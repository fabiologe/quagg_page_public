import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { IfcCamera } from './IfcCamera.js';
import { DATA_CONFIG, parseItemData, buildSearchIndex } from './IfcItemData.js';
import { IfcAnnotations } from './IfcAnnotations.js';
import { IfcMeasure } from './IfcMeasure.js';
import { IfcGridAxes } from './IfcGridAxes.js';
import { IfcSection } from './IfcSection.js';
import { IfcStoreys } from './IfcStoreys.js';
import { createGeometryResolver } from './geometry/GeometryResolver.js';
import { IfcAutor } from './IfcAutor.js';


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
        this._hoverInFlight  = false;
        this._canvas         = null;

        // Category / layer visibility
        // Each entry: { name, groupData (ClassificationGroupData), visible, count }
        this._categoryGroups = null;

        // Section cut gizmo

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

        this.components.init();
        world.scene.setup();

        // Alle Kamera-/Orbit-/Snapshot-Logik lebt in IfcCamera.
        this.camera = new IfcCamera({
            getWorld:   () => this._getWorld(),
            getBounds:  () => this._getModelBounds(),
            components: this.components,
        });
        this.camera.configure();

        // Annotationen und Messungen: eigene Dienste, gleiches Muster wie die
        // Kamera. `probePoint` gehoert zum Picking und bleibt hier — beide
        // brauchen einen Weltpunkt unter dem Zeiger, keiner soll ihn nachbauen.
        const probePoint = (x, y) => this._probeWorldPoint(x, y);
        this.gridAxes    = new IfcGridAxes();
        this.section     = new IfcSection({
            getWorld: () => this._getWorld(),
            getBounds: () => this._getModelBounds(),
        });
        this.storeys     = new IfcStoreys({
            components: this.components,
            fitToBox: (box, o) => this.camera.fitToBox(box, o),
            schnitt: this.section,
        });
        this.annotations = new IfcAnnotations({ getWorld: () => this._getWorld(), probePoint });
        this.measure     = new IfcMeasure({     getWorld: () => this._getWorld(), probePoint });
        // Stufe 9.2: der einzige Kanal zur Editor-API von @thatopen/fragments.
        this.autor       = new IfcAutor({ getFragments: () => this.components.get(OBC.FragmentsManager) });

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
            this.gridAxes.ladeAchsen(model, world),
            this.gridAxes.ladeRaster(model, world),
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

    /**
     * Einen GeometryResolver mit den Zutaten dieser Engine bauen (Stufe 9.0b).
     *
     * Bisher stellte sich jede Aufrufstelle den Resolver selbst zusammen
     * (`IfcPdfExporter.js:216`, `LaengsschnittBuilder.js:53`) und musste dafür
     * wissen, welche vier Dinge er braucht. Die Bauform-Bestimmung ist die
     * dritte solche Stelle — ab hier gibt es einen Weg.
     *
     * Bewusst eine FABRIK und kein zwischengespeicherter Resolver: der Resolver
     * hält Caches je Modell, und wer ihn über einen Modellwechsel hinweg
     * behält, bekommt Geometrie des alten Modells zurück.
     */
    makeGeometryResolver() {
        const fragments = this.components.get(OBC.FragmentsManager);
        return createGeometryResolver({
            categoryGroups:   this.getCategoryGroups(),
            fragmentsList:    fragments?.list ?? null,
            fragmentsManager: fragments ?? null,
            webIfcApis:       this.getWebIfcAPIs?.() ?? [],
            coordOffsets:     this.getAllCoordOffsets?.() ?? {},
        });
    }

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

        // Orbit-Pivot auf Element-Center setzen — folgende Maus-Rotationen
        // kreisen um das angeklickte Objekt statt um eine alte Position.
        // Box-Center > Hit-Point: vorhersagbarer (User klickt nicht immer zentral).
        this.camera.orbitAroundSelection(fmodel.modelId, localId).catch(() => { /* */ });

        const rawData = await fragments.getData(modelIdMap, DATA_CONFIG);
        // modelId und localId gehoeren zur Antwort: ohne sie kann der Aufrufer
        // das getroffene Bauteil nicht mehr adressieren — weder zum Zoomen noch
        // fuer seine Bounding-Box. `_parseItemData` bleibt bewusst zustandslos
        // und kennt sie nicht, deshalb werden sie hier angehaengt.
        return { ...this._parseItemData(rawData), modelId: fmodel.modelId, localId };
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
        return this.camera.setProjection(type);
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
     * Per-element colour override — used by the Planning Cockpit's KG-Modus.
     *
     * @param {Map<string, string>} colorMap  keys "modelId|localId", values "#rrggbb"
     */
    async setPerElementColors(colorMap) {
        if (!colorMap?.size) return;
        const fragments = this.components.get(OBC.FragmentsManager);
        // Bucket localIds per model + colour to keep setColor() calls batched.
        const buckets = new Map(); // `${modelId}|${hex}` → { modelId, hex, localIds }
        for (const [key, hex] of colorMap.entries()) {
            const sep = key.indexOf('|');
            if (sep < 0) continue;
            const modelId = key.slice(0, sep);
            const localId = Number(key.slice(sep + 1));
            if (!Number.isFinite(localId)) continue;
            const bk = `${modelId}|${hex}`;
            if (!buckets.has(bk)) buckets.set(bk, { modelId, hex, localIds: [] });
            buckets.get(bk).localIds.push(localId);
        }
        for (const { modelId, hex, localIds } of buckets.values()) {
            const model = fragments.list.get(modelId);
            if (!model || !localIds.length) continue;
            try { await model.setColor(localIds, new THREE.Color(hex)); }
            catch (e) { console.warn('[Engine] per-element setColor failed', modelId, e?.message ?? e); }
        }
    }

    /**
     * Snapshot current render state so it can be restored after a style preview.
     * Returns a plain object — pass it back to restoreRenderState().
     */
    saveRenderState() {
        const world = this._getWorld();
        const bg    = world?.scene?.three?.background;
        return {
            bg:          bg ? bg.clone() : null,
            projection:  world?.camera?.projection?.current ?? 'Perspective',
            gridVisible: this._sceneGrid ? this._sceneGrid.three.visible : true,
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
    }

    // ── Spatial structure ────────────────────────────────────────────────────






    // ── Properties ───────────────────────────────────────────────────────────

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

    async refreshElement() {
        if (!this._selectedItems) return null;
        const fragments = this.components.get(OBC.FragmentsManager);
        const daten = this._parseItemData(await fragments.getData(this._selectedItems, DATA_CONFIG));
        // Dieselbe Kennung wie bei pickElement — sonst verliert das Bauteil sie
        // beim Neuladen der Merkmale wieder.
        const [modelId, localIds] = Object.entries(this._selectedItems)[0] ?? [];
        return { ...daten, modelId, localId: localIds?.[0] };
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





    // ── Camera ───────────────────────────────────────────────────────────────

    // ── Bearbeiten (Implementierung in IfcAutor.js) ─────────────────────────
    istBearbeitbar(modelId)             { return this.autor.istBearbeitbar(modelId); }
    ankerVon(modelId, localIds)         { return this.autor.ankerVon(modelId, localIds); }
    setzeAnker(modelId, localId, ziel)  { return this.autor.setzeAnker(modelId, localId, ziel); }
    erzeugeBauteil(modelId, bauteil)    { return this.autor.erzeuge(modelId, bauteil); }
    loescheBauteil(modelId, localId)    { return this.autor.loesche(modelId, localId); }
    eigenesModell(modelId)              { return this.autor.eigenesModell(modelId); }
    modellAlsPuffer(modelId)            { return this.autor.alsPuffer(modelId); }
    wendeFestlegungenAn(plan, opts)     { return this.autor.wendeAn(plan, opts); }

    // ── Raumstruktur & Geschosse (Implementierung in IfcStoreys.js) ─────────
    getSpatialTree()                     { return this.storeys.getSpatialTree(); }
    getStoreyElements(modelId, localId)  { return this.storeys.getStoreyElements(modelId, localId); }
    setStoreyVisible(localId, v, mid)    { return this.storeys.setStoreyVisible(localId, v, mid); }
    getStoreyList()                      { return this.storeys.getStoreyList(); }
    gotoStorey(modelId, localId, opts)   { return this.storeys.gotoStorey(modelId, localId, opts); }

    // ── Schnittebene (Implementierung in IfcSection.js) ─────────────────────
    createSectionCut()               { return this.section.createSectionCut(); }
    setSectionMode(mode)             { return this.section.setSectionMode(mode); }
    setSectionChangeCallback(fn)     { return this.section.setSectionChangeCallback(fn); }
    getSectionPosition()             { return this.section.getSectionPosition(); }
    snapSectionTo(axis)              { return this.section.snapSectionTo(axis); }
    resetSection()                   { return this.section.resetSection(); }
    deleteSectionCuts()              { return this.section.deleteSectionCuts(); }
    getSectionCutPlane()             { return this.section.getSectionCutPlane(); }
    getSectionState()                { return this.section.getSectionState(); }
    applySectionState(state)         { return this.section.applySectionState(state); }
    placeSectionAt(center, y)        { return this.section.placeSectionAt(center, y); }
    setSectionGizmoVisible(visible)  { return this.section.setSectionGizmoVisible(visible); }
    _hideSectionVisuals()            { return this.section._hideSectionVisuals(); }
    _restoreSectionVisuals(hidden)   { return this.section._restoreSectionVisuals(hidden); }

    // ── Achsen & Raster (Implementierung in IfcGridAxes.js) ─────────────────
    setIfcGridsVisible(visible) { return this.gridAxes.setIfcGridsVisible(visible); }
    getIfcGridAxes()            { return this.gridAxes.getIfcGridAxes(); }

    // ── Annotationen (Implementierung in IfcAnnotations.js) ─────────────────
    enableAnnotationMode()            { return this.annotations.enableAnnotationMode(); }
    disableAnnotationMode()           { return this.annotations.disableAnnotationMode(); }
    addAnnotationAt(pos, text, color) { return this.annotations.addAnnotationAt(pos, text, color); }
    addAnnotation(x, y, text, color)  { return this.annotations.addAnnotation(x, y, text, color); }
    updateAnnotation(id, patch)       { return this.annotations.updateAnnotation(id, patch); }
    removeAnnotation(id)              { return this.annotations.removeAnnotation(id); }
    clearAnnotations()                { return this.annotations.clearAnnotations(); }
    setAnnotations(arr)               { return this.annotations.setAnnotations(arr); }
    getAnnotations()                  { return this.annotations.getAnnotations(); }

    // ── Messungen (Implementierung in IfcMeasure.js) ────────────────────────
    enableMeasureMode()               { return this.measure.enableMeasureMode(); }
    disableMeasureMode()              { return this.measure.disableMeasureMode(); }
    updateMeasureHover(x, y)          { return this.measure.updateMeasureHover(x, y); }
    addMeasurePoint(x, y)             { return this.measure.addMeasurePoint(x, y); }
    clearMeasurements()               { return this.measure.clearMeasurements(); }

    // ── Camera delegations (Implementierung in IfcCamera.js) ────────────────
    zoomToFit()                       { return this.camera.zoomToFit(); }
    viewTop()                         { return this.camera.viewTop(); }
    viewFront()                       { return this.camera.viewFront(); }
    viewSide()                        { return this.camera.viewSide(); }
    resetView()                       { return this.camera.resetView(); }
    lookAtPoint(x, y, z, distance=5)  { return this.camera.lookAtPoint(x, y, z, distance); }
    orbitAroundPoint(p)               { return this.camera.orbitAroundPoint(p); }
    orbitAroundMeasurePoint(p)        { return this.camera.orbitAroundMeasurePoint(p); }
    orbitAroundSelection(mid, lid)    { return this.camera.orbitAroundSelection(mid, lid); }

    // ── Annotations (markers + text pinned in 3D space) ─────────────────────



    /**
     * Add an annotation at the world-point under (clientX, clientY).
     * Returns the new annotation { id, position, text, color, labelOffset, idx } or null if no hit.
     */



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






    // ── Saved Views (camera + visibility + section cut) ─────────────────────

    /**
     * Capture the current view: camera pose, visible categories, active section.
     * Returns a plain object ready for JSON.stringify / localStorage.
     */
    captureView() {
        const cameraState = this.camera.captureState();
        if (!cameraState) return null;

        const visibleCategories = (this._categoryGroups ?? [])
            .filter(g => g.visible).map(g => g.name);

        const section = this.getSectionState();

        return {
            camera: cameraState,
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

        // Camera
        if (view.camera) await this.camera.applyState(view.camera);

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

        // Schnittebene — eine Methode statt Zugriff aufs Feld.
        this.applySectionState(view.section ?? null);
    }

    // ── Measurement (distance between 2 points) ─────────────────────────────










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
        const ok = await this.camera.fitToElement(modelId, localId);
        if (!ok) return false;
        if (select) {
            const fragments = this.components.get(OBC.FragmentsManager);
            const model     = fragments.list.get(modelId);
            if (model) await this._selectByLocalIds(model, [localId]);
        }
        return true;
    }

    /**
     * Fit the camera to the union of all elements in a single category.
     * Uses the indexed category groups built in buildCategoryIndex().
     */
    async zoomToCategory(categoryName) {
        const group = this._categoryGroups?.find(g => g.name === categoryName);
        if (!group) return false;
        return this.camera.fitToCategory(group);
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
    /**
     * Bounding-Boxen einzelner Bauteile.
     *
     * Zwei Aufrufer in IfcViewer.vue haben diese Methode seit jeher benutzt —
     * es gab sie nie. Der Auswahl-Anker fing den Fehler still ab und blieb
     * `null`, weshalb das Kontextmenue am Bauteil (AP-U4) nie erschien und
     * „Issue hier anlegen" wirkungslos war; der Box-Handler des Stores fing
     * ihn gar nicht.
     *
     * Die Fragmente fuehren die Boxen je Modell (`model.getBoxes`), hier wird
     * nur das Modell aufgeloest. Ohne `modelId` gilt das erste geladene.
     *
     * @returns {Promise<import('three').Box3[]>} leer, wenn Modell oder
     *          Geometrie fehlen — nie `null`, damit `?.length` beim Aufrufer
     *          reicht.
     */
    async getBoxes(localIds, modelId = null) {
        if (!localIds?.length) return [];
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = modelId != null
            ? fragments?.list?.get(modelId)
            : [...(fragments?.list?.values() ?? [])][0];
        if (!model) return [];
        try { return (await model.getBoxes(localIds)) ?? []; }
        catch { return []; }
    }

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
        return { center, size, maxDim: Math.max(size.x, size.y, size.z), box };
    }







    /**
     * Public XZ bounds for the overview thumbnail and re-centering logic.
     * Returns null when no model is loaded. Coordinates are world-space meters.
     */
    getModelBoundsXZ() {
        const b = this._getModelBounds();
        if (!b) return null;
        const { box, center } = b;
        return {
            minX: box.min.x, maxX: box.max.x,
            minZ: box.min.z, maxZ: box.max.z,
            centerX: center.x, centerZ: center.z,
            width:  box.max.x - box.min.x,
            depth:  box.max.z - box.min.z,
        };
    }

    async _fitCameraToModel(model /*, world */) {
        return this.camera.fitToModel(model);
    }

    // ── Merkmalsdaten (Implementierung in IfcItemData.js) ───────────────────
    // Zustandslos und deshalb der erste Schnitt: `parseItemData` fasst kein
    // einziges `this._…` an, `buildSearchIndex` braucht nur `components`.
    _parseItemData(rawData)  { return parseItemData(rawData); }
    async buildSearchIndex() { return buildSearchIndex(this.components); }



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
     * T1/AP-C: web-ifc-Zugänge für ALLE geladenen Modelle.
     * web-ifc vergibt Model-IDs in Ladereihenfolge (0, 1, 2, …) — dieselbe
     * Reihenfolge wie fragments.list. Solange kein Modell entladen wurde,
     * stimmt das Mapping; nach unloadModel fallen wir defensiv auf Modell 0
     * zurück (MVP-Absicherung, dokumentierte Einschränkung).
     */
    getWebIfcAPIs() {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const fragments = this.components.get(OBC.FragmentsManager);
        if (!ifcLoader?.webIfc || !fragments.list.size) return [];
        const models = [...fragments.list.values()];
        return models.map((model, i) => ({
            webIfc: ifcLoader.webIfc,
            modelID: i,
            fragmentModelId: model.modelId,
            model,
        }));
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
     *   → px/m = pxPerMm * 1000 / scaleRatio  (auf beiden Achsen gleich)
     *
     * @param {number} scaleRatio    - e.g. 100 for 1:100
     * @param {number} drawWidthMm   - paper drawing area width in mm
     * @param {number} drawHeightMm  - paper drawing area height in mm
     * @param {'top'|'front'|'side'} viewDir
     * @param {number} pxPerMm       - render resolution (default 10 → 10 px/mm ≈ 254 dpi)
     */



    dispose() {
        this.camera?.dispose?.();
        this.annotations?.disableAnnotationMode?.();
        this.measure?.disableMeasureMode?.();
        this.section?.deleteSectionCuts?.();
        if (this.components) this.components.dispose();
        if (this.container?.innerHTML) this.container.innerHTML = '';
    }
}
