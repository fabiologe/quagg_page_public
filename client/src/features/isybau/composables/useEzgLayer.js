/**
 * EZG-Karte: georeferenzierter Hintergrund (Luftbild + Höhenlinien) für den
 * 2D-Editor. Module-level (Singleton) state wie useTutorialGuide.js — der
 * Toggle-Button in ViewerControls.vue und das Rendering in IsybauViewer.vue
 * teilen sich denselben Zustand ohne Prop-Drilling.
 *
 * Bewusst NICHT im Pinia-Store: reiner Session-/Fetch-Zustand (Bild-Blob,
 * Höhenraster, Bounding-Box), der bei jedem Reload ohnehin neu geladen werden
 * müsste. Nur das bestätigte CRS selbst (store.metadata.crs) ist
 * persistenzwürdig.
 *
 * Luftbild und Höhenlinien werden UNABHÄNGIG voneinander geladen und melden
 * ihre Fehler getrennt (error/contourError) — ein Ausfall des
 * Elevation-Proxys darf das bereits funktionierende Luftbild nicht mit
 * herunterreißen, und umgekehrt.
 */
import { ref, watch } from 'vue';
import { useIsybauStore } from '../store/index.js';
import { computeLocalNetworkBounds, padLocalBounds, localBoundsToWGS84, wgs84BoundsToLocal, unionLocalBounds, containsWithMargin } from '../utils/geoBounds.js';
import { fetchAerialImage } from '../services/EzgImageryService.js';
import { fetchElevationGrid } from '../services/ElevationService.js';

const enabled = ref(false);
const status = ref('idle'); // 'idle' | 'loading' | 'ready' | 'error' — bezieht sich auf das Luftbild (primäre Ebene)
const error = ref(null); // Luftbild-Fehlermeldung
const aerialImageUrl = ref(null);
// Tatsächliche lokale Ausdehnung des GELIEFERTEN Kachel-Mosaiks (kachel-
// ausgerichtet, meist etwas größer als die ursprünglich angefragte Box) —
// das ist die Box, an der IsybauViewer.vue das <image> ausrichten muss.
const aerialImageBounds = ref(null);

const contourInterval = ref(2); // Meter; 0 = aus

/**
 * Terrarium-Höhenlinien (30m-Auflösung) sind gegenstandslos, sobald der
 * Nutzer ein eigenes, präziseres DGM hochgeladen hat (store.terrain, siehe
 * xyzTerrainImporter.js) — Mischen beider Quellen an der Kachel-/Upload-Grenze
 * würde grobe und präzise Höhendaten sichtbar nebeneinander zeigen ("Äpfel
 * mit Birnen"). Deckt NUR die Kontur-BERECHNUNG (Marching Squares) ab, nicht
 * das Fetchen selbst (siehe elevationFetchSuppressed()) — sonst würde ein rein
 * kosmetisches "Höhenlinien aus"-Umschalten (contourInterval=0, unabhängig von
 * jedem DGM) auch die für useApiTerrainFallback.js (3D-Fallback-Gelände)
 * benötigten Rohdaten verhungern lassen.
 */
function contourComputeSuppressed() {
    return contourInterval.value <= 0 || !!useIsybauStore().terrain;
}

/**
 * Das WGS84-Höhenraster selbst (cachedElevationGrids) NICHT mehr fetchen,
 * sobald ein eigenes, präziseres DGM existiert — das deckt dann sowohl die
 * 2D-Höhenlinien als auch das 3D-Fallback-Gelände ab, die groben Terrarium-
 * Kacheln wären nur verschwendeter Netzwerk-Traffic. Unabhängig vom
 * contourInterval-Toggle (der ist rein kosmetisch fürs 2D-Liniendisplay).
 */
function elevationFetchSuppressed() {
    return !!useIsybauStore().terrain;
}
const contourStatus = ref('idle'); // 'idle' | 'loading' | 'ready' | 'error'
const contourError = ref(null);

