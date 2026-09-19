import * as OBC from '@thatopen/components';
import { pruefmassVon, achsmassAus } from './geometrie/hilfen.js';
import { setzeBeleuchtung } from './IfcBeleuchtung.js';
import { BAUTEILFARBEN, eigeneFarbe, faerbePlan, farbeFuer, materialWerte } from './Bauteilfarben.js';
import { FAERBE_FARBEN } from './Vorschau.js';
import { karteMitEngine } from './GlobalIdKarte.js';
import { DELTA_MARKE, basisModelId, istDeltaModell } from './DeltaBoxen.js';
import { strukturBeziehungen } from './Bauwerksstruktur.js';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { IfcCamera } from './IfcCamera.js';
import { DATA_CONFIG, parseItemData } from './IfcItemData.js';
import { IfcAnnotations } from './IfcAnnotations.js';
import { IfcMeasure } from './IfcMeasure.js';
import { IfcOverlay } from './IfcOverlay.js';
import { boxenAktuell } from './DeltaBoxen.js';
import { FANG_RADIUS_PX } from './Fangpunkte.js';
import { IfcGridAxes } from './IfcGridAxes.js';
import { IfcSection } from './IfcSection.js';
import { IfcStoreys } from './IfcStoreys.js';
import { createGeometryResolver } from './ifcleser/GeometryResolver.js';
import { IfcAutor, CDE_MODELL_ID } from './IfcAutor.js';
import { DURCHTIPP_PX, rangiereTreffer, waehleKandidat } from './Auswahlrang.js';
import { erzeugeKernel } from './geometrie/Kernel.js';
import { erzeugeWorkerBackend } from './geometrie/KernelWorker.js';
import { erzeugeServerBackend } from './geometrie/KernelServer.js';
import backendApi from '@/services/api';
import { gelaendeElemente, GELAENDE_VORBELEGUNG } from './GelaendeQuelle.js';
import { bauformAusNetz } from './bauform/Formsignatur.js';
import { achsGuete } from './bauform/Bauformen.js';
import { makeHeightSampler } from './TerrainMesh.js';
import { GelaendeKanten } from './GelaendeKanten.js';
import { ErdbauUmrisse } from './ErdbauUmrisse.js';
import { IfcQuelle } from './IfcQuelle.js';
import { importBefund, zaehltAlsBauteil } from './ImportBefund.js';
import { inMeterUmrechnen } from './Einheiten.js';
import { erzeugeEinheitenWorker } from './EinheitenWorker.js';
import { strangMitAchsen } from './Netztopologie.js';
import { achseAusKante } from './CdeAchsen.js';

import { leseGeoreferenz } from './Georeferenz.js';
import { erdmassen as _ausgelagert_erdmassen } from './Erdmassen.js';
import { _quellFormVon as _ausgelagert__quellFormVon, _achseAlsLinie as _ausgelagert__achseAlsLinie, gelaendeKandidaten as _ausgelagert_gelaendeKandidaten, erdbauKandidaten as _ausgelagert_erdbauKandidaten, koerperKandidaten as _ausgelagert_koerperKandidaten } from './engine/Quellformen.js';
import { netzVon as _ausgelagert_netzVon, anschluesseVon as _ausgelagert_anschluesseVon, anschluesseFuer as _ausgelagert_anschluesseFuer, schachtPunkteVon as _ausgelagert_schachtPunkteVon, netzAuskunft as _ausgelagert_netzAuskunft, knotenGriffe as _ausgelagert_knotenGriffe } from './engine/Netzabfragen.js';
import { beziehungen as _ausgelagert_beziehungen, _beziehungsObjekte as _ausgelagert__beziehungsObjekte, _beziehungenDirtyAus as _ausgelagert__beziehungenDirtyAus, kollisionenPruefen as _ausgelagert_kollisionenPruefen } from './engine/Beziehungslauf.js';
import { pruefeAlles as _ausgelagert_pruefeAlles } from './engine/Pruefliste.js';
import { leseAchsen as _ausgelagert_leseAchsen } from './ifcleser/Achsen.js';
import { buildSearchIndex as _ausgelagert_buildSearchIndex } from './ifcleser/Suchindex.js';
import { _hoehenversatzMessen as _ausgelagert__hoehenversatzMessen } from './ifcleser/Hoehenversatz.js';


/**
 * Die AUSWAHL — leicht (Fabio, 2026-09-10: „das grüne Auswählen sollte weg
 * und durch ein leichteres Feedback ersetzt werden"). Vorher deckendes
 * Reingrün (0, 1, 0.08): das gewählte Bauteil verlor Form und Schattierung,
 * ein gewähltes Gelände war eine grüne Fläche. Jetzt ein heller,
 * durchscheinender Schimmer; ein Gelände füllt `_highlight` gar nicht mehr —
 * seine Dreieckskanten tragen die Auswahl (`GelaendeKanten`).
 */
