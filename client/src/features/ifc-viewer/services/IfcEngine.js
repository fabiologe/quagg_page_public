import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const DATA_CONFIG = {
    attributesDefault: true,
    relationsDefault: { attributes: false, relations: false },
    relations: {
        IsDefinedBy:     { attributes: true, relations: true  },
        IsTypedBy:       { attributes: true, relations: false },
        HasAssociations: { attributes: true, relations: false },
    },
};

const SELECTION_STYLE = {
    color: new THREE.Color(0.0, 1.0, 0.08),
    renderedFaces: FRAGS.RenderedFaces.TWO,
    opacity: 1.0,
    transparent: false,
};

const CATEGORY_COLORS = {
    IFCWALLSTANDARDCASE:   new THREE.Color(0.85, 0.84, 0.78),
    IFCWALL:               new THREE.Color(0.85, 0.84, 0.78),
    IFCWALLTYPE:           new THREE.Color(0.85, 0.84, 0.78),
    IFCSLAB:               new THREE.Color(0.75, 0.74, 0.70),
    IFCSLABTYPE:           new THREE.Color(0.75, 0.74, 0.70),
    IFCCOLUMN:             new THREE.Color(0.60, 0.60, 0.58),
    IFCCOLUMNTYPE:         new THREE.Color(0.60, 0.60, 0.58),
    IFCBEAM:               new THREE.Color(0.55, 0.54, 0.52),
    IFCBEAMTYPE:           new THREE.Color(0.55, 0.54, 0.52),
    IFCWINDOW:             new THREE.Color(0.40, 0.75, 0.90),
    IFCWINDOWTYPE:         new THREE.Color(0.40, 0.75, 0.90),
    IFCDOOR:               new THREE.Color(0.68, 0.44, 0.18),
    IFCDOORTYPE:           new THREE.Color(0.68, 0.44, 0.18),
    IFCPIPESEGMENT:        new THREE.Color(0.45, 0.55, 0.75),
    IFCPIPESEGMENTTYPE:    new THREE.Color(0.45, 0.55, 0.75),
    IFCPIPEFITTING:        new THREE.Color(0.45, 0.55, 0.75),
    IFCDUCT:               new THREE.Color(0.80, 0.70, 0.28),
    IFCDUCTTYPE:           new THREE.Color(0.80, 0.70, 0.28),
    IFCDUCTFITTING:        new THREE.Color(0.80, 0.70, 0.28),
    IFCROOF:               new THREE.Color(0.55, 0.34, 0.22),
    IFCROOFTYPE:           new THREE.Color(0.55, 0.34, 0.22),
    IFCSTAIR:              new THREE.Color(0.72, 0.70, 0.63),
    IFCSTAIRTYPE:          new THREE.Color(0.72, 0.70, 0.63),
    IFCSTAIRFLIGHT:        new THREE.Color(0.72, 0.70, 0.63),
    IFCFOOTING:            new THREE.Color(0.62, 0.60, 0.56),
    IFCFOOTINGTYPE:        new THREE.Color(0.62, 0.60, 0.56),
    IFCPLATE:              new THREE.Color(0.60, 0.62, 0.65),
    IFCMEMBER:             new THREE.Color(0.50, 0.52, 0.55),
    IFCMEMBERTYPE:         new THREE.Color(0.50, 0.52, 0.55),
    IFCFURNITURE:          new THREE.Color(0.70, 0.55, 0.35),
    IFCFURNITURETYPE:      new THREE.Color(0.70, 0.55, 0.35),
    IFCCURTAINWALL:        new THREE.Color(0.55, 0.75, 0.85),
    IFCCURTAINWALLTYPE:    new THREE.Color(0.55, 0.75, 0.85),
    IFCRAILING:            new THREE.Color(0.40, 0.40, 0.45),
    IFCSPACE:              new THREE.Color(0.70, 0.85, 0.90),
    IFCSPACETYPE:          new THREE.Color(0.70, 0.85, 0.90),
    IFCFLOWSEGMENT:        new THREE.Color(0.45, 0.55, 0.75),
    IFCFLOWFITTING:        new THREE.Color(0.45, 0.55, 0.75),
    IFCFLOWTERMINAL:       new THREE.Color(0.50, 0.65, 0.80),
    IFCAIRTERMINAL:        new THREE.Color(0.65, 0.75, 0.80),
    IFCPUMP:               new THREE.Color(0.35, 0.45, 0.65),
    IFCVALVE:              new THREE.Color(0.35, 0.45, 0.65),
};