// Flaches Float32Array (x,y,0, x,y,0, ... — ein Punktpaar pro Liniensegment),
// direkt im Format, das LineSegmentsGeometry.setPositions() in
// useContourGpuLayer.js erwartet. Kommt fertig berechnet (Marching Squares +
// Verkettung + Douglas-Peucker + Flatten) aus ezgContourWorker.js zurück,
// siehe recomputeContoursFromCache() — bewusst ein einfacher ref() statt
// computed(), da die Berechnung jetzt asynchron (Worker-Antwort per
// Transferable, zero-copy) statt synchron aus dem Höhenraster abgeleitet
// wird. Bewusst NICHT mehr als verschachtelte {elevation,lines}-Objekte
// (frühere Version): das kostete beim strukturierten Klonen auf dem
// Main-Thread mehrere Sekunden (Profiling) — der genaue Hänger, den der
// Worker-Umbau eigentlich vermeiden sollte.
const contourPositions = ref(new Float32Array(0));

let currentObjectUrl = null;
// EIN Eintrag { raster, width, height, pixelToWGS84, tileParams } PRO
// erfolgreich geladenem (Teil-)Bereich — nicht mehr ein einzelnes, bei jedem
// Nachladen überschriebenes Raster. Grund: expandCoverage() lud vorher bei
// JEDEM Pan die GESAMTE (wachsende) Union-Fläche neu und berechnete ALLE
// Konturen von Grund auf neu — sichtbar als "Linien zeichnen sich zwar
// dynamisch, verschwinden/verschieben sich dann aber wieder" (Nutzer-
// Feedback), weil (a) das Höhenraster bei wachsender Fläche irgendwann einen
// gröberen Zoom braucht (Kachelbudget), was ALLE Linien leicht verschiebt,
// und (b) marching squares bei floatgenauer Neuberechnung nicht zwingend
// bitidentische Segmente liefert. Jetzt bleibt jedes einmal berechnete Stück
// Kontur unangetastet liegen — appendContours() (siehe unten) fügt nur NEU
// hinzu, recomputeContoursFromCache() (Intervall-Wechsel) baut aus ALLEN
// Einträgen neu zusammen.
let cachedElevationGrids = [];
let cachedEpsg = null;
// cachedElevationGrids/cachedEpsg sind bewusst plain (nicht reaktiv) — dieser
// Zähler ist der einzige reaktive Anknüpfpunkt dafür, damit z.B.
// useApiTerrainFallback.js (3D-Ansicht) auf neu geladene/nachgeladene Kacheln
// reagieren kann, ohne die Grids selbst in einen (teuren, tiefen) Vue-Proxy
// zu zwingen. Bei jeder Mutation von cachedElevationGrids mit hochzählen.
const elevationGridVersion = ref(0);
// Zuletzt angefragte (gepolsterte) lokale Box — Basis fürs Pan-Nachladen
// (expandCoverage() wächst diese Box, statt bei jedem Pan alles neu zu holen).
let lastRequestedLocalBounds = null;
const isExpanding = ref(false); // eigener Ladezustand fürs Pan-Nachladen, blockiert NICHT die LoadingOverlay

// Marching Squares + Verkettung + Douglas-Peucker liefen vorher synchron auf
// dem Main-Thread (siehe git-history) — bei größeren Höhenrastern (seit der
// "viel mehr initial laden"-Änderung eher die Regel als die Ausnahme) blieb
// dabei sogar die LoadingOverlay-Animation sichtbar hängen (Nutzer-Feedback).
// Einziger Worker der Datei, lazy erzeugt, lebt für die Session (Singleton-
// Composable wie der restliche Modul-State hier — kein explizites
// terminate() nötig).
let contourWorker = null;
let contourReqId = 0;
// reqId -> resolve(positions), damit jeder Aufrufer (recomputeContoursFromCache
// für einen Vollaufbau, appendContours für ein einzelnes Delta-Raster) selbst
// entscheidet, was mit dem Ergebnis passiert (ersetzen vs. anhängen) — der
// Worker/onmessage-Handler mutiert contourPositions NICHT mehr direkt.
const pendingContourResolvers = new Map();