export const SELECTION_STYLE = {
    color: new THREE.Color(0.72, 0.88, 1.0),
    renderedFaces: FRAGS.RenderedFaces.TWO,
    opacity: 0.55,
    transparent: true,
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
    IFCDUCTSEGMENT:        new THREE.Color(0.80, 0.70, 0.28),
    IFCDUCTSEGMENTTYPE:    new THREE.Color(0.80, 0.70, 0.28),
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

/**
 * DER CURSOR WOHNT IM CSS (Teil XVI, S1). Die Engine setzte ihn bis dahin als
 * Inline-Style auf das Canvas — und Inline schlägt jede Klasse: der
 * Mess-Cursor aus `IfcViewer.vue` kam deshalb nie an. Jetzt liefert
 * `hoverElement` nur Daten; welche Klasse das Canvas trägt, entscheidet
 * `useZeiger` — EIN Besitzer.
 */

/**
 * Färbe-Rollen der Vorschau (Teil XVI, S2) — ein STAPEL in der Engine, weil
 * sich hier schon drei Besitzer um das Highlight streiten (Auswahl, Rahmen,
 * Herkunft). Das Dimmen des Subjekts überschreibt dessen Auswahl-Highlight;
 * beim Entfärben wird die Auswahl deshalb wiederhergestellt.
 */
/** Der Rollenname, unter dem ein IFC-Typ im Färbe-Stapel liegt. */
export const erdbauRolle = (kategorie) => `erdbau:${String(kategorie).toUpperCase()}`;

const FAERBE_STILE = Object.freeze({
    // DIE FARBE KOMMT ALS HEX (2026-09-17). Vorher standen hier Float-Tripel,
    // die aus eben diesen Hex-Werten gerechnet waren — three (ColorManagement
    // an) liest Floats aber als LINEAR: `(0.31, 0.76, 0.97)` erschien als
    // `#97e2fc`, der Geist derselben Bearbeitung als `#4fc3f7`. Eine Rolle,
    // eine Farbe: `FAERBE_FARBEN` (Vorschau.js).
    dimmen:   { color: new THREE.Color(FAERBE_FARBEN.dimmen),   renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 0.25, transparent: true },
    kandidat: { color: new THREE.Color(FAERBE_FARBEN.kandidat), renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 0.9,  transparent: true },
    ziel:     { color: new THREE.Color(FAERBE_FARBEN.ziel),     renderedFaces: FRAGS.RenderedFaces.TWO, opacity: 1.0,  transparent: false },
    // Die Erdbau-Farben kommen aus dem KATALOG (`Bauteilfarben.js`) — je
    // IFC-Typ eine Rolle. Sie stehen hier, damit `faerbe(rolle, orte)` der
    // eine Weg bleibt und nicht ein zweiter mit eigenem Stil entsteht.
    ...Object.fromEntries(Object.entries(BAUTEILFARBEN).map(([typ, f]) => {
        // Deckkraft, Transparenz und `depthWrite` rechnet der Katalog
        // (`materialWerte`) — dieselbe Quelle wie das Material im Bauteil
        // (`IfcAutor._materialFuer`). Vorher stand die Regel hier ein zweites
        // Mal; ein Katalogeintrag mit Sonderfall hätte sie auseinandergeführt.
        const m = materialWerte(f);
        return [erdbauRolle(typ), {
            color: new THREE.Color(m.color),
            renderedFaces: FRAGS.RenderedFaces.TWO,
            opacity: m.opacity,
            transparent: m.transparent,
            depthWrite: m.depthWrite,
        }];
    })),
});

/** Der Stil einer Färbe-Rolle — der eine Zugang zum Stapel (auch für Wächter). */
export const faerbeStilFuer = (rolle) => FAERBE_STILE[rolle] ?? null;

/**
 * Rang im Färbe-Stapel (Abnahme 2026-09-12, K4): der Katalog unten, die
 * Vorschau darüber; die Auswahl legt `_auswahlErneuern` zuletzt obenauf.
 * Ein Highlight gibt es je Bauteil nur EINMAL — wer zurücksetzt, nimmt die
 * Farbe darunter mit. Der Stapel trägt sie wieder auf.
 */
const VORSCHAU_RANG = ['dimmen', 'kandidat', 'ziel'];
export const faerbeRang = (rolle) => (String(rolle).startsWith('erdbau:') ? 0 : 1 + VORSCHAU_RANG.indexOf(rolle));

/** Die Orte einer Rolle, die auch in `items` stehen — Basis und Delta zählen als ein Modell. */
function _schnitt(karte, items) {
    const aus = {};
    let n = 0;
    for (const [m, ids] of Object.entries(karte ?? {})) {
        const dort = new Set(Object.entries(items ?? {})
            .filter(([mm]) => basisModelId(mm) === basisModelId(m))
            .flatMap(([, liste]) => (liste ?? []).map(Number)));
        const s = ids.filter(i => dort.has(Number(i)));
        if (s.length) { aus[m] = s; n += s.length; }
    }
    return n ? aus : null;
}

/** Rahmenauswahl — derselbe Stil wie die Einzelauswahl, damit zwei Wege eine Sprache sprechen. */
const MARQUEE_STYLE = { ...SELECTION_STYLE, color: SELECTION_STYLE.color.clone() };

// Multi-sample offsets (px) around the click point — improves hit rate on thin
// edges and small elements without requiring an exact pixel hit.
const PICK_OFFSETS = [
    [0, 0],
    [11, 0], [-11, 0], [0, 11], [0, -11],
    [8, 8],  [-8, 8],  [8, -8], [-8, -8],
    [16, 0], [-16, 0], [0, 16], [0, -16],
];


/**
 * Das DELTA-MODELL des fragments-Editors (Teil XVI, Nachprüfung 2026-09-08).
 *
 * Jede Bearbeitung (`editor.applyChanges`) landet in einem eigenen Modell
 * `<modelId>-DELTA-MODEL-<zeit>`, das die Bibliothek in DIESELBE Liste legt;
 * die Basis blendet das bearbeitete Bauteil aus, das Delta zeichnet es am
 * neuen Ort. Der Raycast trifft also das Delta (gemessen: Treffer auf dem
 * verschobenen Rohr kam mit der Delta-Kennung), und `getModelList` zählte es
 * als Modell. Für die CDE ist das Delta KEIN Modell: Treffer, Auswahl,
 * Färbung und Verstecken gehören dem Basismodell, und wer die Basis anfasst,
 * muss das Delta mitnehmen (`_mitDelta`), sonst bleibt die sichtbare Kopie
 * unmarkiert oder stehen.
 */
export { DELTA_MARKE, basisModelId, istDeltaModell } from './DeltaBoxen.js';

/**
 * Der Ladeversatz eines Modells (welt = roh − versatz), aus der fragments-Bibliothek.
 *
 * fragments 3.x lässt `object.position` des ERSTEN Modells auf null und legt
 * dessen Koordinationspunkt in `core.baseCoordinates` ab; jedes spätere Modell
 * wird über `object.position = base − eigene` daran ausgerichtet. Für JEDES
 * Modell gilt damit welt = roh + base, also versatz = −base — die Bibliothek
 * hat das Netz beim Importieren schon um den Koordinationspunkt geschoben.
 *
 * Bis 2026-09-08 las die Engine `−object.position` und bekam für X und Z immer
 * null (nur Y wurde gemessen, siehe `_hoehenversatzMessen`): Achsen, Schacht-
 * knoten, Fang, Griffe und die Rohkoordinate der Leiste lagen 2,5 Mio. m neben
 * der Fragment-Welt. Gesehen im Headless-Lauf am ENQUIER-Netz — die Attrappen
 * hatten immer Versatz 0 und konnten es nicht zeigen.
 *
 * @param {{baseCoordinates?: number[]|null, position?: {x,y,z}|null}} q
 * @returns {{x:number, y:number, z:number, quelle:'baseCoordinates'|'position'}}
 */
export function ladeversatzAus({ baseCoordinates = null, position = null } = {}) {
    const b = Array.isArray(baseCoordinates) && baseCoordinates.length >= 3
        && baseCoordinates.slice(0, 3).every(Number.isFinite) ? baseCoordinates : null;
    if (b) return { x: 0 - b[0], y: 0 - b[1], z: 0 - b[2], quelle: 'baseCoordinates' };
    const p = position ?? {};
    return { x: 0 - (p.x ?? 0), y: 0 - (p.y ?? 0), z: 0 - (p.z ?? 0), quelle: 'position' };
}



export class IfcEngine {
    constructor() {
        this.components      = new OBC.Components();
        this._selectedItems  = null;
        this._selectedKey    = null;
        this._faerbungen     = new Map();   // rolle → ModelIdMap (Teil XVI, S2)
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
         * Der BEZIEHUNGSINDEX (Teil XVII) — abgeleitet, nie gespeichert.
         * `_beziehungenDirty`: true = ganz neu, Set = nur diese GlobalIds,
         * null = frisch. `_huellen` hält die Bounding-Boxen je Modell
         * (Worker-Roundtrip — einmal je Modellmenge, danach nur für Bewegtes).
         */
        this._beziehungen        = null;
        this._beziehungenDirty   = true;
        this._beziehungenNr      = 0;
        this._huellen            = new Map();
        this._cdeAbleitungen     = [];
        /** modelId → Bericht der Einheiten-Umrechnung (oder Fehlgrund). */
        this._einheitsUmrechnungen = new Map();
        /** modelId → umgerechnete Bytes, EINMAL abholbar (die Ablage legt sie ab). */
        this._einheitsBytes = new Map();
        /** modelId → {puffer, ausAblage}, EINMAL abholbar — die Fragmentdatei des Importers. */
        this._fragPuffer = new Map();
        this._koordinaten = new Map();   // Koordinationspunkt je Modell (Gegenprobe der Fragment-Ablage)
        this._achsenRoh = new Map();     // Achsen wie geliefert (S7: `_achsen` = mit Lagen)
        this._knotenRoh = new Map();
        this._lagen = new Map();         // GlobalId → Δ gegen den Lieferstand
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
        /** Ist das Bezugsraster dem Gelände schon einmal gewichen? (einmalig, umkehrbar) */
        this._rasterWichGelaende = false;
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
        // PLASTIZITÄT (2026-09-09): die Bibliothek stellt Umgebungs- und
        // Richtungslicht gleich stark — die Hälfte des Lichts kommt dann aus
        // allen Richtungen zugleich und macht jede Fläche gleich hell, egal
        // wie sie geneigt ist. Ein Erdkörper sah dadurch aus wie ein Blatt
        // Papier. `setzeBeleuchtung` nimmt das Umgebungslicht zurück und
        // richtet das Hauptlicht nach Nordwest aus — Hangschattierung, wie
        // sie jede Reliefkarte benutzt.
        setzeBeleuchtung(world);

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
            quelleVon: (modelId) => this.quelleVon(modelId),
        });
        this.annotations = new IfcAnnotations({ getWorld: () => this._getWorld(), probePoint,
                                                probeTreffer: (x, y) => this.probeTreffer(x, y) });
        this.measure     = new IfcMeasure({     getWorld: () => this._getWorld(), probePoint });
        // Teil XVI: der EINE Besitzer temporärer Grafik (Zeiger, Vorschau, Griffe, Fang).
        this.overlay     = new IfcOverlay({ getWorld: () => this._getWorld() });
        // Die Dreieckskanten der Gelände (2026-09-10) — mit Tiefentest, deshalb nicht im Overlay.
        this.gelaendeKanten = new GelaendeKanten({ getWorld: () => this._getWorld() });
        // Der Umriss jedes Erdkörpers auf dem Gelände (Teil XXI, E2): der
        // Körper liegt durchscheinend UNTER der Anzeige, seine Fussspur steht
        // darüber — sonst sähe man von oben nur unberührtes Gelände.
        this.erdbauUmrisse = new ErdbauUmrisse({ getWorld: () => this._getWorld() });
        // Stufe 9.2: der einzige Kanal zur Editor-API von @thatopen/fragments.
        this.autor       = new IfcAutor({
            getFragments: () => this.components.get(OBC.FragmentsManager),
            // Verborgene Modelle bleiben es über jeden Neuaufbau (Abnahme 2026-09-12, A6).
            istVerborgen: (modelId) => !this.modellSichtbar(modelId),
            getWelt:      () => this._getWorld(),
            // Stufe 15: das Höhenraster eines GELIEFERTEN Bauteils — für das
            // Gelände-Rezept. Über den Resolver (dieselbe Ableitung wie die
            // Analyse), nie aus dem Journal.
            holeQuellraster: (globalId, opts) => this._quellrasterVon(globalId, opts),
            // Teil XIV: Ableitungen holen ihre Quellen in Kernel-Form, rechnen
            // über den Kernel und brauchen den Höhenversatz für die NN-Grenze.
            holeQuellForm: (globalId, form, opts) => this._quellFormVon(globalId, form, opts),
            // Das Formpaar-Gate (2026-09-03): woran erkennt der Lauf, dass die
            // gewählte Quelle wirklich ein Gelände ist? An DERSELBEN Antwort,
            // die auch der Sampler und die Toolbox benutzen — eine zweite
            // Rechnung sagte irgendwann etwas anderes, und der Nutzer sähe
            // „Gelände" im Formular und „kein Gelände" im Lauf.
            holeQuellBauform: (globalId) => this._quellBauformVon(globalId),
            kernel: erzeugeKernel({
                worker: erzeugeWorkerBackend(),
                // Der Server-Kernel (G7): Transport injiziert, der Ordner
                // geometrie/ kennt kein `@/`. Antworten sind Meshpakete.
                server: erzeugeServerBackend({
                    hole: async (pfad) => (await backendApi.get(pfad)).data,
                    sende: async (pfad, puffer) => (await backendApi.post(pfad, puffer, {
                        headers: { 'Content-Type': 'application/octet-stream' },
                        responseType: 'arraybuffer',
                    })).data,
                }),
            }),
            getHoehenversatz: () => this._hoehenversatz ?? 0,
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
        // Den Server-Kernel einmal befragen — ohne Antwort bleiben seine
        // Operationen gesperrt, mit Grund (Gesetz 10).
        this.autor?._kernel?.bereit?.().catch(() => {});
    }

    // ── Model loading ────────────────────────────────────────────────────────

    /**
     * Bytes auf Meter umrechnen — den Faktor liest DIE Georeferenz, nicht ein
     * zweiter Leser.
     *
     * Dafür wird die Datei einmal zusätzlich geöffnet. Das kostet eine Sekunde
     * und ist der Preis dafür, dass es die Längeneinheit im Haus nur einmal
     * gibt: ein eigener kleiner Einheiten-Leser hier wäre die zweite Antwort
     * auf dieselbe Frage, und die läuft irgendwann auseinander.
     */
    /**
     * Die Fragmente in die Szene — aus der ABLAGE, wenn möglich, sonst über
     * den Importer (2026-09-07).
     *
     * Gemessen an Fabios Planungsdatei: web-ifc parst und tesselliert in
     * 0,4 s, der fragments-Importer braucht 1,4 s — und sein Ergebnis ist
     * 0,6 MB gross. Es bei jedem Start neu zu rechnen war der grösste
     * Einzelposten eines normalen Ladens. Die Fragmentdatei je Prüfsumme
     * abzulegen und direkt zu laden spart ihn.
     *
     * NACHGEBAUT aus `IfcLoader.load` der Bibliothek, Zeile für Zeile
     * (Importer mit den Loader-Einstellungen, dann `core.load`); der
     * Vertragstest `fragmentsVertrag` liest diesen Rumpf mit, damit ein
     * Bibliothekssprung hier auffällt und nicht in der Szene.
     *
     * GEGENPROBE statt Vertrauen: die abgelegte Fragmentdatei trägt den
     * Rahmen (Ladeversatz), mit dem sie entstand. Weicht der nach dem Laden
     * ab, wird sie verworfen und neu importiert — sonst läge das Journal
     * gegen den falschen Rahmen (Lücke ⑤).
     *
     * @returns {Promise<{model, puffer: ArrayBuffer|Uint8Array|null, ausAblage: boolean}>}
     */
    async _fragmenteLaden(bytes, name, frag = null) {
        const ifcLoader = this.components.get(OBC.IfcLoader);
        const fragments = this.components.get(OBC.FragmentsManager);
        fragments.core.settings.autoCoordinate = true;

        if (frag?.puffer) {
            let model = null;
            try {
                model = await fragments.core.load(frag.puffer, { modelId: name });
                // GEGENPROBE am Koordinationspunkt des Modells selbst — er steckt
                // in der Fragmentdatei. Der Welt-Rahmen entsteht erst beim Laden
                // aus `baseCoordinates` (welt = roh + base) und hängt nicht am
                // Puffer; `object.position` ist beim ersten Modell immer null und
                // taugt nicht als Probe. Eine Ablage OHNE Koordinationspunkt
                // (Altbestand) wird neu importiert — nie geraten.
                const ist = await model.getCoordinates();
                const soll = frag.koordinaten;
                const passt = Array.isArray(soll) && Array.isArray(ist) && soll.length >= 3 && ist.length >= 3
                    && [0, 1, 2].every(i => Math.abs((ist[i] ?? NaN) - soll[i]) < 1e-6);
                if (passt) { this._koordinaten.set(name, [...ist]); return { model, puffer: null, ausAblage: true }; }
                console.warn('cde: Fragment-Ablage ohne passenden Koordinationspunkt — wird neu importiert');
                await this._modellVerwerfen(model);
            } catch (fehler) {
                console.warn('cde: Fragment-Ablage unbrauchbar — wird neu importiert:', fehler?.message ?? fehler);
                if (model) await this._modellVerwerfen(model).catch(() => {});
            }
        }

        // Der Importer — genau das, was `IfcLoader.load` tut, nur mit dem
        // Puffer in der Hand.
        if (ifcLoader.settings?.autoSetWasm && typeof ifcLoader.autoSetWasm === 'function') {
            await ifcLoader.autoSetWasm();
        }
        const importer = new FRAGS.IfcImporter();
        importer.wasm.path = ifcLoader.settings.wasm.path;
        importer.wasm.absolute = ifcLoader.settings.wasm.absolute;
        importer.webIfcSettings = ifcLoader.settings.webIfc;
        ifcLoader.onIfcImporterInitialized?.trigger?.(importer);
        const puffer = await importer.process({ bytes });
        const model = await fragments.core.load(puffer, { modelId: name });
        try { this._koordinaten.set(name, [...(await model.getCoordinates() ?? [])]); } catch { /* ohne Probe */ }
        return { model, puffer, ausAblage: false };
    }

    /** Ein Modell wieder aus der Bibliothek nehmen, bevor es in der Szene war. */
    async _modellVerwerfen(model) {
        const fragments = this.components.get(OBC.FragmentsManager);
        try {
            if (typeof model?.dispose === 'function') await model.dispose();
            else fragments.list.delete(model?.modelId);
        } catch { fragments.list.delete(model?.modelId); }
    }

    /** Die Fragmentdatei dieses Ladevorgangs — EINMAL abholbar, mit dem Rahmen. */
    fragmentPuffer(modelId) {
        const f = this._fragPuffer.get(modelId) ?? null;
        this._fragPuffer.delete(modelId);
        if (!f) return null;
        const off = this._coordOffsets.get(modelId) ?? null;
        const k = this._koordinaten.get(modelId) ?? null;
        return { ...f, offset: off ? { x: off.x, y: off.y, z: off.z } : null, koordinaten: k ? [...k] : null };
    }

    /** Die frisch umgerechneten Meter-Bytes — EINMAL abholbar. */
    einheitsBytes(modelId) {
        const b = this._einheitsBytes.get(modelId) ?? null;
        this._einheitsBytes.delete(modelId);
        return b;
    }

    async _inMeter(data) {
        try {
            const WebIFC = await import('web-ifc');
            const vorab = await IfcQuelle.oeffne(WebIFC, data, { wasmPfad: '/', absolut: true, name: 'einheiten' });
            if (!vorab) return { bytes: null, grund: 'Datei nicht lesbar' };
            const faktor = leseGeoreferenz(vorab)?.einheit?.faktor ?? 1;
            if (!Number.isFinite(faktor) || Math.abs(faktor - 1) < 1e-12) {
                vorab.schliesse();
                return { bytes: null, grund: 'schon in Metern' };
            }
            vorab.schliesse();

            // ── ZUERST DER WORKER ───────────────────────────────────────────
            // `SaveModel` schreibt die ganze Datei neu; im Hauptthread friert
            // dabei das Bild ein, der Ladeschleier bleibt stehen, und das
            // sieht aus wie ein Absturz. Der Worker rechnet DIESELBE Funktion.
            const wk = erzeugeEinheitenWorker();
            if (wk) {
                const r = await wk.umrechnen({ bytes: data, faktor, wasmPfad: '/', absolut: true });
                // `weg` steht im Bericht, damit die Meldung nicht behaupten
                // muss, was sie nicht weiss: „im Hintergrund gerechnet" ist
                // eine andere Aussage als „hat gerechnet".
                if (r?.bytes) return { ...r, bericht: { ...(r.bericht ?? {}), weg: 'worker' } };
                // Kein Wurf, ein GRUND — und dann inline weiter. Ein fehlender
                // Worker-Chunk (der 404-Fall vom Kernel-Worker) darf die
                // Umrechnung nicht unmöglich machen, nur langsamer. Gemeldet
                // wird er trotzdem: still ausweichen hiesse, den Fehler nie
                // wieder zu sehen.
                console.warn('cde: Einheiten-Worker nicht nutzbar, rechne inline —', r?.grund);
            }

            // ── Rückfall: inline, auf der GEMEINSAMEN wasm-Instanz ──────────
            // Ein zweites `Init()` wäre Sekunden für nichts (siehe IfcQuelle).
            const geteilt = await IfcQuelle.oeffne(WebIFC, data, { wasmPfad: '/', absolut: true, name: 'einheiten-inline' });
            const r = await inMeterUmrechnen(WebIFC, data, { faktor, api: geteilt?.api ?? null, wasmPfad: '/', absolut: true });
            geteilt?.schliesse();
            return r?.bytes ? { ...r, bericht: { ...(r.bericht ?? {}), weg: 'inline' } } : r;
        } catch (fehler) {
            return { bytes: null, grund: fehler?.message ?? String(fehler) };
        }
    }

    /** Was beim Laden umgerechnet wurde — `null`, wenn nichts. */
    einheitsUmrechnung(modelId) {
        return this._einheitsUmrechnungen?.get(modelId) ?? null;
    }

    /** Wurde für DIESES Modell erfolgreich auf Meter umgerechnet? */
    istInMeter(modelId) {
        return this._einheitsUmrechnungen?.get(modelId)?.ok === true;
    }

    /**
     * @param {Uint8Array} data
     * @param {string} name
     * @param {object} [opts]
     * @param {boolean} [opts.inMeter=false]  Modelleinheiten vor dem Laden auf
     *   Meter umrechnen. Siehe `services/Einheiten.js`: web-ifc liefert
     *   Geometrie in MODELLeinheiten, und fragments skaliert sie nicht — ein
     *   Millimeter-Modell kommt sonst tausendfach zu gross an. Umgerechnet
     *   wird HIER und nur hier; alles dahinter weiss von Einheiten nichts.
     *   Die Originalbytes bleiben unberührt (Prüfsumme, Ablage, Register).
     */
    async loadIfc(data, name = 'model', { inMeter = false, meterBytes = null, frag = null } = {}) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const world     = this._getWorld();

        // ── Einheiten (2026-09-03) ──────────────────────────────────────────
        // Die Umrechnung muss VOR dem Importer stehen: danach steckt die
        // Geometrie in Fragmenten, und die kennen keinen Faktor mehr.
        // Seit 2026-09-07 kommen die Meter-Bytes meist aus der ABLAGE
        // (`meterBytes`) — dann wird nichts gerechnet, nur gelesen.
        let bytes = data;
        let umrechnung = null;
        if (meterBytes) {
            bytes = meterBytes;
            umrechnung = { bytes: meterBytes, bericht: { weg: 'ablage' } };
        } else if (inMeter) {
            umrechnung = await this._inMeter(data);
            if (umrechnung?.bytes) bytes = umrechnung.bytes;
        }

        const { model, puffer, ausAblage } = await this._fragmenteLaden(bytes, name, frag);
        if (umrechnung) {
            this._einheitsUmrechnungen.set(model.modelId,
                umrechnung.bytes ? { ok: true, ...(umrechnung.bericht ?? {}) }
                                 : { ok: false, grund: umrechnung.grund });
            // Frisch gerechnete Meter-Bytes für die Ablage bereithalten — einmal.
            if (umrechnung.bytes && umrechnung.bericht?.weg !== 'ablage') {
                this._einheitsBytes.set(model.modelId, umrechnung.bytes);
            }
        }
        this._fragPuffer.set(model.modelId, { puffer, ausAblage });
        world.scene.three.add(model.object);

        // ── Ladeversatz: Three-Welt bleibt um null, die IFC-Rohlage wird geführt ──
        //   ifcRaw = threeJsWorld + offset. Der Versatz kommt aus `baseCoordinates`
        //   der Bibliothek, NICHT aus `object.position` — das ist beim ersten
        //   Modell immer null (siehe `ladeversatzAus`).
        const versatz   = ladeversatzAus({ baseCoordinates: fragments.core.baseCoordinates, position: model.object.position });
        const modelOff  = new THREE.Vector3(versatz.x, versatz.y, versatz.z);
        this._coordOffsets.set(model.modelId, modelOff);

        // Eigenen Lesezugriff auf DIESELBEN Bytes öffnen. Dynamisch importiert,
        // damit web-ifc nicht im Auswertungspfad jedes Moduls landet, das die
        // Engine erbt — und erst, wenn wirklich eine Datei kommt.
        try {
            const WebIFC = await import('web-ifc');
            // DIESELBEN Bytes wie der Loader — sonst läse die Quelle
            // Platzierungen und Achsen in Millimetern, während die Fragmente
            // in Metern liegen. Genau die Sorte halber Umrechnung, die
            // richtig aussieht und falsch ist.
            const quelle = await IfcQuelle.oeffne(WebIFC, bytes, {
                wasmPfad: '/', absolut: true, name: model.modelId,
            });
            if (quelle) {
                this._quellen.set(model.modelId, quelle);
                this._quellenFehler?.delete(model.modelId);
                this._beziehungenVerwerfen(true);
            } else {
                console.warn('cde: keine IFC-Quelle für', model.modelId, '— Georeferenz und Achsen bleiben ungelesen');
                // Der Grund gehört in den Import-Befund, nicht nur in die Konsole.
                this._quelleFehlt(model.modelId, IfcQuelle.letzterFehler ?? 'OpenModel gab nichts zurück');
            }
        } catch (fehler) {
            // Ohne Quelle läuft alles wie bisher weiter. Sie ist ein Zugewinn,
            // keine Voraussetzung — der Viewer darf daran nicht hängen. Aber
            // sie SAGT es: der Import-Befund zeigt den Grund (2026-09-11).
            console.warn('cde: IFC-Quelle', fehler?.message ?? fehler);
            this._quelleFehlt(model.modelId, String(fehler?.message ?? fehler));
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

        // EIN NEUES MODELL IST EIN ANDERES GELÄNDE (2026-09-09, im Browser
        // gefunden). `_gelaendeVerwerfen` lief bisher nur beim ENTLADEN und
        // beim Journalwechsel — nicht beim Laden. Wer sein Kanalnetz öffnet
        // und danach das Geländemodell dazulädt, behielt die Liste, die beim
        // Netz allein entstanden war: LEER. Danach bot kein Werkzeug ein
        // Gelände an, und nach einer Formung stand gar nichts mehr im Raum,
        // weil das Ur-Gelände verborgen und das neue nie gefunden wurde.
        this._gelaendeVerwerfen();
        await Promise.all([
            this.buildCategoryIndex()
                .then(() => this._applyDefaultCategoryColors(model))
                .then(() => fragments.core.update(true)),
            this.gridAxes.ladeAchsen(model, world),
            this.gridAxes.ladeRaster(model, world),
        ]);
        this._bezugsrasterNachziehen();

        await this._replayInitialVisibilityToggle();
        await fragments.core.update(true);

        return model;
    }

    getModelList() {
        const fragments = this.components.get(OBC.FragmentsManager);
        // Ohne die Delta-Modelle des Editors — sie sind Bearbeitungen, keine Dateien.
        return [...fragments.list.values()].filter(m => !istDeltaModell(m.modelId)).map(m => ({
            modelId: m.modelId,
            name:    m.name ?? m.modelId,
        }));
    }

    // ── Delta-Modelle des Editors (siehe `basisModelId`) ────────────────────

    /** Das Basismodell zu einem Treffer — ein Delta-Treffer wird auf seine Basis abgebildet. */
    _basisModell(fmodel) {
        if (!fmodel) return fmodel;
        const id = basisModelId(fmodel.modelId);
        if (id === fmodel.modelId) return fmodel;
        const fragments = this.components.get(OBC.FragmentsManager);
        return fragments.list?.get?.(id) ?? fmodel;
    }

    /** Eine Modell→Ids-Karte um die Delta-Modelle der Basen erweitern. */
    _mitDelta(items) {
        if (!items) return items;
        const fragments = this.components.get(OBC.FragmentsManager);
        const out = { ...items };
        for (const [mid, ids] of Object.entries(items)) {
            const d = fragments.list?.get?.(mid)?.deltaModelId ?? null;
            if (d && fragments.list.has(d) && !out[d]) out[d] = ids;
        }
        return out;
    }

    async _highlight(stil, items) {
        // AUSWAHL auf Gelände: nicht füllen — die Dreieckskanten tragen sie
        // (Fabio, 2026-09-10). Alle Auswahlwege (Klick, Rahmen, Verbund,
        // Wiederherstellen nach dem Entfärben) kommen hier vorbei; andere
        // Färbungen (Kandidat, Dimmen, Erdbau) füllen weiter.
        if (stil === SELECTION_STYLE || stil === MARQUEE_STYLE) {
            const { gelaende, rest } = await this._ohneGelaende(items);
            this.gelaendeKanten?.markiere(gelaende);
            if (!Object.keys(rest).length) return;
            items = rest;
        }
        const fragments = this.components.get(OBC.FragmentsManager);
        try { await fragments.highlight(stil, this._mitDelta(items)); }
        catch { await fragments.highlight(stil, items); }
    }

    async _resetHighlight(items) {
        this.gelaendeKanten?.demarkiere(this._schluesselVon(items));
        const fragments = this.components.get(OBC.FragmentsManager);
        try { await fragments.resetHighlight(this._mitDelta(items)); }
        catch { await fragments.resetHighlight(items); }
        // Was darunter lag (Katalog, Vorschau), kommt wieder — sonst verlor ein
        // geliefertes Gelände nach jeder Vorschau und jeder Auswahl seinen Ton (K4).
        await this._stapelErneuern(items);
    }

    /** Den Färbe-Stapel auf diesen Bauteilen wieder auftragen — nach Rang. */
    async _stapelErneuern(items) {
        if (!this._faerbungen?.size || !items) return;
        const rollen = [...this._faerbungen.keys()].sort((a, b) => faerbeRang(a) - faerbeRang(b));
        for (const rolle of rollen) {
            const teil = _schnitt(this._faerbungen.get(rolle), items);
            if (!teil) continue;
            try { await this._highlight(faerbeStilFuer(rolle), teil); }
            catch (e) { console.warn('[Engine] stapel', rolle, e?.message ?? e); }
        }
    }

    async _hiderSet(sichtbar, items) {
        // Die Geländekanten folgen dem Hider — sonst schwebten sie über einem ausgeblendeten Gelände.
        const schluessel = this._schluesselVon(items);
        this.gelaendeKanten?.sichtbarkeit(sichtbar, schluessel);
        // Der Umriss gehört zum Körper: geht der Körper, geht die Linie (E2/E3).
        this.erdbauUmrisse?.sichtbarkeit(sichtbar, schluessel);
        const hider = this.components.get(OBC.Hider);
        try { await hider.set(sichtbar, this._mitDelta(items)); }
        catch { await hider.set(sichtbar, items); }
    }

    async unloadModel(modelId) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = fragments.list.get(modelId);
        if (!model) return;
        // Erst aus der Szene, dann das Delta, dann die Basis — und abwarten
        // (Abnahme 2026-09-12): `dispose` nimmt das Objekt erst nach der
        // Worker-Antwort heraus, und ein Delta aus Lageänderungen blieb stehen.
        try { model.object?.removeFromParent?.(); } catch { /* Anzeige */ }
        try { await fragments.core?.editor?.disposeDeltaModels?.(modelId); } catch { /* keins */ }
        try {
            if (typeof model.dispose === 'function') await model.dispose();
            else fragments.list.delete(modelId);
        } catch (_) { fragments.list.delete(modelId); }
        // Drop the offset entry for this model so it doesn't leak / collide later
        this._coordOffsets.delete(modelId);
        // Den wasm-Speicher wirklich freigeben — sonst liegt die Datei für
        // immer im Heap, und sie liegt dort schon ein zweites Mal.
        this._quellen.get(modelId)?.schliesse();
        this._quellenFehler?.delete(modelId);
        this._quellen.delete(modelId);
        this._beziehungenVerwerfen(true);
        this._einheitsUmrechnungen.delete(modelId);
        this._einheitsBytes.delete(modelId);
        this._fragPuffer.delete(modelId);
        // If the removed model was the legacy primary, repoint to whatever's left
        if (this._coordOffsets.size) this._coordinationOffset.copy([...this._coordOffsets.values()][0]);
        else                          this._coordinationOffset.set(0, 0, 0);
        // Rebuild categories for remaining models
        this._gelaendeVerwerfen();         // anderes Modell, anderes Gelände
        this._verborgeneModelle?.delete(modelId);
        if (fragments.list.size > 0) {
            await this.buildCategoryIndex();
        } else {
            this._categoryGroups = null;
        }
    }

    /**
     * Ein GANZES Modell aus- oder einblenden (Abnahme 2026-09-12, A6/A7).
     *
     * Über das Szenenobjekt, nicht über die Sichtbarkeit je Bauteil: die trägt
     * schon, was der Verlauf ausblendet (das Ur-Gelände unter einer Anzeige),
     * und ein „alles einblenden" hätte es wieder gezeigt. Das Delta-Modell
     * hängt unter dem Objekt der Basis (fragments `editor.load`) und geht mit.
     * Treffer auf einem verborgenen Modell zählen nicht (`pickElement`), und
     * das Eigenbau-Modell fragt beim Neuanlegen nach (`IfcAutor.eigenesModell`).
     */
    async setzeModellSichtbar(modelId, sichtbar) {
        this._verborgeneModelle ??= new Set();
        if (sichtbar) this._verborgeneModelle.delete(modelId);
        else this._verborgeneModelle.add(modelId);
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = fragments.list.get(modelId);
        if (model?.object) model.object.visible = !!sichtbar;
        // Die Kanten liegen in einer eigenen Gruppe der Szene — das Auge muss sie erreichen (M2).
        this.gelaendeKanten?.modellSichtbarkeit?.(modelId, sichtbar);
        this.erdbauUmrisse?.modellSichtbarkeit?.(modelId, sichtbar);
        try { await fragments.core?.update?.(true); } catch { /* Anzeige */ }
    }

    /** Ist das Modell sichtbar? Ein Delta fragt für seine Basis. */
    modellSichtbar(modelId) {
        return !this._verborgeneModelle?.has(basisModelId(modelId));
    }

    // ── Category / Layer visibility ──────────────────────────────────────────

    async buildCategoryIndex() {
        try {
            // DIE ABFRAGEN VERGESSEN, WAS SIE WUSSTEN (2026-09-10, im Browser
            // gefunden). `byCategory()` legt je Kategorie EINMAL eine
            // FinderQuery an, und die cacht ihr Ergebnis — beim ersten Laden
            // `{R01: [107]}`. Entladen und Neuladen berühren den Cache nie: mit
            // R02 im Raum lieferte `groupData.get()` weiter nur das entladene
            // R01, R02 fehlte, die Gelände-Kandidaten waren leer — genau beim
            // Revisionswechsel. Die Bibliothek hat ihr `clearCache` auskommentiert.
            const finder = this.components.get(OBC.ItemsFinder);
            for (const [, abfrage] of finder?.list ?? []) abfrage?.clearCache?.();
            const classifier = this.components.get(OBC.Classifier);
            await classifier.byCategory();

            const groups = classifier.list.get('Categories');
            if (!groups) { this._categoryGroups = []; this._gelaendeVerwerfen(); return []; }

            this._categoryGroups = [];
            for (const [name, groupData] of groups) {
                const map   = await groupData.get();
                const count = Object.values(map).reduce((s, ids) => s + (ids?.length ?? 0), 0);
                this._categoryGroups.push({ name, groupData, visible: true, count });
            }
            // Neue Kategorien, neues Gelände: wer die Liste VOR diesem Punkt
            // fragte (das Laden verwirft VOR dem Index), hielt die alte.
            this._gelaendeVerwerfen();
            return this._categoryGroups.map(g => g.name);
        } catch (err) {
            console.error('[IfcEngine] buildCategoryIndex failed:', err);
            this._categoryGroups = [];
            this._gelaendeVerwerfen();
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
        await this._hiderSet(visible, map);
        // Ein „Kategorie an" darf einen überdeckten Erdkörper nicht wieder
        // hervorholen — die Regel dafür ist das Auge je Vorgang (Teil XXI, E3).
        if (visible) await this.erdkoerperSichtbarkeitAnwenden();
    }

    // ── Erdkörper: das Auge je Vorgang (Teil XXI, E3) ───────────────────────

    /**
     * WER STEHT IM RAUM, WENN ZWEI VORGÄNGE DENSELBEN BODEN MEINEN?
     *
     * Fabio 2026-09-17: nach einer Auffüllung liegen Aushub, Auffüllung und
     * Netz übereinander, „unklar, was was ist". Seine Entscheidung (E3): der
     * JÜNGERE Vorgang steht im Raum; ein älterer, den ein späterer wieder
     * überformt hat, kommt nur über sein AUGE zurück. Die Mengen bleiben
     * beide — verdeckt heisst nicht ungültig.
     *
     * WARUM ÜBER DEN HIDER und nicht über die Farbe: fragments kennt weder
     * `polygonOffset` noch `renderOrder` je Element. Die einzigen Hebel sind
     * Sichtbarkeit je Bauteil, Deckkraft und die Geometrie selbst.
     *
     * EIN Mechanismus: das Auge. Die Auswahl schaltet nichts implizit, sonst
     * hätte man zwei Regeln für dieselbe Frage.
     *
     * Der Zustand lebt in `_vorgangAugen` und überlebt den Neuaufbau — das
     * fragments-Modell wird bei jeder Bearbeitung verworfen und neu gebaut,
     * der Hider-Zustand stirbt mit ihm. Deshalb wird nach JEDEM Aufbau neu
     * angewandt.
     */
    _vorgangAugenKarte() {
        this._vorgangAugen ??= new Map();
        return this._vorgangAugen;
    }

    /** Ist der Vorgang im Raum zu sehen — und wenn nicht, wer überdeckt ihn? */
    vorgangSichtbar(ableitung) {
        const verdecktVon = this.autor?.ableitungen?.get(ableitung)?.kennzahlen?.verdecktVon ?? [];
        const auge = this._vorgangAugenKarte().get(ableitung);
        return { sichtbar: auge ?? !verdecktVon.length, verdecktVon };
    }

    /**
     * Das Auge eines Vorgangs stellen. `null` gibt ihn der Regel zurück
     * (sichtbar, solange ihn niemand überdeckt).
     */
    async setzeVorgangSichtbar(ableitung, sichtbar) {
        const augen = this._vorgangAugenKarte();
        if (sichtbar == null) augen.delete(ableitung);
        else augen.set(ableitung, !!sichtbar);
        await this.erdkoerperSichtbarkeitAnwenden();
        return this.vorgangSichtbar(ableitung);
    }

    /** Ein Vorgang, den es nicht mehr gibt, braucht kein Auge. */
    vergissVorgangsauge(ableitung) { this._vorgangAugenKarte().delete(ableitung); }

    /**
     * Die Regel auf den aktuellen Aufbau anwenden — nach jedem Neuaufbau, nach
     * `showAll` und nach jedem „Kategorie an". Ohne gebaute Erdkörper ist es
     * ein No-op.
     */
    async erdkoerperSichtbarkeitAnwenden() {
        const koerper = this.autor?.erdkoerper;
        if (!koerper?.size) return;
        const zeigen = [], verbergen = [];
        for (const [, k] of koerper) {
            if (k.localId == null) continue;
            (this.vorgangSichtbar(k.ableitung).sichtbar ? zeigen : verbergen).push(k.localId);
        }
        if (zeigen.length)     await this._hiderSet(true,  { [CDE_MODELL_ID]: zeigen });
        if (verbergen.length)  await this._hiderSet(false, { [CDE_MODELL_ID]: verbergen });
        // Ein zurückgeholter Vorgang hat noch keinen Umriss — er wurde beim
        // letzten Nachziehen ausgelassen (E2).
        await this._erdbauUmrisseNachziehen().catch(e => console.warn('[CDE] Erdbau-Umrisse:', e?.message ?? e));
        try { await this.components.get(OBC.FragmentsManager).core?.update?.(true); }
        catch { /* Anzeige */ }
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
     * this._hiderSet() or model.setVisible() failed. The manual user-click is the
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

    /**
     * Ein Bauteil unter dem Zeiger wählen.
     *
     * REIHENFOLGE MIT ABSICHT (Teil XVI, S1): erst raycasten, DANN die alte
     * Auswahl zurücksetzen. Vorher lief es umgekehrt — und damit durchlief
     * der Klick aufs schon gewählte Bauteil den ganzen Weg erneut: Highlight
     * ab und wieder an, Kamerasprung (`orbitAroundSelection`), Merkmale neu
     * lesen, und beim Aufrufer die komplette Neueinordnung samt
     * Mesh-Auflösung. Jetzt meldet derselbe Schlüssel `{gleich: true}`, und
     * nichts davon passiert.
     *
     * @param {number} clientX
     * @param {number} clientY
     * @param {{orbit?: boolean}} [opt]  `orbit: false` lässt die Kamera stehen
     * @returns {Promise<object|{gleich:true,key,modelId,localId,point}|null>}
     *          null = kein Treffer (die alte Auswahl bleibt; der Aufrufer
     *          entscheidet, ob er sie leert)
     */
    async pickElement(clientX, clientY, { orbit = true } = {}) {
        const world = this._getWorld();
        if (!world) return null;
        const fragments = this.components.get(OBC.FragmentsManager);

        // WAS DER KLICK MEINT (Teil XXII): alle Kandidaten, nach Art und Nähe
        // geordnet — Bauteil vor Erdkörper vor Gelände (`Auswahlrang.js`).
        const kandidaten = await this._pickKandidaten(clientX, clientY);
        if (!kandidaten.length) { this._letzterPick = null; return null; }
        // NOCHMAL AN DERSELBEN STELLE → der nächste Kandidat. Ohne Taste, damit
        // es auch der Finger kann (Tablet-Rezept, Regel 2).
        const l = this._letzterPick;
        const wiederholt = !!l && Math.hypot(clientX - l.x, clientY - l.y) <= DURCHTIPP_PX;
        const { kandidat: best, nr } = waehleKandidat(kandidaten, { gewaehlt: this._selectedKey, wiederholt });
        this._letzterPick = { x: clientX, y: clientY };
        const auswahl = { nr, von: kandidaten.length, arten: kandidaten.map(k => k.art) };

        const { localId } = best;
        const fmodel = best.fmodel;
        const key   = best.key;
        const point = best.point ? { x: best.point.x, y: best.point.y, z: best.point.z } : null;
        if (this._selectedKey && this._selectedKey === key) {
            return { gleich: true, key, modelId: fmodel.modelId, localId, point, auswahl };
        }

        if (this._selectedItems) {
            await this._resetHighlight(this._selectedItems);
            this._selectedItems = null;
            this._selectedKey   = null;
        }
        this._hoveredKey = null;

        const modelIdMap = { [fmodel.modelId]: [localId] };
        await this._highlight(SELECTION_STYLE, modelIdMap);
        this._selectedItems = modelIdMap;
        this._selectedKey   = key;

        // Orbit-Pivot auf Element-Center setzen — folgende Maus-Rotationen
        // kreisen um das angeklickte Objekt statt um eine alte Position.
        // Box-Center > Hit-Point: vorhersagbarer (User klickt nicht immer zentral).
        // NUR bei neuer Auswahl — ein Klick, der nur zeigt, bewegt die Kamera nicht.
        if (orbit) this.camera.orbitAroundSelection(fmodel.modelId, localId).catch(() => { /* */ });

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
            point,
            auswahl,
        };
    }

    /**
     * Alle Treffer eines Klicks, geordnet (Teil XXII). Der MITTELSTRAHL nimmt
     * jeden Treffer je Modell (`raycastAll`) — nur so findet er den Erdkörper
     * zwei Zentimeter unter der deckenden Geländeanzeige; die Randstrahlen
     * bleiben beim nächsten (sie sind für dünne Bauteile da).
     * @returns {Promise<Array>} Kandidaten mit key, fmodel, localId, point, distance, art
     */
    async _pickKandidaten(clientX, clientY) {
        const world = this._getWorld();
        const fragments = this.components.get(OBC.FragmentsManager);
        const canvas = world.renderer.three.domElement;
        const strahl = (dx, dy) => ({ camera: world.camera.three, mouse: new THREE.Vector2(clientX + dx, clientY + dy), dom: canvas });
        const [mitte, ...rand] = await Promise.all([
            (async () => {
                const aus = [];
                for (const model of fragments.list?.values?.() ?? []) {
                    let r = null;
                    try { r = typeof model.raycastAll === 'function' ? await model.raycastAll(strahl(0, 0)) : null; }
                    catch { r = null; }
                    // `raycastAll` trägt das Modell nicht immer am Treffer — hier schon.
                    for (const t of r ?? []) aus.push({ ...t, fragments: t.fragments ?? model });
                }
                // Ohne `raycastAll` (ältere Bibliothek, Attrappe): der nächste Treffer.
                if (!aus.length) {
                    const t = await fragments.raycast(strahl(0, 0));
                    if (t) aus.push(t);
                }
                return aus;
            })(),
            ...PICK_OFFSETS.slice(1).map(([dx, dy]) => fragments.raycast(strahl(dx, dy))),
        ]);
        // Ein verborgenes Modell wird nicht getroffen (Abnahme 2026-09-12): es
        // ist nur aus der Szene genommen, der Worker kennt es weiter.
        const treffer = [...mitte.map(t => [t, 0]), ...rand.map((t, i) => [t, i + 1])]
            .filter(([t]) => t && this.modellSichtbar(t.fragments?.modelId))
            .map(([t, i]) => {
                // Ein Treffer auf dem Delta-Modell (verschobenes Bauteil) gehört der Basis.
                const fmodel = this._basisModell(t.fragments);
                return { key: `${fmodel.modelId}:${t.localId}`, fmodel, localId: t.localId,
                         point: t.point ?? null, distance: t.distance, strahl: i };
            });
        if (!treffer.length) return [];
        const gelaende = new Set();
        try {
            for (const o of (await this._gelaendeOrteHolen()) ?? []) gelaende.add(`${basisModelId(o.modelId)}:${o.localId}`);
        } catch { /* ohne Geländeliste: alles ist Bauteil — wie vorher */ }
        const erdkoerper = new Set([...(this.autor?.erdkoerper?.values?.() ?? [])]
            .filter(k => k?.localId != null).map(k => `${CDE_MODELL_ID}:${k.localId}`));
        return rangiereTreffer(treffer, (t) => (gelaende.has(t.key) ? 'gelaende'
            : erdkoerper.has(t.key) ? 'erdkoerper' : 'bauteil'));
    }

    async clearSelection() {
        if (!this._selectedItems) return;
        const fragments = this.components.get(OBC.FragmentsManager);
        await this._resetHighlight(this._selectedItems);
        this._selectedItems = null;
        this._selectedKey   = null;
    }

    /**
     * Was liegt unter dem Zeiger? — nur DATEN, kein Cursor.
     *
     * Merkt sich den Treffer für `getHitPoint()` (Koordinatenleiste) und gibt
     * ihn zurück. `undefined` heisst „überholt": ein Raycast läuft noch, der
     * Aufrufer behält seinen letzten Stand. Der Raycast ist ein
     * Worker-Roundtrip — ein Staudamm je Zeiger reicht, ein zweiter Aufruf
     * würde nur eine ältere Position beantworten.
     *
     * @param {{fang?: boolean}} [opt]  Fang (Ecken/Kanten) nur mit scharfem
     *        Werkzeug — der zweite Roundtrip lohnt beim blossen Schweben nicht.
     * @returns {Promise<object|null|undefined>} siehe `probeTreffer`
     */
    async hoverElement(clientX, clientY, { fang = false } = {}) {
        if (this._hoverInFlight) return undefined;
        this._hoverInFlight = true;
        try {
            const t = await this.probeTreffer(clientX, clientY, { fang });
            this._lastHitPoint   = t?.point ? new THREE.Vector3(t.point.x, t.point.y, t.point.z) : null;
            this._lastHitModelId = t?.modelId ?? null;
            this._hoveredKey     = t?.key ?? null;
            return t;
        } finally {
            this._hoverInFlight = false;
        }
    }

    clearHover() {
        this._hoveredKey     = null;
        this._lastHitPoint   = null;
        // Vorher blieb die Modellkennung stehen (Landmine aus Teil VI) — ein
        // veralteter Bezug überlebte bis zum nächsten Treffer.
        this._lastHitModelId = null;
    }

    /**
     * Der Treffer unter einem Bildschirmpunkt — mit Normale, wahlweise mit Fang.
     *
     * Zustandslos: der eine Kanal für „Weltpunkt unter dem Zeiger", den
     * Messen, Notizen, Zeiger und (ab S3) der Eingabe-Motor teilen.
     *
     * @param {{fang?: boolean, modelId?: string|null}} [opt]
     *        `modelId` beschränkt den Raycast auf EIN Modell (die Bibliothek
     *        kann das je Modell) — „Punkt auf dem Subjekt".
     * @returns {Promise<{key, point:{x,y,z}, normal:{x,y,z}|null, modelId, localId,
     *          fang: null|{art:'ecke'|'kante', name, punkt, abstandPx, kante}}|null>}
     */
    async probeTreffer(clientX, clientY, { fang = false, modelId = null } = {}) {
        const world = this._getWorld();
        if (!world) return null;
        const fragments = this.components.get(OBC.FragmentsManager);
        const canvas    = this._canvas ?? world.renderer.three.domElement;
        const daten = { camera: world.camera.three, mouse: new THREE.Vector2(clientX, clientY), dom: canvas };
        const modell = modelId != null ? (fragments.list?.get?.(modelId) ?? null) : null;
        if (modelId != null && !modell) return null;

        let r = null;
        try { r = await (modell ?? fragments).raycast(daten); } catch { r = null; }
        if (!r?.point) return null;

        const mId = basisModelId(r.fragments?.modelId ?? modelId ?? null);
        const treffer = {
            key:     (mId != null && r.localId != null) ? `${mId}:${r.localId}` : null,
            point:   { x: r.point.x, y: r.point.y, z: r.point.z },
            normal:  r.normal ? { x: r.normal.x, y: r.normal.y, z: r.normal.z } : null,
            modelId: mId,
            localId: r.localId ?? null,
            fang:    null,
        };
        if (fang) {
            const modelle = modell ? [modell] : [...(fragments.list?.values?.() ?? [])];
            treffer.fang = await this._bibliotheksFang(daten, modelle, treffer.point);
        }
        return treffer;
    }

    /**
     * Ecken und Kanten fängt die BIBLIOTHEK (`raycastWithSnapping`); wir
     * wählen nur den nächsten Kandidaten im Bildschirm-Radius. Der fachliche
     * Fang (Schachtmitten, Achsenden) wohnt in `Fangpunkte.js` und läuft
     * beim Aufrufer — zwei Sorten, zwei Stellen, ein Radius.
     */
    async _bibliotheksFang(daten, modelle, roh) {
        const zeiger = this.projectToScreen([roh.x, roh.y, roh.z]);
        if (!zeiger) return null;
        const klassen = [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE];
        let bester = null;
        for (const m of modelle) {
            // KEIN BIBLIOTHEKSFANG AUF DEM CDE-EIGENEN MODELL (2026-09-11). Seine
            // Ecken sind Knoten eines Rechenrasters (die Anzeige 2 m, Aushub und
            // Auftrag aus Rastern), keine Punkte eines Planers. Gemessen im
            // Browser: eine Böschungskante auf der Anzeige wurde je Punkt um
            // (−0,61 / −0,12 m) auf den nächsten Rasterknoten gezogen — rechts
            // der Kante zeigte das Gelände deshalb 8 cm unter dem Soll, obwohl
            // Rechnung und Anzeige exakt waren. Die sinnvollen eigenen Punkte
            // (Schacht, Achsende, Stützpunkt) fängt der fachliche Fang
            // (`Fangpunkte.js`); geliefertes Material fängt weiter hier.
            if (basisModelId(m?.modelId ?? null) === CDE_MODELL_ID) continue;
            let liste = null;
            try { liste = await m.raycastWithSnapping({ ...daten, snappingClasses: klassen }); } catch { liste = null; }
            for (const s of liste ?? []) {
                if (!s?.point) continue;
                const px = this.projectToScreen([s.point.x, s.point.y, s.point.z]);
                if (!px) continue;
                const d = Math.hypot(px.x - zeiger.x, px.y - zeiger.y);
                if (d > FANG_RADIUS_PX) continue;
                const art = s.snappingClass === FRAGS.SnappingClass.POINT ? 'ecke' : 'kante';
                const besser = !bester || d < bester.abstandPx - 0.5
                    || (Math.abs(d - bester.abstandPx) <= 0.5 && art === 'ecke' && bester.art !== 'ecke');
                if (!besser) continue;
                bester = {
                    art, name: art === 'ecke' ? 'Ecke' : 'Kante',
                    punkt: { x: s.point.x, y: s.point.y, z: s.point.z },
                    abstandPx: d,
                    kante: (s.snappedEdgeP1 && s.snappedEdgeP2)
                        ? [{ x: s.snappedEdgeP1.x, y: s.snappedEdgeP1.y, z: s.snappedEdgeP1.z },
                           { x: s.snappedEdgeP2.x, y: s.snappedEdgeP2.y, z: s.snappedEdgeP2.z }]
                        : null,
                };
            }
        }
        return bester;
    }

    /**
     * Rahmenauswahl über die Bibliothek (`rectangleRaycast` je Modell).
     *
     * Ersetzt die alte Schleife, die je Modell die Kategoriegruppen neu holte
     * und die Boxen ALLER Bauteile projizierte. `fullyIncluded` ist das
     * AutoCAD-Muster: Window (ganz drin) gegen Crossing (berührt).
     *
     * Die Treffer werden zur AUSWAHL (`_selectedItems`), damit der nächste
     * Klick sie wieder zurücksetzt — vorher blieb ein Rahmen-Highlight stehen,
     * bis der nächste Rahmen kam.
     *
     * @returns {Promise<{items: Object<string, number[]>, count: number}>}
     */
    async rechteckAuswahl({ x0, y0, x1, y1 }, { fullyIncluded = true } = {}) {
        const world = this._getWorld();
        if (!world) return { items: {}, count: 0 };
        const fragments = this.components.get(OBC.FragmentsManager);
        const canvas    = this._canvas ?? world.renderer.three.domElement;
        const topLeft     = new THREE.Vector2(Math.min(x0, x1), Math.min(y0, y1));
        const bottomRight = new THREE.Vector2(Math.max(x0, x1), Math.max(y0, y1));

        const items = {};
        let count = 0;
        for (const model of fragments.list?.values?.() ?? []) {
            let r = null;
            try {
                r = await model.rectangleRaycast({ camera: world.camera.three, dom: canvas, topLeft, bottomRight, fullyIncluded });
            } catch { r = null; }
            const ids = r?.localIds ?? [];
            if (!ids.length) continue;
            // Treffer im Delta-Modell zählen zur Basis — und nur einmal.
            const mid = basisModelId(model.modelId);
            const menge = new Set(items[mid] ?? []);
            for (const id of ids) menge.add(id);
            count += menge.size - (items[mid]?.length ?? 0);
            items[mid] = [...menge];
        }

        if (this._selectedItems) {
            try { await this._resetHighlight(this._selectedItems); } catch { /* */ }
        }
        this._selectedItems = null;
        this._selectedKey   = null;
        if (count) {
            try { await this._highlight(MARQUEE_STYLE, items); this._selectedItems = items; }
            catch (e) { console.warn('[Selection] marquee highlight failed:', e); }
        }
        return { items, count };
    }

    // ── Overlay: Zeiger, Vorschau, Griffe, Fang (Teil XVI) ─────────────────
    // 1:1-Delegationen — Vue fasst `engine.overlay` nie selbst an.

    setzeZeiger(z)                 { return this.overlay.setzeZeiger(z); }
    overlayZeige(ebene, primitive) { return this.overlay.zeige(ebene, primitive); }
    overlayLeere(ebene)            { return this.overlay.leere(ebene); }
    // Griffe (S4)
    zeigeGriffe(griffe, opt)       { return this.overlay.zeigeGriffe(griffe, opt); }
    griffUnter(x, y)               { return this.overlay.griffUnter(x, y); }
    griffHervorheben(key)          { return this.overlay.griffHervorheben(key); }
    griffVersetzen(key, pos)       { return this.overlay.griffVersetzen(key, pos); }
    zeigeZugbild(z)                { return this.overlay.zeigeZugbild(z); }
    strahl(x, y)                   { return this.overlay.strahl(x, y); }
    blickrichtung()                { return this.overlay.blickrichtung(); }
    /** Die Kamera während eines Griff-Zugs sperren — sonst dreht sie mit. */
    kameraSperren(an)              { return this.camera.sperren(an); }

    // ── Färbe-Stapel (Teil XVI, S2) ────────────────────────────────────────

    /**
     * Bauteile in einer ROLLE hervorheben (dimmen | kandidat | ziel).
     *
     * Ersetzt, was in dieser Rolle vorher gefärbt war; andere Rollen bleiben.
     * @param {Array<{modelId, localId}>} orte
     * @returns {Promise<number>} wie viele Bauteile gefärbt sind
     */
    async faerbe(rolle, orte = []) {
        if (!faerbeStilFuer(rolle)) throw new Error(`IfcEngine.faerbe: unbekannte Rolle „${rolle}"`);
        const karte = {};
        let n = 0;
        for (const o of orte) {
            if (o?.modelId == null || !Number.isFinite(Number(o.localId))) continue;
            (karte[o.modelId] ??= []).push(Number(o.localId));
            n++;
        }
        const alt = this._faerbungen.get(rolle);
        // Erst den Stapel umstellen, DANN zurücksetzen: `_resetHighlight` trägt
        // auf, was darunter liegt — die ersetzte Rolle darf nicht mehr dabei sein.
        if (n) this._faerbungen.set(rolle, karte); else this._faerbungen.delete(rolle);
        if (alt) { try { await this._resetHighlight(alt); } catch { /* */ } }
        if (!n) {
            await this._auswahlErneuern();
            await this._neuZeichnen();
            return 0;
        }
        // Nach Rang: färbt der Katalog ein Bauteil, das die Vorschau gerade
        // dimmt, bleibt das Dimmen obenauf.
        await this._stapelErneuern(karte);
        await this._neuZeichnen();
        return n;
    }

    /** Eine Rolle zurücknehmen — die Auswahl kommt darunter wieder hervor. */
    async entfaerbe(rolle) {
        const alt = this._faerbungen.get(rolle);
        if (!alt) return false;
        this._faerbungen.delete(rolle);
        try { await this._resetHighlight(alt); } catch { /* */ }   // trägt den Rest des Stapels wieder auf
        await this._auswahlErneuern();
        await this._neuZeichnen();
        return true;
    }

    async entfaerbeAlle() {
        for (const rolle of [...this._faerbungen.keys()]) await this.entfaerbe(rolle);
    }

    // ── Erdbau-Farben (2026-09-09) ──────────────────────────────────────────
    //
    // ERZEUGTES trägt seine Farbe im MATERIAL (`IfcAutor._materialFuer`) und
    // braucht hier nichts. Hier geht es um GELIEFERTES: ein Ur-Gelände, ein
    // fremder Aushubkörper. Fabios Regel: was der Planer selbst gefärbt hat,
    // wird nicht stillschweigend übermalt — dann wird gefragt.

    /** → `engine/Quellformen.js` (Teil XXIII, A8: Engine-Diät). */
    erdbauKandidaten(...a) { return _ausgelagert_erdbauKandidaten(this, ...a); }

    /**
     * Welche dieser Bauteile bringen eine EIGENE Farbe mit?
     *
     * Über den Editor, weil nur sein `RawItemData` die Materialien JE
     * ELEMENT führt (`samples[].material` → `materials[id]`); die
     * Modell-API kennt nur die Materialliste des ganzen Modells.
     */
    async eigeneFarben(orte = []) {
        const proModell = new Map();
        for (const o of orte) {
            if (!proModell.has(o.modelId)) proModell.set(o.modelId, []);
            proModell.get(o.modelId).push(o);
        }
        const eigen = [];
        for (const [modelId, liste] of proModell) {
            const editor = this.autor?._editor?.(modelId) ?? null;
            if (!editor?.getElements) continue;
            let elemente = null;
            try { elemente = await editor.getElements(modelId, liste.map(o => o.localId)); }
            catch { continue; }
            for (const [i, el] of (elemente ?? []).entries()) {
                // Der Editor antwortet stellungsgleich zur Anfrage.
                const ort = liste[i];
                if (!ort || !el) continue;
                const daten = el.data ?? el;
                if (eigeneFarbe(daten).eigen) eigen.push(ort);
            }
        }
        return eigen;
    }

    /**
     * Den Farbkatalog auf geliefertes Material anwenden — das Gelände nach
     * ROLLE (Abnahme K4): was die Geländeliste führt, trägt den Geländeton,
     * gleich welcher IFC-Typ und ob mit eigener Farbe (`faerbePlan`).
     *
     * @param {object} opts
     * @param {boolean} opts.ueberschreiben  auch Bauteile mit eigener Farbe
     * @returns {Promise<{gefaerbt: number, eigene: Array, kategorien: string[]}>}
     */
    async erdbauFaerben({ ueberschreiben = false } = {}) {
        const schluessel = (o) => `${o.modelId}|${o.localId}`;
        const kandidaten = await this.erdbauKandidaten();
        const gelaende = await this._gelaendeFuerFarbe();
        const imGelaende = new Set(gelaende.map(schluessel));
        const bekannt = new Set(kandidaten.map(schluessel));
        const orte = [...kandidaten, ...gelaende.filter(o => !bekannt.has(schluessel(o)))];
        if (!orte.length) return { gefaerbt: 0, eigene: [], kategorien: [] };
        // Die Frage nach der eigenen Farbe nur für Nicht-Gelände (sie kostet je Modell einen Editor-Lauf).
        const rest = kandidaten.filter(o => !imGelaende.has(schluessel(o)));
        const eigene = ueberschreiben || !rest.length ? [] : await this.eigeneFarben(rest);
        const plan = faerbePlan(orte, { gelaende: imGelaende, eigen: new Set(eigene.map(schluessel)),
                                        satz: this._farbsatz ?? BAUTEILFARBEN });
        let gefaerbt = 0;
        for (const [kategorie, liste] of plan) gefaerbt += await this.faerbe(erdbauRolle(kategorie), liste);
        // Was der Plan nicht mehr nennt, geht — sonst bliebe das alte Grün eines Geländes stehen.
        for (const rolle of [...this._faerbungen.keys()]) {
            if (rolle.startsWith('erdbau:') && !plan.has(rolle.slice('erdbau:'.length))) await this.entfaerbe(rolle);
        }
        this._erdbauGefaerbt = gefaerbt > 0;
        return { gefaerbt, eigene, kategorien: [...plan.keys()] };
    }

    /** Die Erdbau-Farben zurücknehmen. */
    async erdbauEntfaerben() {
        for (const rolle of [...this._faerbungen.keys()]) {
            if (rolle.startsWith('erdbau:')) await this.entfaerbe(rolle);
        }
        this._erdbauGefaerbt = false;
    }

    /** Die Auswahl nach einem Reset wieder anlegen — ein Reset auf das Subjekt nähme sie mit. */
    async _auswahlErneuern() {
        if (!this._selectedItems) return;
        const fragments = this.components.get(OBC.FragmentsManager);
        try { await this._highlight(SELECTION_STYLE, this._selectedItems); } catch { /* */ }
    }

    async _neuZeichnen() {
        const fragments = this.components.get(OBC.FragmentsManager);
        try { await fragments?.core?.update?.(true); } catch { /* */ }
    }

    /**
     * Ein Bauteil per Kennung auswählen — ohne Kamerafahrt (Teil XVI, S2).
     * Nach dem Anwenden wird das Subjekt so neu adressiert, wenn der
     * Neuaufbau des CDE-Modells ihm eine neue localId gegeben hat.
     */
    async waehleOrt(modelId, localId) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const model = fragments?.list?.get(modelId);
        if (!model || !Number.isFinite(Number(localId))) return false;
        await this._selectByLocalIds(model, [Number(localId)]);
        this._selectedKey = `${modelId}:${localId}`;
        return true;
    }

    // ── Section cuts ─────────────────────────────────────────────────────────














    // ── Render state / Layer styles ──────────────────────────────────────────

    /**
     * Den Grund der Szene setzen — ein Stil (Planungslayer: weiß) oder null
     * für den Grundton des Farbmodus (H6). Vorher fiel null auf #1a1a2e,
     * einen Ton, den die Szene beim Start nie hatte (#202932).
     */
    setBackgroundColor(hexColor) {
        this._stilGrund = hexColor ?? null;
        const world = this._getWorld();
        world.scene.three.background = new THREE.Color(hexColor ?? this._grundton ?? '#202932');
    }

    /**
     * Grund und Raster der Szene aus dem Farbmodus (H6). Ein Stil mit
     * eigenem Grund bleibt stehen; `raster` null oder „none" gibt der
     * Bibliothek ihr Standardraster zurück.
     */
    setzeSzenenfarben({ grund = null, raster = null } = {}) {
        this._grundton = grund || null;
        const szene = this._getWorld?.()?.scene?.three;
        if (szene && !this._stilGrund && this._grundton) szene.background = new THREE.Color(this._grundton);
        const gitter = this._sceneGrid;
        if (!gitter?.config) return;
        this._rasterVorgabe ??= gitter.config.color?.clone?.() ?? null;
        const farbe = raster && raster !== 'none' ? new THREE.Color(raster) : this._rasterVorgabe;
        if (farbe) {
            try { gitter.config.color = farbe.clone(); } catch { /* Raster ohne Farbe */ }
        }
    }

    /**
     * DAS BEZUGSRASTER WEICHT DEM GELÄNDE (Fabio, 2026-09-09: „das Raster im
     * Viewer versperrt die Sicht").
     *
     * `OBC.Grids` legt ein unendliches Raster auf die Höhe NULL. Bei einem
     * georeferenzierten Modell liegt das Gelände irgendwo zwischen −20 und
     * +50 m — das Raster schneidet also mitten hindurch und verdeckt genau
     * die Böschung, die man ansehen will. Es ist eine Orientierungshilfe für
     * den LEEREN Raum; wer ein Gelände geladen hat, hat eine bessere.
     *
     * EINMALIG und umkehrbar: nur beim ersten Gelände, und der Schalter im
     * Ebenen-Panel holt es jederzeit zurück. Wer es danach wieder einschaltet,
     * behält es — die Automatik greift nicht ein zweites Mal.
     */
    _bezugsrasterNachziehen() {
        if (this._rasterWichGelaende || !this._sceneGrid) return;
        const kategorien = new Set((this._gelaendeKategorien ?? GELAENDE_VORBELEGUNG));
        const hatGelaende = (this._categoryGroups ?? []).some(g => kategorien.has(String(g?.name ?? '').toUpperCase()));
        if (!hatGelaende) return;
        this._rasterWichGelaende = true;
        this.setGridVisible(false);
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
            // ERST ALLE Einzelfarben zurück (Abnahme 2026-09-12): der
            // Herkunft-Schalter färbt per `setColor`, und die Kategoriefarben
            // decken nur ihre Kategorien — das Gelände blieb nach dem
            // Ausschalten orange.
            try { await model.resetColor?.(undefined); } catch { /* Anzeige */ }
            await this._applyDefaultCategoryColors(model);
        }
        // `setColor` IST eine Hervorhebung (fragments: `preserveOriginalMaterial`),
        // und `resetColor` nimmt die Farbe aus der Definition des Bauteils — auch
        // die des Katalogs, wo „Herkunft" darübergemalt hatte. Gemessen in 42069
        // (Abnahme K4): das Urgelände kam nach dem Verwerfen in seiner
        // Lieferfarbe zurück. Der Stapel trägt deshalb alles wieder auf.
        await this._stapelNeuAuftragen();
    }

    /** Den ganzen Färbe-Stapel neu auftragen — nach Rang, die Auswahl obenauf. */
    async _stapelNeuAuftragen() {
        if (!this._faerbungen?.size) return;
        for (const rolle of [...this._faerbungen.keys()].sort((a, b) => faerbeRang(a) - faerbeRang(b))) {
            try { await this._highlight(faerbeStilFuer(rolle), this._faerbungen.get(rolle)); }
            catch (e) { console.warn('[Engine] stapel', rolle, e?.message ?? e); }
        }
        await this._auswahlErneuern();
        await this._neuZeichnen();
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
     * Der Weltpunkt unter dem Zeiger — als Rückruf für Messen und Notizen.
     * Derselbe Kanal wie `probeTreffer`, nur auf den Punkt reduziert.
     */
    async _probeWorldPoint(clientX, clientY) {
        const t = await this.probeTreffer(clientX, clientY);
        return t?.point ? new THREE.Vector3(t.point.x, t.point.y, t.point.z) : null;
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
    /** Eigenbau-Geometrie für den IFC-Export — derselbe Bauweg wie im Raum (`IfcAutor._baueSchritt`). */
    eigenbauGeometrien(schritte, opts)  { return this.autor.eigenbauGeometrien(schritte, opts); }
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
        // Der Aufbau hat das Eigenbau-Modell verworfen und neu gebaut; der
        // Hider-Zustand ist mit ihm gestorben (Teil XXI, E3).
        await this.erdkoerperSichtbarkeitAnwenden();
        return r;
    }

    async _sichtbarkeitSetzen(orte, sichtbar) {
        if (!orte?.length) return;
        const karte = {};
        for (const o of orte) (karte[o.modelId] ??= []).push(o.localId);
        const schluessel = this._schluesselVon(karte);
        this.gelaendeKanten?.sichtbarkeit(sichtbar, schluessel);
        this.erdbauUmrisse?.sichtbarkeit(sichtbar, schluessel);
        try {
            await this.components.get(OBC.Hider).set(sichtbar, karte);
            await this.components.get(OBC.FragmentsManager).core.update(true);
        } catch (fehler) {
            console.warn('cde: sichtbarkeit setzen', fehler?.message ?? fehler);
        }
    }

    // ── Raumstruktur & Geschosse (Implementierung in IfcStoreys.js) ─────────
    getSpatialTree()                     { return this.storeys.getSpatialTree(); }
    getSpatialTrees()                    { return this.storeys.getSpatialTrees(); }
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
    updateMeasureHoverAn(punkt)       { return this.measure.updateMeasureHoverAn(punkt); }
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
    /**
     * Meter je Bildschirmpixel in der Tiefe eines Weltpunkts — der Rückfall
     * des Achszugs, wenn die Höhenachse von oben gesehen zum Punkt wird.
     */
    pixelmass(punkt) {
        const world = this._getWorld();
        if (!world || !this._canvas || !punkt) return null;
        const cam = world.camera.three;
        const rect = this._canvas.getBoundingClientRect();
        if (!rect.height) return null;
        if (cam.isOrthographicCamera) return (cam.top - cam.bottom) / (cam.zoom || 1) / rect.height;
        const dist = cam.position.distanceTo(new THREE.Vector3(punkt.x, punkt.y, punkt.z));
        return (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / rect.height;
    }

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
        await this._hiderSet(false, this._selectedItems);
        await this.clearSelection();
        return true;
    }

    /** Isolate selection: hide every other item, keep selection visible. */
    async isolateSelected() {
        if (!this._selectedItems || !this._categoryGroups?.length) return false;

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
        await this._hiderSet(false, toHide);
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
        // „Alles einblenden" meint alle KATEGORIEN, nicht die Vorgänge: ein
        // überdeckter Erdkörper bleibt verborgen, bis sein Auge ihn holt (E3).
        await this.erdkoerperSichtbarkeitAnwenden();
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
            try { await this._resetHighlight(this._selectedItems); } catch { /* */ }
        }
        const items = { [model.modelId]: localIds };
        this._selectedItems = items;
        try { await this._highlight(SELECTION_STYLE, items); } catch { /* */ }
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
        // Aktuell, nicht Lieferort: das Delta-Modell des Editors zählt mit.
        try { return (await boxenAktuell(model, [...localIds], (id) => fragments.list.get(id))) ?? []; }
        catch { return []; }
    }

    getCoordOffsetForModel(modelId) {
        return this._coordOffsets.get(modelId) ?? null;
    }

    /** → `ifcleser/Hoehenversatz.js` (Teil XXIII, A8: Engine-Diät). */
    _hoehenversatzMessen(...a) { return _ausgelagert__hoehenversatzMessen(this, ...a); }

    /** Wie der Höhenversatz zustande kam — für die Anzeige. */
    hoehenBefund(modelId) {
        return this._hoehenBefund.get(modelId) ?? null;
    }
    alleHoehenBefunde() {
        return Object.fromEntries(this._hoehenBefund);
    }

    /**
     * Die Bauteile bestimmter Kategorien in den GELIEFERTEN Modellen — Kennung,
     * Name, Kategorie (Stufe 5 des Aushub-Fachmodells: die Kandidaten, auf die
     * ein Journal nach einer neuen Revision umgehängt werden kann). Aus der
     * IfcQuelle, nicht aus dem Suchindex: der kennt nur fest verdrahtete
     * Kategorien. Eigenes (CDE) hat keine Quelle und kommt nicht vor.
     */
    bauteileDerKategorie(kategorien = []) {
        const out = [];
        for (const { modelId } of this.getModelList?.() ?? []) {
            const q = this.quelleVon(modelId);
            if (!q) continue;
            for (const typ of kategorien ?? []) {
                for (const id of q.ids(typ, { untertypen: true })) {
                    const z = q.zeile(id);
                    const globalId = z?.GlobalId?.value;
                    if (globalId) out.push({ globalId, name: z?.Name?.value ?? '', kategorie: q.kategorieVon(z) || typ, modelId, localId: id });
                }
            }
        }
        return out;
    }

    /** Der lebende Lesezugriff auf ein Modell, oder null. */
    /** Aussparungen und Gruppen eines Modells für die Bauwerksstruktur (Stufe 8) — aus seiner IfcQuelle. */
    strukturBeziehungen(modelId) { return strukturBeziehungen(this.quelleVon(modelId)); }

    quelleVon(modelId) {
        const q = this._quellen.get(modelId) ?? null;
        return q?.lebt() ? q : null;
    }

    /**
     * Der Import-Befund je Modell (services/ImportBefund.js, 2026-09-11).
     *
     * Die Engine sammelt nur Zahlen — Schema aus der Quelle, Anzahl je
     * Bauteilklasse —, bewertet wird im reinen Dienst. Ein Modell, dessen
     * Lesequelle nicht aufging, bekommt einen Befund MIT Grund; vorher stand
     * der nur in der Konsole, und Georeferenz, Achsen und Geschosshöhen
     * fehlten still.
     */
    importBefunde() {
        const out = {};
        for (const [modelId, q] of this._quellen ?? new Map()) {
            if (!q?.lebt?.()) continue;
            try {
                const typen = q.typenImModell()
                    .filter(({ typ }) => zaehltAlsBauteil(typ))
                    .map(({ typ }) => ({ typ, anzahl: q.zaehle(typ) }));
                out[modelId] = importBefund({ schema: q.schema(), typen });
            } catch (fehler) {
                out[modelId] = importBefund({ quelle: 'fehlt', grund: String(fehler?.message ?? fehler) });
            }
        }
        for (const [modelId, grund] of this._quellenFehler ?? new Map()) {
            if (!(modelId in out)) out[modelId] = importBefund({ quelle: 'fehlt', grund });
        }
        return out;
    }

    /** Merken, warum ein Modell keine Lesequelle bekam — für den Import-Befund. */
    _quelleFehlt(modelId, grund) {
        if (!this._quellenFehler) this._quellenFehler = new Map();
        this._quellenFehler.set(modelId, grund);
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
    _parseItemData(rawData)  { return parseItemData(rawData); }

    /**
     * Die GlobalId eines Bauteils — aus dem GUID-Index, nicht aus den Attributen.
     *
     * `parseItemData` las `item['GlobalId']`, und das ist in Fragments nicht
     * da: der IfcLoader importiert von Haus aus nur einen schmalen Satz
     * Attribute (Projekt/Geschoss, Materialien, Merkmalssätze), die GlobalId
     * gehört nicht dazu. Sie führt die Bibliothek in einem EIGENEN Index,
     * erreichbar über `getGuidsByLocalIds` — im Datenabruf steht sie als
     * `_guid` (seit 2026-09-19 gelesen über `IfcDataConfig.globalIdAusDaten`).
     *
     * Das war nicht folgenlos: `parseItemData` fällt auf `''` zurück, und
     * `eintragen` verwirft einen Eintrag ohne GlobalId. Jede Bearbeitung endete
     * damit still — die GlobalId ist der Angelpunkt des ganzen Journals, denn
     * sie ist das Einzige, was eine Modellrevision überlebt.
     */
    async _globalIdVon(model, localId) {
        try {
            const [guid] = await model.getGuidsByLocalIds([localId]);
            if (guid) return guid;
        } catch (fehler) {
            console.warn('cde: GlobalId lesen', fehler?.message ?? fehler);
            return '';
        }
        // DAS CDE-MODELL FÜHRT DEN RÜCKWÄRTSINDEX NICHT (gemessen 2026-09-09):
        // `getLocalIdsByGuids` findet ein selbst erzeugtes Bauteil in der Basis,
        // `getGuidsByLocalIds` gibt dort nichts zurück — die Kennung steht nur
        // im DELTA-Modell des Editors. Weil Treffer und Karte auf die Basis
        // normieren, kam jedes eigene Bauteil ohne GlobalId an: kein Bauplan,
        // keine Eigen-Werkzeuge, keine Stützpunkt-Griffe.
        //
        // Also im Delta nachfragen — MIT GEGENPROBE, und zwar IM DELTA: dort
        // gilt diese localId (die Basis kann nicht zurückrechnen, sie führt
        // den Index ja nicht). Ohne Probe könnte eine fremde Kennung
        // hereinkommen, und die wandert ins Journal.
        const deltaId = model?.deltaModelId ?? null;
        if (!deltaId) return '';
        try {
            const delta = this.components.get(OBC.FragmentsManager)?.list?.get?.(deltaId) ?? null;
            const [guid] = (await delta?.getGuidsByLocalIds?.([localId])) ?? [];
            if (!guid) return '';
            const [zurueck] = (await delta.getLocalIdsByGuids?.([guid])) ?? [];
            return zurueck === localId ? guid : '';
        } catch (fehler) {
            console.warn('cde: GlobalId im Delta lesen', fehler?.message ?? fehler);
            return '';
        }
    }
    /** → `ifcleser/Suchindex.js` (Teil XXIII, A8: Engine-Diät). */
    buildSearchIndex(...a) { return _ausgelagert_buildSearchIndex(this, ...a); }



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
    setzeJournalStand({ kanten = [], knoten = [], gelaende = [], koerper = [], verdeckt = new Set(),
                        namen = new Map(), gelaendeKategorien = null, bauformVon = null,
                        gelaendeBrauchtMerkmale = false, lagen = new Map(), ableitungen = [],
                        bauplaene = null } = {}) {
        this._cdeNamen = namen instanceof Map ? namen : new Map(Object.entries(namen ?? {}));
        // Die Baupläne der eigenen Bauteile — nur für die Fachgrenzen ihrer
        // Rezeptwerte in der Prüfliste (K10); die Engine liest kein Journal.
        this._cdeBauplaene = bauplaene instanceof Map ? bauplaene : null;
        const neueLagen = lagen instanceof Map ? lagen : new Map(Object.entries(lagen ?? {}));
        const neuVerdeckt = verdeckt instanceof Set ? verdeckt : new Set(verdeckt);
        // Teil XVII: WAS sich gegen den vorigen Stand bewegt hat — der
        // Beziehungsindex rechnet danach nur die berührten Paare neu.
        const dirty = this._beziehungenDirtyAus({ lagen: neueLagen, verdeckt: neuVerdeckt, kanten, knoten, koerper, gelaende });
        // S7: die wirksamen LAGEN gelieferter Bauteile als Verschiebung je
        // GlobalId (Δ gegen den Lieferstand) — Achsen und Knoten folgen.
        this._lagen = neueLagen;
        this._lagenAnwenden();
        this._cdeKanten = new Map(kanten.map(k => [k.globalId, k]));
        this._cdeKnoten = new Map(knoten.map(k => [k.globalId, k]));
        // Teil XIV: selbst erzeugte Geländeflächen und Körper — fürs
        // Gelände-Sampling (G3) und die Kollisionsprüfung (G7).
        this._cdeGelaende = new Set(gelaende);
        this._cdeKoerper = new Set(koerper);
        this._verdeckt = neuVerdeckt;
        // Teil → Quelle aus dem Journal: die Engine liest kein Journal, sie
        // bekommt die Paare als Daten (Art `ableitung` im Beziehungsindex).
        this._cdeAbleitungen = Array.isArray(ableitungen) ? ableitungen : [];
        // Die DEKLARIERTE Bauform eines Bauteils — die kennt nur der Viewer
        // (Journal + Regeln + Typprofile). Die Engine bekommt sie als Funktion
        // herein und hält kein Journal.
        //
        // EINE Funktion, zwei Verbraucher: „ist das Gelände?" ist nur die
        // Frage `=== 'hoehenfeld'`, und das Formpaar-Gate der Ableitungen
        // braucht ohnehin den vollen Wert. Zwei injizierte Funktionen wären
        // zwei Wege zu derselben Frage gewesen.
        this._gelaendeKategorien = gelaendeKategorien;
        this._bauformVon = typeof bauformVon === 'function' ? bauformVon : null;
        // DREIWERTIG: true/false aus der Deklaration, null = niemand hat etwas
        // erklärt — dann fragt `gelaendeElemente` die Formsignatur. Vorher
        // galt null als false, und ein undeklariertes Gelände fiel heraus.
        this._istGelaende = this._bauformVon
            ? (ctx) => { const b = this._bauformVon(ctx); return b == null ? null : b === 'hoehenfeld'; }
            : null;
        this._gelaendeBrauchtMerkmale = !!gelaendeBrauchtMerkmale;
        this._gelaendeVerwerfen();
        this._kollisionen = null;          // abgeleitet — stirbt mit jeder Geometrieänderung (G7)
        this._beziehungenVerwerfen(dirty);
    }

    // ── Der Beziehungsindex (Teil XVII, B1) ─────────────────────────────────

    /** → `engine/Beziehungslauf.js` (Teil XXIII, A8: Engine-Diät). */
    _beziehungenDirtyAus(...a) { return _ausgelagert__beziehungenDirtyAus(this, ...a); }

    /** Den Index (teilweise) entwerten. `true` = ganz neu, Set = nur diese GlobalIds. */
    _beziehungenVerwerfen(dirty = true) {
        if (dirty === true || this._beziehungenDirty === true || !this._beziehungen) {
            this._beziehungenDirty = true;
            if (dirty === true) this._huellen = new Map();
        } else if (dirty instanceof Set && dirty.size) {
            const bisher = this._beziehungenDirty instanceof Set ? this._beziehungenDirty : new Set();
            for (const g of dirty) bisher.add(g);
            this._beziehungenDirty = bisher;
        }
        // Ein laufender Aufbau darf sein Ergebnis nicht mehr zurückschreiben
        // (dieselbe Lehre wie beim Gelände-Sampler): die Laufnummer entwertet ihn.
        this._beziehungenNr = (this._beziehungenNr ?? 0) + 1;
    }

    /** → `engine/Beziehungslauf.js` (Teil XXIII, A8: Engine-Diät). */
    _beziehungsObjekte(...a) { return _ausgelagert__beziehungsObjekte(this, ...a); }

    /** → `engine/Beziehungslauf.js` (Teil XXIII, A8: Engine-Diät). */
    beziehungen(...a) { return _ausgelagert_beziehungen(this, ...a); }

    /** Die Beziehungen EINES Bauteils aus dem zuletzt gebauten Index — synchron, für Subjekt und HUD. */
    beziehungenVon(globalId) {
        return this._beziehungen?.von?.(globalId) ?? [];
    }

    /**
     * Die WIRKSAMEN Achsen und Knoten aus den rohen ableiten (S7).
     *
     * Bis heute rechneten Strang, Fang, Sohlgriffe und Prüfliste nach einem
     * Zug weiter mit dem Lieferort: ein verschobenes Rohr meldete kein loses
     * Ende, der Fang fand den alten Knoten. Die Verschiebung ist eine reine
     * Translation (Länge, Gefälle, DN bleiben) — wie in `JournalVersatz`.
     * Ohne Eintrag bleibt das rohe Objekt selbst (kein Klon auf Vorrat).
     */
    _lagenAnwenden() {
        const lagen = this._lagen ?? new Map();
        const verdeckt = this._verdeckt ?? new Set();
        // Attrappen (Tests) setzen `_achsen`/`_knoten` direkt und kennen kein Roh:
        // dann gilt das Gesetzte als Roh — ohne Lagen/Verdecktes bleibt es unberührt.
        const achsenRoh = this._achsenRoh ?? this._achsen ?? new Map();
        const knotenRoh = this._knotenRoh ?? this._knoten ?? new Map();
        if (!this._achsenRoh && !this._knotenRoh && !lagen.size && !verdeckt.size) return;
        const schieb = (p, d) => ({ ...p, x: p.x + d.x, y: p.y + d.y, z: p.z + d.z });
        const gut = (d) => d && [d.x, d.y, d.z].every(Number.isFinite) && (d.x || d.y || d.z);
        // Ein GELÖSCHTES (verdecktes) Bauteil fällt aus der wirksamen Sicht —
        // kein Sohlgriff, kein Label, keine Achse mehr (S8). `netzVon` filtert
        // ohnehin selbst; hier gilt es für `achsenVon`/`achseVon`/`schachtPunkteVon`.
        this._achsen = new Map();
        for (const [modelId, karte] of achsenRoh) {
            const neu = new Map();
            for (const [id, a] of karte) {
                if (a.globalId && verdeckt.has(a.globalId)) continue;
                const d = a.globalId ? lagen.get(a.globalId) : null;
                neu.set(id, gut(d)
                    ? { ...a, anfang: schieb(a.anfang, d), ende: schieb(a.ende, d), polyline: a.polyline.map(q => schieb(q, d)) }
                    : a);
            }
            this._achsen.set(modelId, neu);
        }
        this._knoten = new Map();
        for (const [modelId, karte] of knotenRoh) {
            const neu = new Map();
            for (const [id, k] of karte) {
                if (k.globalId && verdeckt.has(k.globalId)) continue;
                const d = k.globalId ? lagen.get(k.globalId) : null;
                neu.set(id, gut(d) ? { ...k, punkt: schieb(k.punkt, d) } : k);
            }
            this._knoten.set(modelId, neu);
        }
    }

    // ── Geistnetz eines Griff-Zugs (S7) ─────────────────────────────────────

    /**
     * Die zusammengeführte Geometrie EINES Bauteils fürs Geistnetz —
     * über den Resolver (Delta inklusive). Null über dem Budget oder ohne Netz.
     */
    async geistLaden(modelId, localId, { maxDreiecke = 200000 } = {}) {
        if (modelId == null || localId == null) return null;
        try {
            const res = await this.makeGeometryResolver()?.forElements([{ modelId, localId }])?.getForm('mesh');
            const d = res?.data;
            if (!d?.positions?.length || !(d.triCount > 0) || d.triCount > maxDreiecke) return null;
            return { positions: d.positions, triCount: d.triCount };
        } catch { return null; }
    }

    zeigeGeist(g, opt)   { return this.overlay.zeigeGeist(g, opt); }
    geistVersetzen(d)    { return this.overlay.geistVersetzen(d); }
    geistLeeren()        { return this.overlay.geistLeeren(); }

    /**
     * Alles Gelände-Abgeleitete verwerfen.
     *
     * DIE LAUFENDE BERECHNUNG GEHÖRT DAZU. `_gelaendeSampler = null` allein
     * genügte nicht: ein bereits gestarteter Aufbau schreibt sein Ergebnis
     * danach ZURÜCK in den Cache — mit der alten Elementliste. Solange nur
     * Erzeugtes das Gelände bewegte, war das ein seltenes Rennen; seit eine
     * Bauform-Auslegung dasselbe tut, wäre es der Normalfall.
     *
     * Den LAUF zu nullen half dabei nicht (2026-09-10, im Browser gefunden):
     * der alte Lauf schrieb in seinem `.then` trotzdem zurück. R02 entladen,
     * R01 geladen — und die Kandidatenliste hielt die Elemente des entladenen
     * Modells, also kein Gelände. Deshalb zählt `_gelaendeGeneration`: wer
     * nach dem Verwerfen fertig wird, schreibt nicht zurück und fragt neu.
     */
    _gelaendeVerwerfen() {
        this._gelaendeGeneration = (this._gelaendeGeneration ?? 0) + 1;
        this._gelaendeSampler = null;
        this._gelaendeSamplerLauf = null;
        this._gelaendeOrte = null;
        this._gelaendeOrteLauf = null;
        this._gelaendeMerkmale = null;
        // Anderes Gelände, andere Kanten — entprellt, das Verwerfen kommt beim Laden gehäuft.
        this._gelaendeKantenPlanen();
    }

    /** Die Dreieckskanten nachziehen — 250 ms nach dem LETZTEN Verwerfen. */
    _gelaendeKantenPlanen() {
        if (!this.gelaendeKanten && !this.erdbauUmrisse) return;
        clearTimeout(this._gelaendeKantenUhr);
        this._gelaendeKantenUhr = setTimeout(() => {
            this._gelaendeKantenNachziehen().catch(e => console.warn('[CDE] Geländekanten:', e?.message ?? e));
            // Dieselbe Uhr: die Umrisse der Erdkörper hängen an denselben
            // Netzen und sollen mit den Kanten zusammen erscheinen (E2).
            this._erdbauUmrisseNachziehen().catch(e => console.warn('[CDE] Erdbau-Umrisse:', e?.message ?? e));
        }, 250);
    }

    /**
     * DIE FUSSSPUR JEDES ERDKÖRPERS (Teil XXI, E2).
     *
     * Die Orte kommen aus dem letzten Aufbau (`autor.erdkoerper`), die Netze
     * aus demselben Resolver wie die Geländekanten — also aus dem gebauten
     * fragments-Modell, in dem der Körper schon abgesenkt liegt. Die Farbe ist
     * die des Katalogs: dieselbe wie sein Material.
     *
     * Verborgene Vorgänge (`vorgangSichtbar`) bekommen gar keinen Umriss —
     * sonst zeigte eine Linie einen Körper an, den niemand sieht.
     * @returns {Promise<boolean>} gezeichnet?
     */
    async _erdbauUmrisseNachziehen() {
        if (!this.erdbauUmrisse) return false;
        const koerper = this.autor?.erdkoerper;
        if (!koerper?.size) {
            this.erdbauUmrisse.setze(new Map());
            this._umrisseStand = koerper ?? null; this._umrisseSchluessel = '';
            return true;
        }
        // SCHON GEZEICHNET? Je Übernehmen ruft zweierlei hier an: die Uhr der
        // Geländekanten und `erdkoerperSichtbarkeitAnwenden`. Der Umriss eines
        // 52.000-Dreieck-Körpers kostet dabei jedes Mal rund eine Sekunde
        // (gemessen 2026-09-17: 0,76 s und 2,07 s je Übernehmen). Solange
        // derselbe Aufbau dieselben Körper zeigt, gibt es nichts zu tun.
        const gewollt = [...koerper.values()]
            .filter(k => k.localId != null && this.vorgangSichtbar(k.ableitung).sichtbar)
            .map(k => k.localId).sort((a, b) => a - b).join(',');
        if (this._umrisseStand === koerper && this._umrisseSchluessel === gewollt) return true;
        const generation = this._gelaendeGeneration ?? 0;
        const aus = new Map();
        for (const [, k] of koerper) {
            if (k.localId == null || !this.vorgangSichtbar(k.ableitung).sichtbar) continue;
            const farbe = farbeFuer(k.kategorie)?.farbe;
            if (farbe == null) continue;
            const ort = { modelId: CDE_MODELL_ID, localId: k.localId };
            let d = null;
            try { d = (await this.makeGeometryResolver()?.forElements([ort])?.getForm('mesh'))?.data ?? null; }
            catch { d = null; }
            if ((this._gelaendeGeneration ?? 0) !== generation) return false;
            if (d?.positions?.length && d.triCount > 0) {
                aus.set(`${CDE_MODELL_ID}|${k.localId}`, { netz: { positions: d.positions, triCount: d.triCount }, farbe });
            }
        }
        if ((this._gelaendeGeneration ?? 0) !== generation) return false;
        for (const [schluessel, eintrag] of this._erdbauKanten(koerper)) aus.set(schluessel, eintrag);
        this.erdbauUmrisse.setze(aus);
        this._umrisseStand = koerper; this._umrisseSchluessel = gewollt;
        return true;
    }

    /**
     * DIE BÖSCHUNGSKANTEN je sichtbarem Vorgang (Teil XX Stufe B).
     *
     * Sie kommen fertig aus dem Ableitungslauf (`ableitungen.<id>.kanten`) —
     * gerechnet auf demselben Raster wie die Massen, in Weltkoordinaten. Hier
     * werden sie nur eingefärbt: was abgetragen wurde, trägt den Ton des
     * Aushubs, was aufgetragen wurde den des Auftrags. Eine Kante ist die
     * Grenze eines Erdkörpers, also gehört sie zu seiner Farbe.
     *
     * @returns {Array<[string, {linien, farbe}]>}
     */
    _erdbauKanten(koerper) {
        const aus = [];
        const sichtbar = new Set([...koerper.values()]
            .filter(k => k.localId != null && this.vorgangSichtbar(k.ableitung).sichtbar)
            .map(k => k.ableitung));
        const abtrag = farbeFuer('IFCEARTHWORKSCUT')?.farbe;
        const auftrag = farbeFuer('IFCEARTHWORKSFILL')?.farbe;
        for (const id of sichtbar) {
            const kanten = this.autor?.ableitungen?.get(id)?.kanten ?? [];
            if (!kanten.length) continue;
            for (const [art, farbe] of [['oberkante', abtrag], ['sohlkante', abtrag],
                                        ['fuss', auftrag], ['kronenkante', auftrag]]) {
                const linien = kanten.filter(k => k.art === art);
                if (!linien.length || farbe == null) continue;
                aus.push([`kante:${id}:${art}`, { linien, farbe }]);
            }
        }
        return aus;
    }

    /**
     * Die Kanten GENAU der Gelände, die auch Sampler und Kandidaten sehen
     * (`_gelaendeOrteHolen` — eine Liste, eine Antwort), aus ihren ORIGINAL-
     * Dreiecken. Wird währenddessen verworfen, bricht der Lauf ab: der
     * nächste ist dann schon geplant.
     * @returns {Promise<boolean>} gezeichnet?
     */
    async _gelaendeKantenNachziehen() {
        const generation = this._gelaendeGeneration ?? 0;
        const orte = await this._gelaendeOrteHolen();
        const netze = new Map();
        for (const o of orte ?? []) {
            let d = null;
            try { d = (await this.makeGeometryResolver()?.forElements([o])?.getForm('mesh'))?.data ?? null; } catch { d = null; }
            if ((this._gelaendeGeneration ?? 0) !== generation) return false;
            if (d?.positions?.length && d.triCount > 0) {
                // Die Geländeanzeige der CDE bringt ihre Kanten mit (Teil XXII):
                // die der Lieferung und des geformten Rasters, nicht die
                // Schnittlinien, an denen sie die Lieferung zuschneidet.
                const strecken = basisModelId(o.modelId) === CDE_MODELL_ID
                    ? (this.autor?.anzeigeKanten?.get(o.localId) ?? null) : null;
                netze.set(`${basisModelId(o.modelId)}|${o.localId}`,
                          { positions: d.positions, triCount: d.triCount, ...(strecken ? { strecken } : {}) });
            }
        }
        if ((this._gelaendeGeneration ?? 0) !== generation) return false;
        this.gelaendeKanten?.setze(netze);
        return true;
    }

    /** `${modelId}|${localId}` je Eintrag einer ModelIdMap — Basis-Kennung, wie die Kanten sie führen. */
    _schluesselVon(items) {
        const aus = [];
        for (const [mid, ids] of Object.entries(items ?? {})) for (const id of ids ?? []) aus.push(`${basisModelId(mid)}|${id}`);
        return aus;
    }

    /** Die Gelände aus einer ModelIdMap herausnehmen — dieselbe Liste wie Sampler, Kandidaten und Kanten. */
    async _ohneGelaende(items) {
        let orte = this._gelaendeOrte;
        if (!orte) { try { orte = await this._gelaendeOrteHolen(); } catch { orte = []; } }
        const istGelaende = new Set((orte ?? []).map(o => `${basisModelId(o.modelId)}|${o.localId}`));
        const gelaende = [];
        const rest = {};
        for (const [mid, ids] of Object.entries(items ?? {})) {
            const bleiben = [];
            for (const id of ids ?? []) {
                const k = `${basisModelId(mid)}|${id}`;
                if (istGelaende.has(k)) gelaende.push(k); else bleiben.push(id);
            }
            if (bleiben.length) rest[mid] = bleiben;
        }
        return { gelaende, rest };
    }

    /**
     * Der Elementzusammenhang, wie ihn die Regel-Maschine erwartet — billig.
     *
     * Aus der DATEI (`IfcQuelle`), nicht aus den Fragmenten: die Fragmente
     * führen nur einen schmalen Attributsatz, und `PredefinedType` gehört
     * nicht dazu — genau das Feld, an dem `IfcGeographicElement` hängt.
     *
     * Merkmalssätze werden NUR gelesen, wenn eine Regel sie wirklich braucht
     * (`gelaendeBrauchtMerkmale`): `merkmale()` läuft tief über alle
     * `IfcRelDefinesByProperties` der Datei, und das ist für die Frage
     * „welche Kategorie ist Gelände?" fast immer unnötig.
     */
    _gelaendeKontext(modelId, localId) {
        const quelle = this.quelleVon(modelId);
        const zeile = quelle?.zeile(localId) ?? null;
        if (!zeile) return null;
        const merkmale = this._gelaendeBrauchtMerkmale ? this._merkmaleVon(modelId) : null;
        return {
            // Über `kategorieVon`, NICHT über `zeile.type`: das ist die
            // Typkonstante als Zahl, und als Kategorie weitergereicht trifft
            // sie kein Typprofil und keine Regel — lautlos.
            category: quelle.kategorieVon(zeile) || null,
            globalId: zeile.GlobalId?.value ?? null,
            attributes: {
                // Merkmale zuerst, echte IFC-Attribute danach: kollidiert ein
                // Merkmalsname mit einem Attributnamen, gilt das Attribut.
                ...(merkmale?.get(localId) ?? {}),
                Name: zeile.Name?.value ?? '',
                Description: zeile.Description?.value ?? '',
                ObjectType: zeile.ObjectType?.value ?? '',
                PredefinedType: zeile.PredefinedType?.value ?? '',
            },
            psets: {},
        };
    }

    /** Die flachen Merkmale einer Datei, einmal je Modell gelesen. */
    _merkmaleVon(modelId) {
        if (!this._gelaendeMerkmale) this._gelaendeMerkmale = new Map();
        if (!this._gelaendeMerkmale.has(modelId)) {
            this._gelaendeMerkmale.set(modelId, this.quelleVon(modelId)?.merkmale() ?? new Map());
        }
        return this._gelaendeMerkmale.get(modelId);
    }

    /**
     * Die deklarierte Bauform eines GELIEFERTEN Bauteils, über seine GlobalId.
     *
     * Für das Formpaar-Gate der Ableitungen (`braucht`). Fragt denselben
     * Kontext und dieselbe Entscheidung wie der Gelände-Sampler — `null`
     * heisst ehrlich „weiss ich nicht", und der Lauf vermerkt es, statt
     * durchzuwinken oder abzuweisen.
     */
    async _quellBauformVon(globalId) {
        if (!this._bauformVon || !globalId) return null;
        const { karte } = await karteMitEngine(this, [globalId]);
        const treffer = karte.get(globalId);
        if (!treffer) return null;
        const ctx = this._gelaendeKontext(treffer.modelId, treffer.localId);
        return ctx ? (this._bauformVon(ctx) ?? null) : null;
    }

    /**
     * WELCHE Elemente das Gelände sind — einmal je Journalstand, für alle.
     *
     * Sampler und Kandidatenliste stellten dieselbe Frage und rechneten sie
     * getrennt. Getrennt heisst: sie können auseinanderlaufen, und seit die
     * Antwort von einer Auslegung abhängt, wäre das schwer zu bemerken.
     */
    async _gelaendeOrteHolen() {
        if (this._gelaendeOrte) return this._gelaendeOrte;
        if (!this._gelaendeOrteLauf) {
            const generation = this._gelaendeGeneration ?? 0;
            const lauf = gelaendeElemente(this._gelaendeFrage()).then((orte) => {
                // Seit dem Start verworfen (Modell entladen/geladen, Journal)?
                // Dann gilt diese Liste nicht mehr: nicht zurückschreiben, neu fragen.
                if ((this._gelaendeGeneration ?? 0) !== generation) return this._gelaendeOrteHolen();
                this._gelaendeOrte = orte;
                return orte;
            }).finally(() => { if (this._gelaendeOrteLauf === lauf) this._gelaendeOrteLauf = null; });
            this._gelaendeOrteLauf = lauf;
        }
        return this._gelaendeOrteLauf;
    }

    /** Die Frage „was ist Gelände?" — EINE Stelle für den Sampler und die Farbe. */
    _gelaendeFrage() {
        const fragments = this.components.get(OBC.FragmentsManager);
        return {
            categoryGroups: this._categoryGroups ?? [],
            fragmentsList: fragments?.list ?? new Map(),
            verdeckt: this._verdeckt ?? new Set(),
            cdeGelaende: this._cdeGelaende ?? new Set(),
            kategorien: this._gelaendeKategorien ?? GELAENDE_VORBELEGUNG,
            leseKontext: (m, l) => this._gelaendeKontext(m, l),
            istGelaende: this._istGelaende,
            bauformAusGeometrie: (m, l) => this.formsignaturVon({ modelId: m, localId: l }).then(r => r?.bauform ?? null),
        };
    }

    /**
     * Die Geländeliste für die FARBE (Abnahme K4) — dieselbe Frage wie der
     * Sampler, nur ohne das Verdeckte auszunehmen: ein ersetztes Ur-Gelände
     * bleibt Gelände und kommt nach dem Verwerfen im selben Ton zurück. Die
     * eigenen Teile nicht — ihre Farbe sitzt im Material.
     */
    async _gelaendeFuerFarbe() {
        try {
            const orte = await gelaendeElemente({ ...this._gelaendeFrage(), verdeckt: new Set(), cdeGelaende: new Set() });
            return orte.filter(o => basisModelId(o.modelId) !== CDE_MODELL_ID);
        } catch { return []; }
    }

    /**
     * Die FORMSIGNATUR eines Bauteils — was die Geometrie über seine Form
     * sagt, ohne Journal, ohne Regeln (2026-09-07). Für das Bauformen-Panel
     * (je Gruppe ein Beispiel) und für den Gelände-Sampler bei Kandidaten
     * ohne Deklaration. `null`, wenn nichts zu messen ist.
     * @returns {Promise<{bauform, guete, grund, signatur}|null>}
     */
    async formsignaturVon({ modelId, localId } = {}) {
        if (!modelId || localId == null) return null;
        const handle = this.makeGeometryResolver()?.forElements([{ modelId, localId }]);
        if (!handle) return null;
        let achse = null;
        try {
            const a = await handle.getForm('axis');
            achse = achsGuete(a?.perElement?.[0] ?? null);
        } catch { achse = null; }
        let solid = null;
        try { solid = (await handle.getForm('solid'))?.data ?? null; } catch { solid = null; }
        if (!solid?.triCount && !achse) return null;
        return bauformAusNetz({
            positions: solid?.positions ?? null, triCount: solid?.triCount ?? 0,
            closed: !!solid?.closed, achse,
        });
    }

    /**
     * Typen der geladenen Dateien, die das IFC-4.3-Wörterbuch nicht kennt —
     * gestrichene oder exporteureigene. Für die Toolbox und das Panel: wer
     * sie sieht, versteht, warum Vererbung und Typprofile hier nicht greifen.
     * @returns {Array<{typ: string, anzahl: number}>}
     */
    fremdeTypen() {
        const summe = new Map();
        for (const quelle of (this._quellen ?? new Map()).values()) {
            if (!quelle?.lebt?.()) continue;
            for (const f of quelle.fremdeUntertypen('IFCPRODUCT')) {
                summe.set(f.typ, (summe.get(f.typ) ?? 0) + f.anzahl);
            }
        }
        return [...summe].map(([typ, anzahl]) => ({ typ, anzahl }));
    }

    /** Der Name eines eigenen Bauteils aus dem Journalstand — für Prüfliste und Kandidatenlisten. */
    _cdeNameVon(globalId) {
        return this._cdeNamen?.get(globalId) ?? null;
    }

    /** → `engine/Quellformen.js` (Teil XXIII, A8: Engine-Diät). */
    koerperKandidaten(...a) { return _ausgelagert_koerperKandidaten(this, ...a); }

    /** Kann der Kernel diese Operation — und wenn nicht, warum? (Server-Ops erst nach bereit().) */
    kernelKann(name) {
        return this.autor?._kernel?.kann?.(name) ?? { ok: false, grund: 'kein Kernel' };
    }

    /** → `engine/Beziehungslauf.js` (Teil XXIII, A8: Engine-Diät). */
    kollisionenPruefen(...a) { return _ausgelagert_kollisionenPruefen(this, ...a); }

    /**
     * Die Planbilder der Ableitungen (G5): Böschungsoberkanten aus dem
     * letzten Aufbau, in der Form der `erzeugte`-Linien des Plotters.
     */
    ableitungsBilder() {
        const out = [];
        for (const a of this.autor?.ableitungen?.values() ?? []) {
            for (const l of a.bild ?? []) {
                out.push({ punkte: l.punkte.map(p => [p.x, 0, p.z]), geschlossen: !!l.geschlossen,
                           name: '', art: 'boeschungskante' });
            }
        }
        return out;
    }

    /** Ist diese GlobalId ein selbst erzeugtes Gelände (DGM-Teil)? */
    istCdeGelaende(globalId) {
        return !!this._cdeGelaende?.has(globalId);
    }

    /**
     * DER Gelände-Sampler (Teil XIV, G3): Höhe y an (x, z) aus allem, was
     * Gelände IST — gelieferte Terrain-Elemente ohne Verdecktes, dazu die
     * eigenen DGM-Teile, nie die Aushubkörper (GelaendeQuelle.js). Gecacht,
     * bis der Journalstand oder das Modell sich bewegt.
     */
    async gelaendeSampler() {
        if (this._gelaendeSampler) return this._gelaendeSampler;
        if (!this._gelaendeSamplerLauf) {
            const generation = this._gelaendeGeneration ?? 0;
            const lauf = (async () => {
                const elemente = await this._gelaendeOrteHolen();
                // ÜBER DEN RESOLVER, nicht mit `filter: 'upward'` (2026-09-03).
                //
                // Der Filter nimmt jedes nach oben zeigende Dreieck — bei einem
                // GESCHLOSSENEN Erdkörper also auch Flächen im Inneren und an
                // der Unterseite von Überhängen; `makeHeightSampler` nimmt dann
                // den höchsten Treffer und liegt daneben. `deriveSurface('auto')`
                // entscheidet je Element: geschlossen → Höhenfeld, offenes DGM →
                // Oberflächen. Genau der Weg, den `_quellFormVon` fürs Raster
                // ohnehin geht — und seit die Auslegung einen Volumenkörper zum
                // Gelände machen kann, ist er der Regelfall, nicht die Ausnahme.
                const res = elemente.length
                    ? await this.makeGeometryResolver()?.forElements(elemente)?.getForm('surface')
                    : null;
                const positions = res?.data?.positions ?? new Float64Array(0);
                const gesamt = res?.data?.triCount ?? 0;
                const sampler = gesamt
                    ? makeHeightSampler(positions, gesamt)
                    : { sample: () => null, bounds: null };
                // Wie bei den Orten: verworfen, während er baute → nicht zurückschreiben.
                if ((this._gelaendeGeneration ?? 0) !== generation) return this.gelaendeSampler();
                this._gelaendeSampler = sampler;
                return sampler;
            })().finally(() => { if (this._gelaendeSamplerLauf === lauf) this._gelaendeSamplerLauf = null; });
            this._gelaendeSamplerLauf = lauf;
        }
        return this._gelaendeSamplerLauf;
    }

    /** Synchron: Höhe aus dem gecachten Sampler — undefined, solange er nicht bereit ist. */
    hoeheAn(x, z) {
        if (!this._gelaendeSampler) return undefined;
        return this._gelaendeSampler.sample(x, z);
    }

    /**
     * Der Höhenversatz Welt→NN, wie ihn der Viewer aus dem Bezug ableitet
     * (Teil XIV). Die Rezepte rechnen ihre NN-Höhen an genau dieser Zahl in
     * Welt-Y um — der Viewer meldet sie nach jedem Laden.
     */
    setzeHoehenversatz(v) {
        this._hoehenversatz = Number.isFinite(v) ? v : 0;
    }

    /** → `ifcleser/Achsen.js` (Teil XXIII, A8: Engine-Diät). */
    leseAchsen(...a) { return _ausgelagert_leseAchsen(this, ...a); }

    /** → `engine/Pruefliste.js` (Teil XXIII, A8: Engine-Diät). */
    pruefeAlles(...a) { return _ausgelagert_pruefeAlles(this, ...a); }

    /** → `engine/Netzabfragen.js` (Teil XXIII, A8: Engine-Diät). */
    netzVon(...a) { return _ausgelagert_netzVon(this, ...a); }

    /** → `engine/Netzabfragen.js` (Teil XXIII, A8: Engine-Diät). */
    schachtPunkteVon(...a) { return _ausgelagert_schachtPunkteVon(this, ...a); }

    strangVon(modelId, localId) {
        // GlobalId und Name stehen seit 17.3 AN der Achse — ein Weg für
        // geliefert und cde; die Form des Strangs lebt seit K3 an EINER Stelle.
        return strangMitAchsen(this.netzVon(modelId), localId, (id) => this.achseVon(modelId, id));
    }

    /** → `engine/Netzabfragen.js` — das Netz, wie ein eigenes Subjekt es braucht (Teil XXIV, K3). */
    netzAuskunft(...a) { return _ausgelagert_netzAuskunft(this, ...a); }

    /** → `engine/Netzabfragen.js` (Teil XXIII, A8: Engine-Diät). */
    anschluesseVon(...a) { return _ausgelagert_anschluesseVon(this, ...a); }

    /** → `engine/Netzabfragen.js` (Teil XXIII, A8: Engine-Diät). */
    knotenGriffe(...a) { return _ausgelagert_knotenGriffe(this, ...a); }

    /** Wo ein GELIEFERTER Schacht wohnt — Modell und localId zur GlobalId. */
    schachtOrt(globalId) {
        for (const [modelId, knoten] of this._knoten ?? new Map()) {
            for (const [localId, k] of knoten) {
                if (k.globalId === globalId) return { modelId, localId };
            }
        }
        return null;
    }

    /** → `engine/Netzabfragen.js` (Teil XXIII, A8: Engine-Diät). */
    anschluesseFuer(...a) { return _ausgelagert_anschluesseFuer(this, ...a); }

    /**
     * Mehrere Orte zugleich auswählen — für „Verbundenes wählen" (B2), über
     * DENSELBEN Auswahlzustand wie die Rahmenauswahl: `_selectedItems` je
     * Modell, ein Highlight, kein Schlüssel (mehrere Bauteile haben keinen).
     */
    async waehleOrte(orte = []) {
        const fragments = this.components.get(OBC.FragmentsManager);
        const items = {};
        for (const o of orte) {
            if (!o?.modelId || !Number.isFinite(Number(o.localId))) continue;
            if (!fragments?.list?.get(o.modelId)) continue;
            (items[o.modelId] ??= []).push(Number(o.localId));
        }
        if (this._selectedItems) {
            try { await this._resetHighlight(this._selectedItems); } catch { /* */ }
        }
        this._selectedItems = Object.keys(items).length ? items : null;
        this._selectedKey = null;
        if (this._selectedItems) {
            try { await this._highlight(SELECTION_STYLE, items); } catch (e) { console.warn('[Selection] verbund highlight failed:', e); }
        }
        return { items, count: Object.values(items).reduce((n, ids) => n + ids.length, 0) };
    }

    schachtAnschluesse(globalId) {
        return this.anschluesseFuer(globalId).map(k => ({
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

    /** → `engine/Quellformen.js` (Teil XXIII, A8: Engine-Diät). */
    _quellFormVon(...a) { return _ausgelagert__quellFormVon(this, ...a); }

    /**
     * Die Kernel-Form `knoten` samt UNTERKANTE (Teil XXI, P2c).
     *
     * `_knotenAlsPunkt` liefert die PLATZIERUNG eines Schachts — und die ist
     * nicht seine Sohle. Der Kanalgraben setzte seine Baugrube auf
     * `platzierung − Bettung` und blieb damit um den Rohrhalbmesser über der
     * Grabensohle stehen: ein Absatz von 0,15 m, in `b3.test.js` sogar
     * festgeschrieben. Die Sohle steht in der HÜLLE (tiefster Punkt), und
     * genau so liest sie der Längsschnitt schon lange.
     *
     * Ohne Hülle bleibt die Platzierung — mit dem Unterschied, dass das Rezept
     * es dann WEISS (`unterkante` fehlt) statt zu raten.
     */
    async _knotenMitUnterkante(globalId) {
        const punkt = this._knotenAlsPunkt(globalId);
        if (!punkt) return null;
        // WAS y IST (A9): bei einem gelieferten Schacht die PLATZIERUNG — wo
        // der Hersteller den Ursprung setzt (Sohle, Deckel, Mitte), sagt die
        // Datei nicht. Die Sohle belegt erst die Hülle.
        const k = { ...punkt, hoehenbezug: 'platzierung' };
        try {
            const { karte } = await karteMitEngine(this, [globalId]);
            const ort = karte.get(globalId);
            if (ort) {
                const h = (await this.autor.huellenVon(ort.modelId, [ort.localId]))?.get(ort.localId);
                if (Number.isFinite(h?.unterkante)) {
                    return { ...k, unterkante: h.unterkante, ...(Number.isFinite(h?.oberkante) ? { oberkante: h.oberkante } : {}) };
                }
            }
        } catch { /* ohne Hülle gilt die Platzierung */ }
        return k;
    }

    /** Kernel-Form `knoten` eines Schachts (geliefert oder eigen): {x, y, z, name} oder null. */
    _knotenAlsPunkt(globalId) {
        for (const karte of (this._knoten ?? new Map()).values()) {
            for (const k of karte.values()) {
                if (k.globalId === globalId && k.punkt) return { x: k.punkt.x, y: k.punkt.y, z: k.punkt.z, name: k.name ?? '' };
            }
        }
        const eigen = this._cdeKnoten?.get(globalId) ?? null;
        return eigen?.punkt ? { x: eigen.punkt.x, y: eigen.punkt.y, z: eigen.punkt.z, name: eigen.name ?? '' } : null;
    }

    /** → `engine/Quellformen.js` (Teil XXIII, A8: Engine-Diät). */
    _achseAlsLinie(...a) { return _ausgelagert__achseAlsLinie(this, ...a); }

    /** → `engine/Quellformen.js` (Teil XXIII, A8: Engine-Diät). */
    gelaendeKandidaten(...a) { return _ausgelagert_gelaendeKandidaten(this, ...a); }

    /** Rückwärtsverträglich — der Aufrufer im Autor nennt es weiter so. */
    _quellrasterVon(globalId, opts = {}) {
        return this._quellFormVon(globalId, 'raster', opts);
    }

    /** Das Prüfmass eines gelieferten Bauteils (Teil XIV) — null, wenn es nicht im Modell ist. */
    async pruefmassVon(globalId) {
        const mesh = await this._quellFormVon(globalId, 'mesh');
        return mesh ? pruefmassVon(mesh) : null;
    }

    /**
     * Das ACHSMASS eines Rohrs (B3): Länge, DN, Höhenunterschied — cm-gerundet,
     * translationsinvariant, ohne Resolver. Für die Rohre eines Strang-Grabens
     * gibt es beim Setzen kein Netz-Prüfmass (synchron, viele Rohre); das
     * Achsmass fängt trotzdem, wenn der Planer eine Haltung ändert.
     */
    achsmassVon(globalId) {
        const l = this._achseAlsLinie(globalId);
        return l ? achsmassAus(l) : null;
    }

    /** → `Erdmassen.js` (Teil XXIII, A8: Engine-Diät). */
    erdmassen(...a) { return _ausgelagert_erdmassen(this, ...a); }

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
            return achseAusKante(this._cdeKanten?.get(localId.slice(4)) ?? null);
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
        // Vor `components.dispose()` — danach gibt es die Szene nicht mehr.
        this.overlay?.dispose?.();
        clearTimeout(this._gelaendeKantenUhr);
        this.gelaendeKanten?.dispose?.();
        this.erdbauUmrisse?.dispose?.();
        if (this.components) this.components.dispose();
        if (this.container?.innerHTML) this.container.innerHTML = '';
    }
}
