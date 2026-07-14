/**
 * Pans and zooms the D3 canvas to center exactly on the specific node,
 * while dimming all other nodes to create a visual focus effect.
 * @param {string} nodeId - The ID of the node to focus on.
 */
export function focusNode(nodeId) {
    const nodeData = globalState.familyData.nodes.find(n => n.id === nodeId);
    if (!nodeData || typeof nodeData.x === 'undefined' || typeof nodeData.y === 'undefined') return;

    // Center coordinates (assuming standard screen sizing, adjust offset if needed)
    const width = document.getElementById('tree-canvas').clientWidth || window.innerWidth;
    const height = document.getElementById('tree-canvas').clientHeight || window.innerHeight;
    
    // Calculate transform to center the node
    const scale = 1.2; // Zoom level
    const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-nodeData.x, -nodeData.y);

    // Animate camera pan & zoom
    svg.transition()
        .duration(1000) // 1 second smooth animation
        .call(zoom.transform, transform);

    // Apply visual focus (dim others, highlight target)
    d3.selectAll('.node-group')
        .transition()
        .duration(500)
        .style('opacity', d => d.id === nodeId ? 1 : 0.15);
        
    d3.selectAll('.link-path')
        .transition()
        .duration(500)
        .style('opacity', 0.1);

    // Listen for background clicks to clear the focus
    svg.on('click.focusClear', (event) => {
        // Restore opacity to all nodes and links
        d3.selectAll('.node-group').transition().duration(500).style('opacity', 1);
        d3.selectAll('.link-path').transition().duration(500).style('opacity', 1);
        // Remove this specific click listener
        svg.on('click.focusClear', null);
    });
}
