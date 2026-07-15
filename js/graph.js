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
    
    // Physics entirely disabled to allow pure mathematical tree rendering
    simulation = d3.forceSimulation().alphaDecay(1);
}

export function resizeCanvas() {
    if (svg) {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    }
}

// 1. COMPACT RECURSIVE TREE-WIDTH ALGORITHM (With Strict Bounding-Box Collision)
function calculateDeterministicGrid(nodes, links) {
    if (!nodes || nodes.length === 0) return;

    const units = [];
    const nodeToUnit = new Map();

    // Step 1: Package spouses into indivisible Family Units
    nodes.forEach(n => {
        if (nodeToUnit.has(n.id)) return;
        
        const unitNodes = new Set([n]);
        const queue = [n];
        
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
        
        // Ensure blood relative is placed first for aesthetic alignment
        unitArray.sort((a, b) => {
            const aIsBlood = links.some(l => (l.type === 'parent' || !l.type) && (l.target.id === a.id || l.target === a.id));
            const bIsBlood = links.some(l => (l.type === 'parent' || !l.type) && (l.target.id === b.id || l.target === b.id));
            if (aIsBlood && !bIsBlood) return -1;
            if (!aIsBlood && bIsBlood) return 1;
            return (parseInt(a.birth) || 9999) - (parseInt(b.birth) || 9999);
        });
        
        const unit = {
            id: unitArray[0].id,
            nodes: unitArray,
            level: 0,
            childrenUnits: [],
            parentUnits: [],
            primaryParentUnit: null,
            bioParentsMap: new Map(),
            width: unitArray.length * 260,
            treeWidth: 0,
            xAssigned: false
        };

        unitArray.forEach(un => nodeToUnit.set(un.id, unit));
        units.push(unit);
    });

    // Step 2: Build Strict Parent-Child Unit Relationships
    links.forEach(l => {
        if (l.type === 'parent' || !l.type) {
            const parentUnit = nodeToUnit.get(l.source.id || l.source);
            const childUnit = nodeToUnit.get(l.target.id || l.target);
            if (parentUnit && childUnit && parentUnit !== childUnit) {
                if (!childUnit.primaryParentUnit) { 
                    childUnit.primaryParentUnit = parentUnit;
                }
                if (!childUnit.parentUnits.includes(parentUnit)) {
                    childUnit.parentUnits.push(parentUnit);
                    parentUnit.childrenUnits.push(childUnit);
                }
                // Map the exact biological connection
                childUnit.bioParentsMap.set(parentUnit.id, l.target.id || l.target);
            }
        }
    });

    const absoluteRoots = units.filter(u => u.parentUnits.length === 0);

    // Step 3: Assign Generation Levels (Top-Down with Relaxation)
    absoluteRoots.forEach(r => r.level = 0);
    let changed = true;
    let iterations = 0;
    while(changed && iterations < 100) {
        changed = false;
        iterations++;
        units.forEach(u => {
            if (u.parentUnits.length > 0) {
                let maxLvl = -1;
                u.parentUnits.forEach(p => { if (p.level > maxLvl) maxLvl = p.level; });
                if (u.level <= maxLvl) {
                    u.level = maxLvl + 1;
                    changed = true;
                }
            }
        });
    }

    // Step 4: Calculate Sub-Tree Widths (Bottom-Up)
    function calcTreeWidth(u) {
        const primaryChildren = u.childrenUnits.filter(c => c.primaryParentUnit === u);
        if (primaryChildren.length === 0) {
            u.treeWidth = u.width;
        } else {
            primaryChildren.forEach(c => calcTreeWidth(c));
            const minGap = 40;
            const totalChildrenWidth = primaryChildren.reduce((sum, c) => sum + c.treeWidth, 0) + (primaryChildren.length - 1) * minGap;
            u.treeWidth = Math.max(u.width, totalChildrenWidth);
        }
    }
    absoluteRoots.forEach(r => calcTreeWidth(r));

    // Step 5: Assign X Coordinates (Top-Down)
    function assignCenterX(u, startX) {
        if (u.xAssigned) return;

        u.centerX = startX + u.treeWidth / 2;
        
        u.nodes.forEach((n, idx) => {
            n.fx = u.centerX - ((u.nodes.length - 1) * 260) / 2 + (idx * 260);
            n.fy = u.level * 320 + 150;
            n.x = n.fx;
            n.y = n.fy;
        });
        u.xAssigned = true;
        
        const primaryChildren = u.childrenUnits.filter(c => c.primaryParentUnit === u);
        if (primaryChildren.length > 0) {
            primaryChildren.sort((a,b) => (parseInt(a.nodes[0].birth)||9999) - (parseInt(b.nodes[0].birth)||9999));
            
            const minGap = 40;
            const totalChildrenWidth = primaryChildren.reduce((sum, c) => sum + c.treeWidth, 0) + (primaryChildren.length - 1) * minGap;
            
            let currentChildStartX = u.centerX - (totalChildrenWidth / 2);
            
            primaryChildren.forEach((c) => {
                assignCenterX(c, currentChildStartX);
                currentChildStartX += c.treeWidth + minGap;
            });
        }
    }

    // First Pass: Place primary roots (Roots that control child placement)
    let currentX = 0;
    const primaryRoots = absoluteRoots.filter(r => r.childrenUnits.length === 0 || r.childrenUnits.some(c => c.primaryParentUnit === r));
    
    primaryRoots.forEach(r => {
        assignCenterX(r, currentX);
        currentX += r.treeWidth + 120;
    });

    // Secondary Pass: Place "In-Law" / Extra parents DIRECTLY above their children using Bounding Box Anti-Collision
    const secondaryRoots = absoluteRoots.filter(r => !r.xAssigned);
    
    secondaryRoots.forEach(r => {
        // Find a child unit that is already placed
        const placedChild = r.childrenUnits.find(c => c.xAssigned);
        
        if (placedChild) {
            const bioChildId = placedChild.bioParentsMap.get(r.id);
            const bioChildNode = placedChild.nodes.find(n => n.id === bioChildId);
            
            let targetX = placedChild.centerX;
            if (bioChildNode) targetX = bioChildNode.x;

            // Strict Physical Bounding Box Collision Detection
            let occupied = [];
            units.filter(u => u.xAssigned && u.level === r.level).forEach(u => {
                occupied.push({
                    min: u.centerX - (u.width / 2) - 40, // 40px minimum safety gap
                    max: u.centerX + (u.width / 2) + 40
                });
            });

            // Generate precise mathematical candidate points (Edges of existing boxes)
            let candidates = [targetX];
            occupied.forEach(occ => {
                candidates.push(occ.min - (r.width / 2) - 40);
                candidates.push(occ.max + (r.width / 2) + 40);
            });

            // Sort candidates to find the closest available spot to the ideal targetX
            candidates.sort((a, b) => Math.abs(a - targetX) - Math.abs(b - targetX));

            let bestX = targetX;
            for (let cx of candidates) {
                let cMin = cx - (r.width / 2);
                let cMax = cx + (r.width / 2);
                let isClear = true;
                for (let occ of occupied) {
                    // Check intersection
                    if (cMax > occ.min && cMin < occ.max) {
                        isClear = false;
                        break;
                    }
                }
                if (isClear) {
                    bestX = cx;
                    break;
                }
            }

            // Assign placement based on the mathematically cleared bestX
            function assignFromCenterX(u, targetCenterX) {
                if (u.xAssigned) return;
                u.centerX = targetCenterX;
                u.nodes.forEach((n, idx) => {
                    n.fx = u.centerX - ((u.nodes.length - 1) * 260) / 2 + (idx * 260);
                    n.fy = u.level * 320 + 150;
                    n.x = n.fx;
                    n.y = n.fy;
                });
                u.xAssigned = true;
                
                const primaryChildren = u.childrenUnits.filter(c => c.primaryParentUnit === u);
                if (primaryChildren.length > 0) {
                    primaryChildren.sort((a,b) => (parseInt(a.nodes[0].birth)||9999) - (parseInt(b.nodes[0].birth)||9999));
                    const minGap = 40;
                    const totalChildrenWidth = primaryChildren.reduce((sum, c) => sum + c.treeWidth, 0) + (primaryChildren.length - 1) * minGap;
                    let currentChildStartX = u.centerX - (totalChildrenWidth / 2);
                    primaryChildren.forEach((c) => {
                        assignCenterX(c, currentChildStartX);
                        currentChildStartX += c.treeWidth + minGap;
                    });
                }
            }
            
            assignFromCenterX(r, bestX);
            
        } else {
            // Failsafe
            assignCenterX(r, currentX);
            currentX += r.treeWidth + 120;
        }
    });

    // Final Failsafe
    units.filter(u => !u.xAssigned).forEach(u => {
        assignCenterX(u, currentX);
        currentX += u.treeWidth + 120;
    });

    // Step 6: Center the entire assembled graph to the screen viewport
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

// 2. ADVANCED SMOOTH CURVE GENERATOR
function drawSmoothLink(d, allLinks) {
    const s = d.source;
    const t = d.target;
    const type = d.type;

    if (type === 'spouse') {
        const startY = s.y + nodeHeight / 2 - 10; 
        const endY = t.y + nodeHeight / 2 - 10;
        const midX = (s.x + t.x) / 2;
        const controlY = startY + 50; 

        return `M ${s.x} ${startY} Q ${midX} ${controlY} ${t.x} ${endY}`;
    } else {
        let startX = s.x;
        let startY = s.y + nodeHeight / 2;

        const spouseLink = allLinks.find(l => l.type === 'spouse' && (l.source.id === s.id || l.target.id === s.id));
        if (spouseLink) {
            const partner = (spouseLink.source.id === s.id) ? spouseLink.target : spouseLink.source;
            if (Math.abs(partner.y - s.y) < 10) {
                startX = (s.x + partner.x) / 2; 
                startY = s.y + nodeHeight / 2 + 15; 
            }
        }

        const endY = t.y - nodeHeight / 2;
        return `M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${t.x} ${(startY + endY) / 2}, ${t.x} ${endY}`;
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
         .attr("d", d => drawSmoothLink(d, displayLinks));
    
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
        links.attr("d", d => drawSmoothLink(d, displayLinks));
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
    
    const allRenderedLinks = g.selectAll(".link").data();
    g.selectAll(".link").filter(l => l.source.id === d.id || l.target.id === d.id)
     .attr("d", l => drawSmoothLink(l, allRenderedLinks));
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

/**
 * Pans and zooms the D3 canvas to center on a specific node securely,
 * with a wide zoom and a visual "SELECTED" state.
 */
export function focusNode(nodeId) {
    const nodeData = globalState.familyData.nodes.find(n => n.id === nodeId);
    
    // מוודא שיש קואורדינטות תקינות
    if (!nodeData || typeof nodeData.x !== 'number' || typeof nodeData.y !== 'number') return;

    const canvas = document.getElementById('tree-canvas');
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    
    // 1. זום רחב להצגת ההקשר של העץ (0.6 במקום ה-1.3 או 1.2 שהיה מקודם)
    const scale = 0.6; 
    const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-nodeData.x, -nodeData.y);

    // 2. תנועת מצלמה חלקה אל היעד בזום הרחב
    d3.select('#tree-canvas').transition()
        .duration(800)
        .call(zoom.transform, transform);

    // 3. יצירת מצב "SELECTED" (הדגשה) - עמעום שאר העץ
    d3.selectAll('.node-group').transition().duration(400).style('opacity', d => d.id === nodeId ? 1 : 0.15);
    d3.selectAll('.link-path').transition().duration(400).style('opacity', 0.1);
    
    // 4. הקפצת בן המשפחה הנבחר לחזית (כדי שלא יוסתר על ידי קווים או ישויות אחרות)
    d3.selectAll('.node-group').filter(d => d.id === nodeId).raise();

    // 5. מנגנון שחרור בטוח למניעת קפיאת העץ: 
    // אנחנו משתמשים ב-mousedown מופרד (clearFocus) שמאזין רק לרקע הריק כדי לא להרוס את הגרירה של D3
    d3.select('#tree-canvas').on('mousedown.clearFocus', (event) => {
        // בודק אם הלחיצה הייתה על הרקע (ה-SVG) ולא על קרוב משפחה אחר
        if (event.target.tagName.toLowerCase() === 'svg') {
            // החזרת האטימות לכל העץ (שחרור מצב SELECTED)
            d3.selectAll('.node-group').transition().duration(400).style('opacity', 1);
            d3.selectAll('.link-path').transition().duration(400).style('opacity', 1);
            
            // מחיקת המאזין אחרי שהמשימה בוצעה כדי לחסוך במשאבים
            d3.select('#tree-canvas').on('mousedown.clearFocus', null);
        }
    });
}
