import { globalState, nodeWidth, nodeHeight } from './config.js';
import { createNodeCard, createActionBubbles, showNodeDetailsById, filterFamilyById, openModalForm } from './ui.js';

export let svg, g, zoom, simulation;

export function initD3Graph() {
    svg = d3.select("#tree-canvas");
    g = svg.append("g");

    svg.on("click", (event) => {
        if (event.target === svg.node() || event.target.tagName === 'rect') {
            d3.selectAll(".node-actions").style("opacity", 0).style("pointer-events", "none");
            clearHighlights();
        }
    });

    zoom = d3.zoom().scaleExtent([0.1, 3]).on("zoom", (event) => {
        g.attr("transform", event.transform);
    });
    svg.call(zoom);
    resizeCanvas();
    
    // Physics entirely disabled. Grid is fully deterministic.
    simulation = d3.forceSimulation().alphaDecay(1);
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// 1. DETERMINISTIC HIERARCHY & UNIT CLUSTERING GRID
function calculateDeterministicGrid(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Step 1: Initialize all dynamic levels
    nodes.forEach(n => n.dynamicLevel = -1);
    
    // Find roots (nodes with no parents)
    let roots = nodes.filter(n => !links.some(l => (l.type === 'parent' || !l.type) && (l.target.id === n.id || l.target === n.id)));
    if (roots.length === 0) roots = [nodes[0]]; // Fallback

    roots.forEach(r => r.dynamicLevel = 0);

    // Iterative relaxation algorithm to sync spouses and push children down correctly
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
        changed = false;
        iterations++;
        links.forEach(l => {
            const s = nodeMap.get(l.source.id || l.source);
            const t = nodeMap.get(l.target.id || l.target);
            if (!s || !t) return;

            if (l.type === 'spouse') {
                // Spouses MUST securely share the same maximum vertical level
                const maxLvl = Math.max(s.dynamicLevel, t.dynamicLevel);
                if (maxLvl !== -1) {
                    if (s.dynamicLevel !== maxLvl) { s.dynamicLevel = maxLvl; changed = true; }
                    if (t.dynamicLevel !== maxLvl) { t.dynamicLevel = maxLvl; changed = true; }
                }
            } else {
                // Parent to Child generation step
                if (s.dynamicLevel !== -1) {
                    const expectedChildLvl = s.dynamicLevel + 1;
                    if (t.dynamicLevel < expectedChildLvl) { t.dynamicLevel = expectedChildLvl; changed = true; }
                }
            }
        });
    }
    nodes.forEach(n => { if (n.dynamicLevel === -1) n.dynamicLevel = 0; });

    // Step 2: Group into indivisible Family Units (A person + their spouses)
    const units = [];
    const placedInUnit = new Set();

    // Sort nodes initially by birth year to maintain a stable baseline
    nodes.sort((a, b) => {
        const bA = parseInt(a.birth) || 9999;
        const bB = parseInt(b.birth) || 9999;
        return bA !== bB ? bA - bB : String(a.id).localeCompare(String(b.id));
    });

    nodes.forEach(n => {
        if (placedInUnit.has(n.id)) return;
        const unitNodes = [n];
        placedInUnit.add(n.id);

        // Package all spouses into this single unit block
        const spouses = links.filter(l => l.type === 'spouse' && ((l.source.id || l.source) === n.id || (l.target.id || l.target) === n.id))
                             .map(l => (l.source.id || l.source) === n.id ? (l.target.id || l.target) : (l.source.id || l.source))
                             .map(id => nodeMap.get(id))
                             .filter(sp => sp && !placedInUnit.has(sp.id));
                             
        spouses.forEach(sp => { unitNodes.push(sp); placedInUnit.add(sp.id); });

        // Ensure chronological order inside the marriage if birth dates exist
        unitNodes.sort((a, b) => (parseInt(a.birth) || 9999) - (parseInt(b.birth) || 9999));

        units.push({
            id: unitNodes[0].id, 
            nodes: unitNodes,
            level: unitNodes[0].dynamicLevel,
            parentUnitId: null,
            width: unitNodes.length * 280, // 280px width per node inside the unit
            centerX: 0
        });
    });

    // Step 3: Link Units to their Parent Units (establishing the parent-sibling hierarchy)
    units.forEach(u => {
        let parentIds = [];
        u.nodes.forEach(n => {
            const pLinks = links.filter(l => (l.type === 'parent' || !l.type) && (l.target.id || l.target) === n.id);
            pLinks.forEach(pl => parentIds.push(pl.source.id || pl.source));
        });
        if (parentIds.length > 0) {
            const parentUnit = units.find(pu => pu.nodes.some(pn => parentIds.includes(pn.id)));
            if (parentUnit) u.parentUnitId = parentUnit.id;
        }
    });

    // Step 4: Map grid rows by clustering sibling units underneath their parent units
    const levelsObj = {};
    units.forEach(u => {
        if (!levelsObj[u.level]) levelsObj[u.level] = [];
        levelsObj[u.level].push(u);
    });

    Object.keys(levelsObj).sort((a, b) => a - b).forEach(lvl => {
        const currentY = lvl * 320 + 150; // Y-axis row spacing
        const rowUnits = levelsObj[lvl];
        
        // Cluster siblings by their shared parent
        const clusters = {};
        rowUnits.forEach(u => {
            const pid = u.parentUnitId || 'root_cluster';
            if (!clusters[pid]) clusters[pid] = [];
            clusters[pid].push(u);
        });

        // Sort clusters by their parent's X coordinate to avoid crisscrossing lines
        const sortedClusters = Object.values(clusters).sort((cA, cB) => {
            const pA = units.find(u => u.id === cA[0].parentUnitId);
            const pB = units.find(u => u.id === cB[0].parentUnitId);
            const xA = pA ? pA.centerX : 0;
            const xB = pB ? pB.centerX : 0;
            return xA - xB;
        });

        let nextX = 0;

        sortedClusters.forEach(cluster => {
            // Sort siblings inside the cluster by birth year
            cluster.sort((a, b) => {
                const birthA = Math.min(...a.nodes.map(n => parseInt(n.birth) || 9999));
                const birthB = Math.min(...b.nodes.map(n => parseInt(b.birth) || 9999));
                return birthA - birthB;
            });

            const gapBetweenSiblings = 60;
            const clusterWidth = cluster.reduce((sum, u) => sum + u.width, 0) + (cluster.length - 1) * gapBetweenSiblings;
            
            const parentUnit = units.find(u => u.id === cluster[0].parentUnitId);
            
            // Calculate ideal X placement to center the sibling cluster perfectly under the parents
            const idealStartX = parentUnit ? parentUnit.centerX - (clusterWidth / 2) : nextX;
            
            // Apply collision tracking: Never place further left than the next available space
            let startX = Math.max(nextX, idealStartX);

            cluster.forEach(u => {
                u.centerX = startX + (u.width / 2);
                
                // Assign fixed grid coordinates to nodes inside the unit
                u.nodes.forEach((n, index) => {
                    n.fx = startX + (index * 280);
                    n.fy = currentY;
                    n.x = n.fx;
                    n.y = n.fy;
                });
                
                startX += u.width + gapBetweenSiblings;
            });
            
            nextX = startX + 140; // Margin between completely different family groups
        });
    });

    // Step 5: Center entire graph to the viewport
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;
    nodes.forEach(n => {
        if (n.x < globalMinX) globalMinX = n.x;
        if (n.x > globalMaxX) globalMaxX = n.x;
    });

    const graphWidth = globalMaxX - globalMinX;
    const shiftX = (window.innerWidth / 2) - (graphWidth / 2) - globalMinX;
    
    nodes.forEach(n => { 
        n.fx += shiftX; 
        n.x = n.fx; 
    });
}

