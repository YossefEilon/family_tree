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
    
    // Physics disabled. We use the simulation object solely to trigger re-renders on drag.
    simulation = d3.forceSimulation().alphaDecay(1);
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// 1. THE RIGID MATH GRID (NOW POWERED BY BIRTH YEARS)
function calculateDeterministicGrid(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    // --- NEW: DYNAMIC LEVEL COMPUTATION FROM BIRTH DATES ---
    // Ignore the old static 'level'. Calculate hierarchy dynamically.
    
    // Step 1: Parse existing birth years
    nodes.forEach(n => {
        if (n.birth) {
            const match = String(n.birth).match(/\d{4}/);
            n.computedBirth = match ? parseInt(match[0]) : null;
        } else {
            n.computedBirth = null;
        }
    });

    // Step 2: Infer missing birth years automatically (Iterative propagation)
    for (let i = 0; i < 5; i++) {
        nodes.forEach(n => {
            if (n.computedBirth !== null) return;
            
            // Try from spouse (same age)
            const spouseLink = links.find(l => l.type === 'spouse' && ((l.source.id || l.source) === n.id || (l.target.id || l.target) === n.id));
            if (spouseLink) {
                const partnerId = (spouseLink.source.id || spouseLink.source) === n.id ? (spouseLink.target.id || spouseLink.target) : (spouseLink.source.id || spouseLink.source);
                const partner = nodes.find(p => p.id === partnerId);
                if (partner && partner.computedBirth !== null) { n.computedBirth = partner.computedBirth; return; }
            }
            // Try from parents (assume parent is 25 years older)
            const parentLink = links.find(l => (l.type === 'parent' || !l.type) && (l.target.id || l.target) === n.id);
            if (parentLink) {
                const parentId = parentLink.source.id || parentLink.source;
                const parent = nodes.find(p => p.id === parentId);
                if (parent && parent.computedBirth !== null) { n.computedBirth = parent.computedBirth + 25; return; }
            }
            // Try from children (assume child is 25 years younger)
            const childLink = links.find(l => (l.type === 'parent' || !l.type) && (l.source.id || l.source) === n.id);
            if (childLink) {
                const childId = childLink.target.id || childLink.target;
                const child = nodes.find(p => p.id === childId);
                if (child && child.computedBirth !== null) { n.computedBirth = child.computedBirth - 25; return; }
            }
        });
    }

    // Step 3: Fallback for completely isolated nodes
    const knownBirths = nodes.map(n => n.computedBirth).filter(b => b !== null);
    const avgBirth = knownBirths.length > 0 ? Math.round(knownBirths.reduce((a,b)=>a+b,0)/knownBirths.length) : 1950;
    nodes.forEach(n => { if (n.computedBirth === null) n.computedBirth = avgBirth; });

    // Step 4: Force spouses to the exact same computed age for perfect horizontal alignment
    links.forEach(l => {
        if (l.type === 'spouse') {
            const s = nodes.find(n => n.id === (l.source.id || l.source));
            const t = nodes.find(n => n.id === (l.target.id || l.target));
            if (s && t) {
                const avg = Math.round((s.computedBirth + t.computedBirth) / 2);
                s.computedBirth = avg;
                t.computedBirth = avg;
            }
        }
    });

    // Step 5: Calculate Dynamic Level (Group into 25-year rows)
    const minBirth = Math.min(...nodes.map(n => n.computedBirth));
    nodes.forEach(n => {
        n.dynamicLevel = Math.max(0, Math.round((n.computedBirth - minBirth) / 25));
    });

    // Step 6: Strict Hierarchy Override (Parents MUST visually be above children)
    for (let i = 0; i < 4; i++) {
        links.forEach(l => {
            if (l.type === 'parent' || !l.type) {
                const parent = nodes.find(n => n.id === (l.source.id || l.source));
                const child = nodes.find(n => n.id === (l.target.id || l.target));
                // If a child ended up on the same row or above the parent, force them down
                if (parent && child && child.dynamicLevel <= parent.dynamicLevel) {
                    child.dynamicLevel = parent.dynamicLevel + 1;
                    
                    // Sync the child's spouse to pull them down as well
                    const childSpouseLink = links.find(sl => sl.type === 'spouse' && ((sl.source.id || sl.source) === child.id || (sl.target.id || sl.target) === child.id));
                    if (childSpouseLink) {
                        const spouseId = (childSpouseLink.source.id || childSpouseLink.source) === child.id ? (childSpouseLink.target.id || childSpouseLink.target) : (childSpouseLink.source.id || childSpouseLink.source);
                        const spouse = nodes.find(n => n.id === spouseId);
                        if (spouse) spouse.dynamicLevel = child.dynamicLevel;
                    }
                }
            }
        });
    }
    // --- END NEW BIRTH COMPUTATION ---

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // Sort chronologically by the new computed birth dates
    nodes.sort((a, b) => {
        return a.computedBirth !== b.computedBirth ? a.computedBirth - b.computedBirth : String(a.id).localeCompare(String(b.id));
    });

    // Group by our new dynamically generated levels
    const levels = {};
    nodes.forEach(n => {
        const l = parseInt(n.dynamicLevel || 0);
        if (!levels[l]) levels[l] = [];
        levels[l].push(n);
    });

    const placed = new Set();
    let globalMinX = Infinity;
    let globalMaxX = -Infinity;

    // Traverse the family tree row by row
    Object.keys(levels).sort((a, b) => a - b).forEach(lvl => {
        const currentY = lvl * 280 + 150;
        let currentX = 0;

        levels[lvl].forEach(node => {
            if (placed.has(node.id)) return;

            const spouseLinks = links.filter(l => l.type === 'spouse' && (
                (l.source.id || l.source) === node.id || (l.target.id || l.target) === node.id
            ));

            let familyGroup = [node];

            spouseLinks.forEach(link => {
                const partnerId = (link.source.id || link.source) === node.id ? (link.target.id || link.target) : (link.source.id || link.source);
                const partner = nodeMap.get(partnerId);
                if (partner && !placed.has(partner.id)) {
                    familyGroup.push(partner);
                }
            });

            // Lock the family unit horizontally
            familyGroup.forEach((member, index) => {
                member.fx = currentX + (index * 260); 
                member.fy = currentY;
                member.x = member.fx;
                member.y = member.fy;
                placed.add(member.id);
            });

            const groupIds = familyGroup.map(g => g.id);
            const sharedChildren = nodes.filter(n => links.some(l => 
                (l.type === 'parent' || !l.type) && 
                (groupIds.includes(l.source.id || l.source)) && 
                (l.target.id || l.target) === n.id
            ));

            // Center children perfectly underneath
            if (sharedChildren.length > 0) {
                const midX = (familyGroup[0].fx + familyGroup[familyGroup.length - 1].fx) / 2;
                let childX = midX - ((sharedChildren.length - 1) * 280) / 2;
                const childY = (parseInt(lvl) + 1) * 280 + 150;

                sharedChildren.sort((a,b) => String(a.id).localeCompare(String(b.id))).forEach((child, i) => {
                    if (!placed.has(child.id)) {
                        child.fx = childX + (i * 280);
                        child.fy = childY;
                        child.x = child.fx; 
                        child.y = child.fy;
                        child.dynamicLevel = parseInt(lvl) + 1; 
                        placed.add(child.id);
                    }
                });
            }
            currentX += (familyGroup.length * 260) + 100; 
        });
    });

    // Center entire grid
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
    const newNode = { id: newId, name: "ילד/ה חדש/ה", role: "ילד", isAlive: true, gender: "neutral" };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: parentId, target: newId, type: "parent" });
    openModalForm(newNode);
}
function addParentDirect(childId) {
    const child = globalState.familyData.nodes.find(n => n.id === childId);
    if (!child) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "הורה חדש/ה", role: "הורה", isAlive: true, gender: "neutral" };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: newId, target: childId, type: "parent" });
    openModalForm(newNode);
}
function addSpouseDirect(partnerId) {
    const partner = globalState.familyData.nodes.find(n => n.id === partnerId);
    if (!partner) return;
    const newId = Date.now().toString();
    const newNode = { id: newId, name: "בן/בת זוג חדש/ה", role: "בן/בת זוג", isAlive: true, gender: "neutral" };
    globalState.familyData.nodes.push(newNode);
    globalState.familyData.links.push({ source: partnerId, target: newId, type: "spouse" });
    openModalForm(newNode);
}
