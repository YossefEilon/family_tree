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

    // 1. THE CURE FOR RANDOMNESS: Seed the D3 physics engine
    // This forces D3 to calculate identical placement vectors on every reload.
    const seededRandom = d3.randomLcg(42);

    simulation = d3.forceSimulation()
        .randomSource(seededRandom) 
        .force("link", d3.forceLink().id(d => d.id)
            .distance(d => d.type === 'spouse' ? nodeWidth + 20 : 250)
            .strength(d => d.type === 'spouse' ? 1 : 0.6)
        )
        .force("charge", d3.forceManyBody().strength(-1500)) 
        .force("collide", d3.forceCollide().radius(nodeWidth * 0.7).iterations(3))
        // 2. STRICT GENERATION ROWS: Heavily pull nodes to their calculated Y-axis based on level
        .force("y", d3.forceY(d => (d.level || 0) * 320 + 150).strength(1.5))
        .force("x", d3.forceX(window.innerWidth / 2).strength(0.05));
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// Compute perfect static coordinates and lock them explicitly to prevent dynamic floating shuffles
function computeDeterministicLayout(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const generations = {};

    // Group elements into separate arrays by generational tree level
    nodes.forEach(n => {
        const lvl = n.level || 0;
        if (!generations[lvl]) generations[lvl] = [];
        generations[lvl].push(n);
    });

    // Parse each generation sequentially to establish fixed grid alignments
    Object.keys(generations).sort((a, b) => a - b).forEach(lvl => {
        const currentGenNodes = generations[lvl];
        const processedIds = new Set();
        
        // Horizontal centering calculations for row distribution
        const totalRowWidth = (currentGenNodes.length - 1) * 280;
        let currentXX = (window.innerWidth / 2) - (totalRowWidth / 2);
        const assignedY = lvl * 260 + 150;

        currentGenNodes.forEach(node => {
            if (processedIds.has(node.id)) return;

            // Search for an active generational marriage partner relation link
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
                    // Lock couple side-by-side using fixed coordinates (fx, fy) to bypass D3 physics
                    node.fx = currentXX;
                    node.fy = assignedY;
                    node.x = node.fx; node.y = node.fy;

                    partner.fx = currentXX + 250;
                    partner.fy = assignedY;
                    partner.x = partner.fx; partner.y = partner.partnerY;

                    processedIds.add(node.id);
                    processedIds.add(partner.id);

                    // Map out children descending from this parent relationship
                    const children = nodes.filter(n => 
                        links.some(l => (l.type === 'parent' || !l.type) && 
                            ((typeof l.source === 'object' ? l.source.id : l.source) === node.id || 
                             (typeof l.source === 'object' ? l.source.id : l.source) === partner.id) && 
                            (typeof l.target === 'object' ? l.target.id : l.target) === n.id
                        )
                    );

                    // Center children directly underneath the mid-point of the couple block
                    if (children.length > 0) {
                        const midPointX = (node.fx + partner.fx) / 2;
                        let childStartX = midPointX - ((children.length - 1) * 270) / 2;
                        const nextGenY = (parseInt(lvl) + 1) * 260 + 150;
                        
                        children.forEach((child, index) => {
                            child.fx = childStartX + (index * 270);
                            child.fy = nextGenY;
                            child.x = child.fx; child.y = child.fy;
                        });
                    }

                    currentXX += 560; // Offset spacing sequence to prevent overlap anomalies
                    return;
                }
            }

            // Lock single isolated individuals cleanly into row matrix
            if (!processedIds.has(node.id)) {
                node.fx = currentXX;
                node.fy = assignedY;
                node.x = node.fx; node.y = node.fy;
                
                processedIds.add(node.id);
                currentXX += 280;
            }
        });
    });
}

export function updateGraphView() {
    // 3. DATA SORTING: Guarantee the arrays are processed in the exact same order every time
    let displayNodes = [...globalState.familyData.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    let displayLinks = [...globalState.familyData.links].sort((a, b) => {
        const sA = typeof a.source === 'object' ? a.source.id : a.source;
        const sB = typeof b.source === 'object' ? b.source.id : b.source;
        return String(sA).localeCompare(String(sB));
    });

    if (globalState.filteredRootId) {
        const descendantIds = getDescendantIds(globalState.filteredRootId);
        const spouseIds = getSpouseIds(globalState.filteredRootId);
        const allowedIds = new Set([...descendantIds, ...spouseIds, globalState.filteredRootId]);

        displayNodes = displayNodes.filter(n => allowedIds.has(n.id));
        displayLinks = displayLinks.filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return allowedIds.has(s) && allowedIds.has(t);
        });
        document.getElementById('btn-reset-filter').classList.remove('hidden');
    } else {
        document.getElementById('btn-reset-filter').classList.add('hidden');
    }

    // --- (Keep your existing SVG mapping logic here for links, nodes, and action bubbles) ---
    // [Insert linkSelection, linkEnter, nodeSelection, nodeEnter logic here...]

    simulation.nodes(displayNodes).on("tick", () => {
        // 4. THE GEOMETRIC OVERRIDE: Hijack the physics engine on every single frame
        displayLinks.forEach(link => {
            if (link.type === 'spouse' && typeof link.source === 'object' && typeof link.target === 'object') {
                
                // Force spouses to the exact same Height (Y-axis)
                const avgY = (link.source.y + link.target.y) / 2;
                link.source.y = avgY;
                link.target.y = avgY;

                // Force spouses uniformly close together on the X-axis
                const avgX = (link.source.x + link.target.x) / 2;
                const spouseGap = nodeWidth + 40; // Consistent gap size between cards

                // Use their IDs to strictly dictate left vs. right placement (prevents random swapping)
                if (String(link.source.id) > String(link.target.id)) {
                    link.source.x = avgX + (spouseGap / 2);
                    link.target.x = avgX - (spouseGap / 2);
                } else {
                    link.source.x = avgX - (spouseGap / 2);
                    link.target.x = avgX + (spouseGap / 2);
                }
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
    simulation.alpha(1).restart();
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
    // Allow coordinates to unlock temporarily during active drag interactions
    d.fx = null; d.fy = null;
    d3.selectAll(".node-actions").style("opacity", 0).style("pointer-events", "none");
}
function dragged(event, d) { d.x = event.x; d.y = event.y; }
function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    // Lock drag drop target cleanly back into fixed parameters
    d.fx = d.x; d.fy = d.y;
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