function ensureContourWorker() {
    if (contourWorker) return contourWorker;
    contourWorker = new Worker(new URL('../workers/ezgContourWorker.js', import.meta.url), { type: 'module' });
    contourWorker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type !== 'result') return;
        const resolve = pendingContourResolvers.get(msg.reqId);
        pendingContourResolvers.delete(msg.reqId);
        resolve?.(msg.positions);
    };
    contourWorker.onerror = (err) => {
        console.error('EZG-Karte: Kontur-Worker-Fehler', err.message || err);
        contourError.value = err.message || 'Höhenlinien-Berechnung fehlgeschlagen';
        contourStatus.value = 'error';
        for (const resolve of pendingContourResolvers.values()) resolve(new Float32Array(0));
        pendingContourResolvers.clear();
    };
    return contourWorker;
}

function revokeCurrentImage() {
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
}

/** Berechnet die Konturen für EIN Höhenraster im Worker. @returns {Promise<Float32Array>} */
function computeContoursForGrid(grid, epsg) {
    if (contourComputeSuppressed()) return Promise.resolve(new Float32Array(0));
    const worker = ensureContourWorker();
    const myReqId = ++contourReqId;
    return new Promise((resolve) => {
        pendingContourResolvers.set(myReqId, resolve);
        worker.postMessage({
            type: 'compute',
            reqId: myReqId,
            raster: grid.raster,
            width: grid.width,
            height: grid.height,
            interval: contourInterval.value,
            epsg,
            tileParams: grid.tileParams
        });
    });
}

/**
 * Höhenlinien direkt aus dem hochgeladenen DGM (store.terrain, siehe
 * xyzTerrainImporter.js) statt aus den groben Terrarium-Kacheln. Läuft
 * UNABHÄNGIG vom enabled-Toggle (der ist nur für Luftbild+Terrarium
 * zuständig) — wer ein eigenes DGM hochgeladen hat, muss nicht zusätzlich
 * die EZG-Luftbild-Ebene einschalten, um seine eigenen Höhenlinien zu sehen.
 * Wird über den watch(() => store.terrain, ...) unten getriggert.
 */
async function computeContoursForTerrain() {
    const terrain = useIsybauStore().terrain;
    if (!terrain || contourInterval.value <= 0) {
        contourPositions.value = new Float32Array(0);
        contourStatus.value = 'idle';
        return;
    }

    contourStatus.value = 'loading';
    contourError.value = null;
    try {
        const { gridData, ncols, nrows, cellsize, xllcorner, yllcorner } = terrain;
        // NODATA (siehe makeTerrainObject: v <= -9000, gleiche Schwelle) -> NaN,
        // damit marchingSquares() diese Zellen überspringt statt eine falsche
        // Steilklippen-Kontur an der Vermessungsgrenze zu zeichnen. Eigene Kopie
        // (nicht gridData selbst transferieren!) — das Original wird u.a. vom
        // 3D-Terrain-Mesh weiterverwendet.
        const raster = new Float32Array(gridData.length);
        for (let i = 0; i < gridData.length; i++) {
            const v = gridData[i];
            raster[i] = v <= -9000 ? NaN : v;
        }

        const worker = ensureContourWorker();
        const myReqId = ++contourReqId;
        const positions = await new Promise((resolve) => {
            pendingContourResolvers.set(myReqId, resolve);
            worker.postMessage({
                type: 'compute',
                reqId: myReqId,
                raster,
                width: ncols,
                height: nrows,
                interval: contourInterval.value,
                localGrid: { xllcorner, yllcorner, cellsize }
            }, [raster.buffer]);
        });

        // terrain könnte sich während des Wartens geändert haben (neuer Upload/
        // Entfernen) — Ergebnis dann verwerfen statt veraltete Linien zu zeigen.
        if (useIsybauStore().terrain !== terrain) return;
        contourPositions.value = positions;
        contourStatus.value = 'ready';
    } catch (e) {
        contourError.value = e.message || 'Höhenlinien-Berechnung fehlgeschlagen';
        contourStatus.value = 'error';
    }
}

