import * as THREE from 'three';

export function useShovelTool() {

    // Internal Helper not exported
    const getIntersect = (pointer, raycaster, camera, context) => {
        raycaster.setFromCamera(pointer, camera);
        const plane = context.interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);
        return target;
    };

    const onClick = ({ event, raycaster, camera, pointer, ...context }) => {
        if (!context.parsedData) return;

        const target = getIntersect(pointer, raycaster, camera, context);
        if (target) {
            const { minZ, cellsize, ncols, nrows, gridData, bounds } = context.parsedData;
            const localX = target.x + bounds.width / 2;
            const localY = -target.z + bounds.height / 2;

            const col = Math.round(localX / cellsize);
            const geomRow = Math.round(localY / cellsize);
            const gridRow = (nrows - 1) - geomRow;

            if (col >= 0 && col < ncols && gridRow >= 0 && gridRow < nrows) {
                const idx = gridRow * ncols + col;

                // Perform Dig
                let currentZ = minZ;
                if (gridData[idx] > -9000) currentZ = gridData[idx];

                const newZ = currentZ - 0.5;
                gridData[idx] = newZ;

                // Update Mesh
                if (context.terrainMesh && context.terrainMesh.geometry) {
                    const attr = context.terrainMesh.geometry.attributes.position;
                    attr.setZ(idx, (newZ - minZ)); // Displacement
                    attr.needsUpdate = true;
                }

                // Return action info if needed
                return { action: 'DUG', idx, newZ };
            }
        }
    };

    // Optional: Ghost cursor?
    const onMove = () => { };

    return {
        onClick,
        onMove
    };
}
