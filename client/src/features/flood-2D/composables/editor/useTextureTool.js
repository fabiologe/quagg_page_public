import { ref, reactive, watch } from 'vue';
import * as THREE from 'three';
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';

/**
 * useTextureTool.js
 * Composable for painting surface materials onto the 3D terrain.
 * Updates the terrain mesh's per-vertex aSurfaceColor attribute for real-time visual feedback.
 * Follows the same interaction pattern as useShovelTool.js.
 */

// --- MODULE LEVEL HELPERS ---

const getIntersect = (pointer, raycaster, camera, context) => {
    raycaster.setFromCamera(pointer, camera);
    const intersects = [];

    if (context.scene) {
        const terrain = context.scene.children.find(c => c.userData && c.userData.isTerrain);
        if (terrain) {
            raycaster.intersectObject(terrain, false, intersects);
        }
    }

    if (intersects.length > 0) return intersects[0].point;
    return null;
};

/**
 * Convert world-space intersection point to grid col/row.
 * Uses the same coordinate system as useShovelTool (local mesh space).
 * @param {THREE.Vector3} localPoint - Point in mesh local space
 * @param {object} gridMetadata - { cellsize, nrows, ncols }
 * @returns {{ col: number, row: number } | null}
 */
const worldToGrid = (localPoint, gridMetadata) => {
    const { cellsize, nrows, ncols } = gridMetadata;

    const gridWidth = (ncols - 1) * cellsize;
    const gridHeight = (nrows - 1) * cellsize;
    const offsetX = gridWidth / 2;
    const offsetY = gridHeight / 2;

    const col = Math.floor((localPoint.x + offsetX + (cellsize * 0.5)) / cellsize);
    const gridRow = Math.floor((localPoint.y + offsetY + (cellsize * 0.5)) / cellsize);

    if (col < 0 || col >= ncols || gridRow < 0 || gridRow >= nrows) return null;
    return { col, gridRow };
};

// --- SINGLETON STATE ---
const isPainting = ref(false);

// --- INTERNAL GLOBALS (Visuals) ---
let cursorMesh = null;
let contextRef = null;

