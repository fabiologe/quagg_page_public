import * as OBC from '@thatopen/components';
import * as THREE from 'three';

export class IfcEngine {
    constructor() {
        this.components = new OBC.Components();
    }

    async init(container) {
        this.container = container;

        // Hack to completely force web-ifc into Single-Threaded mode bypassing browser heuristics
        // which sometimes evaluate to true but fail to provide the worker script in ESM apps.
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

        // Initialize core components
        const worlds = this.components.get(OBC.Worlds);
        const world = worlds.create();

        world.scene = new OBC.SimpleScene(this.components);
        world.renderer = new OBC.SimpleRenderer(this.components, container);
        world.camera = new OBC.SimpleCamera(this.components);

        this.components.init();

        world.scene.setup();
        world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);

        const grids = this.components.get(OBC.Grids);
        const grid = grids.create(world);
        world.scene.three.add(grid.three);

        // Setup Raycaster for selection/highlighting if needed
        const raycasters = this.components.get(OBC.Raycasters);
        raycasters.get(world);

        // Fragment Manager for IFC loading
        const fragments = this.components.get(OBC.FragmentsManager);
        fragments.init();

        // Setup IfcLoader
        const ifcLoader = this.components.get(OBC.IfcLoader);
        await ifcLoader.setup();

        // Setup IfcLoader with static WASM paths (Vite maps these to root in dev/dist)
        ifcLoader.settings.wasm = {
            path: "/",
            absolute: true
        };
    }

    async loadIfc(data) {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const model = await ifcLoader.load(data);
        const worlds = this.components.get(OBC.Worlds);
        const world = [...worlds.list.values()][0]; // Get the active world
        world.scene.three.add(model);
        return model;
    }

    dispose() {
        if (this.components) {
            this.components.dispose();
        }
        // ensure container is clean
        if (this.container && this.container.innerHTML) {
            this.container.innerHTML = '';
        }
    }
}
