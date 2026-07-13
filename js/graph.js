import { globalState, nodeWidth, nodeHeight } from './config.js';
import { createNodeCard, createActionBubbles, showNodeDetailsById, filterFamilyById } from './ui.js';

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

    // Strict constraint parameters using low alpha values to prevent erratic shuffles
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(d => d.type === 'spouse' ? 140 : 180).strength(0.4))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("collide", d3.forceCollide().radius(nodeWidth * 0.55).iterations(2))
        .force("x", d3.forceX(d => d.targetX || (window.innerWidth / 2)).strength(0.7))
        .force("y", d3.forceY(d => d.targetY || ((d.level || 0) * 240 + 150)).strength(1.0));
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// Compute deterministic coordinates and assign fixed initial positions to block random shuffling
function computeDeterministicLayout(nodes, links) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const generations = {};

    // Distribute tree elements cleanly by their level property
    nodes.forEach(n => {
        const lvl = n.level || 0;
        if (!generations[lvl]) generations[lvl] = [];
        generations[lvl].push(n);
    });

    Object.keys(generations).sort((a, b) => a - b).forEach(lvl => {
        const currentGenNodes = generations[lvl];
        const processedIds = new Set();
        
        // Centered starting boundary calculation per generational row
        let currentXX = (window.innerWidth / 2) - ((currentGenNodes.length - 1) * 160);

        currentGenNodes.forEach(node => {
            if (processedIds.has(node.id)) return;

            // Detect matching spouse assignments
            const spouseLink = links.find(l => 
                l.type === 'spouse' && 
                ((typeof l.source === 'object' ? l.source.id : l.source) === node.id || 
                 (typeof l.target === 'object' ? l.target.id : l.target) === node.id)
            );

            if (spouseLink) {
                const sId = typeof spouseLink.source === 'object' ? spouseLink.source.id : spouseLink.source;
                const tId = typeof spouseLink.target === 'object' ? spouseLink.target.id : spouseLink.target;
                const partnerId = sId === node.id ? tId : sId;
                const partner = nodeMap.get(partnerId);

                if (partner && partner.level === node.level) {
                    const assignedY = lvl * 240 + 150;
                    
                    // Assign target positions
                    node.targetX = currentXX;
                    node.targetY = assignedY;
                    partner.targetX = currentXX + 250;
                    partner.targetY = assignedY;

                    // Hard overwrite D3 coordinates to completely override internal physics randomization
                    node.x = node.targetX; node.y = node.targetY;
                    node.px = node.x; node.py = node.y;
                    
                    partner.x = partner.targetX; partner.y = partner.targetY;
                    partner.px = partner.x; partner.py = partner.y;

                    processedIds.add(node.id);
                    processedIds.add(partner.id);

                    // Track down mutual children descending from parents
                    const children = nodes.filter(n => 
                        links.some(l => (l.type === 'parent' || !l.type) && 
                            ((typeof l.source === 'object' ? l.source.id : l.source) === node.id || 
                             (typeof l.source === 'object' ? l.source.id : l.source) === partner.id) && 
                            (typeof l.target === 'object' ? l.target.id : l.target) === n.id
                        )
                    );

                    // Center children uniformly directly underneath the couple's midpoint coordinates
                    if (children.length > 0) {
                        const midX = (node.targetX + partner.targetX) / 2;
                        let childStartX = midX - ((children.length - 1) * 260) / 2;
                        
                        children.forEach((child, index) => {
                            child.targetX = childStartX + (index * 260);
                            child.targetY = (parseInt(lvl) + 1) * 240 + 150;
                            
                            // Hard overwrite child entry frames
                            child.x = child.targetX;
                            child.y = child.targetY;
                            child.px = child.x;
                            child.py = child.y;
                        });
                    }

                    currentXX += 540;
                    return;
                }
            }

            // Fallback rules targeting single unpartnered nodes
            if (!processedIds.has(node.id)) {
                node.targetX = currentXX;
                node.targetY = lvl * 240 + 150;
                
                node.x = node.targetX; node.y = node.targetY;
                node.px = node.x; node.py = node.y;
                
                processedIds.add(node.id);
                currentXX += 280;
            }
        });
    });
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

    // Force layout constraints to process coordinates cleanly
    computeDeterministicLayout(displayNodes, displayLinks);

    const linkSelection = g.selectAll(".link").data(displayLinks, d => {
        const s = typeof d.source === 'object' ? d.source.id : d.source;
        const t = typeof d.target === 'object' ? d.target.id : d.target;
        return s + "-" + t + "-" + (d.type || 'parent');
    });

    const linkEnter = linkSelection.enter().append("path")
        .attr("class", d => `link ${d.type === 'spouse' ? 'link-spouse' : 'link-parent'}`)
        .style("opacity", 0);

    const links = linkEnter.merge(linkSelection);
    links.transition().duration(500).style("opacity", 1);
    linkSelection.exit().remove();

    const nodeSelection = g.selectAll(".node").data(displayNodes, d => d.id);
    const nodeEnter = nodeSelection.enter().append("g")
        .attr("class", "node")
        .style("opacity", 0)
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
    nodes.transition().duration(500).style("opacity", 1);
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
        // Enforce horizontal couple constraints during frame adjustments
        displayLinks.forEach(l => {
            if (l.type === 'spouse') {
                const avgY = (l.source.y + l.target.y) / 2;
                l.source.y = avgY;
                l.target.y = avgY;
            }
        });

        links.attr("d", d => {
            if (d.type === 'spouse') {
                return `M ${d.source.x} ${d.source.y} L ${d.target.x} ${d.target.y}`;
            } else {
                const sourceY = d.source.y + (nodeHeight / 2);
                const targetY = d.target.y - (nodeHeight / 2);
                return `M ${d.source.x} ${sourceY} C ${d.source.x} ${(sourceY + targetY) / 2}, ${d.target.x} ${(sourceY + targetY) / 2}, ${d.target.x} ${targetY}`;
            }
        });
        nodes.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });

    simulation.force("link").links(displayLinks);
    simulation.force("x").initialize(displayNodes);
    simulation.force("y").initialize(displayNodes);
    simulation.alpha(0.2).restart(); // Kept low to keep elements firmly locked to positions
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

function dragstarted(event, d) {
    d3.select(event.currentTarget).raise(); 
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
    d3.selectAll(".node-actions").style("opacity", 0).style("pointer-events", "none");
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
}

import { openModalForm } from './ui.js';
function addChildDirect(parentId) {
    const parent = globalState.familyData.nodes.find(n => n.id === parentId);
    if (!parent) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "ילד/ה חדש/ה", role: "ילד", isAlive: true, gender: "neutral", level: (parent.level || 0) + 1, x: parent.x, y: parent.y + 200 };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: parentId, target: newId, type: "parent" });
    openModalForm(newNode);
}
function addParentDirect(childId) {
    const child = globalState.familyData.nodes.find(n => n.id === childId);
    if (!child) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "הורה חדש/ה", role: "הורה", isAlive: true, gender: "neutral", level: Math.max(0, (child.level || 0) - 1), x: child.x, y: Math.max(50, child.y - 200) };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: newId, target: childId, type: "parent" });
    openModalForm(newNode);
}
function addSpouseDirect(partnerId) {
    const partner = globalState.familyData.nodes.find(n => n.id === partnerId);
    if (!partner) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "בן/בת זוג חדש/ה", role: "בן/בת זוג", isAlive: true, gender: "neutral", level: partner.level || 0, x: partner.x - 140, y: partner.y };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: partnerId, target: newId, type: "spouse" });
    openModalForm(newNode);
}
