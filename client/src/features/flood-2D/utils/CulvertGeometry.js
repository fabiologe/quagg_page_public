import * as THREE from 'three';

/**
 * CulvertGeometry.js
 * Generates the 3D geometry for a Culvert.
 * Currently mimics an extruded building block but allows for 
 * future customization (e.g., arch shape, specific side textures).
 */

export function createCulvertMesh(points, baseEle, totalDepth) {

    // 1. Create Base Shape
    const shape = new THREE.Shape();
    // In our coordinate system, we map X -> X and Z -> -Y (for Shape)
    shape.moveTo(points[0].x, -points[0].z);
    for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i].x, -points[i].z);
    }
    shape.closePath();

    // 2. Extrude
    const extrudeSettings = {
        steps: 1,
        depth: totalDepth,
        bevelEnabled: false,
        // Helper to separate faces if needed later
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // 3. Materials
    // We can use an array of materials to distinguish faces
    // [0] = Top/Bottom/Sides (Extrusion Body)
    // [1] = Front/Back (Caps) ... wait, ExtrudeGeometry maps logic differently.
    // Usually ExtrudeGeometry groups are: 0: Side faces, 1: Top face (Start), 2: Bottom face (End)

    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xe67e22 }); // Orange Body
    const capMaterial = new THREE.MeshLambertMaterial({ color: 0xd35400 });  // Darker Orange Caps (Inlet/Outlet)

    // Note: To truly map inlet/outlet specifically, we might need custom UVs or splitting logic.
    // For now, ExtrudeGeometry applies index 0 to sides (the walls) and index 1 to the caps (top/bottom in shape space -> front/back in extruded space).
    // In our case: "Top" and "Bottom" of the extrusion are the footprint shape (the roof and floor if extruded vertically).
    // Wait, we extrude vertically (Depth). So the "Caps" are the Roof and the Floor.
    // A Culvert usually lies horizontally? 
    // Implementation: User draws footprint on ground (Top-Down). We extrude UP.
    // So the Side Faces are the Walls. The Caps are Roof and Floor.
    // If user draws a "Line" capable culvert, that's different. 
    // Assuming "Building-like" footprint for now as per prompt ("ähnlich wie Gebäude").

    const materials = [bodyMaterial, capMaterial];

    const mesh = new THREE.Mesh(geometry, materials);

    // Position
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = baseEle;

    return mesh;
}