/**
 * Zentraler Dispatcher: welche Kontur-Quelle gerade aktiv ist, entscheidet
 * store.terrain (siehe contourComputeSuppressed()/elevationFetchSuppressed()
 * für die Begründung der Exklusivität). ALLE Trigger, die Konturen neu
 * anzeigen sollen (Intervall-Wechsel, DGM-Upload/-Entfernen, enabled-Toggle),
 * laufen hier zusammen statt an mehreren Stellen verstreut zu entscheiden.
 */
function refreshContourSource() {
    if (useIsybauStore().terrain) {
        computeContoursForTerrain();
    } else if (enabled.value) {
        recomputeContoursFromCache();
    } else {
        contourPositions.value = new Float32Array(0);
        contourStatus.value = 'idle';
    }
}

// DGM hochgeladen/entfernt -> Konturen sofort neu (unabhängig vom
// EZG-Luftbild-Toggle, siehe computeContoursForTerrain()).
watch(() => useIsybauStore().terrain, () => refreshContourSource());

/** Hängt b hinter a — vermeidet unnötiges Kopieren, falls eine Seite leer ist. */
function concatPositions(a, b) {
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    const merged = new Float32Array(a.length + b.length);
    merged.set(a, 0);
    merged.set(b, a.length);
    return merged;
}

/**
 * Baut contourPositions aus ALLEN gecachten Rastern komplett neu auf (z.B.
 * nach einem Intervall-Wechsel — dabei ändert sich zwangsläufig JEDE Linie,
 * ein Neuaufbau ist hier korrekt und erwartet, anders als beim Pan-Nachladen).
 * @returns {Promise<void>}
 */
async function recomputeContoursFromCache() {
    if (cachedElevationGrids.length === 0 || contourComputeSuppressed()) {
        contourPositions.value = new Float32Array(0);
        return;
    }
    const results = await Promise.all(
        cachedElevationGrids.map((grid) => computeContoursForGrid(grid, cachedEpsg))
    );
    contourPositions.value = results.reduce(concatPositions, new Float32Array(0));
}

async function refreshAerial(wgs84Bounds, epsg) {
    status.value = 'loading';
    error.value = null;
    try {
        const { imageUrl, actualWgs84Bounds } = await fetchAerialImage(wgs84Bounds);
        revokeCurrentImage();
        currentObjectUrl = imageUrl;
        aerialImageUrl.value = imageUrl;
        aerialImageBounds.value = wgs84BoundsToLocal(actualWgs84Bounds, epsg);
        status.value = 'ready';
    } catch (e) {
        console.error('EZG-Karte: Luftbild-Laden fehlgeschlagen', e);
        error.value = e.message || 'Laden fehlgeschlagen';
        status.value = 'error';
    }
}

