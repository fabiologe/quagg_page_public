/**
 * IfcQuelle — ein LEBENDER Lesezugriff auf die IFC-Datei (Stufe 13.1, neu).
 *
 * WARUM ES DIESE DATEI GIBT. Die CDE hat bisher über `ifcLoader.webIfc`
 * gelesen — und dieser Handle hat **nie ein Modell offen** und ist nicht
 * einmal initialisiert. Nur `IfcLoader.readIfcFile()` öffnet eines und ruft
 * dabei `Init()`; die CDE ruft das nirgends, weil `load()` über
 * `FRAGS.IfcImporter` geht und `this.webIfc` überhaupt nicht anfasst
 * (@thatopen/components, dist:3867-3892).
 *
 * Alles, was darauf gebaut war, lief still ins Leere:
 *   extractAxisPolylines   Haltungsbeschriftung leer; `getForm('axis')` fiel
 *                          IMMER auf `skeletonAxis` zurück, also jede Achse
 *                          „geschätzt" — auch die, die der Planer gezeichnet hat
 *   IfcStoreys.Elevation   Geschosshöhen aus einem toten Handle
 *   Georeferenz            Stufe 0, obwohl die Datei Stufe 50 trägt
 *
 * Und ein Zugriff auf diese nicht initialisierte wasm-API im Renderpfad hat
 * einmal den ganzen Viewer gekostet. Deshalb steht `lebt()` hier ganz vorne
 * und wird von jedem Aufrufer gefragt, BEVOR er etwas liest.
 *
 * WAS SIE ANDERS MACHT: sie bringt ihre eigene `IfcAPI` mit, initialisiert sie,
 * öffnet die Dateibytes und hält sie offen. Die Bytes liegen ohnehin vor —
 * `IfcEngine.loadIfc(data, name)` bekommt sie herein.
 *
 * SKALIERBAR AUF ALLE IFC-TYPEN, nicht auf eine Liste. Zwei Dinge tragen das:
 *
 *   1. Die Typkonstante kommt aus dem MODUL von web-ifc (`WebIfcTypen.js`),
 *      nicht von der Instanz — sie liegt dort nicht.
 *   2. `mitUntertypen` weitet eine Abfrage über die IFC-VERERBUNG aus. „Gib
 *      mir alle `IFCELEMENT`" liefert damit Wand, Rohr, Schacht und jeden
 *      Typ, den noch niemand gesehen hat — über `data/entity-schema.js`,
 *      dieselbe Quelle, aus der schon die Typprofile erben. Kein
 *      Kategorien-Whitelist wie in `buildSearchIndex` (30 feste Typen, und
 *      `GlobalIdKarte.js:9-15` nennt das selbst als Schwäche).
 *
 * PREIS, ausdrücklich benannt: das Modell liegt danach ZWEIMAL im Speicher —
 * einmal als Fragmente für die Anzeige, einmal im wasm-Heap zum Lesen. Bei
 * einer 9-MB-Datei ist das spürbar. Deshalb `schliesse()`, und deshalb ruft
 * `IfcEngine.unloadModel` es auf.
 */

import { ENTITY_META } from '../data/entity-schema.js';
import { typKonstante, typName } from './WebIfcTypen.js';

/**
 * Alle Nachfahren eines IFC-Typs, er selbst eingeschlossen.
 *
 * Aus `ENTITY_META`, wo jede Klasse ihre volle `hierarchy` trägt. Einmal je
 * Typ gerechnet und gemerkt — der Baum hat 1.418 Einträge, und die Abfrage
 * käme sonst bei jedem Lesen wieder.
 */
/**
 * Woran ein Typ STRUKTURELL erkannt wird, wenn das Wörterbuch ihn nicht
 * kennt — die Attribute, die die Wurzel in jeder Schemafassung definiert.
 * Bewusst nur die zwei Wurzeln, die das Haus aufzählt.
 */
export const STRUKTUR_MERKMALE = Object.freeze({
    IFCPRODUCT: ['ObjectPlacement', 'Representation'],
    IFCELEMENT: ['ObjectPlacement', 'Representation', 'Tag'],
});

const _untertypCache = new Map();
export function mitUntertypen(typName) {
    const wurzel = String(typName ?? '').toUpperCase().trim();
    if (!wurzel) return [];
    if (_untertypCache.has(wurzel)) return _untertypCache.get(wurzel);

    const out = [];
    for (const [name, meta] of Object.entries(ENTITY_META)) {
        if (name === wurzel) { out.push(name); continue; }
        const kette = meta?.hierarchy;
        if (Array.isArray(kette) && kette.some(h => h.toUpperCase() === wurzel)) out.push(name);
    }
    _untertypCache.set(wurzel, out);
    return out;
}

