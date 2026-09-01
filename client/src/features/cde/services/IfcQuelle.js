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
import { typKonstante } from './WebIfcTypen.js';

/**
 * Alle Nachfahren eines IFC-Typs, er selbst eingeschlossen.
 *
 * Aus `ENTITY_META`, wo jede Klasse ihre volle `hierarchy` trägt. Einmal je
 * Typ gerechnet und gemerkt — der Baum hat 1.418 Einträge, und die Abfrage
 * käme sonst bei jedem Lesen wieder.
 */
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
     * Die ExpressIDs eines Typs.
     *
     * @param {string|string[]} typ
     * @param {object} opts
     * @param {boolean} [opts.untertypen=false] auch alle abgeleiteten Typen
     * @returns {number[]}
     */
    ids(typ, { untertypen = false } = {}) {
        if (!this.lebt()) return [];
        const namen = Array.isArray(typ) ? typ : [typ];
        const gesucht = untertypen ? namen.flatMap(mitUntertypen) : namen.map(n => String(n).toUpperCase());
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