/** Kompletter (Neu-)Aufbau — verwirft alle bisherigen Raster/Konturen. Für refresh() (Erstladen/"Aktualisieren"). */
async function refreshContours(wgs84Bounds, epsg) {
    if (elevationFetchSuppressed()) {
        // Eigenes DGM aktiv — keine Terrarium-Kacheln holen, stattdessen die
        // eigenen Konturen (neu) berechnen statt sie stumpf zu löschen.
        cachedElevationGrids = [];
        elevationGridVersion.value++;
        await computeContoursForTerrain();
        return;
    }
    contourStatus.value = 'loading';
    contourError.value = null;
    try {
        const grid = await fetchElevationGrid(wgs84Bounds);
        if (!enabled.value) return; // zwischenzeitlich deaktiviert — Ergebnis verwerfen
        cachedElevationGrids = [grid]; // Neustart: ab hier wieder EIN Bereich
        cachedEpsg = epsg;
        elevationGridVersion.value++;
        // Bewusst AWAITED (nicht fire-and-forget): erst wenn der Worker die
        // fertige Geometrie zurückgeliefert hat, gilt diese Ebene als
        // 'ready' — sonst würde die LoadingOverlay schon verschwinden,
        // während die Konturen im Hintergrund noch berechnet werden, und
        // kurz danach sichtbar "nachpoppen".
        await recomputeContoursFromCache();
        contourStatus.value = 'ready';
    } catch (e) {
        // Bewusst NICHT cachedElevationGrids/contourPositions zurücksetzen —
        // mirrort refreshAerial()'s Fehlerbehandlung: ein fehlgeschlagener
        // Ladeversuch soll die zuletzt erfolgreich gezeichneten Konturen
        // NICHT wegwischen (Nutzer-Feedback).
        console.error('EZG-Karte: Höhenlinien-Laden fehlgeschlagen', e);
        contourError.value = e.message || 'Laden fehlgeschlagen';
        contourStatus.value = 'error';
    }
}

/**
 * Lädt Höhenraster NUR für den neu hinzugekommenen Bereich und HÄNGT die
 * daraus berechneten Konturen an die bestehenden an — für expandCoverage()
 * (Pan-Nachladen). Im Gegensatz zu refreshContours() wird NICHTS Bestehendes
 * neu berechnet: die schon gezeichneten Linien bleiben unverändert liegen
 * (weder Positions- noch Zoom-/Rundungs-bedingte Verschiebung), nur neue
 * Linien kommen hinzu — genau das vom Nutzer gewünschte Verhalten ("soll nur
 * zeichnen und dann die Linien stehen lassen"). Kleiner Nebeneffekt: im
 * Überlappungsstreifen (die 15%-Sicherheitsmarge) werden manche Linien
 * doppelt zurückgeliefert — harmlos, dieselbe Linie zweimal gezeichnet sieht
 * identisch aus wie einmal, kostet nur etwas zusätzliche (vernachlässigbare)
 * GPU-Geometrie.
 */
async function appendContours(deltaWgs84Bounds, epsg) {
    if (elevationFetchSuppressed()) return; // eigenes DGM aktiv — nichts zu holen, contourPositions bleibt wie es ist
    contourStatus.value = 'loading';
    contourError.value = null;
    try {
        const grid = await fetchElevationGrid(deltaWgs84Bounds);
        const newPositions = await computeContoursForGrid(grid, epsg); // leer, falls contourComputeSuppressed()
        if (!enabled.value) return; // zwischenzeitlich deaktiviert — Ergebnis verwerfen, nicht ins frisch geleerte contourPositions schreiben
        cachedElevationGrids.push(grid);
        cachedEpsg = epsg;
        elevationGridVersion.value++;
        contourPositions.value = concatPositions(contourPositions.value, newPositions);
        contourStatus.value = 'ready';
    } catch (e) {
        console.error('EZG-Karte: Höhenlinien-Nachladen fehlgeschlagen', e);
        contourError.value = e.message || 'Laden fehlgeschlagen';
        contourStatus.value = 'error';
    }
}