/**
 * EINE web-ifc-Maschine für alle Quellen.
 *
 * `Init()` instanziiert das wasm-Modul, und das kostet je Aufruf spürbar Zeit
 * (im Test waren sechs Handles rund 50 Sekunden). Eine `IfcAPI` kann aber
 * mehrere Modelle gleichzeitig halten — `OpenModel` gibt je Datei eine eigene
 * Kennung zurück. Also einmal hochfahren und teilen.
 *
 * Die Folge steht in `schliesse()`: dort wird nur das MODELL geschlossen, nie
 * die API entsorgt — ein `Dispose()` risse jedes andere offene Modell mit.
 */
let _api = null;
let _apiStartet = null;
async function _gemeinsameApi(WebIFC, wasmPfad, absolut) {
    if (_api) return _api;
    if (!_apiStartet) {
        _apiStartet = (async () => {
            const api = new WebIFC.IfcAPI();
            api.SetWasmPath(wasmPfad, absolut);
            await api.Init();
            _api = api;
            return api;
        })();
    }
    return _apiStartet;
}

export class IfcQuelle {
    /**
     * Eine Datei öffnen. Gibt `null`, wenn es nicht geht — nie einen halben
     * Handle: ein Handle, der aussieht wie einer und keiner ist, hat uns den
     * Viewer gekostet.
     *
     * @param {object} WebIFC    das web-ifc-MODUL (nicht die Instanz)
     * @param {Uint8Array} bytes die IFC-Datei
     * @param {object} opts      { wasmPfad, absolut }
     */
    static async oeffne(WebIFC, bytes, { wasmPfad = '/', absolut = true, name = '' } = {}) {
        if (!WebIFC?.IfcAPI || !bytes?.length) return null;
        let api = null;
        try {
            api = await _gemeinsameApi(WebIFC, wasmPfad, absolut);
            const modelID = api.OpenModel(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
            if (!Number.isFinite(modelID) || modelID < 0) throw new Error('OpenModel gab keine Kennung');
            const quelle = new IfcQuelle(WebIFC, api, modelID, name);
            // LEBENDNACHWEIS, bevor irgendjemand sie bekommt. Ein Handle, der
            // sich nicht selbst beweisen kann, wird gar nicht erst gereicht.
            if (!quelle.lebt()) throw new Error('Handle antwortet nicht');
            return quelle;
        } catch (fehler) {
            console.warn('cde: IFC-Quelle öffnen', fehler?.message ?? fehler);
            return null;      // die gemeinsame API bleibt stehen — andere Modelle hängen dran
        }
    }

    constructor(WebIFC, api, modelID, name = '') {
        this._modul = WebIFC;
        this._api = api;
        this._modelID = modelID;
        this.name = name;
        this._offen = true;
        this._guidIndex = null;      // erst bei Bedarf
    }

    /**
     * Antwortet dieser Handle wirklich?
     *
     * NICHT „ist ein Objekt da" — das war er vorher auch. Es wird gefragt, ob
     * ein echter Lesezugriff etwas liefert. `IFCPROJECT` gibt es in jedem
     * gültigen Modell genau einmal; kommt hier nichts, ist der Handle tot.
     */
    lebt() {
        if (!this._offen || !this._api) return false;
        try {
            const k = typKonstante(this._modul, 'IFCPROJECT');
            if (k === null) return false;
            return this._anzahl(this._api.GetLineIDsWithType(this._modelID, k)) > 0;
        } catch {
            return false;
        }
    }

    /** web-ifc gibt mal einen Vektor, mal ein Array — beides zählen können. */
    _anzahl(v) {
        if (!v) return 0;
        return typeof v.size === 'function' ? v.size() : (v.length ?? 0);
    }
    _element(v, i) {
        return typeof v.get === 'function' ? v.get(i) : v[i];
    }

    /**
     * Die Typen, die DIESE Datei führt — von web-ifc selbst, nicht aus dem
     * Wörterbuch. Einmal je Handle gelesen.
     * @returns {Array<{typ: string, konstante: number}>}
     */
    typenImModell() {
        if (!this.lebt()) return [];
        if (this._typen) return this._typen;
        const out = [];
        try {
            for (const t of this._api.GetAllTypesOfModel(this._modelID) ?? []) {
                const typ = String(t?.typeName ?? typName(this._modul, t?.typeID) ?? '').toUpperCase();
                if (typ && Number.isFinite(t?.typeID)) out.push({ typ, konstante: t.typeID });
            }
        } catch (fehler) {
            console.warn('cde: Typen des Modells lesen', fehler?.message ?? fehler);
        }
        this._typen = out;
        return out;
    }

    /**
     * Typen des Modells, die das IFC-4.3-Wörterbuch NICHT kennt — aber
     * STRUKTURELL Nachfahren von `wurzel` sind (2026-09-07).
     *
     * DER BEFUND: `IfcCivilElement` (IFC4, Fabios Gelände), `IfcProxy`,
     * `IfcWallStandardCase`, `IfcElectricalElement`, … sind in 4.3 gestrichen.
     * Wer „alle Produkte" über das 4.3-Wörterbuch aufzählt, fragt web-ifc nach
     * diesen Typen NIE — Suchindex, Bauformen-Panel, Gelände-Kandidaten sahen
     * das DGM nicht, und nichts meldete es. Ein Schema-Fehler erster Güte.
     *
     * Die Kur rät keine Vererbung, sie prüft die DEFINITION: ein IfcProduct
     * ist in jeder Schemafassung das, was `ObjectPlacement` und
     * `Representation` trägt; ein IfcElement dazu `Tag`. Geprüft wird an der
     * ersten Zeile des Typs — einmal je Typ, dann gemerkt.
     *
     * @returns {Array<{typ: string, anzahl: number}>}
     */
    fremdeUntertypen(wurzel) {
        const merkmale = STRUKTUR_MERKMALE[String(wurzel ?? '').toUpperCase()];
        if (!merkmale || !this.lebt()) return [];
        if (!this._fremde) this._fremde = new Map();
        const schluessel = String(wurzel).toUpperCase();
        if (this._fremde.has(schluessel)) return this._fremde.get(schluessel);
        const out = [];
        for (const { typ, konstante } of this.typenImModell()) {
            if (ENTITY_META[typ]) continue;                    // das Wörterbuch kennt ihn — kein Fremder
            let v;
            try { v = this._api.GetLineIDsWithType(this._modelID, konstante); } catch { continue; }
            const n = this._anzahl(v);
            if (!n) continue;
            const erste = this.zeile(this._element(v, 0));
            if (!erste || !merkmale.every(m => m in erste)) continue;
            out.push({ typ, anzahl: n });
        }
        this._fremde.set(schluessel, out);
        return out;
    }

    /**
     * Die Dreiecke eines Elements in Modellkoordinaten — unindiziert, 9 Werte
     * je Dreieck, Platzierung angewandt. Für Prüfungen ohne WebGL (Tests) und
     * als Rückfall, wenn kein Fragment vorliegt. `null`, wenn es keine
     * Geometrie gibt.
     * @returns {{positions: Float64Array, triCount: number}|null}
     */
    dreiecke(id) {
        if (!this.lebt() || !Number.isFinite(id)) return null;
        let flat;
        try { flat = this._api.GetFlatMesh(this._modelID, id); } catch { return null; }
        const teile = [];
        let gesamt = 0;
        const n = this._anzahl(flat?.geometries);
        for (let g = 0; g < n; g++) {
            const pg = this._element(flat.geometries, g);
            let geo;
            try { geo = this._api.GetGeometry(this._modelID, pg.geometryExpressID); } catch { continue; }
            const verts = this._api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
            const idx = this._api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
            const m = pg.flatTransformation;
            const out = new Float64Array(idx.length * 3);
            for (let k = 0; k < idx.length; k++) {
                const v = idx[k] * 6;              // web-ifc: x y z nx ny nz je Ecke
                const x = verts[v], y = verts[v + 1], z = verts[v + 2];
                out[k * 3]     = m[0] * x + m[4] * y + m[8] * z + m[12];
                out[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                out[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
            }
            teile.push(out);
            gesamt += out.length;
            if (typeof geo.delete === 'function') geo.delete();
        }
        if (!gesamt) return null;
        const positions = new Float64Array(gesamt);
        let o = 0;
        for (const t of teile) { positions.set(t, o); o += t.length; }
        return { positions, triCount: gesamt / 9 };
    }

    /**
     * Die ExpressIDs eines Typs.
     *
     * Mit `untertypen` kommen die Nachfahren aus dem 4.3-Wörterbuch — UND die
     * Typen, die das Wörterbuch nicht kennt, aber strukturell dazugehören
     * (`fremdeUntertypen`). Ohne den zweiten Teil fehlte jedes Bauteil aus
     * einer älteren Schemafassung, still.
     *
     * @param {string|string[]} typ
     * @param {object} opts
     * @param {boolean} [opts.untertypen=false] auch alle abgeleiteten Typen
     * @returns {number[]}
     */
    ids(typ, { untertypen = false } = {}) {
        if (!this.lebt()) return [];
        const namen = Array.isArray(typ) ? typ : [typ];
        const gesucht = untertypen
            ? namen.flatMap(n => [...mitUntertypen(n), ...this.fremdeUntertypen(n).map(f => f.typ)])
            : namen.map(n => String(n).toUpperCase());
        const out = [];
        const gesehen = new Set();
        for (const name of gesucht) {
            const k = typKonstante(this._modul, name);
            if (k === null) continue;              // Typ gibt es in dieser Fassung nicht
            let v;
            try { v = this._api.GetLineIDsWithType(this._modelID, k); } catch { continue; }
            const n = this._anzahl(v);
            for (let i = 0; i < n; i++) {
                const id = this._element(v, i);
                if (!gesehen.has(id)) { gesehen.add(id); out.push(id); }
            }
        }
        return out;
    }

    /**
     * Eine Zeile lesen.
     *
     * `tief: false` ist die Vorgabe und mit Absicht: `GetLine(..., true)` löst
     * ALLE Verweise rekursiv auf, und bei einem Produkt hängt daran der ganze
     * Darstellungsbaum. Über tausend Bauteile wird das sehr teuer.
     */
    zeile(id, { tief = false } = {}) {
        if (!this.lebt() || !Number.isFinite(id)) return null;
        try { return this._api.GetLine(this._modelID, id, tief); } catch { return null; }
    }

    /**
     * Die KATEGORIE eines Elements — als IFC-Klassenname, nicht als Zahl.
     *
     * `zeile(id).type` ist die Typkonstante (`1077100507`), und wer sie roh
     * als Kategorie weitergibt, sucht in Typprofilen und Bauformregeln nach
     * einer Ziffernfolge: kein Treffer, keine Meldung. Deshalb geht der Weg
     * zur Kategorie durch diese Methode und nirgends daran vorbei.
     *
     * Nimmt eine ExpressID oder eine bereits gelesene Zeile.
     */
    kategorieVon(idOderZeile) {
        const z = (idOderZeile && typeof idOderZeile === 'object')
            ? idOderZeile : this.zeile(idOderZeile);
        return typName(this._modul, z?.type) ?? '';
    }

    /** Alle Zeilen eines Typs — bequem, aber bei grossen Mengen `ids` nehmen. */
    alle(typ, opts = {}) {
        return this.ids(typ, opts).map(id => this.zeile(id, opts)).filter(Boolean);
    }

    /** Wie viele gibt es von diesem Typ? Ohne die Zeilen zu lesen. */
    zaehle(typ, opts = {}) {
        return this.ids(typ, opts).length;
    }

    /**
     * ExpressID zu einer GlobalId.
     *
     * Der Index wird beim ersten Zugriff über ALLE `IfcRoot`-Nachfahren
     * gebaut — also über alles, was eine GlobalId überhaupt haben kann, nicht
     * über eine Typliste. Das ist der Unterschied zu `buildSearchIndex`, das
     * 30 Kategorien fest verdrahtet und alles andere verliert.
     */
    nachGlobalId(guid) {
        if (!guid || !this.lebt()) return null;
        if (!this._guidIndex) {
            this._guidIndex = new Map();
            for (const id of this.ids('IFCROOT', { untertypen: true })) {
                const g = this.zeile(id)?.GlobalId?.value;
                if (g && !this._guidIndex.has(g)) this._guidIndex.set(g, id);
            }
        }
        return this._guidIndex.get(guid) ?? null;
    }

    /**
     * Die WELTHÖHE der Platzierung je Bauteil, wie sie in der DATEI steht.
     *
     * Wozu: Der Ladeversatz der CDE kommt aus `-model.object.position` — und
     * dessen Y-Anteil ist 0, obwohl die Geometrie sehr wohl in der Höhe
     * verschoben wurde. `COORDINATE_TO_ORIGIN` backt die Höhenverschiebung in
     * die Scheitelpunkte, `autoCoordinate` setzt die Objektlage aus der
     * MapConversion (deren OrthogonalHeight hier 0 ist). Zwei Mechanismen, und
     * nur einer steht in `object.position`.
     *
     * Statt zu raten, was die Bibliothek getan hat, wird gemessen: dieselbe
     * Platzierung einmal aus der Datei, einmal aus den Fragmenten
     * (`model.getPositions`), und die Differenz IST der Versatz.
     *
     * Die Kette `IfcLocalPlacement.PlacementRelTo` wird dabei aufsummiert —
     * ein Bauteil hängt über Geschoss, Bauwerk und Gelände am Ursprung.
     *
     * @returns {Map<number, number>} ExpressID → Z in Dateikoordinaten
     */
    platzierungsHoehen(ids) {
        const out = new Map();
        for (const [id, p] of this.platzierungen(ids)) out.set(id, p.y);
        return out;
    }

    /**
     * Der Platzierungspunkt je Bauteil, dreidimensional, in DREI-Konvention.
     *
     * Gebraucht für die NETZTOPOLOGIE (Stufe 14.5): Rohranfang und Rohrende
     * liegen in Fabios Dateien exakt auf den Schachtkoordinaten — auf 0,000 m.
     * Das ist die einzige echte Verkettung, die dort steht: es gibt in keiner
     * der Dateien einen einzigen `IfcDistributionPort`.
     *
     * Die Kette `PlacementRelTo` wird aufsummiert. ROTATIONEN DER ELTERN
     * BLEIBEN UNBERÜCKSICHTIGT — für die hier vorkommenden Ketten
     * (Site → Building → Bauteil, alle ohne Drehung) ist das exakt, und der
     * Vergleich mit den Pset-Sohlhöhen bestätigt es an 524 Bauteilen. Käme
     * ein gedrehtes Bauwerk vor, wäre die volle Matrix nötig; sie steht in
     * `AxisAnnotations`.
     *
     * @returns {Map<number, {x, y, z}>} y ist die HÖHE, z = −Nord (three-Konvention)
     */
    platzierungen(ids) {
        const out = new Map();
        if (!this.lebt()) return out;
        const tiefeGrenze = 16;                 // gegen zyklische Ketten

        const punktVon = (plcId, tiefe = 0) => {
            if (!Number.isFinite(plcId) || tiefe > tiefeGrenze) return { x: 0, y: 0, z: 0 };
            const lp = this.zeile(plcId);
            if (!lp) return { x: 0, y: 0, z: 0 };
            const ax = this.zeile(lp.RelativePlacement?.value);
            const c = ax ? this.zeile(ax.Location?.value)?.Coordinates : null;
            const z = (i) => Number(c?.[i]?.value ?? 0) || 0;
            const eltern = punktVon(lp.PlacementRelTo?.value, tiefe + 1);
            // IFC-Raum → three: X bleibt, IFC-Z ist die Höhe, IFC-Y (Nord) liegt
            // auf MINUS z — dieselbe Konvention wie das Netz aus `GetFlatMesh`
            // und die Achslese (AxisAnnotations, seit 2026-09-08 verifiziert).
            return { x: eltern.x + z(0), y: eltern.y + z(2), z: eltern.z - z(1) };
        };

        for (const id of ids ?? this.ids('IFCELEMENT', { untertypen: true })) {
            const el = this.zeile(id);
            const plc = el?.ObjectPlacement?.value;
            if (Number.isFinite(plc)) out.set(id, punktVon(plc));
        }
        return out;
    }

    /**
     * Die HÖHENHÜLLE je Bauteil, aus der DATEI, in derselben Achslage wie die
     * Fragmente (Y ist oben).
     *
     * Wozu eine Hülle und nicht die Platzierung: Der Versatz wird bestimmt,
     * indem dieselbe Größe zweimal gelesen wird — einmal aus der Datei, einmal
     * aus dem geladenen Modell. `platzierungsHoehen` taugt dafür NICHT, und
     * das ist gemessen, nicht vermutet:
     *
     *   `model.getPositions()` liefert die MITTE eines Bauteils, die
     *   IFC-Platzierung dagegen einen Bezugspunkt des Autors. Am echten Netz
     *   (6275_ENQUIER) sitzt er bei 27 Schächten exakt auf der Unterkante und
     *   bei 24 Haltungen am oberen Ende — die Differenz beider Größen streut
     *   dadurch um 10,2 m. Genau diese 10,2 m hat die Messung gemeldet und
     *   deshalb (richtig) nichts gesetzt.
     *
     * Eine Hülle hat dieses Problem nicht: `model.getBoxes()` und diese
     * Methode beschreiben DENSELBEN Körper. Unter- und Oberkante müssen darum
     * beide denselben Versatz ergeben — das ist die eingebaute Gegenprobe.
     *
     * Teuer (die Geometrie wird ausgewertet), deshalb immer nur an einer
     * Stichprobe aufrufen.
     *
     * @returns {Map<number, {min: number, max: number}>} in Dateikoordinaten
     */
    hoehenHuellen(ids) {
        const out = new Map();
        if (!this.lebt() || !ids?.length) return out;
        for (const id of ids) {
            try {
                const flach = this._api.GetFlatMesh(this._modelID, id);
                let lo = Infinity, hi = -Infinity;
                const n = flach.geometries.size();
                for (let i = 0; i < n; i++) {
                    const pg = flach.geometries.get(i);
                    const g = this._api.GetGeometry(this._modelID, pg.geometryExpressID);
                    const v = this._api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
                    const m = pg.flatTransformation;
                    // Scheitelpunkte sind (x,y,z,nx,ny,nz); Y ist die Höhe.
                    for (let k = 0; k < v.length; k += 6) {
                        const y = m[1] * v[k] + m[5] * v[k + 1] + m[9] * v[k + 2] + m[13];
                        if (y < lo) lo = y;
                        if (y > hi) hi = y;
                    }
                    g.delete?.();
                }
                if (lo < Infinity) out.set(id, { min: lo, max: hi });
            } catch { /* ein Bauteil ohne auswertbare Geometrie ist kein Fehler */ }
        }
        return out;
    }

    /**
     * Die Merkmale aller Bauteile — EIN Durchlauf über die Beziehungen.
     *
     * Warum nicht über `getData` je Bauteil: Der IfcLoader importiert nur einen
     * schmalen Attributsatz, und ein Aufruf je Bauteil wäre bei tausend
     * Haltungen tausend Aufrufe. `IFCRELDEFINESBYPROPERTIES` steht dagegen
     * genau einmal je Zuordnung in der Datei; ein Lauf darüber liefert alles.
     *
     * In Fabios Netzen hängt an jedem Bauteil ein `QG_ISYBAU_Data` mit acht
     * Feldern: Objektbezeichnung, Kanalart, Material, Baujahr, Sohlenhoehe,
     * Deckelhoehe, Profilbreite, Profilhoehe.
     *
     * FLACH, ohne Satznamen: die Namen sind innerhalb einer Datei eindeutig,
     * und ein zweistufiger Zugriff („welcher Satz war das nochmal?") hilft
     * niemandem. Kollidieren zwei Sätze doch, gewinnt der zuletzt gelesene —
     * das ist selten und allemal besser als eine Schachtel mehr.
     *
     * @returns {Map<number, Record<string, string|number>>}
     */
    merkmale() {
        const out = new Map();
        if (!this.lebt()) return out;
        for (const rel of this.alle('IFCRELDEFINESBYPROPERTIES', { tief: true })) {
            const satz = rel?.RelatingPropertyDefinition;
            const werte = {};
            let hatWas = false;
            for (const pr of satz?.HasProperties ?? []) {
                const name = pr?.Name?.value;
                if (!name) continue;
                werte[name] = pr?.NominalValue?.value ?? null;
                hatWas = true;
            }
            if (!hatWas) continue;
            for (const o of rel.RelatedObjects ?? []) {
                if (!Number.isFinite(o?.expressID)) continue;
                out.set(o.expressID, { ...(out.get(o.expressID) ?? {}), ...werte });
            }
        }
        return out;
    }

    /** Das Schema der Datei, falls die Bibliothek es hergibt. */
    schema() {
        try { return this._api.GetModelSchema?.(this._modelID) ?? null; } catch { return null; }
    }

    /** Die rohe API — nur für Leser, die mehr brauchen (z. B. Georeferenz). */
    get api() { return this._offen ? this._api : null; }
    get modelID() { return this._modelID; }

    /**
     * Schliessen und den wasm-Speicher freigeben.
     *
     * MUSS beim Entladen eines Modells gerufen werden, sonst liegt die Datei
     * für immer im Heap — und sie liegt dort ohnehin schon ein zweites Mal
     * neben den Fragmenten.
     */
    schliesse() {
        if (!this._offen) return;
        this._offen = false;
        this._guidIndex = null;
        // NUR das Modell schliessen, nicht die API entsorgen: sie ist
        // gemeinsam, und ein `Dispose()` risse jedes andere offene Modell mit.
        try { this._api.CloseModel(this._modelID); } catch { /* egal */ }
        this._api = null;
    }
}