export function useTextureTool() {
    const surfaceStore = useSurfaceStore();
    const geoStore = useGeoStore();

    // --- GEOMETRY HELPERS ---

    const createCursor = () => {
        const geometry = new THREE.RingGeometry(0, 1, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xe67e22,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    };

    const updateCursorScale = (context) => {
        if (!cursorMesh || !context?.parsedData) return;
        const { cellsize } = context.parsedData;
        const worldRadius = surfaceStore.brushRadius * cellsize;
        cursorMesh.scale.set(worldRadius, worldRadius, 1);
    };

    // --- VERTEX COLOR UPDATE ---
    /**
     * Update the aSurfaceColor attribute on the terrain mesh for the painted cells.
     * Maps gridRow (bottom-up) to geomRow (top-down) for correct vertex indexing.
     * @param {object} context - contains terrainMesh, parsedData 
     * @param {number} centerCol - Grid column of brush center
     * @param {number} centerGridRow - Grid row (grid convention: 0=bottom)
     * @param {number} radius - Brush radius in cells
     */
    const updateVertexColors = (context, centerCol, centerGridRow, radius) => {
        if (!context?.terrainMesh?.geometry) return;
        const { ncols, nrows } = context.parsedData;
        const colorAttr = context.terrainMesh.geometry.getAttribute('aSurfaceColor');
        if (!colorAttr) return;

        const mat = surfaceStore.activeMaterial;
        if (!mat) return;

        const color = new THREE.Color(mat.color);
        const r = Math.ceil(radius);
        let updated = false;

        for (let dr = -r; dr <= r; dr++) {
            for (let dc = -r; dc <= r; dc++) {
                if (dc * dc + dr * dr > radius * radius) continue;
                const col = centerCol + dc;
                const gridRow = centerGridRow + dr;
                if (col < 0 || col >= ncols || gridRow < 0 || gridRow >= nrows) continue;

                // gridRow here is in grid convention (0=bottom), convert to geometry convention (0=top row in PlaneGeometry)
                const geomRow = (nrows - 1) - gridRow;
                const vertexIdx = geomRow * ncols + col;
                colorAttr.setXYZ(vertexIdx, color.r, color.g, color.b);
                updated = true;
            }
        }

        if (updated) {
            colorAttr.needsUpdate = true;
        }
    };

    /**
     * Sync ALL surface grid colors to the terrain vertex attribute.
     * Called on activate to restore previously painted state.
     */
    const syncAllVertexColors = (context) => {
        if (!context?.terrainMesh?.geometry || !surfaceStore.isInitialized) return;
        const { ncols, nrows } = context.parsedData;
        const colorAttr = context.terrainMesh.geometry.getAttribute('aSurfaceColor');
        if (!colorAttr) return;

        // Build color lookup
        const colorLookup = {};
        for (const m of surfaceStore.materials) {
            colorLookup[m.id] = new THREE.Color(m.color);
        }
        const defaultColor = new THREE.Color('#95a5a6'); // Asphalt light gray

        for (let geomRow = 0; geomRow < nrows; geomRow++) {
            // Geometry row 0 = top (north), Grid row 0 = bottom (south)
            const gridRow = (nrows - 1) - geomRow;
            for (let col = 0; col < ncols; col++) {
                const gridIdx = gridRow * ncols + col;
                const matId = surfaceStore.surfaceGrid[gridIdx] || 1;
                const color = colorLookup[matId] || defaultColor;
                const vertexIdx = geomRow * ncols + col;
                colorAttr.setXYZ(vertexIdx, color.r, color.g, color.b);
            }
        }
        colorAttr.needsUpdate = true;
    };

    // --- AUTO-INIT GRID ---
    const ensureGridInitialized = () => {
        if (surfaceStore.isInitialized) return;
        const terrain = geoStore.terrain;
        if (!terrain) return;

        const header = terrain.header || terrain;
        if (header.nrows && header.ncols) {
            surfaceStore.initGrid(header.nrows, header.ncols, 1);
        }
    };

    // --- PAINTING LOGIC ---

    const paintAt = (point, context) => {
        if (!context?.terrainMesh || !context?.parsedData) return;
        ensureGridInitialized();
        if (!surfaceStore.isInitialized) return;

        const localPoint = context.terrainMesh.worldToLocal(point.clone());
        const cell = worldToGrid(localPoint, context.parsedData);
        if (!cell) return;

        // 1. Update surface grid (data store)
        // cell.gridRow is already in 0=bottom format (matching gridData convention).
        surfaceStore.paintBrush(
            cell.col, cell.gridRow,
            surfaceStore.brushRadius,
            surfaceStore.activeMaterialId
        );

        // 2. Update vertex colors on mesh (visual feedback)
        updateVertexColors(context, cell.col, cell.gridRow, surfaceStore.brushRadius);
    };

    // --- LIFECYCLE ---

    const activate = (scene) => {
        ensureGridInitialized();

        if (!cursorMesh) cursorMesh = createCursor();
        scene.add(cursorMesh);

        // Restore painted colors on terrain when re-entering texture mode
        if (contextRef && surfaceStore.isInitialized) {
            syncAllVertexColors(contextRef);
        }
    };

    const deactivate = (scene) => {
        if (isPainting.value) {
            surfaceStore.calculateCoverage();
        }
        isPainting.value = false;

        if (cursorMesh) {
            scene.remove(cursorMesh);
        }
    };

    const reset = (scene) => {
        isPainting.value = false;
        if (cursorMesh) cursorMesh.visible = false;
    };

    // --- EVENTS ---

    const onMouseDown = ({ event, raycaster, camera, pointer, ...context }) => {
        if (event.button !== 0) return;

        const point = getIntersect(pointer, raycaster, camera, context);
        if (point) {
            contextRef = context;
            isPainting.value = true;

            // Init sync on first interaction if not done yet
            if (surfaceStore.isInitialized && context.terrainMesh?.geometry?.getAttribute('aSurfaceColor')) {
                // Check if colors were already synced by checking first vertex
                const colorAttr = context.terrainMesh.geometry.getAttribute('aSurfaceColor');
                // First paint? Force full sync
                if (colorAttr.getX(0) === 0.5 && colorAttr.getY(0) === 0.5 && colorAttr.getZ(0) === 0.5) {
                    syncAllVertexColors(context);
                }
            }

            paintAt(point, context);
        }
    };

    const onMouseUp = () => {
        if (isPainting.value) {
            surfaceStore.calculateCoverage();
        }
        isPainting.value = false;
    };

    const onMove = ({ event, raycaster, camera, pointer, ...context }) => {
        const point = getIntersect(pointer, raycaster, camera, context);

        if (point) {
            contextRef = context;

            // Update cursor position & scale
            if (cursorMesh) {
                if (context.scene && !context.scene.children.includes(cursorMesh)) {
                    context.scene.add(cursorMesh);
                }
                updateCursorScale(context);
                cursorMesh.visible = true;
                cursorMesh.position.copy(point);
                cursorMesh.position.y += 0.2;

                // Update cursor color to match active material
                const mat = surfaceStore.activeMaterial;
                if (mat && cursorMesh.material) {
                    cursorMesh.material.color.set(mat.color);
                }
            }

            // Paint while dragging
            if (isPainting.value) {
                paintAt(point, context);
            }
        } else {
            if (cursorMesh) cursorMesh.visible = false;
        }
    };

    // Watch brush radius changes to update cursor
    watch(() => surfaceStore.brushRadius, () => {
        if (contextRef) updateCursorScale(contextRef);
    });

    return reactive({
        // State
        isPainting,

        // Lifecycle & Actions
        activate,
        deactivate,
        onMove,
        onMouseDown,
        onMouseUp,
        reset,
        syncColors: (ctx) => { syncAllVertexColors(ctx || contextRef); }
    });
}
