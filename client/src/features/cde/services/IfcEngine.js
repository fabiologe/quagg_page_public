import * as OBC from '@thatopen/components';
import { heightfieldRaster } from './geometry/SurfaceOps.js';
import { formeNach, massenAus } from './gelaende/Operationen.js';
import { karteMitEngine } from './GlobalIdKarte.js';
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
import { IfcQuelle } from './IfcQuelle.js';
import { extractAxisPolylines } from './AxisAnnotations.js';
import { befundeFuer, befundeFuerNetz } from './Befunde.js';
import { baueNetz, strangAb } from './Netztopologie.js';

/**
 * Wie viele Bauteile die Höhenmessung auswertet.
 *
 * Gesucht ist EINE Verschiebung des ganzen Modells, kein Wert je Bauteil —
 * mehr Bauteile machen die Antwort nicht genauer, nur das Laden langsamer.
 * Gemessen: 12 Bauteile kosten 15 ms.
 */
const STICHPROBE = 24;
import { leseGeoreferenz } from './Georeferenz.js';


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
        /**
         * Lebende IFC-Lesezugriffe je Modell (Stufe 13.1).
         *
         * `ifcLoader.webIfc` hat NIE ein Modell offen — nur `readIfcFile()`
         * öffnet eines, und das ruft die CDE nirgends. Deshalb bringt die CDE
         * ihren eigenen Handle mit, geöffnet auf denselben Bytes, die ohnehin
         * durch `loadIfc` kommen. Preis: das Modell liegt zweimal im Speicher.
         */
        this._quellen            = new Map();
        /**
         * Wie der Höhenversatz je Modell zustande kam.
         *
         * Sichtbar gemacht, weil er zweimal still danebenlag und Fabio jedes
         * Mal in die Konsole schauen sollte. Ein Befund, den nur die Konsole
         * kennt, ist für den Nutzer kein Befund.
         */
        this._hoehenBefund       = new Map();
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
        this.autor       = new IfcAutor({
            getFragments: () => this.components.get(OBC.FragmentsManager),
            getWelt:      () => this._getWorld(),
            // Stufe 15: das Höhenraster eines GELIEFERTEN Bauteils — für das
            // Gelände-Rezept. Über den Resolver (dieselbe Ableitung wie die
            // Analyse), nie aus dem Journal.
            holeQuellraster: (globalId) => this._quellrasterVon(globalId),
        });

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

        // Eigenen Lesezugriff auf DIESELBEN Bytes öffnen. Dynamisch importiert,
        // damit web-ifc nicht im Auswertungspfad jedes Moduls landet, das die
        // Engine erbt — und erst, wenn wirklich eine Datei kommt.
        try {
            const WebIFC = await import('web-ifc');
            const quelle = await IfcQuelle.oeffne(WebIFC, data, {
                wasmPfad: '/', absolut: true, name: model.modelId,
            });
            if (quelle) {
                this._quellen.set(model.modelId, quelle);
            } else {
                console.warn('cde: keine IFC-Quelle für', model.modelId, '— Georeferenz und Achsen bleiben ungelesen');
            }
        } catch (fehler) {
            // Ohne Quelle läuft alles wie bisher weiter. Sie ist ein Zugewinn,
            // keine Voraussetzung — der Viewer darf daran nicht hängen.
            console.warn('cde: IFC-Quelle', fehler?.message ?? fehler);
        }
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

        // ERST JETZT den Höhenversatz messen. Davor ist das Modell noch nicht
        // tesselliert — der Kommentar direkt darüber sagt es: „if we proceed
        // too early, model.box is empty … silent no-ops". Genau da stand der
        // erste Versuch, und er lief still ins Leere.
        await this._hoehenversatzMessen(model, this._quellen.get(model.modelId), modelOff);

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
        // Den wasm-Speicher wirklich freigeben — sonst liegt die Datei für
        // immer im Heap, und sie liegt dort schon ein zweites Mal.
        this._quellen.get(modelId)?.schliesse();
        this._quellen.delete(modelId);
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
        const daten = this._parseItemData(rawData);
        return {
            ...daten,
            // Aus dem GUID-Index nachschlagen, wenn die Attribute sie nicht
            // tragen — siehe `_globalIdVon`. Ohne sie lässt sich das Bauteil
            // nicht ins Journal eintragen.
            globalId: daten?.globalId || await this._globalIdVon(fmodel, localId),
            modelId: fmodel.modelId,
            localId,
        };
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
        // beim Neuladen der Merkmale wieder. Das gilt für die GlobalId genauso:
        // ohne sie fiele das Bauteil nach dem Anlegen eines Merkmalssatzes aus
        // dem Journal heraus.
        const [modelId, localIds] = Object.entries(this._selectedItems)[0] ?? [];
        const localId = localIds?.[0];
        const model = [...fragments.list.values()].find(m => m.modelId === modelId);
        const globalId = daten?.globalId
            || (model && localId !== undefined ? await this._globalIdVon(model, localId) : '');
        return { ...daten, globalId, modelId, localId };
    }

    // Der Merkmals-Schreiber lebt seit Lücke ⑧ (2026-09-02) im Autorenkanal:
    // `IfcAutor.schreibeMerkmalssatz(modelId, localId, name, props)`. Die
    // alte Fassung hier hing an der AUSWAHL und schrieb am Journal vorbei —
    // keine Spur, kein Zurück, und nach F5 war der Satz weg. Jetzt läuft der
    // Weg Eintrag → wendeEintragAn → wendeAn wie bei jeder anderen Änderung.

    // ── Civil geometry ───────────────────────────────────────────────────────





    // ── Camera ───────────────────────────────────────────────────────────────

    // ── Bearbeiten (Implementierung in IfcAutor.js) ─────────────────────────
    istBearbeitbar(modelId)             { return this.autor.istBearbeitbar(modelId); }
    ankerVon(modelId, localIds)         { return this.autor.ankerVon(modelId, localIds); }
    huellenVon(modelId, localIds)       { return this.autor.huellenVon(modelId, localIds); }
    setzeAnker(modelId, localId, ziel)  { return this.autor.setzeAnker(modelId, localId, ziel); }
    erzeugeBauteil(modelId, bauteil)    { return this.autor.erzeuge(modelId, bauteil); }
    loescheBauteil(modelId, localId)    { return this.autor.loesche(modelId, localId); }
    eigenesModell(modelId)              { return this.autor.eigenesModell(modelId); }
    modellAlsPuffer(modelId)            { return this.autor.alsPuffer(modelId); }
    /**
     * Festlegungen ans Modell bringen — und das Ausblenden gleich mit.
     *
     * Das Verstecken ist eine Sache der ANSICHT und gehört deshalb nicht in
     * den Autoren-Kanal: der fasst die Editor-API an, nicht den Hider. Er sagt
     * nur, WAS verborgen werden soll.
     */
    async wendeFestlegungenAn(plan, opts) {
        const r = await this.autor.wendeAn(plan, opts);
        await this._sichtbarkeitSetzen(r.auszublenden, false);
        await this._sichtbarkeitSetzen(r.einzublenden, true);
        return r;
    }

    async _sichtbarkeitSetzen(orte, sichtbar) {
        if (!orte?.length) return;
        const karte = {};
        for (const o of orte) (karte[o.modelId] ??= []).push(o.localId);
        try {
            await this.components.get(OBC.Hider).set(sichtbar, karte);
            await this.components.get(OBC.FragmentsManager).core.update(true);
        } catch (fehler) {
            console.warn('cde: sichtbarkeit setzen', fehler?.message ?? fehler);
        }
    }

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

    /**
     * Alle Ladeversätze — als {x, y, z}, DIESELBE Form wie
     * `getCoordOffsetForModel`.
     *
     * Vorher stand hier `off.toArray()`, also `[x, y, z]`. Jeder Verbraucher
     * greift aber mit `.x`/`.y`/`.z` zu, und ein Array liefert darauf
     * `undefined` — ohne zu werfen. Zwei Accessoren, zwei Formen, kein Hinweis.
     *
     * Was daraus in Produktion wurde:
     *   DxfExporter          alle Koordinaten NaN (der Rückfall `?? {x:0,z:0}`
     *                        griff nicht — ein Array ist truthy)
     *   LaengsschnittBuilder heightOffsetY immer 0; die Achse ist „m NN"
     *                        beschriftet und zeigt Welt-Y
     *   UtmGrid              Gitterkreuze beschriften Weltkoordinaten als E/N
     *   AxisAnnotations      Achs-Polylinien NaN
     *
     * Die Tests konnten es nicht sehen, weil sie `{x, z}`-Objekte übergeben —
     * die Form, die die Engine gar nicht lieferte. Sie prüften eine
     * Schnittstelle, die es nicht gab. Der Guard in `koordinatenForm.test.js`
     * geht deshalb von der ECHTEN Ausgabe aus.
     */
    /**
     * Den HÖHENVERSATZ messen, statt ihn aus `object.position` zu erraten.
     *
     * DER BEFUND: `-model.object.position` liefert x und z richtig, y aber 0 —
     * obwohl die Geometrie in der Höhe sehr wohl verschoben ist. Zwei
     * Mechanismen wirken übereinander: `COORDINATE_TO_ORIGIN` (web-ifc) backt
     * eine Höhenverschiebung in die Scheitelpunkte, `autoCoordinate`
     * (fragments) setzt die Objektlage aus der MapConversion — und deren
     * `OrthogonalHeight` ist in beiden ISYBAU-Dateien 0. Nur der zweite
     * landet in `object.position`.
     *
     * Sichtbar wurde es als „E und N stimmen, H ist noch die Three-Koordinate".
     *
     * Statt nachzubauen, was die Bibliothek tut — das wäre eine Annahme über
     * fremden Code —, wird DIESELBE Platzierung zweimal geholt: aus der Datei
     * und aus den Fragmenten. Die Differenz IST der Versatz. Der Median macht
     * es unempfindlich gegen einzelne Ausreisser, und die Streuung sagt, ob
     * man dem Ergebnis trauen darf.
     */
    /**
     * Den Höhenversatz eines Modells bestimmen — HÜLLE gegen HÜLLE.
     *
     * Der erste Anlauf verglich die IFC-Platzierung mit `model.getPositions()`
     * und scheiterte, weil das zwei VERSCHIEDENE Punkte sind: `getPositions`
     * liefert die Mitte eines Bauteils, die Platzierung einen Bezugspunkt des
     * Autors. Am echten Netz sitzt der bei Schächten auf der Unterkante, bei
     * Haltungen am oberen Ende — die Differenz streute dadurch um 10,2 m, und
     * die Messung hat (richtig) nichts gesetzt.
     *
     * Eine Hülle beschreibt auf beiden Seiten DENSELBEN Körper. Damit gilt
     * für eine reine Verschiebung:
     *
     *     Versatz = DateiUnterkante − WeltUnterkante
     *             = DateiOberkante  − WeltOberkante
     *
     * Dass beide dasselbe ergeben, ist keine Nebensache, sondern der BEWEIS,
     * dass überhaupt nur verschoben und nicht skaliert wurde. Stimmen sie
     * nicht überein, wird nichts gesetzt und der Befund gemeldet — eine
     * erfundene Höhe wäre schlimmer als gar keine.
     */
    async _hoehenversatzMessen(model, quelle, modelOff) {
        const merke = (b) => { this._hoehenBefund.set(model.modelId, b); return b; };
        if (!quelle?.lebt?.()) return merke({ art: 'ohne-quelle', text: 'keine IFC-Quelle' });
        try {
            // Eine Stichprobe genügt: gesucht ist EINE Verschiebung, nicht ein
            // Wert je Bauteil. Die Geometrie auszuwerten kostet, deshalb wenige.
            const stichprobe = quelle.ids('IFCELEMENT', { untertypen: true }).slice(0, STICHPROBE);
            if (!stichprobe.length) return merke({ art: 'keine-bauteile', text: 'keine Bauteile in der Datei' });

            const datei = quelle.hoehenHuellen(stichprobe);
            // NUR die Bauteile, für die BEIDE Seiten etwas liefern — sonst
            // deckten die zwei Hüllen verschiedene Körper ab und die Differenz
            // wäre die Auswahl, nicht der Versatz.
            const ids = stichprobe.filter(id => datei.has(id));
            if (ids.length < 2) return merke({ art: 'keine-geometrie', text: 'Geometrie in der Datei nicht auswertbar' });

            const welt = await model.getMergedBox(ids);
            if (!welt || welt.isEmpty?.() || !Number.isFinite(welt.min?.y)) {
                return merke({ art: 'keine-weltlage', text: 'Weltlage nicht lesbar' });
            }

            let dMin = Infinity, dMax = -Infinity;
            for (const id of ids) {
                const h = datei.get(id);
                if (h.min < dMin) dMin = h.min;
                if (h.max > dMax) dMax = h.max;
            }

            const vonUnten = dMin - welt.min.y;
            const vonOben  = dMax - welt.max.y;
            const abweichung = Math.abs(vonUnten - vonOben);
            if (abweichung > 0.01) {
                return merke({
                    art: 'uneinheitlich', spanne: abweichung, unten: vonUnten, oben: vonOben,
                    text: `Unter- und Oberkante ergeben ${vonUnten.toFixed(2)} m bzw. `
                        + `${vonOben.toFixed(2)} m — das ist keine reine Verschiebung, nicht gesetzt`,
                });
            }

            const versatz = (vonUnten + vonOben) / 2;
            modelOff.y = versatz;
            this._coordOffsets.set(model.modelId, modelOff);
            if (this._coordOffsets.size === 1) this._coordinationOffset.copy(modelOff);
            // Beide Räume mitgeben. Zeigt die Koordinatenleiste eine Höhe, die
            // in KEINEN von beiden passt, liegt der Fehler nicht am Versatz —
            // und das sieht man dann sofort, statt es zu erraten.
            return merke({
                art: 'gemessen', wert: versatz, spanne: abweichung, n: ids.length,
                datei: { min: dMin, max: dMax },
                welt:  { min: welt.min.y, max: welt.max.y },
                text: `über ${ids.length} Bauteile, Unter- und Oberkante stimmen auf `
                    + `${(abweichung * 1000).toFixed(1)} mm überein`,
            });
        } catch (fehler) {
            return merke({ art: 'fehler', text: String(fehler?.message ?? fehler) });
        }
    }

    /** Wie der Höhenversatz zustande kam — für die Anzeige. */
    hoehenBefund(modelId) {
        return this._hoehenBefund.get(modelId) ?? null;
    }
    alleHoehenBefunde() {
        return Object.fromEntries(this._hoehenBefund);
    }

    /** Der lebende Lesezugriff auf ein Modell, oder null. */
    quelleVon(modelId) {
        const q = this._quellen.get(modelId) ?? null;
        return q?.lebt() ? q : null;
    }

    /**
     * Was die geladenen Dateien über ihre Lage auf der Erde SAGEN (Stufe 13.1).
     *
     * Nur über LEBENDE Quellen. Entschieden wird hier nichts — das Auflösen
     * von Widersprüchen ist Stufe 13.2.
     */
    leseGeoreferenzen() {
        const out = {};
        for (const [modelId, q] of this._quellen) {
            if (!q.lebt()) continue;
            try { out[modelId] = leseGeoreferenz(q); }
            catch (fehler) { console.warn('cde: georeferenz', fehler?.message ?? fehler); }
        }
        return out;
    }

    getAllCoordOffsets() {
        const out = {};
        for (const [mid, off] of this._coordOffsets) out[mid] = { x: off.x, y: off.y, z: off.z };
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

    /**
     * Die GlobalId eines Bauteils — aus dem GUID-Index, nicht aus den Attributen.
     *
     * `parseItemData` liest `item['GlobalId']`, und das ist in Fragments nicht
     * da: der IfcLoader importiert von Haus aus nur einen schmalen Satz
     * Attribute (Projekt/Geschoss, Materialien, Merkmalssätze), die GlobalId
     * gehört nicht dazu. Sie führt die Bibliothek in einem EIGENEN Index,
     * erreichbar über `getGuidsByLocalIds`.
     *
     * Das war nicht folgenlos: `parseItemData` fällt auf `''` zurück, und
     * `eintragen` verwirft einen Eintrag ohne GlobalId. Jede Bearbeitung endete
     * damit still — die GlobalId ist der Angelpunkt des ganzen Journals, denn
     * sie ist das Einzige, was eine Modellrevision überlebt.
     */
    async _globalIdVon(model, localId) {
        try {
            const [guid] = await model.getGuidsByLocalIds([localId]);
            return guid ?? '';
        } catch (fehler) {
            console.warn('cde: GlobalId lesen', fehler?.message ?? fehler);
            return '';
        }
    }
    async buildSearchIndex() { return buildSearchIndex(this.components); }



    /**
     * Return the raw web-ifc API and model ID for vector plot extraction.
     * Returns null if no model is loaded.
     */
    /**
     * Wie viele Achsen sich aus den geladenen Dateien gewinnen lassen.
     *
     * Einmal je Laden, nicht je Bildaufbau — die Extrusionen auszuwerten kostet.
     * Der Wert entscheidet, ob der Längsschnitt-Modus bedienbar ist; der war
     * bis Stufe 14.1 DAUERHAFT gesperrt, weil `hatAchsen` nirgends gesetzt
     * wurde und die Achse ohnehin nie ankam.
     */
    /**
     * Der Journalstand als DATEN (Stufe 17.3): selbst erzeugte Rohre und
     * Schächte kommen ins Fachmodell, verdeckte Bauteile fliegen heraus.
     *
     * Die Engine liest KEIN Journal — die Schichtung zeigt nach unten. Der
     * Viewer-Hub (`entwerteNach`) rechnet den Stand über `CdeAchsen.js` aus
     * und reicht ihn hier herein; ohne den Aufruf gilt das nackte Geliefert.
     * CDE-Kanten tragen im Netz String-Schlüssel `cde:<globalId>` — die
     * localIds zweier Modelle dürfen kollidieren, GlobalIds nicht.
     */
    setzeJournalStand({ kanten = [], knoten = [], verdeckt = new Set() } = {}) {
        this._cdeKanten = new Map(kanten.map(k => [k.globalId, k]));
        this._cdeKnoten = new Map(knoten.map(k => [k.globalId, k]));
        this._verdeckt = verdeckt instanceof Set ? verdeckt : new Set(verdeckt);
    }

    async leseAchsen() {
        this._achsen = new Map();
        this._knoten = new Map();
        this._merkmale = new Map();
        let n = 0;
        for (const api of this.getWebIfcAPIs()) {
            // In WELTKOORDINATEN, nicht roh: alles andere in der CDE rechnet
            // in der Three-Welt, und die Umrechnung nach m NN steht an genau
            // einer Stelle (`Hoehenbezug`). Zwei Höhenwege wären zwei
            // Wahrheiten — davon hatte dieses Feature genug.
            const off = this._coordOffsets.get(api.fragmentModelId) ?? null;
            let achsen = [];
            try {
                achsen = extractAxisPolylines(api.quelle, { coordOffset: off });
            } catch (fehler) {
                console.warn('cde: achsen lesen', fehler?.message ?? fehler);
                continue;
            }
            const karte = new Map();
            for (const a of achsen) {
                const p = a.polyline;
                // GlobalId und Name GLEICH MIT ans Achsenband (Stufe 17.3):
                // vorher schlug jeder Konsument (Strang, Anschlüsse, Mengen,
                // Prüfliste) einzeln bei der Quelle nach — und der
                // Verdeckt-Filter unten wäre ohne die Kennung gar nicht
                // möglich.
                const zeile = api.quelle.zeile(a.expressId) ?? null;
                karte.set(a.expressId, {
                    globalId: zeile?.GlobalId?.value ?? null,
                    name: zeile?.Name?.value ?? '',
                    kategorie: a.category,
                    // Anfang und Ende GETRENNT — das ist der ganze Zweck.
                    // Die Hülle kennt nur eine Bounding-Box und weiß nicht,
                    // welches Ende oben liegt; damit ist kein Gefälle
                    // bearbeitbar.
                    anfang: p[0],
                    ende: p[p.length - 1],
                    polyline: p,
                    laenge: a.laenge,
                    gefaelle: a.gefaelle,
                    dn: a.dn,
                    quelle: a.quelle,
                });
            }
            this._achsen.set(api.fragmentModelId, karte);
            n += karte.size;

            // DIE KNOTEN gleich mit: die Schächte, an denen die Haltungen
            // hängen. Ohne sie gibt es keine Topologie — und ohne Topologie
            // keinen einzigen Netz-Befund. Gelesen wird nur die PLATZIERUNG,
            // keine Geometrie; das kostet nichts.
            const knoten = new Map();
            for (const [id, punkt] of api.quelle.platzierungen(
                api.quelle.ids('IFCDISTRIBUTIONCHAMBERELEMENT', { untertypen: true }))) {
                const kZeile = api.quelle.zeile(id) ?? null;
                knoten.set(id, {
                    punkt: off
                        ? { x: punkt.x - off.x, y: punkt.y - (off.y ?? 0), z: punkt.z - off.z }
                        : punkt,
                    globalId: kZeile?.GlobalId?.value ?? null,
                    name: kZeile?.Name?.value ?? '',
                });
            }
            this._knoten.set(api.fragmentModelId, knoten);

            // Die Merkmale gleich mit — ein Durchlauf über die Beziehungen.
            // Material, Baujahr und Kanalart stehen in Fabios Dateien an jedem
            // Bauteil und wurden bisher nirgends gelesen.
            this._merkmale.set(api.fragmentModelId, api.quelle.merkmale());
        }
        return n;
    }

    /**
     * Das ganze Modell prüfen — die Prüfliste (Stufe 14.4).
     *
     * Läuft über die Achsen, die seit dem Laden bereitstehen; es wird nichts
     * nachgelesen. Rein beratend: kein Befund hält je etwas auf.
     *
     * @param {object} opts
     * @param {(kategorie:string) => object|null} [opts.typprofilFuer]
     * @param {object} [opts.regelwerk]
     * @returns {Array<{modelId, localId, globalId, kategorie, name, befunde}>}
     */
    pruefeAlles({ typprofilFuer = () => null, umgekehrtFuer = () => false, regelwerk } = {}) {
        const out = [];
        for (const [modelId, achsen] of (this._achsen ?? new Map())) {
            const quelle = this.quelleVon(modelId);
            // Netz-Befunde zuerst: sie betreffen auch Bauteile OHNE Achse
            // (einen Schacht ohne Anschluss etwa), die die Schleife darunter
            // gar nicht besucht.
            const netzBefunde = befundeFuerNetz(this.netzVon(modelId), regelwerk);
            for (const [localId, achse] of achsen) {
                // Verdeckte prüfen nicht mit — ein unsichtbares Bauteil mit
                // sichtbaren Befunden wäre eine Liste, der niemand traut.
                if (achse.globalId && this._verdeckt?.has(achse.globalId)) {
                    netzBefunde.delete(localId);
                    continue;
                }
                const zeile = quelle?.zeile(localId) ?? null;
                const kategorie = achse.kategorie
                    ?? (zeile?.constructor?.name ?? '').toUpperCase()
                    ?? '';
                const globalId = achse.globalId ?? String(localId);
                const befunde = befundeFuer({
                    globalId,
                    kategorie,
                    beschreibung: zeile?.Description?.value ?? null,
                    achse,
                    umgekehrt: umgekehrtFuer(globalId),
                    typprofil: typprofilFuer(kategorie),
                }, regelwerk).concat(netzBefunde.get(localId) ?? []);
                netzBefunde.delete(localId);
                if (!befunde.length) continue;
                out.push({
                    modelId, localId,
                    globalId: zeile?.GlobalId?.value ?? null,
                    kategorie,
                    name: zeile?.Name?.value ?? '',
                    befunde,
                });
            }

            // Die CDE-KANTEN durch dieselben Regeln — ein selbst gebautes
            // Rohr mit Gegengefälle verdient denselben Befund wie ein
            // geliefertes (Stufe 17.3).
            for (const [gid, k] of this._cdeKanten ?? new Map()) {
                if (this._verdeckt?.has(gid)) continue;
                const kantenId = `cde:${gid}`;
                const befunde = befundeFuer({
                    globalId: gid,
                    kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
                    achse: k,
                    umgekehrt: umgekehrtFuer(gid),
                    typprofil: typprofilFuer(k.kategorie ?? 'IFCPIPESEGMENT'),
                }, regelwerk).concat(netzBefunde.get(kantenId) ?? []);
                netzBefunde.delete(kantenId);
                if (!befunde.length) continue;
                out.push({
                    modelId, localId: kantenId,
                    globalId: gid, kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
                    name: k.name ?? '', befunde,
                });
            }

            // Was übrig bleibt, sind Bauteile ohne Achse — die Schächte
            // (gelieferte über die Quelle, selbst gesetzte über den Stand)
            // und die CDE-Kanten, deren Befunde die Schleife oben nicht sah.
            for (const [localId, befunde] of netzBefunde) {
                if (typeof localId === 'string' && localId.startsWith('cde:')) {
                    const gid = localId.slice(4);
                    const meta = this._cdeKnoten?.get(gid) ?? this._cdeKanten?.get(gid) ?? null;
                    out.push({
                        modelId, localId,
                        globalId: gid,
                        kategorie: meta?.kategorie ?? 'IFCDISTRIBUTIONCHAMBERELEMENT',
                        name: meta?.name ?? '',
                        befunde,
                    });
                    continue;
                }
                const zeile = quelle?.zeile(localId) ?? null;
                const knotenMeta = this._knoten?.get(modelId)?.get(localId) ?? null;
                if (knotenMeta?.globalId && this._verdeckt?.has(knotenMeta.globalId)) continue;
                out.push({
                    modelId, localId,
                    globalId: zeile?.GlobalId?.value ?? null,
                    kategorie: (zeile?.constructor?.name ?? '').toUpperCase(),
                    name: zeile?.Name?.value ?? '',
                    befunde,
                });
            }
        }

        // Das Schwerste zuerst — eine Liste, die man von oben abarbeitet.
        return out.sort((a, b) =>
            (b.befunde.some(x => x.schwere === 'warnung') ? 1 : 0)
            - (a.befunde.some(x => x.schwere === 'warnung') ? 1 : 0)
            || b.befunde.length - a.befunde.length);
    }

    /**
     * Das Netz eines Modells — wer hängt an wem (Stufe 14.5).
     *
     * Aus der XY-Koinzidenz, nicht aus erklärten IFC-Beziehungen: die gibt es
     * in den echten Dateien nicht (null Ports, null Connects). Gebaut wird auf
     * Anfrage, nicht beim Laden — es ist eine Auskunft, kein Zustand.
     */
    netzVon(modelId, { toleranz } = {}) {
        const achsen = this.achsenVon(modelId);
        const knoten = this._knoten?.get(modelId) ?? new Map();
        const verdeckt = this._verdeckt ?? new Set();

        const kanten = [];
        for (const [id, a] of achsen) {
            // Verdeckte bleiben draussen: ein ausgeblendetes Bauteil, das
            // weiter verkettet und Befunde trägt, ist ein Geist im Netz.
            if (a.globalId && verdeckt.has(a.globalId)) continue;
            kanten.push({ id, anfang: a.anfang, ende: a.ende, dn: a.dn, laenge: a.laenge });
        }
        for (const [gid, k] of this._cdeKanten ?? new Map()) {
            if (verdeckt.has(gid)) continue;
            kanten.push({ id: `cde:${gid}`, anfang: k.anfang, ende: k.ende, dn: k.dn, laenge: k.laenge });
        }

        const knotenListe = [];
        for (const [id, k] of knoten) {
            if (k.globalId && verdeckt.has(k.globalId)) continue;
            knotenListe.push({ id, punkt: k.punkt });
        }
        for (const [gid, k] of this._cdeKnoten ?? new Map()) {
            if (verdeckt.has(gid)) continue;
            knotenListe.push({ id: `cde:${gid}`, punkt: k.punkt });
        }

        return baueNetz({ kanten, knoten: knotenListe, toleranz });
    }

    /**
     * Der Strang ab diesem Bauteil — die Kette stromab (Stufe 14.6).
     *
     * Angereichert um GlobalId und Achse, damit der Katalog rein bleiben kann:
     * `anwenden(el, werte)` bekommt die fertige Kette am Bauteil und muss
     * weder Netz noch Engine kennen. Dasselbe Vorgehen wie bei `achse`.
     *
     * Die Kette endet am Abzweig — welche Haltung dort gemeint ist, kann nur
     * ein Mensch entscheiden (siehe `strangAb` in Netztopologie.js).
     */
    /**
     * Alle Schachtknoten eines Modells: GlobalId → Punkt (+Name).
     *
     * ZWEI Verbraucher, EIN Mass (Stufe 16): das Anschliessen (nächster
     * Schacht zum Tipp) und das Nachführen beim Nachspielen (hat der Planer
     * den Schacht bewegt?). `zielBasis` am Journaleintrag und der
     * eingefrorene Vergleichswert kommen BEIDE hier heraus — zwei
     * verschiedene Masse (Knoten vs. Hüllen-Anker) hätten still „bewegt"
     * gemeldet, wo nur zweierlei gemessen wurde.
     */
    schachtPunkteVon(modelId) {
        const knoten = this._knoten?.get(modelId) ?? new Map();
        const verdeckt = this._verdeckt ?? new Set();
        const karte = new Map();
        for (const [, k] of knoten) {
            if (!k.globalId || verdeckt.has(k.globalId)) continue;
            karte.set(k.globalId, { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z, name: k.name ?? '' });
        }
        // Selbst gesetzte Schächte sind Anschluss- und Bezugsziele wie
        // gelieferte — dasselbe Mass, dieselbe Karte.
        for (const [gid, k] of this._cdeKnoten ?? new Map()) {
            if (verdeckt.has(gid)) continue;
            karte.set(gid, { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z, name: k.name ?? '' });
        }
        return karte;
    }

    strangVon(modelId, localId) {
        const netz = this.netzVon(modelId);
        if (!netz.kanten.has(localId)) return [];
        // GlobalId und Name stehen seit 17.3 AN der Achse — ein Weg für
        // geliefert und cde, keine Quell-Nachschläge mehr.
        return strangAb(netz, localId).map((id) => {
            const a = this.achseVon(modelId, id);
            return {
                localId: id,
                globalId: a?.globalId ?? null,
                name: a?.name ?? '',
                anfang: a?.anfang ?? null,
                ende: a?.ende ?? null,
                laenge: a?.laenge ?? 0,
                dn: a?.dn ?? null,
            };
        }).filter(k => k.globalId && k.anfang && k.ende);
    }

    /**
     * Die Anschlüsse eines Bauwerks — welche Haltung mit welchem Ende (14.8).
     *
     * Gebraucht fürs Schachtverschieben: die angeschlossenen Haltungen können
     * sich NICHT starr mitbewegen, denn nur EIN Ende wandert; das andere bleibt
     * am Nachbarschacht. Das ist eine Formänderung, und darum muss der Aufrufer
     * wissen, welches Ende gemeint ist.
     *
     * Wie überall in dieser Ecke aus der XY-Koinzidenz — es gibt in den echten
     * Dateien keine erklärten Anschlüsse.
     */
    anschluesseVon(modelId, localId) {
        const netz = this.netzVon(modelId);
        const knoten = netz.knoten.get(localId);
        if (!knoten) return [];
        const eintrag = (kantenId, ende) => {
            const a = this.achseVon(modelId, kantenId);
            return a?.globalId ? {
                localId: kantenId,
                globalId: a.globalId,
                name: a.name ?? '',
                kategorie: a.kategorie ?? 'IFCPIPESEGMENT',
                // `ende` sagt, welches Ende an DIESEM Bauwerk hängt.
                ende,
                anfang: a.anfang, ende_: a.ende, laenge: a.laenge, dn: a.dn,
            } : null;
        };
        return [
            ...knoten.kantenAb.map(id => eintrag(id, 'anfang')),
            ...knoten.kantenAn.map(id => eintrag(id, 'ende')),
        ].filter(Boolean);
    }

    /**
     * Alle Schacht-Griffe für den Lageplan (G1) — über ALLE Modelle.
     *
     * Dieselben Knoten wie `schachtPunkteVon`, aber mit Modell- und
     * Herkunftskennung: Gelieferte Schächte bekommen einen Griff
     * (verschieben = Forderung an den Planer), CDE-eigene NICHT — deren Ort
     * lebt im `erzeugt`-Bauplan, und eine `lage` darauf würde vom Fachmodell
     * nie gelesen (17.3: Kanten und Knoten kommen aus den Bauplan-Parametern).
     * Sie hier trotzdem anzubieten hieße, einen Griff zu zeigen, der nichts
     * bewegt.
     */
    schachtGriffe() {
        const verdeckt = this._verdeckt ?? new Set();
        const out = [];
        for (const [modelId, knoten] of this._knoten ?? new Map()) {
            for (const [localId, k] of knoten) {
                if (!k.globalId || verdeckt.has(k.globalId)) continue;
                out.push({
                    globalId: k.globalId, name: k.name ?? '', modelId, localId,
                    punkt: { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z },
                    herkunft: 'geliefert',
                });
            }
        }
        for (const [gid, k] of this._cdeKnoten ?? new Map()) {
            if (verdeckt.has(gid)) continue;
            out.push({
                globalId: gid, name: k.name ?? '', modelId: null, localId: null,
                punkt: { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z },
                herkunft: 'cde',
            });
        }
        return out;
    }

    /** Wo ein GELIEFERTER Schacht wohnt — Modell und localId zur GlobalId. */
    schachtOrt(globalId) {
        for (const [modelId, knoten] of this._knoten ?? new Map()) {
            for (const [localId, k] of knoten) {
                if (k.globalId === globalId) return { modelId, localId };
            }
        }
        return null;
    }

    /**
     * Die Anschlüsse eines Schachts, nach ENDEN sortiert (G1): `nah` ist das
     * Ende an DIESEM Schacht (es wandert mit), `fern` das andere (es bleibt).
     * Genau die Form, die die Fanglinien und die Anschluss-Vorschau brauchen —
     * `anschluesseVon` liefert dieselben Daten, aber der Aufrufer müsste die
     * Enden selbst auseinanderhalten, und das ist die Sorte Zuordnung, die
     * irgendwann EIN Aufrufer falsch macht.
     */
    schachtAnschluesse(globalId) {
        const ort = this.schachtOrt(globalId);
        if (!ort) return [];
        return this.anschluesseVon(ort.modelId, ort.localId).map(k => ({
            globalId: k.globalId, name: k.name ?? '', ende: k.ende, dn: k.dn ?? null,
            nah: k.ende === 'anfang' ? k.anfang : k.ende_,
            fern: k.ende === 'anfang' ? k.ende_ : k.anfang,
        }));
    }

    /**
     * Die Stammdaten EINES Bauteils, ohne es auszuwählen (Stufe 14.10).
     *
     * `pickElement` braucht einen Mausklick und `refreshElement` die aktuelle
     * Auswahl. Für eine Rahmenauswahl wird beides gebraucht, ohne dass sich
     * die Auswahl je Bauteil ändern dürfte.
     */
    async _elementDaten(modelId, localId) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = fragments?.list?.get(modelId) ?? null;
        if (!model) return null;
        try {
            const roh = await fragments.getData({ [modelId]: [localId] }, DATA_CONFIG);
            const daten = this._parseItemData(roh);
            const globalId = daten?.globalId || await this._globalIdVon(model, localId);
            return { ...daten, globalId, modelId, localId };
        } catch (fehler) {
            console.warn('cde: elementdaten', fehler?.message ?? fehler);
            return null;
        }
    }
    elementDatenVon(modelId, localId) { return this._elementDaten(modelId, localId); }

    /**
     * Was für einen Mengenauszug gebraucht wird — je Bauteil eine Zeile.
     *
     * GlobalId, Länge, Nennweite und die Merkmale, alles aus dem, was seit dem
     * Laden bereitsteht. Gerechnet wird hier nichts: das tut `Sanierung.js`,
     * und zwar rein, damit es sich prüfen lässt.
     */
    /**
     * Das Höhenraster eines GELIEFERTEN Bauteils — für das Gelände-Rezept
     * und den Erdmassen-Auszug. Über den Resolver (dieselbe Ableitung wie
     * die Analyse), nie aus dem Journal (Stufe 15).
     */
    async _quellrasterVon(globalId) {
        const karte = await karteMitEngine(this, [globalId]);
        const treffer = karte.get(globalId);
        if (!treffer) return null;
        const res = await this.makeGeometryResolver()
            ?.forElements([treffer])?.getForm('mesh');
        const d = res?.data;
        if (!d?.positions?.length) return null;
        return heightfieldRaster(d.positions, d.triCount);
    }

    /**
     * Erdmassen je geformtem Gelände (Stufe 15): Ausgangsraster gegen das
     * nach der Operationsliste geformte — Aushub und Auftrag getrennt.
     * Nichts wird gespeichert; jede Zeile entsteht aus Journal + Ableitung.
     */
    async erdmassen(bauplaene = []) {
        const zeilen = [];
        for (const b of bauplaene) {
            if (b?.rezept !== 'gelaende') continue;
            const quelle = b.parameter?.quelle;
            const raster = quelle ? await this._quellrasterVon(quelle) : null;
            if (!raster) {
                zeilen.push({ name: b.name || quelle || '—', aushub: null, auftrag: null,
                              grund: 'Quellraster nicht ableitbar' });
                continue;
            }
            const { raster: geformt } = formeNach(raster, b.parameter?.operationen ?? []);
            const m = massenAus(raster, geformt);
            zeilen.push({ name: b.name || quelle, aushub: m?.aushub ?? null, auftrag: m?.auftrag ?? null });
        }
        return zeilen;
    }

    mengenGrundlage() {
        const out = [];
        const verdeckt = this._verdeckt ?? new Set();
        for (const [modelId, achsen] of (this._achsen ?? new Map())) {
            const merkmale = this.merkmaleAlle(modelId);
            for (const [localId, a] of achsen) {
                if (!a.globalId || verdeckt.has(a.globalId)) continue;
                out.push({ globalId: a.globalId, laenge: a.laenge, dn: a.dn,
                           merkmale: merkmale.get(localId) ?? {} });
            }
        }
        // Selbst gebaute Rohre zählen mit — eine Sanierungsmaßnahme am
        // NEUEN Rohr gehört in denselben Auszug.
        for (const [gid, k] of this._cdeKanten ?? new Map()) {
            if (verdeckt.has(gid)) continue;
            out.push({ globalId: gid, laenge: k.laenge, dn: k.dn, merkmale: {} });
        }
        return out;
    }

    /** Die Merkmale eines Bauteils aus den Merkmalssätzen der Datei. */
    merkmaleVon(modelId, localId) {
        return this._merkmale?.get(modelId)?.get(localId) ?? null;
    }

    /** Alle Merkmale eines Modells — für Auszüge über viele Bauteile. */
    merkmaleAlle(modelId) {
        return this._merkmale?.get(modelId) ?? new Map();
    }

    /** Die Achsen eines Modells — leer, wenn keine gelesen wurden. */
    achsenVon(modelId) {
        return this._achsen?.get(modelId) ?? new Map();
    }

    /**
     * Die Achse EINES Bauteils, oder null.
     *
     * `localId` und die IFC-ExpressID sind dieselbe Zahl — das ist nicht
     * angenommen, sondern gemessen: die Höhenbestimmung (Stufe 13.3) vergleicht
     * `IfcQuelle`-Werte (ExpressID) gegen `model.getBoxes` (localId) und kam
     * über 24 Bauteile auf 0,0 mm Übereinstimmung.
     */
    achseVon(modelId, localId) {
        if (typeof localId === 'string' && localId.startsWith('cde:')) {
            const k = this._cdeKanten?.get(localId.slice(4)) ?? null;
            if (!k) return null;
            return {
                globalId: k.globalId, name: k.name, kategorie: k.kategorie,
                anfang: k.anfang, ende: k.ende, polyline: k.punkte,
                laenge: k.laenge, dn: k.dn, quelle: 'bauplan',
            };
        }
        return this.achsenVon(modelId).get(localId) ?? null;
    }

    /** Dasselbe für das ERSTE Modell — siehe `getWebIfcAPIs`. */
    getWebIfcAPI() {
        return this.getWebIfcAPIs()[0] ?? null;
    }

    /**
     * Lesezugriff auf die IFC-Dateien je geladenem Modell (Stufe 14.1).
     *
     * ÜBER DIE LEBENDEN QUELLEN, nicht über `ifcLoader.webIfc`. Der alte Handle
     * hatte nie ein Modell offen, und `modelID` war schlicht der Schleifenindex
     * — beides fiel nie auf, weil ohnehin nichts herauskam. Folge war unter
     * anderem, dass JEDE Achse aus der Skelettierung des Netzes stammte
     * (Güte `geschaetzt`) und der Längsschnitt dauerhaft gesperrt blieb.
     *
     * `quelle` ist der bevorzugte Zugang — sie kennt Untertypen, den
     * GUID-Index und prüft mit `lebt()` einen echten Lesezugriff. `webIfc` und
     * `modelID` bleiben daneben für Aufrufer, die roh lesen.
     */
    getWebIfcAPIs() {
        const fragments = this.components.get(OBC.FragmentsManager);
        if (!fragments?.list?.size) return [];
        const out = [];
        for (const model of fragments.list.values()) {
            const quelle = this.quelleVon(model.modelId);
            if (!quelle) continue;
            out.push({
                quelle,
                webIfc: quelle.api,
                modelID: quelle.modelID,
                fragmentModelId: model.modelId,
                model,
            });
        }
        return out;
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
