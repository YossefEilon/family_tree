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
    
    // Physics disabled to allow pure mathematical grid mapping
    simulation = d3.forceSimulation().alphaDecay(1);
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// 1. DETERMINISTIC HIERARCHY & SIBLING GROUPING GRID
function calculateDeterministicGrid(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Step 1: Assign exact genealogical levels using Tree Traversal (BFS)
    // This strictly guarantees that siblings are ALWAYS on the exact same vertical level.
    nodes.forEach(n => n.dynamicLevel = null);
    
    // Find absolute roots (nodes with no parents)
    let roots = nodes.filter(n => !links.some(l => (l.type === 'parent' || !l.type) && (l.target.id || l.target) === n.id));
    if (roots.length === 0) roots.push(nodes[0]); // Fallback for circular dependencies

    let queue = roots.map(r => ({ node: r, level: 0 }));
    
    while (queue.length > 0) {
        const { node, level } = queue.shift();
        if (node.dynamicLevel !== null) continue; 
        
        node.dynamicLevel = level;
        
        // Spouses must share the exact same generation level
        const spouses = links
            .filter(l => l.type === 'spouse' && ((l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id))
            .map(l => (l.source.id || l.source) === node.id ? (l.target.id || l.target) : (l.source.id || l.source))
            .map(id => nodeMap.get(id))
            .filter(n => n && n.dynamicLevel === null);
        
        spouses.forEach(s => queue.push({ node: s, level: level }));
        
        // Children are pushed exactly one level down
        const children = links
            .filter(l => (l.type === 'parent' || !l.type) && (l.source.id || l.source) === node.id)
            .map(l => (l.target.id || l.target))
            .map(id => nodeMap.get(id))
            .filter(n => n && n.dynamicLevel === null);
            
        children.forEach(c => queue.push({ node: c, level: level + 1 }));
    }

    // Catch any floating disconnected branches
    nodes.forEach(n => { if (n.dynamicLevel === null) n.dynamicLevel = 0; });

    // Step 2: Parse Birth Dates for left-to-right sibling sorting
    nodes.forEach(n => {
        if (n.birth) {
            const match = String(n.birth).match(/\d{4}/);
            n.computedBirth = match ? parseInt(match[0]) : 9999;
        } else {
            n.computedBirth = 9999;
        }
    });

    // Step 3: Initialize Grid Rows
    const levels = {};
    nodes.forEach(n => {
        const l = n.dynamicLevel;
        if (!levels[l]) levels[l] = [];
        levels[l].push(n);
    });

    const placed = new Set();
    const nextAvailableX = {}; // Strict anti-collision tracking

    // Step 4: Map grid row by row
    Object.keys(levels).sort((a, b) => a - b).forEach(lvl => {
        const currentY = lvl * 280 + 150;
        if (nextAvailableX[lvl] === undefined) nextAvailableX[lvl] = 0;

        // Associate nodes with their parents' X coordinates to perfectly cluster siblings together
        levels[lvl].forEach(n => {
            const parentLinks = links.filter(l => (l.type === 'parent' || !l.type) && (l.target.id || l.target) === n.id);
            if (parentLinks.length > 0) {
                let sumX = 0; let count = 0;
                parentLinks.forEach(pl => {
                    const p = nodeMap.get(pl.source.id || pl.source);
                    // Parents were mapped in the previous loop iteration (lvl - 1), so fx is available
                    if (p && placed.has(p.id)) { sumX += p.fx; count++; }
                });
                n.parentX = count > 0 ? sumX / count : -1;
            } else {
                n.parentX = -1; // Root nodes
            }
        });

        // Sort row: Group by ParentX (keeps siblings contiguous), then sort chronologically by age
        levels[lvl].sort((a, b) => {
            if (a.parentX !== b.parentX) return a.parentX - b.parentX;
            return a.computedBirth - b.computedBirth;
        });

        // Place family blocks
        levels[lvl].forEach(node => {
            if (placed.has(node.id)) return;

            // Gather immediate family unit (Node + Spouses)
            const spouseLinks = links.filter(l => l.type === 'spouse' && ((l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id));
            let familyGroup = [node];
            
            spouseLinks.forEach(link => {
                const partnerId = (link.source.id || link.source) === node.id ? (link.target.id || link.target) : (link.source.id || link.source);
                const partner = nodeMap.get(partnerId);
                if (partner && !placed.has(partner.id) && partner.dynamicLevel === node.dynamicLevel) {
                    familyGroup.push(partner);
                }
            });

            let idealX = node.parentX;
            
            if (idealX !== -1) {
                // To center the ENTIRE block of siblings perfectly under the parent,
                // we shift the FIRST sibling to the left. 
                const siblingsCount = levels[lvl].filter(n => n.parentX === node.parentX).length;
                const isFirstSibling = levels[lvl].find(n => n.parentX === node.parentX) === node;
                
                if (isFirstSibling) {
                    // Shift left based on total siblings + their spouses width
                    idealX = idealX - (siblingsCount * 280) / 2;
                }
            } else {
                idealX = nextAvailableX[lvl];
            }

            // Anti-Collision: Cannot place node further left than the next available space
            let startX = Math.max(nextAvailableX[lvl], idealX);

            // Lock coordinates
            familyGroup.forEach((member, index) => {
                member.fx = startX + (index * 260); // Distance between spouses
                member.fy = currentY;
                member.x = member.fx;
                member.y = member.fy;
                placed.add(member.id);
            });

            // Mark space as occupied + buffer margin
            nextAvailableX[lvl] = startX + (familyGroup.length * 260) + 100; 
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
        const midY = (s.y + t.y) / 2;
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

    displayLinks.forEach(link => {
        if (typeof link.source !== 'object') link.source = displayNodes.find(n => n.id === link.source) || link.source;
        if (typeof link.target !== 'object') link.target = displayNodes.find(n => n.id === link.target) || link.target;
    });
    displayLinks = displayLinks.filter(l => typeof l.source === 'object' && typeof l.target === 'object');

    // Run structural geometric mapping
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
    // Keep exact position after drag
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
