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
    
    // Physics entirely disabled to allow pure mathematical capsule grid
    simulation = d3.forceSimulation().alphaDecay(1);
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// 1. DETERMINISTIC CAPSULE GRID ALGORITHM
// Groups nodes into indivisible Family Units to guarantee spouses are aligned and children are centered
function calculateDeterministicGrid(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    const units = [];
    const nodeToUnit = new Map();

    // Step 1: Package spouses into indivisible Family Units
    nodes.forEach(n => {
        if (nodeToUnit.has(n.id)) return;
        
        const unitNodes = new Set([n]);
        const queue = [n];
        
        // Find all connected spouses
        while(queue.length > 0) {
            const current = queue.shift();
            const spouses = links
                .filter(l => l.type === 'spouse' && ((l.source.id || l.source) === current.id || (l.target.id || l.target) === current.id))
                .map(l => (l.source.id || l.source) === current.id ? (l.target.id || l.target) : (l.source.id || l.source))
                .map(id => nodes.find(x => x.id === id))
                .filter(Boolean);
            
            spouses.forEach(sp => {
                if (!unitNodes.has(sp)) {
                    unitNodes.add(sp);
                    queue.push(sp);
                }
            });
        }

        const unitArray = Array.from(unitNodes);
        // Sort chronologically inside the marriage
        unitArray.sort((a, b) => (parseInt(a.birth) || 9999) - (parseInt(b.birth) || 9999));
        
        const unit = {
            id: unitArray[0].id,
            nodes: unitArray,
            level: 0,
            parents: new Set(),
            children: new Set(),
            width: unitArray.length * 280, // 280px width allocated per person
            centerX: 0
        };

        unitArray.forEach(un => nodeToUnit.set(un.id, unit));
        units.push(unit);
    });

    // Step 2: Establish hierarchical connections between Family Units
    links.forEach(l => {
        if (l.type === 'parent' || !l.type) {
            const parentUnit = nodeToUnit.get(l.source.id || l.source);
            const childUnit = nodeToUnit.get(l.target.id || l.target);
            if (parentUnit && childUnit && parentUnit !== childUnit) {
                childUnit.parents.add(parentUnit);
                parentUnit.children.add(childUnit);
            }
        }
    });

    // Step 3: Compute generation levels securely (Children are strictly Level + 1)
    let changed = true;
    let iterations = 0;
    while(changed && iterations < 100) {
        changed = false;
        iterations++;
        units.forEach(u => {
            if (u.parents.size > 0) {
                let maxParentLevel = -1;
                u.parents.forEach(p => { if (p.level > maxParentLevel) maxParentLevel = p.level; });
                if (u.level <= maxParentLevel) {
                    u.level = maxParentLevel + 1;
                    changed = true;
                }
            }
        });
    }

    // Step 4: Map the grid row by row
    const levelsObj = {};
    units.forEach(u => {
        if (!levelsObj[u.level]) levelsObj[u.level] = [];
        levelsObj[u.level].push(u);
    });

    const nextAvailableX = {};

    Object.keys(levelsObj).sort((a, b) => a - b).forEach(lvl => {
        const rowUnits = levelsObj[lvl];
        const currentY = lvl * 320 + 150; // Vertical spacing between generations
        if (nextAvailableX[lvl] === undefined) nextAvailableX[lvl] = 0;

        // Group sibling units by their parent's coordinates to center them accurately
        rowUnits.forEach(u => {
            if (u.parents.size > 0) {
                let sumX = 0;
                u.parents.forEach(p => sumX += p.centerX);
                u.targetX = sumX / u.parents.size; // Ideal center point based on parents
            } else {
                u.targetX = -1; // Independent root families
            }
        });

        // Cluster sibling units together based on their targetX
        const clusters = new Map();
        rowUnits.forEach(u => {
            const key = u.targetX;
            if (!clusters.has(key)) clusters.set(key, []);
            clusters.get(key).push(u);
        });

        // Place clusters onto the grid safely
        Array.from(clusters.keys()).sort((a, b) => a - b).forEach(key => {
            const cluster = clusters.get(key);
            
            // Sort siblings chronologically inside the cluster
            cluster.sort((a, b) => {
                const birthA = parseInt(a.nodes[0].birth) || 9999;
                const birthB = parseInt(b.nodes[0].birth) || 9999;
                return birthA - birthB;
            });
            
            const gap = 80; // Gap between sibling family units
            const clusterWidth = cluster.reduce((sum, u) => sum + u.width, 0) + (cluster.length - 1) * gap;
            
            let startX = nextAvailableX[lvl];
            
            // Try to center the cluster exactly under the parents, without colliding with neighbors
            if (key !== -1) { 
                const idealStartX = key - (clusterWidth / 2);
                startX = Math.max(nextAvailableX[lvl], idealStartX);
            }

            // Assign exact, immutable coordinates to the nodes
            cluster.forEach(u => {
                u.centerX = startX + (u.width / 2);
                
                u.nodes.forEach((n, idx) => {
                    n.fx = startX + (idx * 280);
                    n.fy = currentY;
                    n.x = n.fx;
                    n.y = n.fy;
                });
                
                startX += u.width + gap;
            });
            
            // Reserve space to prevent the next independent family group from overlapping (Increased margin)
            nextAvailableX[lvl] = startX + 180; 
        });
    });

    // Step 5: Center the entire assembled graph structure to the screen viewport
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

// 2. SMOOTH CURVE GENERATOR
// Uses Bezier curves to visually separate families and prevent horizontal line overlapping
function drawSmoothLink(s, t, type) {
    if (type === 'spouse') {
        return `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
    } else {
        const startY = s.y + nodeHeight / 2;
        const endY = t.y - nodeHeight / 2;
        // Smooth cubic bezier curve ensures each connection has a unique path
        return `M ${s.x} ${startY} C ${s.x} ${(startY + endY) / 2}, ${t.x} ${(startY + endY) / 2}, ${t.x} ${endY}`;
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

    displayLinks.forEach(link => {
        if (typeof link.source !== 'object') link.source = displayNodes.find(n => n.id === link.source) || link.source;
        if (typeof link.target !== 'object') link.target = displayNodes.find(n => n.id === link.target) || link.target;
    });
    displayLinks = displayLinks.filter(l => typeof l.source === 'object' && typeof l.target === 'object');

    // Execute structural clustering before any rendering occurs
    calculateDeterministicGrid(displayNodes, displayLinks);

    const linkSelection = g.selectAll(".link").data(displayLinks, d => d.source.id + "-" + d.target.id + "-" + (d.type || 'parent'));
    const linkEnter = linkSelection.enter().append("path")
        .attr("class", d => `link ${d.type === 'spouse' ? 'link-spouse' : 'link-parent'}`)
        .style("opacity", 0);

    const links = linkEnter.merge(linkSelection);
    links.transition().duration(750)
         .style("opacity", 1)
         .attr("d", d => drawSmoothLink(d.source, d.target, d.type));
    
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
        links.attr("d", d => drawSmoothLink(d.source, d.target, d.type));
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
     .attr("d", l => drawSmoothLink(l.source, l.target, l.type));
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
