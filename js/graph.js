import { globalState, nodeWidth, nodeHeight } from './config.js';
import { createNodeCard, createActionBubbles, showNodeDetailsById, filterFamilyById } from './ui.js';

export let svg, g, zoom;

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
    
    // PHYSICS ENGINE COMPLETELY REMOVED. 
    // We now use a strict mathematical static rendering grid.
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// 1. THE RIGID MATH GRID
// Calculates immutable X and Y coordinates for every node, ignoring all physics.
function calculateDeterministicGrid(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Unconditional sorting guarantees the tree never swaps left/right on reload
    nodes.sort((a, b) => {
        const birthA = parseInt(a.birth) || 9999;
        const birthB = parseInt(b.birth) || 9999;
        return birthA !== birthB ? birthA - birthB : String(a.id).localeCompare(String(b.id));
    });

    const levels = {};
    nodes.forEach(n => {
        const l = parseInt(n.level || 0);
        if (!levels[l]) levels[l] = [];
        levels[l].push(n);
    });

    const placed = new Set();
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;

    // Traverse row by row
    Object.keys(levels).sort((a, b) => a - b).forEach(lvl => {
        const currentY = lvl * 280 + 150;
        let currentX = 0;

        levels[lvl].forEach(node => {
            if (placed.has(node.id)) return;

            // Search for spouse connections
            const spouseLink = links.find(l => l.type === 'spouse' && (
                (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id
            ));

            if (spouseLink) {
                const sId = spouseLink.source.id || spouseLink.source;
                const tId = spouseLink.target.id || spouseLink.target;
                const partnerId = sId === node.id ? tId : sId;
                const partner = nodeMap.get(partnerId);

                // Lock spouses symmetrically side-by-side
                if (partner && partner.level == node.level && !placed.has(partner.id)) {
                    node.x = currentX; node.y = currentY;
                    partner.x = currentX + 260; partner.y = currentY;

                    placed.add(node.id);
                    placed.add(partner.id);

                    // Map all children belonging to this specific couple
                    const sharedChildren = nodes.filter(n => links.some(l => 
                        (l.type === 'parent' || !l.type) && 
                        ((l.source.id || l.source) === node.id || (l.source.id || l.source) === partner.id) && 
                        (l.target.id || l.target) === n.id
                    ));

                    // Center children perfectly underneath the midpoint of the parents
                    if (sharedChildren.length > 0) {
                        const midX = (node.x + partner.x) / 2;
                        let childX = midX - ((sharedChildren.length - 1) * 280) / 2;
                        const childY = (parseInt(lvl) + 1) * 280 + 150;

                        sharedChildren.sort((a,b) => String(a.id).localeCompare(String(b.id))).forEach((child, i) => {
                            if (!placed.has(child.id)) {
                                child.x = childX + (i * 280);
                                child.y = childY;
                                child.level = parseInt(lvl) + 1; // Force strict level hierarchy
                                placed.add(child.id);
                            }
                        });
                    }
                    currentX += 560; // Offset spacing for next couple
                    return;
                }
            }

            // Lock single unmarried nodes
            node.x = currentX; node.y = currentY;
            placed.add(node.id);
            currentX += 280;
        });
    });

    // Perfectly center the entire assembled grid to the middle of the screen
    nodes.forEach(n => {
        if (n.x < globalMinX) globalMinX = n.x;
        if (n.x > globalMaxX) globalMaxX = n.x;
    });

    const graphWidth = globalMaxX - globalMinX;
    const shiftX = (window.innerWidth / 2) - (graphWidth / 2) - globalMinX;
    
    nodes.forEach(n => { n.x += shiftX; });
}

// 2. ORTHOGONAL LINE GENERATOR
// Draws professional, right-angled family tree lines instead of curvy web connections
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

    // Because physics are disabled, D3 won't map object links automatically. We do it manually:
    displayLinks.forEach(link => {
        if (typeof link.source !== 'object') link.source = displayNodes.find(n => n.id === link.source) || link.source;
        if (typeof link.target !== 'object') link.target = displayNodes.find(n => n.id === link.target) || link.target;
    });
    displayLinks = displayLinks.filter(l => typeof l.source === 'object' && typeof l.target === 'object');

    // Calculate grid strictly before rendering
    calculateDeterministicGrid(displayNodes, displayLinks);

    // Render Links
    const linkSelection = g.selectAll(".link").data(displayLinks, d => d.source.id + "-" + d.target.id + "-" + (d.type || 'parent'));
    const linkEnter = linkSelection.enter().append("path")
        .attr("class", d => `link ${d.type === 'spouse' ? 'link-spouse' : 'link-parent'}`)
        .style("opacity", 0);

    const links = linkEnter.merge(linkSelection);
    links.transition().duration(750)
         .style("opacity", 1)
         .attr("d", d => drawOrthogonalLink(d.source, d.target, d.type));
    
    linkSelection.exit().remove();

    // Render Nodes
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
    
    // Animate smoothly to static positions
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
// Directly bind movement to mouse coordinates and update lines instantly without physics
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
    // Drop logic completes cleanly
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

import { openModalForm } from './ui.js';
function addChildDirect(parentId) {
    const parent = globalState.familyData.nodes.find(n => n.id === parentId);
    if (!parent) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "ילד/ה חדש/ה", role: "ילד", isAlive: true, gender: "neutral", level: (parent.level || 0) + 1 };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: parentId, target: newId, type: "parent" });
    openModalForm(newNode);
}
function addParentDirect(childId) {
    const child = globalState.familyData.nodes.find(n => n.id === childId);
    if (!child) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "הורה חדש/ה", role: "הורה", isAlive: true, gender: "neutral", level: Math.max(0, (child.level || 0) - 1) };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: newId, target: childId, type: "parent" });
    openModalForm(newNode);
}
function addSpouseDirect(partnerId) {
    const partner = globalState.familyData.nodes.find(n => n.id === partnerId);
    if (!partner) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "בן/בת זוג חדש/ה", role: "בן/בת זוג", isAlive: true, gender: "neutral", level: partner.level || 0 };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: partnerId, target: newId, type: "spouse" });
    openModalForm(newNode);
}