const CURSOR_DEFAULT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='rgba(0,0,0,0.55)' stroke-width='4'/%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='18' cy='18' r='2' fill='white'/%3E%3Ccircle cx='18' cy='18' r='2' fill='none' stroke='rgba(0,0,0,0.5)' stroke-width='1'/%3E%3C/svg%3E\") 18 18, crosshair";
const CURSOR_HOVER   = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='rgba(0,80,0,0.7)' stroke-width='4'/%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='%2300ff22' stroke-width='2.5'/%3E%3Ccircle cx='18' cy='18' r='2' fill='%2300ff22'/%3E%3C/svg%3E\") 18 18, pointer";

const PICK_OFFSETS = [
    [0, 0],
    [11, 0], [-11, 0], [0, 11], [0, -11],
    [8, 8],  [-8, 8],  [8, -8], [-8, -8],
    [16, 0], [-16, 0], [0, 16], [0, -16],
];


export class IfcEngine {
    constructor() {
        this.components      = new OBC.Components();
        this._selectedItems  = null;
        this._selectedKey    = null;
        this._hoveredKey     = null;
        this._hoverInFlight  = false;
        this._canvas         = null;

        // Category / layer visibility
        // Each entry: { name, groupData (ClassificationGroupData), visible, count }
        this._categoryGroups = null;

        // Section cut gizmo
        this._sectionPlaneId    = null;
        this._planePivot        = null; // THREE.Object3D — gizmo anchor
        this._tcHelper          = null; // TransformControls visual helper in scene
        this._transformControls = null; // TransformControls instance

        // Coordinate offset (IFC → Three.js) + last hover hit point
        this._coordinationOffset = new THREE.Vector3();
        this._lastHitPoint       = null; // THREE.Vector3 | null
    }

    async init(container) {
        this.container = container;

        if (typeof window !== 'undefined') {
            try {
                Object.defineProperty(window, 'crossOriginIsolated', {
                    value: false, writable: false, configurable: true,
                });
            } catch (_) { /* ignore */ }
        }

        const worlds = this.components.get(OBC.Worlds);
        const world  = worlds.create();

        world.scene    = new OBC.SimpleScene(this.components);
        world.renderer = new OBC.SimpleRenderer(this.components, container);
        world.camera   = new OBC.SimpleCamera(this.components);

        world.camera.three.near = 0.5;
        world.camera.three.far  = 100000;
        world.camera.three.updateProjectionMatrix();

        this.components.init();
        world.scene.setup();
        world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
        world.camera.controls.dollySpeed = 0.5;

        const grids = this.components.get(OBC.Grids);
        world.scene.three.add(grids.create(world).three);

        this.components.get(OBC.Raycasters).get(world);

        const fragments = this.components.get(OBC.FragmentsManager);
        fragments.init('/worker.mjs');

        const ifcLoader = this.components.get(OBC.IfcLoader);
        await ifcLoader.setup({ wasm: { path: '/', absolute: true }, autoSetWasm: false });

        this.components.get(OBC.Clipper).setup();

        this._canvas = world.renderer.three.domElement;
    }

    // ── Model loading ────────────────────────────────────────────────────────