/** Lädt (bzw. lädt neu) Luftbild + Höhenlinien für die aktuelle Netz-Ausdehnung. */
async function refresh() {
    const store = useIsybauStore();
    const crs = store.metadata.crs;

    if (!crs?.confirmed) {
        store.ui.showEzgCrsModal = true;
        return;
    }

    // Nodes UND Haltungs-Polylinien (Edge.coords) einbeziehen — eine gebogene
    // Haltung kann außerhalb der Geraden zwischen ihren Endknoten verlaufen.
    // Bei komplett leerem Netz greift der originAnchor-Fallback ("Neu starten").
    const anchor = store.metadata.originAnchor || null;
    const rawBounds = computeLocalNetworkBounds(store.nodeArray, store.edgeArray, anchor);

    // Initiale Ladefläche bewusst großzügig (ratio=1.0 ≈ 3x Netzspannweite):
    // reduziert, wie oft expandCoverage() beim Pannen überhaupt nachladen
    // muss. 500m Mindest-Kante auch für normale (nicht-leere) Netze, nicht
    // nur für den Anker-Fall — ein kleines Netz bekäme sonst kaum spürbar
    // mehr Fläche. Leeres Netz + Anker ("Neu starten"): 2000m Mindest-Kante
    // (der höhere MAX_TILES_PER_SIDE in EzgImageryService.js hält Zoom 18
    // dafür noch im Budget). Wächst das Netz später darüber hinaus, holt
    // refresh() (erneut aufgerufen über den "Aktualisieren"-Button in
    // ViewerControls.vue) automatisch einen größeren Ausschnitt.
    const minSpan = (store.nodeArray.length === 0 && anchor) ? 2000 : 500;
    const padded = padLocalBounds(rawBounds, 1.0, minSpan);
    lastRequestedLocalBounds = padded;
    const wgs84Bounds = localBoundsToWGS84(padded, crs.epsg);

    // Unabhängig, damit ein Ausfall der einen Ebene die andere nicht blockiert.
    await Promise.all([
        refreshAerial(wgs84Bounds, crs.epsg),
        refreshContours(wgs84Bounds, crs.epsg)
    ]);
}

/**
 * Pan-Nachladen: wird (debounced, siehe IsybauViewer.vue) aufgerufen, wenn
 * sich der sichtbare Kartenausschnitt dem Rand der geladenen Fläche nähert.
 * Wächst die geladene Box um den aktuellen Viewport (mit Polsterung) statt
 * alles neu anzufragen — bereits geladene Bereiche bleiben abgedeckt, kein
 * Hin-und-Her-Nachladen beim Pendeln über eine Kante.
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} viewportLocalBounds
 */
async function expandCoverage(viewportLocalBounds) {
    if (!enabled.value || isExpanding.value) return;
    if (status.value === 'loading' || contourStatus.value === 'loading') return;
    if (!lastRequestedLocalBounds) return; // noch kein initialer refresh() gelaufen

    const store = useIsybauStore();
    const crs = store.metadata.crs;
    if (!crs?.confirmed) return;

    // Sicherheitsabstand zum Rand, bevor nachgeladen wird — sonst wird erst
    // nachgeladen, wenn die Lücke schon sichtbar ist. Trigger-Zeitpunkt (WANN
    // nachgeladen wird) und Renderradius (WIE VIEL dabei nachgeladen wird,
    // s.u.) sind zwei getrennte Stellschrauben.
    if (containsWithMargin(lastRequestedLocalBounds, viewportLocalBounds, 0.15)) return;

    isExpanding.value = true;
    try {
        // Renderradius: deckt pro Nachladevorgang eine deutlich größere
        // Fläche um den aktuellen Viewport ab, bevor die nächste Lücke
        // erreicht wird (unabhängig vom Trigger-Zeitpunkt oben).
        const paddedViewport = padLocalBounds(viewportLocalBounds, 2.0);
        const nextBounds = unionLocalBounds(lastRequestedLocalBounds, paddedViewport);
        const unionWgs84Bounds = localBoundsToWGS84(nextBounds, crs.epsg);
        // Luftbild: weiterhin die GESAMTE (gewachsene) Union neu laden — EIN
        // Mosaik-Bild, dieselben Foto-Pixel unabhängig vom angefragten
        // Ausschnitt, kein "verschiebt sich"-Risiko wie bei den Konturen.
        // Konturen: NUR den neuen Delta-Bereich anfragen und anhängen (siehe
        // appendContours()) — die bereits gezeichneten Linien bleiben dabei
        // unangetastet stehen, statt bei wachsender Fläche komplett neu
        // berechnet (und dabei ggf. leicht verschoben) zu werden.
        const deltaWgs84Bounds = localBoundsToWGS84(paddedViewport, crs.epsg);

        await Promise.all([
            refreshAerial(unionWgs84Bounds, crs.epsg),
            appendContours(deltaWgs84Bounds, crs.epsg)
        ]);

        // lastRequestedLocalBounds erst NACH erfolgreichem Laden auf die
        // größere Box committen (nicht optimistisch vorher, wie zuvor) —
        // sonst hielte containsWithMargin() einen Bereich für abgedeckt,
        // dessen Nachladen gerade fehlgeschlagen ist, und ein späterer Pan
        // würde NIE erneut versuchen nachzuladen. 'idle' (Konturen bewusst
        // ausgeschaltet) zählt als kein Fehler, nur 'error' blockiert.
        if (status.value !== 'error' && contourStatus.value !== 'error') {
            lastRequestedLocalBounds = nextBounds;
        }
    } finally {
        isExpanding.value = false;
    }
}

