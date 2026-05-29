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

// Multi-sample offsets (px) around the click point — improves hit rate on thin
// edges and small elements without requiring an exact pixel hit.
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
        this._measureGroup   = null; // THREE.Group with measurement visuals
        this._measurePoints  = [];
        this._measurements   = [];
        this._hoverMarker    = null;
        this._firstMarker    = null;
        this._annotationGroup = null;
        this._annotations     = [];
        this._lastPlotFrustum = null; // captured by getScaleSnapshot, read by vector plotter
        this._hoverInFlight  = false;
        this._canvas         = null;

        // Category / layer visibility
        // Each entry: { name, groupData (ClassificationGroupData), visible, count }
        this._categoryGroups = null;

        // Section cut gizmo
        this._clippingPlane         = null; // THREE.Plane — native renderer clipping plane
        this._sectionRenderHook     = null; // per-frame hook that syncs plane to pivot
        this._planePivot            = null; // THREE.Object3D — gizmo anchor
        this._tcHelper              = null; // TransformControls visual helper in scene
        this._transformControls     = null; // TransformControls instance
        this._sectionChangeCallback = null; // fired on every pivot change
        this._onTcMouseDown         = null; // named listener refs for cleanup
        this._onTcMouseUp           = null;

        // Coordinate offsets (IFC-raw ↔ Three.js-world) — per-model for Multi-IFC safety.
        // _coordOffsets: Map<modelId, THREE.Vector3> where offset = IFC-raw - threeJS-world
        // _coordinationOffset: legacy single-model accessor — points to the FIRST loaded
        //   model's offset for backward compat. New code should read _coordOffsets.
        this._coordOffsets       = new Map();
        this._coordinationOffset = new THREE.Vector3();
        this._lastHitPoint       = null; // THREE.Vector3 | null
        this._lastHitModelId     = null; // string | null — which model the hover hit

        // Scene grid reference (for visibility toggle)
        this._sceneGrid = null;
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

        // near=0.5m prevents z-fighting at close range; far=100km covers sewer networks
        world.camera.three.near = 0.5;
        world.camera.three.far  = 100000;
        world.camera.three.updateProjectionMatrix();

        this.components.init();
        world.scene.setup();
        world.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);
        world.camera.controls.dollySpeed = 0.7; // default is 1.0 — moderately slowed for finer zoom control

        const grids = this.components.get(OBC.Grids);
        this._sceneGrid = grids.create(world);
        world.scene.three.add(this._sceneGrid.three);

        this.components.get(OBC.Raycasters).get(world);

        const fragments = this.components.get(OBC.FragmentsManager);
        fragments.init('/worker.mjs');

        // Default graphicsQuality = 0 (low) renders pipes/MEP as line strips.
        // Set to 1 (high) so full 3D tessellation is used everywhere.
        if (fragments.core?.settings) {
            fragments.core.settings.graphicsQuality = 1;
        }

        const ifcLoader = this.components.get(OBC.IfcLoader);
        await ifcLoader.setup({ wasm: { path: '/', absolute: true }, autoSetWasm: false });

        const clipper = this.components.get(OBC.Clipper);
        clipper.setup();
        // Disable OBC Clipper's per-frame hook: it resets renderer.clippingPlanes = []
        // every frame (even with no planes), which would wipe our native THREE.Plane.
        clipper.enabled = false;

        this._canvas = world.renderer.three.domElement;
    }

    // ── Model loading ────────────────────────────────────────────────────────

    async loadIfc(data, name = 'model') {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const fragments = this.components.get(OBC.FragmentsManager);
        const world     = this._getWorld();

        const model = await ifcLoader.load(data, true, name);
        world.scene.three.add(model.object);

        // ── Coordinate offset (Strategy B: keep Three.js centred, track IFC original) ──
        // coordinateToOrigin=true causes ifcLoader to subtract objPos from every vertex.
        // To convert a Three.js-world point back to IFC-raw coords:
        //   ifcRaw = threeJsWorld + offset    where offset = -objPos
        const objPos    = model.object.position;
        const modelOff  = new THREE.Vector3(-objPos.x, -objPos.y, -objPos.z);
        this._coordOffsets.set(model.modelId, modelOff);
        // Legacy single-model accessor — first model wins
        if (this._coordOffsets.size === 1) this._coordinationOffset.copy(modelOff);

        // Wait for the geometry to actually exist BEFORE acting on it.
        // The worker tessellates async — if we proceed too early, model.box is empty,
        // classifier returns empty maps, and setColor/setVisible are silent no-ops.
        let busyTries = 0;
        while (model.isBusy && busyTries < 60) {
            await new Promise(r => setTimeout(r, 200));
            busyTries++;
        }

        // Multiple update cycles + frame yields so the worker commits its tiles
        for (let i = 0; i < 5; i++) {
            await fragments.core.update(true);
            await new Promise(r => requestAnimationFrame(() => r()));
        }

        // Now fit camera (box is populated), then bind for LOD/culling at final position
        await this._fitCameraToModel(model, world);
        model.useCamera(world.camera.three);
        await fragments.core.update(true);
        await new Promise(r => requestAnimationFrame(() => r()));

        // ALL_VISIBLE: every item as full geometry regardless of distance
        try { await model.setLodMode(FRAGS.LodMode.ALL_VISIBLE); } catch { /* */ }
        await fragments.core.update(true);

        await Promise.all([
            this.buildCategoryIndex()
                .then(() => this._applyDefaultCategoryColors(model))
                .then(() => fragments.core.update(true)),
            this._loadAlignments(model, world),
            this._loadGrids(model, world),
        ]);

        await this._replayInitialVisibilityToggle();
        await fragments.core.update(true);

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
        try {
            if (typeof model.dispose === 'function') model.dispose();
            else fragments.list.delete(modelId);
        } catch (_) { fragments.list.delete(modelId); }
        // Drop the offset entry for this model so it doesn't leak / collide later
        this._coordOffsets.delete(modelId);
        // If the removed model was the legacy primary, repoint to whatever's left
        if (this._coordOffsets.size) this._coordinationOffset.copy([...this._coordOffsets.values()][0]);
        else                          this._coordinationOffset.set(0, 0, 0);
        // Rebuild categories for remaining models
        if (fragments.list.size > 0) {
            await this.buildCategoryIndex();
        } else {
            this._categoryGroups = null;
        }
    }

    // ── Category / Layer visibility ──────────────────────────────────────────

    async buildCategoryIndex() {
        try {
            const classifier = this.components.get(OBC.Classifier);
            await classifier.byCategory();

            const groups = classifier.list.get('Categories');
            if (!groups) { this._categoryGroups = []; return []; }

            this._categoryGroups = [];
            for (const [name, groupData] of groups) {
                const map   = await groupData.get();
                const count = Object.values(map).reduce((s, ids) => s + (ids?.length ?? 0), 0);
                this._categoryGroups.push({ name, groupData, visible: true, count });
            }
            return this._categoryGroups.map(g => g.name);
        } catch (err) {
            console.error('[IfcEngine] buildCategoryIndex failed:', err);
            this._categoryGroups = [];
            return [];
        }
    }

    getCategoryList() {
        if (!this._categoryGroups) return [];
        return this._categoryGroups.map(g => ({
            name: g.name, count: g.count, visible: g.visible,
        }));
    }

    /**
     * Return the raw category groups (with groupData accessors) — used by the
     * geometry-processor to build a localId→category map.
     */
    getCategoryGroups() { return this._categoryGroups ?? []; }

    async setCategoryVisible(category, visible) {
        const group = this._categoryGroups?.find(g => g.name === category);
        if (!group) return;
        group.visible = visible;
        const map   = await group.groupData.get();
        const hider = this.components.get(OBC.Hider);
        await hider.set(visible, map);
    }

    /**
     * Set the LOD/culling mode so all geometry is rendered in full detail,
     * regardless of camera distance.
     *
     * Bug background: The default LodMode.DEFAULT renders far-away elements
     * as low-detail "LOD geometry" (line strips for pipes, manholes etc.) and
     * only switches to full tessellation when the camera gets close.
     * At load time the camera-fit animation may still be in flight, so the
     * Fragment system tessellates for the initial (far) camera position and
     * never re-evaluates → MEP elements stay as lines until something forces
     * an update (which is what the manual hide/show toggle was doing).
     *
     * LodMode.ALL_GEOMETRY tells the Fragment system to ALWAYS render full
     * tessellation — the standard mode for engineering plan views.
     */
    /**
     * Replay the exact sequence a user performs by clicking
     * "Alle ausblenden" then "Alle einblenden" in the layer panel.
     *
     * Why this and not a bulk call: every previous attempt with a single bulk
     * hider.set() or model.setVisible() failed. The manual user-click is the
     * ONLY known path that produces correct rendering. It runs PER CATEGORY,
     * sequentially, through the same setCategoryVisible() method below.
     * We reproduce that exactly — N async hide calls, frame yield, N async show calls.
     */
    async _replayInitialVisibilityToggle() {
        if (!this._categoryGroups?.length) return;
        const _yield = () => new Promise(r => requestAnimationFrame(() => r()));
        for (const group of this._categoryGroups) {
            try { await this.setCategoryVisible(group.name, false); } catch { /* */ }
        }
        await _yield();
        await _yield();
        for (const group of this._categoryGroups) {
            try { await this.setCategoryVisible(group.name, true); } catch { /* */ }
        }
        await _yield();
    }

    async _forceAllGeometryLod() {
        const fragments = this.components.get(OBC.FragmentsManager);
        for (const model of fragments.list.values()) {
            try {
                // ALL_VISIBLE = 1: "Displays all items as full geometry"
                // Stronger than ALL_GEOMETRY (=2). Pipes/manholes always full-tessellated.
                await model.setLodMode(FRAGS.LodMode.ALL_VISIBLE);
            } catch (e) {
                console.warn('[IfcEngine] setLodMode failed for model', model.modelId, e);
            }
        }
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
            // Capture 3D hit point + which model it belongs to so the coord-bar
            // can apply that model's specific IFC offset (Strategy B, Multi-IFC-safe).
            this._lastHitPoint   = result?.point ?? null;
            this._lastHitModelId = result?.fragments?.modelId ?? null;
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
        const world  = this._getWorld();
        const bounds = this._getModelBounds();
        const center = bounds?.center ?? new THREE.Vector3();
        const size   = bounds?.size   ?? new THREE.Vector3(100, 100, 100);
        // 2.2× ensures the plane visually covers the full model footprint with margin
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
                // polygonOffset pushes the plane slightly toward the camera to avoid
                // Z-fighting with scene geometry at the same depth during orbit
                polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
            })
        );
        planeMesh.renderOrder = 1;
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
        // Store as named refs so deleteSectionCuts() can removeEventListener()
        this._onTcMouseDown = () => { if (world.camera.controls) world.camera.controls.enabled = false; };
        this._onTcMouseUp   = () => { if (world.camera.controls) world.camera.controls.enabled = true; };
        tc.addEventListener('mouseDown', this._onTcMouseDown);
        tc.addEventListener('mouseUp',   this._onTcMouseUp);

        this._transformControls = tc;

        // ── Native Three.js clipping plane ────────────────────────────────
        this._clippingPlane = new THREE.Plane();
        world.renderer.three.localClippingEnabled = true;
        world.renderer.three.clippingPlanes = [this._clippingPlane];

        // Per-frame hook: syncs clipping plane from pivot's world matrix BEFORE each render.
        // Using onBeforeUpdate (not TC 'change') ensures the plane is applied exactly once per
        // frame and runs AFTER any OBC component updates that might clear clippingPlanes.
        this._sectionRenderHook = () => this._updateClippingFromPivot();
        world.renderer.onBeforeUpdate.add(this._sectionRenderHook);

        return {};
    }

    /** Set TransformControls mode: 'translate' | 'rotate' */
    setSectionMode(mode) {
        this._transformControls?.setMode(mode);
    }

    /** Recompute native clipping plane from the pivot's current world transform. */
    _updateClippingFromPivot() {
        if (!this._clippingPlane || !this._planePivot) return;

        this._planePivot.updateWorldMatrix(true, false);

        // Plane normal = local +Z (PlaneGeometry normal) transformed to world space
        const normal = new THREE.Vector3(0, 0, 1)
            .transformDirection(this._planePivot.matrixWorld);
        const point = new THREE.Vector3()
            .setFromMatrixPosition(this._planePivot.matrixWorld);

        this._clippingPlane.setFromNormalAndCoplanarPoint(normal, point);

        this._sectionChangeCallback?.();
    }

    setSectionChangeCallback(fn) { this._sectionChangeCallback = fn; }

    getSectionPosition() {
        if (!this._planePivot) return null;
        const p = this._planePivot.position;
        return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
    }

    /** Snap section pivot to one of three cardinal orientations. */
    snapSectionTo(axis) {
        if (!this._planePivot) return;
        this._planePivot.rotation.set(0, 0, 0);
        if      (axis === 'horizontal') this._planePivot.rotation.x = Math.PI / 2;
        else if (axis === 'x')          this._planePivot.rotation.y = -Math.PI / 2;
        // axis === 'z': no rotation → local +Z stays world +Z
        this._planePivot.updateWorldMatrix(true, false);
        this._updateClippingFromPivot();
    }

    /** Reset section pivot to model center, horizontal. */
    resetSection() {
        if (!this._planePivot) return;
        const bounds = this._getModelBounds();
        const center = bounds?.center ?? new THREE.Vector3();
        this._planePivot.position.copy(center);
        this._planePivot.rotation.set(Math.PI / 2, 0, 0);
        this._planePivot.updateWorldMatrix(true, false);
        this._updateClippingFromPivot();
    }

    deleteSectionCuts() {
        const world = this._getWorld();

        if (this._sectionRenderHook) {
            world.renderer.onBeforeUpdate.remove(this._sectionRenderHook);
            this._sectionRenderHook = null;
        }

        if (this._transformControls) {
            // Remove named listeners before dispose to prevent memory leaks
            if (this._onTcMouseDown) this._transformControls.removeEventListener('mouseDown', this._onTcMouseDown);
            if (this._onTcMouseUp)   this._transformControls.removeEventListener('mouseUp',   this._onTcMouseUp);
            this._onTcMouseDown = null;
            this._onTcMouseUp   = null;
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

        world.renderer.three.clippingPlanes      = [];
        world.renderer.three.localClippingEnabled = false;
        this._clippingPlane = null;
    }

    /** Return the active clipping plane (used by vector plotter for section contour). */
    getSectionCutPlane() { return this._clippingPlane ?? null; }

    /** Show or hide the TransformControls gizmo without removing the clip plane. */
    setSectionGizmoVisible(visible) {
        if (this._tcHelper)          this._tcHelper.visible          = visible;
        if (this._transformControls) this._transformControls.enabled = visible;
    }

    // ── Render state / Layer styles ──────────────────────────────────────────

    /** Set Three.js scene background color. Pass null to restore default dark bg. */
    setBackgroundColor(hexColor) {
        const world = this._getWorld();
        world.scene.three.background = hexColor
            ? new THREE.Color(hexColor)
            : new THREE.Color('#1a1a2e');
    }

    /** Toggle the reference grid visibility. */
    setGridVisible(visible) {
        if (this._sceneGrid) this._sceneGrid.three.visible = visible;
    }

    /** Switch camera between 'Perspective' and 'Orthographic'. */
    async setCameraProjection(type) {
        const world = this._getWorld();
        if (world?.camera?.projection) {
            await world.camera.projection.set(type);
        }
    }

    /** Re-apply default category colors to all loaded models (used when restoring a style). */
    async resetCategoryColors() {
        if (!this._categoryGroups) return;
        const fragments = this.components.get(OBC.FragmentsManager);
        for (const model of fragments.list.values()) {
            await this._applyDefaultCategoryColors(model);
        }
    }

    /**
     * Apply a custom color map { IFC_CATEGORY_NAME: '#rrggbb' } to all models,
     * or call resetCategoryColors() when colorMap is null (restores defaults).
     * Used by LayerStyleManager.applyLayerStyle().
     */
    async applyStyleColors(colorMap) {
        if (!colorMap) { await this.resetCategoryColors(); return; }
        if (!this._categoryGroups) return;

        const fragments = this.components.get(OBC.FragmentsManager);
        for (const { name, groupData } of this._categoryGroups) {
            const hex = colorMap[name];
            if (!hex) continue;
            const color = new THREE.Color(hex);
            try {
                const map = await groupData.get();
                for (const model of fragments.list.values()) {
                    const localIds = map[model.modelId];
                    if (localIds?.length) await model.setColor(localIds, color);
                }
            } catch (_) { /* category absent in some models */ }
        }
    }

    /**
     * Snapshot current render state so it can be restored after a style preview.
     * Returns a plain object — pass it back to restoreRenderState().
     */
    saveRenderState() {
        const world = this._getWorld();
        const cam   = world?.camera?.three;
        const bg    = world?.scene?.three?.background;
        return {
            bg:          bg ? bg.clone() : null,
            projection:  world?.camera?.projection?.current ?? 'Perspective',
            gridVisible: this._sceneGrid ? this._sceneGrid.three.visible : true,
                orthoExtent: null, // scale export uses getScaleSnapshot — no frustum manipulation
        };
    }

    /** Restore render state saved by saveRenderState(). */
    async restoreRenderState(saved) {
        if (!saved) return;
        const world = this._getWorld();
        if (saved.bg && world?.scene?.three)  world.scene.three.background = saved.bg;
        if (world?.camera?.projection)         await world.camera.projection.set(saved.projection);
        this.setGridVisible(saved.gridVisible);
        await this.resetCategoryColors();
        if (saved.orthoExtent) this.setOrthoExtent(saved.orthoExtent);
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

    /**
     * Collect all storeys across loaded models with their elevation (m) and bounding-box.
     * Returns [] for models without storey structure (e.g. infrastructure).
     */
    async getStoreyList() {
        const fragments = this.components.get(OBC.FragmentsManager);
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const webIfc    = ifcLoader?.webIfc;
        if (!fragments.list.size) return [];

        const storeys = [];
        for (const model of fragments.list.values()) {
            let tree;
            try { tree = await model.getSpatialStructure(); } catch { continue; }
            if (!tree) continue;

            // Recursively find all IFCBUILDINGSTOREY nodes
            const found = [];
            const walk = (node) => {
                if (!node) return;
                if ((node.category ?? '').toUpperCase() === 'IFCBUILDINGSTOREY') found.push(node);
                for (const c of node.children ?? []) walk(c);
            };
            walk(tree);

            for (const node of found) {
                // Elevation from web-ifc raw entity
                let elevation = null;
                if (webIfc) {
                    try {
                        const ent = webIfc.GetLine(0, node.localId, false);
                        elevation = ent?.Elevation?.value ?? null;
                    } catch { /* skip */ }
                }

                // Collect all descendant localIds for box-union
                const ids = [];
                const collect = (n) => {
                    if (n.localId != null) ids.push(n.localId);
                    for (const c of n.children ?? []) collect(c);
                };
                collect(node);

                let box = null;
                try {
                    const boxes = await model.getBoxes(ids);
                    if (boxes?.length) {
                        const union = new THREE.Box3();
                        union.makeEmpty();
                        for (const b of boxes) if (!b.isEmpty()) union.union(b);
                        if (!union.isEmpty()) box = union;
                    }
                } catch { /* skip */ }

                storeys.push({
                    modelId:   model.modelId,
                    localId:   node.localId,
                    name:      (node.name ?? '').trim() || `Storey ${node.localId}`,
                    elevation,
                    box, // THREE.Box3 or null
                });
            }
        }

        // Sort by elevation (lowest first) for natural floor order
        storeys.sort((a, b) => {
            const ea = a.elevation ?? -Infinity;
            const eb = b.elevation ?? -Infinity;
            return ea - eb;
        });
        return storeys;
    }

    /**
     * Fit the camera to a storey's bounding box. Optionally place an active
     * section cut at (storey-floor + sliceOffset) metres for a true plan-view.
     */
    async gotoStorey(modelId, localId, { withSection = false, sliceOffset = 1.2 } = {}) {
        const storeys = await this.getStoreyList();
        const s = storeys.find(x => x.modelId === modelId && x.localId === localId);
        if (!s || !s.box) return false;

        await this._getWorld().camera.controls.fitToBox(s.box, true, {
            paddingLeft: 0.5, paddingRight: 0.5, paddingTop: 0.5, paddingBottom: 0.5,
        });

        if (withSection) {
            // Tear down any existing section, then create a horizontal cut at floor + offset
            this.deleteSectionCuts();
            this.createSectionCut();
            if (this._planePivot) {
                const floorY = s.box.min.y;
                const center = new THREE.Vector3();
                s.box.getCenter(center);
                this._planePivot.position.set(center.x, floorY + sliceOffset, center.z);
                this._planePivot.rotation.set(Math.PI / 2, 0, 0); // horizontal
                this._planePivot.updateWorldMatrix(true, false);
                this._updateClippingFromPivot();
            }
        }
        return true;
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
        const cam = this._getWorld().camera;
        // Looking straight down: default up=(0,1,0) is parallel to view direction → gimbal lock.
        // Set up=(0,0,-1) so the Z-axis points "north" on screen for a standard plan orientation.
        cam.three.up.set(0, 0, -1);
        await cam.controls.setLookAt(
            b.center.x, b.center.y + b.maxDim * 2, b.center.z,
            b.center.x, b.center.y,                b.center.z,
            false  // immediate — no transition; PDF export needs final position right away
        );
    }

    async viewFront() {
        const b = this._getModelBounds();
        if (!b) return;
        const cam = this._getWorld().camera;
        cam.three.up.set(0, 1, 0);
        await cam.controls.setLookAt(
            b.center.x, b.center.y, b.center.z + b.maxDim * 2,
            b.center.x, b.center.y, b.center.z,
            false
        );
    }

    async viewSide() {
        const b = this._getModelBounds();
        if (!b) return;
        const cam = this._getWorld().camera;
        cam.three.up.set(0, 1, 0);
        await cam.controls.setLookAt(
            b.center.x + b.maxDim * 2, b.center.y, b.center.z,
            b.center.x,                b.center.y, b.center.z,
            false
        );
    }

    async resetView() {
        await this._getWorld().camera.controls.setLookAt(10, 10, 10, 0, 0, 0, true);
    }

    /**
     * Pan the camera by (dx, dy) pixels. camera-controls.truck() converts
     * pixel deltas to world-space movement internally based on truckSpeed.
     */
    truckCamera(dx, dy) {
        this._getWorld()?.camera?.controls?.truck(dx, dy, false);
    }

    /** Move the camera to look at a single world-space point. */
    async lookAtPoint(x, y, z, distance = 5) {
        const ctrls = this._getWorld()?.camera?.controls;
        if (!ctrls) return;
        await ctrls.setLookAt(x + distance, y + distance, z + distance, x, y, z, true);
    }

    // ── Annotations (markers + text pinned in 3D space) ─────────────────────

    enableAnnotationMode() {
        if (this._annotationGroup) return;
        const world = this._getWorld();
        this._annotationGroup = new THREE.Group();
        this._annotationGroup.name = 'annotation-overlay';
        world.scene.three.add(this._annotationGroup);
        // Existing persisted annotations get redrawn
        for (const a of (this._annotations ?? [])) this._drawAnnotationMarker(a);
    }

    disableAnnotationMode() {
        // Keep _annotations data; just remove visuals
        if (!this._annotationGroup) return;
        const world = this._getWorld();
        this._annotationGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        world.scene.three.remove(this._annotationGroup);
        this._annotationGroup = null;
    }

    /**
     * Add an annotation at the world-point under (clientX, clientY).
     * Returns the new annotation { id, position, text, color, labelOffset, idx } or null if no hit.
     */
    async addAnnotation(clientX, clientY, text, color = '#e91e63') {
        const pt = await this._probeWorldPoint(clientX, clientY);
        if (!pt) return null;
        if (!this._annotations) this._annotations = [];

        const ann = {
            id:   Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            position: [pt.x, pt.y, pt.z],
            text: (text ?? '').trim(),
            color,
            labelOffset: [40, -60], // px offset of speech bubble from the pin in screen-space
            idx:  this._annotations.length + 1,
        };
        this._annotations.push(ann);

        if (this._annotationGroup) this._drawAnnotationMarker(ann);
        return ann;
    }

    /** Update an annotation in place. Provide any subset of { text, color, labelOffset, position }. */
    updateAnnotation(id, patch) {
        if (!this._annotations) return false;
        const a = this._annotations.find(x => x.id === id);
        if (!a) return false;
        Object.assign(a, patch);
        if (patch.color !== undefined && this._annotationGroup) {
            // Redraw to pick up the new color
            this.setAnnotations(this._annotations);
        }
        return true;
    }

    /**
     * Project a 3D world point to 2D screen coordinates {x, y} in CSS pixels
     * relative to the canvas. Returns null if behind the camera or no canvas.
     */
    projectToScreen(worldPos) {
        const world = this._getWorld();
        if (!world || !this._canvas) return null;
        const cam   = world.camera.three;
        const v     = new THREE.Vector3().fromArray(worldPos);
        v.project(cam); // → NDC (-1..1)
        if (v.z > 1 || v.z < -1) return null; // outside near/far
        const rect = this._canvas.getBoundingClientRect();
        return {
            x: (v.x * 0.5 + 0.5) * rect.width,
            y: (1 - (v.y * 0.5 + 0.5)) * rect.height,
            behind: false,
        };
    }

    removeAnnotation(id) {
        if (!this._annotations) return;
        this._annotations = this._annotations.filter(a => a.id !== id);
        // Renumber
        this._annotations.forEach((a, i) => { a.idx = i + 1; });
        // Re-draw all
        if (this._annotationGroup) {
            const world = this._getWorld();
            this._annotationGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            while (this._annotationGroup.children.length) {
                this._annotationGroup.remove(this._annotationGroup.children[0]);
            }
            for (const a of this._annotations) this._drawAnnotationMarker(a);
        }
    }

    clearAnnotations() {
        this._annotations = [];
        if (this._annotationGroup) {
            this._annotationGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            while (this._annotationGroup.children.length) {
                this._annotationGroup.remove(this._annotationGroup.children[0]);
            }
        }
    }

    /** Replace the entire annotation list (used when loading from localStorage). */
    setAnnotations(arr) {
        this._annotations = (arr ?? []).map((a, i) => ({ ...a, idx: i + 1 }));
        if (this._annotationGroup) {
            this._annotationGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            while (this._annotationGroup.children.length) {
                this._annotationGroup.remove(this._annotationGroup.children[0]);
            }
            for (const a of this._annotations) this._drawAnnotationMarker(a);
        }
    }

    getAnnotations() { return [...(this._annotations ?? [])]; }

    _drawAnnotationMarker(ann) {
        const cam     = this._getWorld().camera.three;
        const pos     = new THREE.Vector3().fromArray(ann.position);
        const camDist = cam.position.distanceTo(pos);
        const r       = Math.max(0.12, camDist / 150);

        // Outer ring for visibility against any background
        const ringGeo = new THREE.SphereGeometry(r * 1.4, 14, 14);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.renderOrder = 999;

        // Inner pin in the annotation's color
        const colorHex = ann.color ? new THREE.Color(ann.color).getHex() : 0xe91e63;
        const pinGeo = new THREE.SphereGeometry(r, 14, 14);
        const pinMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
        const pin    = new THREE.Mesh(pinGeo, pinMat);
        pin.position.copy(pos);
        pin.renderOrder = 1000;
        pin.userData.annotationId = ann.id;
        pin.userData.idx          = ann.idx;

        this._annotationGroup.add(ring);
        this._annotationGroup.add(pin);
    }

    // ── Saved Views (camera + visibility + section cut) ─────────────────────

    /**
     * Capture the current view: camera pose, visible categories, active section.
     * Returns a plain object ready for JSON.stringify / localStorage.
     */
    captureView() {
        const world  = this._getWorld();
        if (!world) return null;
        const cam    = world.camera.three;
        const ctrls  = world.camera.controls;
        const target = new THREE.Vector3();
        ctrls.getTarget(target);

        const visibleCategories = (this._categoryGroups ?? [])
            .filter(g => g.visible).map(g => g.name);

        // Section: capture pivot pose if active
        let section = null;
        if (this._planePivot) {
            section = {
                position: this._planePivot.position.toArray(),
                rotation: this._planePivot.rotation.toArray().slice(0, 3),
            };
        }

        return {
            camera: {
                position: cam.position.toArray(),
                target:   target.toArray(),
                up:       cam.up.toArray(),
            },
            visibleCategories,
            section,
        };
    }

    /**
     * Apply a previously captured view. Tolerant to missing categories
     * (model could differ from the one the view was saved against).
     */
    async applyView(view) {
        if (!view) return;
        const world = this._getWorld();
        if (!world) return;
        const cam   = world.camera.three;
        const ctrls = world.camera.controls;

        // Camera
        if (view.camera) {
            if (view.camera.up) cam.up.fromArray(view.camera.up);
            const p = view.camera.position;
            const t = view.camera.target;
            if (p && t) await ctrls.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], true);
        }

        // Visibility — set every known category to match the saved set
        if (Array.isArray(view.visibleCategories) && this._categoryGroups?.length) {
            const wanted = new Set(view.visibleCategories);
            for (const g of this._categoryGroups) {
                const shouldBeVisible = wanted.has(g.name);
                if (g.visible !== shouldBeVisible) {
                    try { await this.setCategoryVisible(g.name, shouldBeVisible); } catch { /* */ }
                }
            }
        }

        // Section cut
        if (view.section) {
            if (!this._planePivot) this.createSectionCut();
            if (this._planePivot) {
                this._planePivot.position.fromArray(view.section.position);
                this._planePivot.rotation.set(...view.section.rotation);
                this._planePivot.updateWorldMatrix(true, false);
                this._updateClippingFromPivot();
            }
        } else if (this._planePivot) {
            this.deleteSectionCuts();
        }
    }

    // ── Measurement (distance between 2 points) ─────────────────────────────

    /**
     * Enable interactive distance measurement. Each call to addMeasurePoint(x,y)
     * adds a point; on the 2nd point, a distance is computed and returned.
     */
    enableMeasureMode() {
        if (this._measureGroup) return;
        const world = this._getWorld();
        this._measureGroup = new THREE.Group();
        this._measureGroup.name = 'measurement-overlay';
        world.scene.three.add(this._measureGroup);
        this._measurePoints = [];   // Array<THREE.Vector3>
        this._measurements  = [];   // [{ p1, p2, dist, line, marker1, marker2 }]
    }

    disableMeasureMode() {
        if (!this._measureGroup) return;
        const world = this._getWorld();
        this._measureGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        world.scene.three.remove(this._measureGroup);
        this._measureGroup  = null;
        this._measurePoints = [];
        this._measurements  = [];
        this._hoverMarker   = null;
        this._firstMarker   = null;
    }

    /**
     * Probe the world position under the cursor using OBC's fragment raycaster
     * (same path as hoverElement). Returns THREE.Vector3 or null.
     */
    async _probeWorldPoint(clientX, clientY) {
        const world = this._getWorld();
        if (!world) return null;
        const fragments = this.components.get(OBC.FragmentsManager);
        const canvas    = this._canvas ?? world.renderer.three.domElement;
        const result    = await fragments.raycast({
            camera: world.camera.three,
            mouse:  new THREE.Vector2(clientX, clientY),
            dom:    canvas,
        });
        return result?.point ? result.point.clone() : null;
    }

    /**
     * Update the live hover-marker so the user sees exactly where the next
     * measure point would land. Call from a mousemove handler while in measure mode.
     */
    async updateMeasureHover(clientX, clientY) {
        if (!this._measureGroup) return null;
        const pt = await this._probeWorldPoint(clientX, clientY);
        if (!pt) {
            if (this._hoverMarker) this._hoverMarker.visible = false;
            return null;
        }
        if (!this._hoverMarker) {
            const geo = new THREE.SphereGeometry(0.12, 14, 14);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00e5ff, transparent: true, opacity: 0.7, depthTest: false,
            });
            this._hoverMarker = new THREE.Mesh(geo, mat);
            this._hoverMarker.renderOrder = 1000;
            this._measureGroup.add(this._hoverMarker);
        }
        // Adapt marker size to camera distance so it stays roughly the same on screen
        const cam     = this._getWorld().camera.three;
        const camDist = cam.position.distanceTo(pt);
        const scale   = Math.max(0.3, camDist / 30);
        this._hoverMarker.scale.setScalar(scale);
        this._hoverMarker.position.copy(pt);
        this._hoverMarker.visible = true;
        return pt;
    }

    /**
     * Add a measurement point at screen coords. Uses OBC fragment raycast.
     * Returns { phase, dist?, p1?, p2? }.
     */
    async addMeasurePoint(clientX, clientY) {
        if (!this._measureGroup) return null;
        const hit = await this._probeWorldPoint(clientX, clientY);
        if (!hit) return { phase: 'no-hit' };

        this._measurePoints.push(hit);

        if (this._measurePoints.length < 2) {
            // First point: prominent pulsing marker
            this._addMeasureMarker(hit, /* isFirst */ true);
            return { phase: 'awaiting-second', p1: hit };
        }

        // Second point: convert the pending "first" marker to a regular one + draw line
        this._convertFirstMarkerToFinal();
        this._addMeasureMarker(hit, /* isFirst */ false);

        const [p1, p2] = this._measurePoints;
        const dist = p1.distanceTo(p2);
        this._addMeasureLine(p1, p2, dist);
        this._measurements.push({ p1, p2, dist });
        this._measurePoints = []; // ready for next measurement

        return { phase: 'complete', dist, p1, p2 };
    }

    _convertFirstMarkerToFinal() {
        if (!this._firstMarker) return;
        this._firstMarker.material.color.setHex(0xffeb3b);
        this._firstMarker.material.opacity = 1;
        this._firstMarker.material.transparent = false;
        this._firstMarker.userData.isFirst = false;
        this._firstMarker = null;
    }

    /** Remove all measurements but keep measure mode active. */
    clearMeasurements() {
        if (!this._measureGroup) return;
        while (this._measureGroup.children.length) {
            const c = this._measureGroup.children.pop();
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
            this._measureGroup.remove(c);
        }
        this._measurements  = [];
        this._measurePoints = [];
        this._hoverMarker   = null;
        this._firstMarker   = null;
    }

    _addMeasureMarker(point, isFirst = false) {
        // Camera-relative scale so markers stay visible at any zoom
        const cam     = this._getWorld().camera.three;
        const camDist = cam.position.distanceTo(point);
        const baseR   = Math.max(0.08, camDist / 200);

        const geo = new THREE.SphereGeometry(baseR, 14, 14);
        const mat = isFirst
            ? new THREE.MeshBasicMaterial({ color: 0xff4081, depthTest: false }) // pink for first
            : new THREE.MeshBasicMaterial({ color: 0xffeb3b, depthTest: false }); // yellow for set
        const sphere = new THREE.Mesh(geo, mat);
        sphere.position.copy(point);
        sphere.renderOrder = 999;
        sphere.userData.isFirst = isFirst;
        this._measureGroup.add(sphere);

        if (isFirst) {
            // Add a ring around it for extra prominence
            const ringGeo = new THREE.RingGeometry(baseR * 1.8, baseR * 2.4, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xff4081, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthTest: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(point);
            // face the camera
            ring.lookAt(cam.position);
            ring.renderOrder = 999;
            sphere.add(ring);
            this._firstMarker = sphere;
        }
    }

    _addMeasureLine(p1, p2, dist) {
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const mat = new THREE.LineBasicMaterial({
            color: 0xffeb3b, linewidth: 2, depthTest: false,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 999;
        this._measureGroup.add(line);
        // Label is rendered in the DOM by the Vue layer (3D HTML labels are heavy);
        // engine returns distance, UI shows it as a toast + sidebar list.
    }

    // ── Hide / Isolate / Show all ────────────────────────────────────────────

    /** Hide the currently selected items (selection itself is cleared). */
    async hideSelected() {
        if (!this._selectedItems) return false;
        const hider = this.components.get(OBC.Hider);
        await hider.set(false, this._selectedItems);
        await this.clearSelection();
        return true;
    }

    /** Isolate selection: hide every other item, keep selection visible. */
    async isolateSelected() {
        if (!this._selectedItems || !this._categoryGroups?.length) return false;
        const hider = this.components.get(OBC.Hider);

        // Build a map of ALL items per model, then subtract the selected ones
        const allPerModel = {};
        for (const { groupData } of this._categoryGroups) {
            try {
                const map = await groupData.get();
                for (const [mid, ids] of Object.entries(map)) {
                    if (!ids?.length) continue;
                    if (!allPerModel[mid]) allPerModel[mid] = new Set();
                    for (const id of ids) allPerModel[mid].add(id);
                }
            } catch { /* */ }
        }
        for (const [mid, ids] of Object.entries(this._selectedItems)) {
            const set = allPerModel[mid];
            if (set) for (const id of ids) set.delete(id);
        }
        const toHide = {};
        for (const [mid, set] of Object.entries(allPerModel)) toHide[mid] = [...set];
        await hider.set(false, toHide);
        // Mark all categories as hidden for layer-panel UI sync
        for (const g of this._categoryGroups) g.visible = false;
        return true;
    }

    /** Restore visibility of all categories. */
    async showAll() {
        if (!this._categoryGroups?.length) return;
        for (const g of this._categoryGroups) {
            try { await this.setCategoryVisible(g.name, true); } catch { /* */ }
        }
    }

    /**
     * Fit the camera to a single element by modelId + localId.
     * Optionally select the element so it's highlighted after the zoom.
     */
    async zoomToElement(modelId, localId, { select = true } = {}) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = fragments.list.get(modelId);
        if (!model) return false;

        let boxes;
        try { boxes = await model.getBoxes([localId]); } catch { return false; }
        if (!boxes?.length || boxes[0].isEmpty()) return false;

        const box = boxes[0];
        // Pad the box a bit so the element isn't flush against the viewport edge
        const size = new THREE.Vector3();
        box.getSize(size);
        const pad = Math.max(size.x, size.y, size.z) * 0.2;
        box.expandByScalar(pad);

        await this._getWorld().camera.controls.fitToBox(box, true, {
            paddingLeft: 0.5, paddingRight: 0.5, paddingTop: 0.5, paddingBottom: 0.5,
        });

        if (select) await this._selectByLocalIds(model, [localId]);
        return true;
    }

    /**
     * Fit the camera to the union of all elements in a single category.
     * Uses the indexed category groups built in buildCategoryIndex().
     */
    async zoomToCategory(categoryName) {
        const group = this._categoryGroups?.find(g => g.name === categoryName);
        if (!group) return false;
        const map = await group.groupData.get();
        const fragments = this.components.get(OBC.FragmentsManager);

        const union = new THREE.Box3();
        union.makeEmpty();
        for (const [modelId, ids] of Object.entries(map)) {
            const model = fragments.list.get(modelId);
            if (!model || !ids?.length) continue;
            try {
                const boxes = await model.getBoxes(ids);
                for (const b of boxes) if (!b.isEmpty()) union.union(b);
            } catch { /* skip */ }
        }
        if (union.isEmpty()) return false;

        await this._getWorld().camera.controls.fitToBox(union, true, {
            paddingLeft: 0.5, paddingRight: 0.5, paddingTop: 0.5, paddingBottom: 0.5,
        });
        return true;
    }

    /** Internal: select elements by localIds in a model (mirrors pickElement's selection logic). */
    async _selectByLocalIds(model, localIds) {
        const fragments = this.components.get(OBC.FragmentsManager);
        if (this._selectedItems) {
            try { await fragments.resetHighlight(this._selectedItems); } catch { /* */ }
        }
        const items = { [model.modelId]: localIds };
        this._selectedItems = items;
        try { await fragments.highlight(SELECTION_STYLE, items); } catch { /* */ }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Returns the last fragment raycast hit point in both Three.js world coords
     * and original IFC coords (before coordinateToOrigin shift).
     * Returns null when cursor is over empty space.
     */
    getHitPoint() {
        if (!this._lastHitPoint) return null;
        const p = this._lastHitPoint;
        // Use the offset of the model that owns the hovered geometry — falls back
        // to the legacy single-offset for backward compat.
        const off = this._coordOffsets.get(this._lastHitModelId) ?? this._coordinationOffset;
        return {
            x: p.x, y: p.y, z: p.z,
            ox: p.x + off.x,
            oy: p.y + off.y,
            oz: p.z + off.z,
            modelId: this._lastHitModelId,
        };
    }

    /** Public accessor: per-model offset (Three.js → IFC-raw addition). */
    getCoordOffsetForModel(modelId) {
        return this._coordOffsets.get(modelId) ?? null;
    }
    getAllCoordOffsets() {
        const out = {};
        for (const [mid, off] of this._coordOffsets) out[mid] = off.toArray();
        return out;
    }

    /** Direct access to fragments.list — used by the box-outlines pipeline. */
    getFragmentsList() {
        return this.components.get(OBC.FragmentsManager)?.list ?? null;
    }

    /** Direct access to FragmentsManager — for rule-based Pset reads. */
    getFragmentsManager() {
        return this.components.get(OBC.FragmentsManager) ?? null;
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
            // Box source: model.box first, Three.js scene-graph fallback
            let box = model.box;
            if (!box || box.isEmpty()) box = new THREE.Box3().setFromObject(model.object);
            if (!box || box.isEmpty()) {
                box = new THREE.Box3(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
            }

            const center = new THREE.Vector3();
            const size   = new THREE.Vector3();
            box.getCenter(center);
            box.getSize(size);
            const d = Math.max(size.x, size.y, size.z) * 1.5;

            await world.camera.controls.setLookAt(
                center.x + d * 0.6, center.y + d * 0.6, center.z + d * 0.6,
                center.x, center.y, center.z, false
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

    /**
     * Build a flat search index of all IFCPRODUCT instances across loaded models.
     * Each entry: { name, globalId, category, localId, modelId }.
     * Heavy on big models — call once after loadIfc, cache the result in the store.
     */
    async buildSearchIndex() {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const fragments = this.components.get(OBC.FragmentsManager);
        const webIfc    = ifcLoader?.webIfc;
        if (!webIfc) return [];

        const entries = [];
        // IFCPRODUCT-rooted categories that should be queryable
        const QUERY_TYPES = [
            'IFCWALL','IFCWALLSTANDARDCASE','IFCSLAB','IFCCOLUMN','IFCBEAM',
            'IFCDOOR','IFCWINDOW','IFCROOF','IFCFOOTING','IFCSTAIR','IFCSTAIRFLIGHT',
            'IFCPLATE','IFCMEMBER','IFCSPACE','IFCBUILDINGSTOREY','IFCBUILDING','IFCSITE',
            'IFCPIPESEGMENT','IFCPIPEFITTING','IFCDUCT','IFCDUCTFITTING',
            'IFCFLOWSEGMENT','IFCFLOWFITTING','IFCFLOWTERMINAL','IFCAIRTERMINAL',
            'IFCPUMP','IFCVALVE','IFCFURNITURE','IFCBUILDINGELEMENTPROXY',
            'IFCRAILING','IFCCURTAINWALL',
        ];

        for (const model of fragments.list.values()) {
            const modelId = model.modelId;
            const wid = 0; // web-ifc model id
            for (const typeName of QUERY_TYPES) {
                const typeConst = webIfc[typeName];
                if (!typeConst) continue;
                let ids;
                try { ids = webIfc.GetLineIDsWithType(wid, typeConst); } catch { continue; }
                for (const localId of ids) {
                    let p;
                    try { p = webIfc.GetLine(wid, localId, false); } catch { continue; }
                    if (!p) continue;
                    entries.push({
                        name:     p.Name?.value ?? '',
                        globalId: p.GlobalId?.value ?? '',
                        category: typeName,
                        localId,
                        modelId,
                    });
                }
            }
        }
        return entries;
    }

    /**
     * Return the raw web-ifc API and model ID for vector plot extraction.
     * Returns null if no model is loaded.
     */
    getWebIfcAPI() {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const fragments = this.components.get(OBC.FragmentsManager);
        if (!ifcLoader?.webIfc || !fragments.list.size) return null;
        // Return the first model too — used for BBox fallback in the vector plotter
        const model = [...fragments.list.values()][0] ?? null;
        return { webIfc: ifcLoader.webIfc, modelID: 0, model };
    }

    /**
     * Hide section-cut visual helpers (gizmo + plane mesh) for an export snapshot.
     * The actual clipping plane stays active — only the visual overlays are hidden.
     * Returns an array of objects to restore via _restoreSectionVisuals().
     */
    _hideSectionVisuals() {
        const hidden = [];
        if (this._tcHelper && this._tcHelper.visible) {
            hidden.push(this._tcHelper);
            this._tcHelper.visible = false;
        }
        if (this._planePivot && this._planePivot.visible) {
            hidden.push(this._planePivot);
            this._planePivot.visible = false;
        }
        return hidden;
    }

    _restoreSectionVisuals(hidden) {
        for (const obj of hidden) obj.visible = true;
    }

    /**
     * Capture the canvas as a base64 PNG data URL.
     * @param {number} pixelRatio - Render at N× resolution for print quality (default 3).
     *   3 means 3× linear resolution = 9× more pixels than device default.
     */
    getCanvasSnapshot(pixelRatio = 3) {
        const world = this._getWorld();
        if (!world) return null;
        const renderer  = world.renderer.three;
        const origRatio = renderer.getPixelRatio();
        const hidden    = this._hideSectionVisuals();
        renderer.setPixelRatio(pixelRatio);
        renderer.render(world.scene.three, world.camera.three);
        const dataUrl = this._canvas.toDataURL('image/png', 0.92);
        renderer.setPixelRatio(origRatio);
        this._restoreSectionVisuals(hidden);
        // Re-render once with visuals back so the live viewport isn't left blank
        renderer.render(world.scene.three, world.camera.three);
        return dataUrl;
    }

    // ── Orthographic scale helpers (PDF export) ──────────────────────────────

    /**
     * Read the current orthographic camera frustum.
     * Returns null if the camera is in perspective mode.
     */
    /**
     * Render the scene with a temporary orthographic camera at an exact scale
     * and return the result as a base64 PNG.
     *
     * This bypasses the main viewport camera entirely — no CameraControls
     * interference, no need to switch projection modes. The 3D viewport is
     * unchanged after the call.
     *
     * @param {number} scaleRatio    - e.g. 100 for 1:100
     * @param {number} drawWidthMm   - paper drawing area width in mm
     * @param {number} drawHeightMm  - paper drawing area height in mm
     * @param {'top'|'front'|'side'} viewDir - camera direction
     * @param {number} pixelRatio    - snapshot resolution multiplier (default 3)
     */
    /**
     * Render the scene at an exact scale into an off-screen WebGLRenderTarget
     * whose dimensions match the paper's drawing area proportions.
     *
     * This is the only correct approach: rendering into the main canvas (which
     * has a different aspect ratio than the paper) produces unequal px/m ratios
     * on X and Y axes, distorting the image. WebGLRenderTarget lets us render
     * at any size we choose, unconstrained by the viewport.
     *
     * Math:
     *   halfW = drawWidthMm  / 1000 * scaleRatio / 2   (metres)
     *   halfH = drawHeightMm / 1000 * scaleRatio / 2   (metres)
     *   rtW   = drawWidthMm  * pxPerMm                 (pixels)
     *   rtH   = drawHeightMm * pxPerMm                 (pixels)
     *   → px/m = pxPerMm * 1000 / scaleRatio  (equal on both axes ✓)
     *
     * @param {number} scaleRatio    - e.g. 100 for 1:100
     * @param {number} drawWidthMm   - paper drawing area width in mm
     * @param {number} drawHeightMm  - paper drawing area height in mm
     * @param {'top'|'front'|'side'} viewDir
     * @param {number} pxPerMm       - render resolution (default 10 → 10 px/mm ≈ 254 dpi)
     */
    getScaleSnapshot(scaleRatio, drawWidthMm, drawHeightMm, viewDir = 'top', pxPerMm = 10, panX = 0, panZ = 0) {
        const world = this._getWorld();
        if (!world) return null;

        const renderer = world.renderer.three;
        const scene    = world.scene.three;
        const mainCam  = world.camera.three;

        // ── Welt-Ausdehnung ────────────────────────────────────────────────
        const halfW = (drawWidthMm  / 1000 * scaleRatio) / 2;
        const halfH = (drawHeightMm / 1000 * scaleRatio) / 2;

        // ── RenderTarget mit exaktem Papier-Seitenverhältnis ───────────────
        const rtW = Math.round(drawWidthMm  * pxPerMm);
        const rtH = Math.round(drawHeightMm * pxPerMm);
        const rt  = new THREE.WebGLRenderTarget(rtW, rtH, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format:    THREE.RGBAFormat,
        });

        // ── Orthogonale Kamera ─────────────────────────────────────────────
        // Centre = camera look-at target + pan offset (in world metres)
        const target = new THREE.Vector3();
        world.camera.controls.getTarget(target);
        target.x += panX;
        target.z += panZ;

        const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -100000, 100000);
        if (viewDir === 'front') {
            ortho.position.set(target.x, target.y, target.z + 10000);
            ortho.up.set(0, 1, 0);
        } else if (viewDir === 'side') {
            ortho.position.set(target.x + 10000, target.y, target.z);
            ortho.up.set(0, 1, 0);
        } else {
            // top: Draufsicht, Z ist "Nord" auf dem Plan
            ortho.position.set(target.x, target.y + 10000, target.z);
            ortho.up.set(0, 0, -1);
        }
        ortho.lookAt(target.x, target.y, target.z);
        ortho.updateProjectionMatrix();

        // Sprint A: persist the EXACT camera state used for this snapshot so the
        // vector plotter can use the same coordinate frame for world→paper transforms.
        this._lastPlotFrustum = {
            left:     ortho.left,
            right:    ortho.right,
            top:      ortho.top,
            bottom:   ortho.bottom,
            position: ortho.position.toArray(),
            target:   [target.x, target.y, target.z],
            up:       ortho.up.toArray(),
            viewDir,
            scaleRatio,
            drawWidthMm,
            drawHeightMm,
        };

        // ── Off-Screen rendern (Section-Visuals temporär versteckt) ────────
        const hidden = this._hideSectionVisuals();
        renderer.setRenderTarget(rt);
        renderer.render(scene, ortho);
        renderer.setRenderTarget(null);
        this._restoreSectionVisuals(hidden);

        // ── Pixel auslesen + Y-Flip (WebGL: Ursprung unten-links) ──────────
        const pixels = new Uint8ClampedArray(rtW * rtH * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, rtW, rtH, pixels);
        rt.dispose();

        const out = document.createElement('canvas');
        out.width = rtW; out.height = rtH;
        const ctx = out.getContext('2d');
        for (let y = 0; y < rtH; y++) {
            const row = new Uint8ClampedArray(pixels.buffer, (rtH - 1 - y) * rtW * 4, rtW * 4);
            ctx.putImageData(new ImageData(row, rtW, 1), 0, y);
        }

        // ── Haupt-Canvas mit Original-Kamera + sichtbaren Visuals wiederherstellen
        renderer.render(scene, mainCam);

        return out.toDataURL('image/png', 0.92);
    }

    /**
     * Return the frustum + camera pose used in the most recent getScaleSnapshot() call.
     * The vector plotter rebuilds an OrthographicCamera from this so its world→paper
     * transforms match the exact rendered snapshot.
     */
    getLastPlotFrustum() { return this._lastPlotFrustum ?? null; }

    // Kept for saveRenderState/restoreRenderState — no longer needed for scale export
    // but preserves backward compatibility if called.
    getOrthoExtent() { return null; }
    setOrthoExtent(_e) { /* no-op: scale export uses getScaleSnapshot */ }
    setOrthoExtentForScale(_s, _w, _h) { /* no-op: scale export uses getScaleSnapshot */ }

    dispose() {
        if (this.components) this.components.dispose();
        if (this.container?.innerHTML) this.container.innerHTML = '';
    }
}
