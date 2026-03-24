import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';

export class IfcEngine {
    constructor() {
        this.components = new OBC.Components();
    }

    async init(container) {
        this.container = container;

        // Hack to completely force web-ifc into Single-Threaded mode bypassing browser heuristics
        if (typeof window !== 'undefined') {
            try {
                Object.defineProperty(window, 'crossOriginIsolated', {
                    value: false,
                    writable: false,
                    configurable: true
                });
            } catch (e) {
                console.warn("Could not override crossOriginIsolated", e);
            }
        }

        const worlds = this.components.get(OBC.Worlds);
        const world = worlds.create();

        world.scene = new OBC.SimpleScene(this.components);
        world.renderer = new OBC.SimpleRenderer(this.components, container);
        world.camera = new OBC.SimpleCamera(this.components);

        // Extend clipping planes for large-scale models (sewer networks can span km)
        world.camera.three.near = 0.5;
        world.camera.three.far = 100000;
        world.camera.three.updateProjectionMatrix();

        this.components.init();

        world.scene.setup();
        world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);

        const grids = this.components.get(OBC.Grids);
        const grid = grids.create(world);
        world.scene.three.add(grid.three);

        const raycasters = this.components.get(OBC.Raycasters);
        raycasters.get(world);

        const fragments = this.components.get(OBC.FragmentsManager);
        fragments.init("/worker.mjs");

        const ifcLoader = this.components.get(OBC.IfcLoader);

        await ifcLoader.setup({
            wasm: {
                path: "/",
                absolute: true
            },
            autoSetWasm: false
        });