/** Konturintervall ändern und (ohne erneuten Netzwerk-Fetch) neu berechnen. */
function setContourInterval(value) {
    contourInterval.value = value;
    refreshContourSource();
}

/** Zyklus wie cycleGridSize() in ViewerControls.vue: 1m -> 2m -> 5m -> aus -> 1m. */
function cycleContourInterval() {
    const order = [1, 2, 5, 0];
    const idx = order.indexOf(contourInterval.value);
    const next = order[(idx + 1) % order.length];
    setContourInterval(next);
}

/**
 * Bereits gezeichnete Terrarium-Konturen UND das gecachte Rohraster verwerfen
 * (z.B. sobald ein eigenes, präziseres DGM hochgeladen wurde, siehe
 * elevationFetchSuppressed()) — Luftbild bleibt unberührt (Nutzer wollte nur
 * die Höhenlinien/das API-Fallback-Gelände "einfrieren", nicht die ganze
 * EZG-Karte).
 */
function clearContours() {
    contourPositions.value = new Float32Array(0);
    cachedElevationGrids = [];
    contourStatus.value = 'idle';
    contourError.value = null;
    elevationGridVersion.value++;
}

/**
 * Momentaufnahme der gecachten WGS84-Höhenkacheln für useApiTerrainFallback.js
 * (3D-Fallback-Gelände). cachedElevationGrids/cachedEpsg sind bewusst plain —
 * Aufrufer müssen selbst auf elevationGridVersion reagieren, um Änderungen
 * mitzubekommen (siehe Kommentar dort).
 */
function getElevationGrids() {
    return { grids: cachedElevationGrids, epsg: cachedEpsg };
}

function enable() {
    enabled.value = true;
    refresh();
}

function disable() {
    enabled.value = false;
    revokeCurrentImage();
    aerialImageUrl.value = null;
    aerialImageBounds.value = null;
    status.value = 'idle';
    error.value = null;
    contourError.value = null;
    cachedElevationGrids = [];
    elevationGridVersion.value++;
    lastRequestedLocalBounds = null;
    // Löscht Terrarium-Konturen, lässt eigene DGM-Konturen (falls aktiv)
    // unberührt — das Luftbild-Ausschalten betrifft nur die EZG-Quelle.
    refreshContourSource();
}

function toggle() {
    if (enabled.value) disable();
    else enable();
}

export function useEzgLayer() {
    return {
        enabled,
        status,
        error,
        aerialImageUrl,
        aerialImageBounds,
        contourInterval,
        contourPositions,
        contourStatus,
        contourError,
        isExpanding,
        toggle,
        enable,
        disable,
        refresh,
        expandCoverage,
        setContourInterval,
        cycleContourInterval,
        clearContours,
        elevationGridVersion,
        getElevationGrids
    };
}