// 2. ORTHOGONAL LINE GENERATOR
function drawOrthogonalLink(s, t, type) {
    if (type === 'spouse') {
        return `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
    } else {
        const midY = (s.y + t.y) / 2; // Drops down perfectly halfway to the next generation
        return `M ${s.x} ${s.y + nodeHeight / 2} L ${s.x} ${midY} L ${t.x} ${midY} L ${t.x} ${t.y - nodeHeight / 2}`;
    }
}

export function updateGraphView() {
    let displayNodes = globalState.familyData.nodes;
    let displayLinks = globalState.familyData.links;

    if (globalState.filteredRootId) {
        const descendantIds = getDescendantIds(globalState.filteredRootId);
        const spouseIds = getSpouseIds(globalState.filteredRootId);
        const allowedIds = new Set([...descendantIds, ...spouseIds, globalState.filteredRootId]);

        displayNodes = globalState.familyData.nodes.filter(n => allowedIds.has(n.id));
        displayLinks = globalState.familyData.links.filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return allowedIds.has(s) && allowedIds.has(t);
        });
        document.getElementById('btn-reset-filter').classList.remove('hidden');
    } else {
        document.getElementById('btn-reset-filter').classList.add('hidden');
    }

    // Assign objects to links so mathematical tracking works
    displayLinks.forEach(link => {
        if (typeof link.source !== 'object') link.source = displayNodes.find(n => n.id === link.source) || link.source;
        if (typeof link.target !== 'object') link.target = displayNodes.find(n => n.id === link.target) || link.target;
    });
    displayLinks = displayLinks.filter(l => typeof l.source === 'object' && typeof l.target === 'object');

    // Execute structural clustering before rendering the canvas
    calculateDeterministicGrid(displayNodes, displayLinks);

    const linkSelection = g.selectAll(".link").data(displayLinks, d => d.source.id + "-" + d.target.id + "-" + (d.type || 'parent'));
    const linkEnter = linkSelection.enter().append("path")
        .attr("class", d => `link ${d.type === 'spouse' ? 'link-spouse' : 'link-parent'}`)
        .style("opacity", 0);

    const links = linkEnter.merge(linkSelection);
    links.transition().duration(750)
         .style("opacity", 1)
         .attr("d", d => drawOrthogonalLink(d.source, d.target, d.type));
    
    linkSelection.exit().remove();

    const nodeSelection = g.selectAll(".node").data(displayNodes, d => d.id);
    const nodeEnter = nodeSelection.enter().append("g")
        .attr("class", "node")
        .style("opacity", 0)
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .call(d3.drag()
            .filter(event => !event.target.closest('.node-actions'))
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    nodeEnter.append("foreignObject")
        .attr("class", "main-card")
        .attr("width", nodeWidth).attr("height", nodeHeight)
        .attr("x", -nodeWidth / 2).attr("y", -nodeHeight / 2)
        .on("click", handleNodeClick);

    nodeEnter.append("foreignObject")
        .attr("class", "node-actions")
        .attr("width", 440).attr("height", 240)
        .attr("x", -220).attr("y", -120) 
        .style("opacity", 0).style("pointer-events", "none").style("transition", "opacity 0.2s ease");

    const nodes = nodeEnter.merge(nodeSelection);
    
    nodes.transition().duration(750)
         .style("opacity", 1)
         .attr("transform", d => `translate(${d.x}, ${d.y})`);

    nodes.select(".main-card").html(d => createNodeCard(d));
    nodes.select(".node-actions")
        .html(d => createActionBubbles(d))
        .each(function(d) {
            const sel = d3.select(this);
            sel.select(".action-btn-details").on("click", (event) => showNodeDetailsById(d.id, event));
            sel.select(".action-btn-family").on("click", (event) => filterFamilyById(d.id, event));

            if (globalState.isAdmin) {
                sel.select(".action-btn-add-parent").on("click", (event) => { event.stopPropagation(); addParentDirect(d.id); });
                sel.select(".action-btn-add-child").on("click", (event) => { event.stopPropagation(); addChildDirect(d.id); });
                sel.select(".action-btn-add-spouse").on("click", (event) => { event.stopPropagation(); addSpouseDirect(d.id); });
            }
        });

    nodeSelection.exit().remove();

    simulation.nodes(displayNodes).on("tick", () => {
        links.attr("d", d => drawOrthogonalLink(d.source, d.target, d.type));
        nodes.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });

    lucide.createIcons();
}

function handleNodeClick(event, d) {
    if (event.defaultPrevented) return;
    event.stopPropagation();
    d3.selectAll(".node-actions").style("opacity", 0).style("pointer-events", "none");

    const parentNode = d3.select(event.currentTarget.parentNode);
    parentNode.select(".node-actions").style("opacity", 1).style("pointer-events", "auto");
    parentNode.raise();
    
    highlightDescendants(d.id);
}

// 3. OVERRIDE DRAG LOGIC
function dragstarted(event, d) {
    d3.select(event.currentTarget).raise(); 
    d3.selectAll(".node-actions").style("opacity", 0).style("pointer-events", "none");
}
function dragged(event, d) { 
    d.x = event.x; 
    d.y = event.y; 
    d3.select(this).attr("transform", `translate(${d.x}, ${d.y})`);
    
    g.selectAll(".link").filter(l => l.source.id === d.id || l.target.id === d.id)
     .attr("d", l => drawOrthogonalLink(l.source, l.target, l.type));
}
function dragended(event, d) {
    // End frame silently
}

export function getDescendantIds(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);
    const childrenIds = globalState.familyData.links
        .filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            return s === nodeId && (l.type === 'parent' || !l.type);
        })
        .map(l => typeof l.target === 'object' ? l.target.id : l.target);
    childrenIds.forEach(cId => getDescendantIds(cId, visited));
    return visited;
}

export function getSpouseIds(nodeId) {
    const spouses = new Set();
    globalState.familyData.links.forEach(l => {
        if (l.type === 'spouse') {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s === nodeId) spouses.add(t);
            if (t === nodeId) spouses.add(s);
        }
    });
    return spouses;
}

function highlightDescendants(rootId) {
    const descIds = getDescendantIds(rootId);
    g.selectAll(".link").classed("link-dimmed", true).classed("link-highlight", false);
    g.selectAll(".node").classed("node-dimmed", true);

    g.selectAll(".link").filter(d => {
        const s = typeof d.source === 'object' ? d.source.id : d.source;
        return descIds.has(s) && (d.type === 'parent' || !d.type);
    }).classed("link-dimmed", false).classed("link-highlight", true);

    g.selectAll(".node").filter(d => descIds.has(d.id)).classed("node-dimmed", false);
}

export function clearHighlights() {
    g.selectAll(".link").classed("link-dimmed", false).classed("link-highlight", false);
    g.selectAll(".node").classed("node-dimmed", false);
}

export function zoomInAction() { svg.transition().duration(300).call(zoom.scaleBy, 1.3); }
export function zoomOutAction() { svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.3); }
export function resetZoomAction() {
    const bounds = g.node().getBBox();
    const parent = svg.node();
    const fullWidth = parent.clientWidth || window.innerWidth;
    const fullHeight = parent.clientHeight || window.innerHeight;
    const width = bounds.width;
    const height = bounds.height;
    const midX = bounds.x + width / 2;
    const midY = bounds.y + height / 2;

    if (width === 0 || height === 0) return; 

    const scale = Math.max(0.2, Math.min(1.2, 0.85 / Math.max(width / fullWidth, height / fullHeight)));
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
}

function addChildDirect(parentId) {
    const parent = globalState.familyData.nodes.find(n => n.id === parentId);
    if (!parent) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "ילד/ה חדש/ה", role: "ילד", isAlive: true, gender: "neutral", birth: "" };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: parentId, target: newId, type: "parent" });
    openModalForm(newNode);
}
function addParentDirect(childId) {
    const child = globalState.familyData.nodes.find(n => n.id === childId);
    if (!child) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "הורה חדש/ה", role: "הורה", isAlive: true, gender: "neutral", birth: "" };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: newId, target: childId, type: "parent" });
    openModalForm(newNode);
}
function addSpouseDirect(partnerId) {
    const partner = globalState.familyData.nodes.find(n => n.id === partnerId);
    if (!partner) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "בן/בת זוג חדש/ה", role: "בן/בת זוג", isAlive: true, gender: "neutral", birth: "" };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: partnerId, target: newId, type: "spouse" });
    openModalForm(newNode);
}