        // Store references for mouse coordinate tracking
        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    }

    async loadIfc(data, name = 'default-model') {
        console.log("[IfcEngine] loadIfc started with data size:", data.length);
        
        try {
            console.log("[IfcEngine] Running isolated IfcImporter.process() to catch web-ifc throw...");
            const testImporter = new FRAGS.IfcImporter();
            testImporter.wasm.path = "/";
            testImporter.wasm.absolute = true;
            // No worker specified, runs in main thread synchronously, so any errors are caught here!
            const bytes = await testImporter.process({ bytes: data });
            console.log("[IfcEngine] Isolated process SUCCESS! Returned bytes length:", bytes?.length);
        } catch (e) {
            console.error("[IfcEngine] Isolated process FAILED! Error from web-ifc:", e);
        }

        const ifcLoader = this.components.get(OBC.IfcLoader);
        console.log("[IfcEngine] Calling ifcLoader.load()...");
        
        let model;
        try {
            model = await ifcLoader.load(data, true, name);
        } catch (e) {
            console.error("[IfcEngine] Error during ifcLoader.load:", e);
            throw e;
        }
        
        console.log("[IfcEngine] load() finished! Model:", model);
        const worlds = this.components.get(OBC.Worlds);
        const world = [...worlds.list.values()][0]; // Get the active world
        world.scene.three.add(model.object);
        console.log("[IfcEngine] Model added to world.");

        // Give the model a reference to the camera for LOD/culling
        model.useCamera(world.camera.three);

        // Fit the camera to the model's bounding box
        await this._fitCameraToModel(model, world);

        // Wait for the model to finish processing in the worker
        const fragments = this.components.get(OBC.FragmentsManager);
        let waitCount = 0;
        while (model.isBusy && waitCount < 20) {
            console.log(`[IfcEngine] Model is still busy (attempt ${waitCount + 1})...`);
            await new Promise(r => setTimeout(r, 500));
            waitCount++;
        }
        console.log("[IfcEngine] Model busy state:", model.isBusy);

        // Force render update now that model is ready and camera is positioned
        await fragments.core.update(true);
        
        // Log diagnostics
        const meshList = model._meshManager?.list;
        console.log("[IfcEngine] After update - Tiles:", model.tiles.size, 
            "Visible:", model.visibleItems.size,
            "Meshes:", meshList?.size ?? 'N/A',
            "Object children:", model.object?.children?.length);

        return model;
    }

    async _fitCameraToModel(model, world) {
        try {
            const bbox = model.box;
            if (!bbox || bbox.isEmpty()) {
                console.warn("[IfcEngine] Model bounding box is empty, waiting for tiles...");
                await new Promise(r => setTimeout(r, 1500));
            }

            const box = model.box;
            if (!box || box.isEmpty()) {
                console.warn("[IfcEngine] BBox still empty after wait, skipping camera fit.");
                return;
            }

            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);

            // Update ground plane to model center height for coordinate tracking
            this._groundPlane.constant = -center.y;
            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim * 1.5;

            console.log("[IfcEngine] Fitting camera to model:", {
                center: center.toArray(),
                size: size.toArray(),
                distance
            });

            // Position camera at a diagonal offset from center
            const camPos = new THREE.Vector3(
                center.x + distance * 0.6,
                center.y + distance * 0.6,
                center.z + distance * 0.6
            );

            await world.camera.controls.setLookAt(
                camPos.x, camPos.y, camPos.z,
                center.x, center.y, center.z,
                true
            );
        } catch (e) {
            console.warn("[IfcEngine] Could not fit camera to model:", e);
        }
    }

    /** Get the active world */
    _getWorld() {
        const worlds = this.components.get(OBC.Worlds);
        return [...worlds.list.values()][0];
    }

    /** Get bounding box center and size of the last loaded model */
    _getModelBounds() {
        const fragments = this.components.get(OBC.FragmentsManager);
        const models = [...fragments.list.values()];
        if (models.length === 0) return null;

        const mergedBox = new THREE.Box3();
        for (const model of models) {
            if (model.box && !model.box.isEmpty()) {
                mergedBox.union(model.box);
            }
        }
        if (mergedBox.isEmpty()) return null;

        const center = new THREE.Vector3();
        mergedBox.getCenter(center);
        const size = new THREE.Vector3();
        mergedBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        return { center, size, maxDim };
    }

    /** Zoom to fit all models in view */
    async zoomToFit() {
        const bounds = this._getModelBounds();
        if (!bounds) return;
        const { center, maxDim } = bounds;
        const d = maxDim * 1.5;
        const world = this._getWorld();
        await world.camera.controls.setLookAt(
            center.x + d * 0.6, center.y + d * 0.6, center.z + d * 0.6,
            center.x, center.y, center.z,
            true
        );
    }

    /** View from top (plan view) */
    async viewTop() {
        const bounds = this._getModelBounds();
        if (!bounds) return;
        const { center, maxDim } = bounds;
        const world = this._getWorld();
        await world.camera.controls.setLookAt(
            center.x, center.y + maxDim * 2, center.z,
            center.x, center.y, center.z,
            true
        );
    }

    /** View from front */
    async viewFront() {
        const bounds = this._getModelBounds();
        if (!bounds) return;
        const { center, maxDim } = bounds;
        const world = this._getWorld();
        await world.camera.controls.setLookAt(
            center.x, center.y, center.z + maxDim * 2,
            center.x, center.y, center.z,
            true
        );
    }

    /** View from side */
    async viewSide() {
        const bounds = this._getModelBounds();
        if (!bounds) return;
        const { center, maxDim } = bounds;
        const world = this._getWorld();
        await world.camera.controls.setLookAt(
            center.x + maxDim * 2, center.y, center.z,
            center.x, center.y, center.z,
            true
        );
    }

    /** Reset to default diagonal view */
    async resetView() {
        const world = this._getWorld();
        await world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0, true);
    }

    /** Get 3D world position under the mouse cursor */
    getMouseWorldPosition(clientX, clientY, containerRect) {
        const world = this._getWorld();
        if (!world) return null;

        // Normalize mouse to [-1, 1]
        this._mouse.x = ((clientX - containerRect.left) / containerRect.width) * 2 - 1;
        this._mouse.y = -((clientY - containerRect.top) / containerRect.height) * 2 + 1;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        // Intersect with ground plane
        const target = new THREE.Vector3();
        const hit = this._raycaster.ray.intersectPlane(this._groundPlane, target);
        if (hit) {
            return { x: target.x, y: target.y, z: target.z };
        }
        return null;
    }

    dispose() {
        if (this.components) {
            this.components.dispose();
        }
        if (this.container && this.container.innerHTML) {
            this.container.innerHTML = '';
        }
    }
}