    async loadIfc(data, name = 'model') {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const model     = await ifcLoader.load(data, true, name);

        const world = this._getWorld();
        world.scene.three.add(model.object);
        model.useCamera(world.camera.three);

        // Extract coordination offset: the position that was applied to center the model.
        // When coordinateToOrigin=true, model.object.position IS the negative shift.
        // Negating gives the original IFC origin offset.
        const objPos = model.object.position;
        this._coordinationOffset.set(-objPos.x, -objPos.y, -objPos.z);

        await this._fitCameraToModel(model, world);

        const fragments = this.components.get(OBC.FragmentsManager);
        let waitCount = 0;
        while (model.isBusy && waitCount < 20) {
            await new Promise(r => setTimeout(r, 500));
            waitCount++;
        }
        await fragments.core.update(true);

        // Post-load pipeline — parallelize independent tasks
        await Promise.all([
            this.buildCategoryIndex().then(() => this._applyDefaultCategoryColors(model)),
            this._loadAlignments(model, world),
            this._loadGrids(model, world),
        ]);

        return model;
    }

    getModelList() {
        const fragments = this.components.get(OBC.FragmentsManager);
        return [...fragments.list.values()].map(m => ({
            modelId: m.modelId,
            name:    m.name ?? m.modelId,
        }));
    }

