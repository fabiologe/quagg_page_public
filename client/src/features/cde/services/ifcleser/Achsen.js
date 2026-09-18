/**
 * Achsen — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Die Achsen je Modell aus der Datei lesen (Achs-Repräsentation, Extrusion).
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */
import { extractAxisPolylines } from '../AxisAnnotations.js';
import { netzrollenWurzeln } from '../bauform/Typprofile.js';

/**
 * Alle Elemente eines Modells, deren Familie im Katalog diese Netzrolle trägt
 * (Teil XXIII, AE) — je Wurzel mit Untertypen, ohne Doppelte.
 */
function _idsDerNetzrolle(quelle, rolle) {
    const ids = new Set();
    for (const w of netzrollenWurzeln(rolle)) {
        try { for (const id of quelle.ids(w, { untertypen: true }) ?? []) ids.add(id); } catch { /* Familie im Modell unbekannt */ }
    }
    return [...ids];
}

export async function leseAchsen(engine) {
    // ROH = wie geliefert. `_achsen`/`_knoten` sind die WIRKSAMEN Sichten
    // (mit den `lage`-Verschiebungen des Journals, siehe `_lagenAnwenden`).
    engine._achsenRoh = new Map();
    engine._knotenRoh = new Map();
    engine._merkmale = new Map();
    let n = 0;
    for (const api of engine.getWebIfcAPIs()) {
        // In WELTKOORDINATEN, nicht roh: alles andere in der CDE rechnet
        // in der Three-Welt, und die Umrechnung nach m NN steht an genau
        // einer Stelle (`Hoehenbezug`). Zwei Höhenwege wären zwei
        // Wahrheiten — davon hatte dieses Feature genug.
        const off = engine._coordOffsets.get(api.fragmentModelId) ?? null;
        let achsen = [];
        try {
            // Welche Familien KANTEN im Netz sind, sagt der Katalog (`netzrolle`
            // am Typprofil, Teil XXIII AE) — nicht eine Liste hier.
            achsen = extractAxisPolylines(api.quelle, { coordOffset: off, categories: netzrollenWurzeln('kante') });
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
        engine._achsenRoh.set(api.fragmentModelId, karte);
        n += karte.size;

        // DIE KNOTEN gleich mit: die Schächte, an denen die Haltungen
        // hängen. Ohne sie gibt es keine Topologie — und ohne Topologie
        // keinen einzigen Netz-Befund. Gelesen wird nur die PLATZIERUNG,
        // keine Geometrie; das kostet nichts.
        const knoten = new Map();
        // Welche Familien KNOTEN sind, sagt ebenso der Katalog.
        for (const [id, punkt] of api.quelle.platzierungen(_idsDerNetzrolle(api.quelle, 'knoten'))) {
            const kZeile = api.quelle.zeile(id) ?? null;
            knoten.set(id, {
                punkt: off
                    ? { x: punkt.x - off.x, y: punkt.y - (off.y ?? 0), z: punkt.z - off.z }
                    : punkt,
                globalId: kZeile?.GlobalId?.value ?? null,
                name: kZeile?.Name?.value ?? '',
            });
        }
        engine._knotenRoh.set(api.fragmentModelId, knoten);

        // Die Merkmale gleich mit — ein Durchlauf über die Beziehungen.
        // Material, Baujahr und Kanalart stehen in Fabios Dateien an jedem
        // Bauteil und wurden bisher nirgends gelesen.
        engine._merkmale.set(api.fragmentModelId, api.quelle.merkmale());
    }
    engine._lagenAnwenden();
    return n;
}