    async unloadModel(modelId) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = fragments.list.get(modelId);
        if (!model) return;
        model.dispose();
        // Rebuild categories for remaining models
        if (fragments.list.size > 0) {
            await this.buildCategoryIndex();
        } else {
            this._categoryGroups = null;
        }
    }

    // ── Category / Layer visibility ──────────────────────────────────────────

    async buildCategoryIndex() {
        const classifier = this.components.get(OBC.Classifier);
        await classifier.byCategory();

        const groups = classifier.list.get('Categories');
        if (!groups) { this._categoryGroups = []; return []; }

        this._categoryGroups = [];
        for (const [name, groupData] of groups) {
            // Resolve dynamic query to get current ModelIdMap and count
            const map   = await groupData.get();
            const count = Object.values(map).reduce((s, ids) => s + (ids?.length ?? 0), 0);
            this._categoryGroups.push({ name, groupData, visible: true, count });
        }
        return this._categoryGroups.map(g => g.name);
    }

    getCategoryList() {
        if (!this._categoryGroups) return [];
        return this._categoryGroups.map(g => ({
            name: g.name, count: g.count, visible: g.visible,
        }));
    }

    async setCategoryVisible(category, visible) {
        const group = this._categoryGroups?.find(g => g.name === category);
        if (!group) return;
        group.visible = visible;
        const map   = await group.groupData.get(); // ← correct: resolve dynamic query
        const hider = this.components.get(OBC.Hider);
        await hider.set(visible, map);
    }

    async _applyDefaultCategoryColors(model) {
        if (!this._categoryGroups) return;
        for (const { name, groupData } of this._categoryGroups) {
            const color = CATEGORY_COLORS[name];
            if (!color) continue;
            const map      = await groupData.get(); // ← correct
            const localIds = map[model.modelId];
            if (localIds?.length) await model.setColor(localIds, color);
        }
    }

    // ── Selection & hover ────────────────────────────────────────────────────

    async pickElement(clientX, clientY) {
        const world = this._getWorld();
        if (!world) return null;

        const fragments = this.components.get(OBC.FragmentsManager);
        const canvas    = world.renderer.three.domElement;

        if (this._selectedItems) {
            await fragments.resetHighlight(this._selectedItems);
            this._selectedItems = null;
            this._selectedKey   = null;
        }
        this._hoveredKey = null;
        if (this._canvas) this._canvas.style.cursor = CURSOR_DEFAULT;

        const results = await Promise.all(
            PICK_OFFSETS.map(([dx, dy]) => fragments.raycast({
                camera: world.camera.three,
                mouse:  new THREE.Vector2(clientX + dx, clientY + dy),
                dom:    canvas,
            }))
        );

        const best = results
            .filter(Boolean)
            .reduce((min, r) => (!min || r.distance < min.distance) ? r : min, null);

        if (!best) return null;

        const { localId, fragments: fmodel } = best;
        const modelIdMap = { [fmodel.modelId]: [localId] };

        await fragments.highlight(SELECTION_STYLE, modelIdMap);
        this._selectedItems = modelIdMap;
        this._selectedKey   = `${fmodel.modelId}:${localId}`;

        const rawData = await fragments.getData(modelIdMap, DATA_CONFIG);
        return this._parseItemData(rawData);
    }

    async clearSelection() {
        if (!this._selectedItems) return;
        const fragments = this.components.get(OBC.FragmentsManager);
        await fragments.resetHighlight(this._selectedItems);
        this._selectedItems = null;
        this._selectedKey   = null;
    }

    async hoverElement(clientX, clientY) {
        if (this._hoverInFlight) return;
        const world = this._getWorld();
        if (!world) return;

        this._hoverInFlight = true;
        try {
            const fragments = this.components.get(OBC.FragmentsManager);
            const canvas    = this._canvas ?? world.renderer.three.domElement;

            const result = await fragments.raycast({
                camera: world.camera.three,
                mouse:  new THREE.Vector2(clientX, clientY),
                dom:    canvas,
            });

            const newKey = result ? `${result.fragments.modelId}:${result.localId}` : null;
            // Capture 3D hit point for coordinate display
            this._lastHitPoint = result?.point ?? null;
            if (newKey === this._hoveredKey) return;
            this._hoveredKey = newKey;
            canvas.style.cursor = newKey ? CURSOR_HOVER : CURSOR_DEFAULT;
        } finally {
            this._hoverInFlight = false;
        }
    }

    clearHover() {
        this._hoveredKey   = null;
        this._lastHitPoint = null;
        if (this._canvas) this._canvas.style.cursor = CURSOR_DEFAULT;
    }

    // ── Section cuts ─────────────────────────────────────────────────────────

    /**
     * Create an interactive clipping plane with a TransformControls gizmo.
     * The gizmo renders directly in the 3D scene — no sliders needed.
     * Initial orientation: horizontal (plane faces up, clips geometry above pivot).
     */
    createSectionCut() {
        const clipper = this.components.get(OBC.Clipper);
        clipper.enabled = true;
        const world  = this._getWorld();
        const bounds = this._getModelBounds();
        const center = bounds?.center ?? new THREE.Vector3();
        const size   = bounds?.size   ?? new THREE.Vector3(100, 100, 100);
        const planeSize = Math.max(size.x, size.z) * 2.2;

        // ── Gizmo pivot Object3D ──────────────────────────────────────────
        this._planePivot = new THREE.Object3D();
        this._planePivot.position.copy(center);
        // PlaneGeometry normal = local +Z. We want world normal = (0,-1,0) (clips y > center.y).
        // rotation.x = +π/2 → local +Z becomes (0,-1,0) ✓
        this._planePivot.rotation.x = Math.PI / 2;
        world.scene.three.add(this._planePivot);

        // ── Visual plane mesh (semi-transparent quad) ─────────────────────
        const planeMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(planeSize, planeSize),
            new THREE.MeshBasicMaterial({
                color: 0x2196f3, transparent: true, opacity: 0.07,
                side: THREE.DoubleSide, depthWrite: false,
            })
        );
        planeMesh.renderOrder = 500;
        this._planePivot.add(planeMesh);

        // ── Border edge ───────────────────────────────────────────────────
        const edgeGeo  = new THREE.EdgesGeometry(new THREE.PlaneGeometry(planeSize, planeSize));
        const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
            color: 0x42a5f5, transparent: true, opacity: 0.55,
        }));
        this._planePivot.add(edgeLine);

        // ── Crosshair lines ───────────────────────────────────────────────
        const h = planeSize / 2;
        const chPts = new Float32Array([-h,0,0, h,0,0,  0,-h,0, 0,h,0]);
        const chGeo = new THREE.BufferGeometry();
        chGeo.setAttribute('position', new THREE.BufferAttribute(chPts, 3));
        this._planePivot.add(new THREE.LineSegments(chGeo, new THREE.LineBasicMaterial({
            color: 0x42a5f5, transparent: true, opacity: 0.22,
        })));

        // ── TransformControls (r163+ API: getHelper()) ────────────────────
        const tc = new TransformControls(world.camera.three, world.renderer.three.domElement);
        tc.attach(this._planePivot);
        tc.setMode('translate');
        tc.setSpace('world');
        tc.setSize(1.1);

        const helper = tc.getHelper?.() ?? tc;
        world.scene.three.add(helper);
        this._tcHelper = helper;

        // Interlock: disable camera orbit while dragging gizmo
        tc.addEventListener('mouseDown', () => { if (world.camera.controls) world.camera.controls.enabled = false; });
        tc.addEventListener('mouseUp',   () => { if (world.camera.controls) world.camera.controls.enabled = true; });
        tc.addEventListener('change',    () => this._updateClippingFromPivot());

        this._transformControls = tc;

        // ── OBC Clipper plane (initial: normal pointing down) ─────────────
        const id = clipper.createFromNormalAndCoplanarPoint(
            world, new THREE.Vector3(0, -1, 0), center.clone()
        );
        this._sectionPlaneId = id;

        return { id };
    }

    /** Set TransformControls mode: 'translate' | 'rotate' */
    setSectionMode(mode) {
        this._transformControls?.setMode(mode);
    }

    /** Recompute OBC clipping plane from the pivot's current world transform. */
    _updateClippingFromPivot() {
        if (!this._sectionPlaneId || !this._planePivot) return;
        const clipper = this.components.get(OBC.Clipper);
        const plane   = clipper.list.get(this._sectionPlaneId);
        if (!plane) return;

        this._planePivot.updateWorldMatrix(true, false);

        // Plane normal = local +Z (PlaneGeometry normal) transformed to world space
        const normal = new THREE.Vector3(0, 0, 1)
            .transformDirection(this._planePivot.matrixWorld);
        const point = new THREE.Vector3()
            .setFromMatrixPosition(this._planePivot.matrixWorld);

        if (typeof plane.setFromNormalAndCoplanarPoint === 'function') {
            plane.setFromNormalAndCoplanarPoint(normal, point);
        } else if (plane.plane) {
            plane.plane.setFromNormalAndCoplanarPoint(normal, point);
        }
    }

    deleteSectionCuts() {
        const world = this._getWorld();

        if (this._transformControls) {
            this._transformControls.detach();
            this._transformControls.dispose();
            this._transformControls = null;
        }
        if (this._tcHelper) {
            world.scene.three.remove(this._tcHelper);
            this._tcHelper = null;
        }
        if (this._planePivot) {
            this._planePivot.clear();
            world.scene.three.remove(this._planePivot);
            this._planePivot = null;
        }

        const clipper = this.components.get(OBC.Clipper);
        clipper.deleteAll();
        clipper.enabled      = false;
        this._sectionPlaneId = null;
    }

    // ── Spatial structure ────────────────────────────────────────────────────

    async getSpatialTree() {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = [...fragments.list.values()][0];
        if (!model) return null;
        return model.getSpatialStructure();
    }

    async setStoreyVisible(localId, visible) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model     = [...fragments.list.values()][0];
        if (!model) return;
        const hider = this.components.get(OBC.Hider);
        await hider.set(visible, { [model.modelId]: [localId] });
    }

    // ── Properties ───────────────────────────────────────────────────────────

    async refreshElement() {
        if (!this._selectedItems) return null;
        const fragments = this.components.get(OBC.FragmentsManager);
        return this._parseItemData(await fragments.getData(this._selectedItems, DATA_CONFIG));
    }

    async addPsetToElement(psetName, props) {
        if (!this._selectedItems) throw new Error('Kein Element ausgewählt');
        const fragments = this.components.get(OBC.FragmentsManager);
        const [modelId, localIds] = Object.entries(this._selectedItems)[0];
        if (!localIds?.length) throw new Error('Keine localId gefunden');

        const model = [...fragments.list.values()].find(m => m.modelId === modelId);
        if (!model?.editor) throw new Error('Model oder Editor nicht verfügbar');

        const elementLocalId = localIds[0];
        const propIds = await model.editor.edit(modelId, props.map(p => ({
            type: 5,
            data: {
                category: 'IFCPROPERTYSINGLEVALUE',
                data: { Name: { value: p.name }, NominalValue: { value: p.value ?? '' } },
            },
        })));

        const [psetId] = await model.editor.edit(modelId, [{
            type: 5,
            data: { category: 'IFCPROPERTYSET', data: { Name: { value: psetName } } },
        }]);

        await model.editor.edit(modelId, [
            { type: 6, localId: psetId,          data: { data: { HasProperties: propIds } } },
            { type: 6, localId: elementLocalId,  data: { data: { IsDefinedBy: [psetId] } } },
        ]);
    }

    // ── Civil geometry ───────────────────────────────────────────────────────

    async _loadAlignments(model, world) {
        try {
            const g = await model.getHorizontalAlignments();
            if (g?.children?.length) world.scene.three.add(g);
        } catch (_) { /* model has no alignments */ }
    }

    async _loadGrids(model, world) {
        try {
            const g = await model.getGrids();
            if (g?.children?.length) world.scene.three.add(g);
        } catch (_) { /* model has no grids */ }
    }

    // ── Camera ───────────────────────────────────────────────────────────────

    async zoomToFit() {
        const b = this._getModelBounds();
        if (!b) return;
        const d = b.maxDim * 1.5;
        await this._getWorld().camera.controls.setLookAt(
            b.center.x + d * 0.6, b.center.y + d * 0.6, b.center.z + d * 0.6,
            b.center.x, b.center.y, b.center.z, true
        );
    }

    async viewTop() {
        const b = this._getModelBounds();
        if (!b) return;
        await this._getWorld().camera.controls.setLookAt(
            b.center.x, b.center.y + b.maxDim * 2, b.center.z,
            b.center.x, b.center.y, b.center.z, true
        );
    }

    async viewFront() {
        const b = this._getModelBounds();
        if (!b) return;
        await this._getWorld().camera.controls.setLookAt(
            b.center.x, b.center.y, b.center.z + b.maxDim * 2,
            b.center.x, b.center.y, b.center.z, true
        );
    }

    async viewSide() {
        const b = this._getModelBounds();
        if (!b) return;
        await this._getWorld().camera.controls.setLookAt(
            b.center.x + b.maxDim * 2, b.center.y, b.center.z,
            b.center.x, b.center.y, b.center.z, true
        );
    }

    async resetView() {
        await this._getWorld().camera.controls.setLookAt(10, 10, 10, 0, 0, 0, true);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Returns the last fragment raycast hit point in both Three.js world coords
     * and original IFC coords (before coordinateToOrigin shift).
     * Returns null when cursor is over empty space.
     */
    getHitPoint() {
        if (!this._lastHitPoint) return null;
        const p   = this._lastHitPoint;
        const off = this._coordinationOffset;
        return {
            x: p.x, y: p.y, z: p.z,
            ox: p.x + off.x,
            oy: p.y + off.y,
            oz: p.z + off.z,
        };
    }

    _getWorld() {
        const worlds = this.components.get(OBC.Worlds);
        return [...worlds.list.values()][0];
    }

    _getModelBounds() {
        const fragments = this.components.get(OBC.FragmentsManager);
        const models    = [...fragments.list.values()];
        if (!models.length) return null;

        const box = new THREE.Box3();
        for (const m of models) {
            if (m.box && !m.box.isEmpty()) box.union(m.box);
        }
        if (box.isEmpty()) return null;

        const center = new THREE.Vector3();
        const size   = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        return { center, size, maxDim: Math.max(size.x, size.y, size.z) };
    }

    async _fitCameraToModel(model, world) {
        try {
            if (!model.box || model.box.isEmpty()) await new Promise(r => setTimeout(r, 1500));
            const box = model.box;
            if (!box || box.isEmpty()) return;

            const center = new THREE.Vector3();
            const size   = new THREE.Vector3();
            box.getCenter(center);
            box.getSize(size);

            const d = Math.max(size.x, size.y, size.z) * 1.5;

            await world.camera.controls.setLookAt(
                center.x + d * 0.6, center.y + d * 0.6, center.z + d * 0.6,
                center.x, center.y, center.z, true
            );
        } catch (e) {
            console.warn('[IfcEngine] Could not fit camera:', e);
        }
    }

    _parseItemData(rawData) {
        const modelEntries = Object.values(rawData);
        if (!modelEntries.length || !modelEntries[0].length) return null;
        const item = modelEntries[0][0];

        const scalar = (v) => {
            if (v == null) return null;
            if (typeof v === 'object' && 'value' in v) return v.value;
            if (typeof v === 'object') return null;
            return v;
        };

        const RESERVED = new Set([
            '_category', 'GlobalId', 'Name', 'Description',
            'IsDefinedBy', 'IsTypedBy', 'HasAssociations', 'OwnerHistory',
        ]);

        const attrs = [];
        for (const [key, val] of Object.entries(item)) {
            if (RESERVED.has(key)) continue;
            const s = scalar(val);
            if (s != null && s !== '') attrs.push({ name: key, value: String(s) });
        }

        const psets = [], quantities = [];
        for (const rel of (item['IsDefinedBy'] ?? [])) {
            const relName = rel['Name']?.value ?? rel['Name'] ?? '';
            if (Array.isArray(rel['HasProperties'])) {
                const props = rel['HasProperties'].map(p => ({
                    name:  p['Name']?.value ?? p['Name'] ?? '',
                    value: p['NominalValue']?.value ?? p['Value']?.value ?? '',
                })).filter(p => p.name);
                if (props.length || relName) psets.push({ name: String(relName), props });
            } else if (Array.isArray(rel['HasQuantities'])) {
                const props = rel['HasQuantities'].map(q => ({
                    name:  q['Name']?.value ?? q['Name'] ?? '',
                    value: q['LengthValue']?.value ?? q['AreaValue']?.value
                        ?? q['VolumeValue']?.value ?? q['CountValue']?.value
                        ?? q['WeightValue']?.value ?? q['Value']?.value ?? '',
                })).filter(p => p.name);
                quantities.push({ name: String(relName), props });
            }
        }

        let typeName = null;
        const typeRels = item['IsTypedBy'];
        if (Array.isArray(typeRels) && typeRels.length) {
            typeName = typeRels[0]['Name']?.value ?? typeRels[0]['Name'] ?? null;
        }

        const materials = [];
        for (const assoc of (item['HasAssociations'] ?? [])) {
            const mat = assoc['RelatingMaterial'];
            if (mat) {
                const n = mat['Name']?.value ?? mat['Name'] ?? null;
                if (n) materials.push(String(n));
            }
        }

        return {
            type:           (scalar(item['_category']) ?? '').toUpperCase(),
            name:           scalar(item['Name'])           ?? '',
            globalId:       scalar(item['GlobalId'])       ?? '',
            description:    scalar(item['Description'])    ?? '',
            predefinedType: scalar(item['PredefinedType']) ?? '',
            attrs, typeName, psets, quantities, materials,
        };
    }

    dispose() {
        if (this.components) this.components.dispose();
        if (this.container?.innerHTML) this.container.innerHTML = '';
    }
}
