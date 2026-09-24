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
import { MITGELIEFERTE_REGELN, bauformAusRegel } from '../bauform/Bauformregeln.js';
import { achseAusMerkmalen, knotenAusMerkmalen } from './AchsenAusMerkmalen.js';

/**
 * Alle Elemente eines Modells, deren Familie im Katalog diese Netzrolle trägt
 * (Teil XXIII, AE) — je Wurzel mit Untertypen, ohne Doppelte. Mit dem
 * WIRKSAMEN Profilsatz (Büro/Projekt), nicht nur dem eingebauten — sonst
 * erreichte eine eigene `netzrolle` am Typprofil die Achslese nie.
 */
function _idsDerNetzrolle(quelle, rolle, profile = null) {
    const ids = new Set();
    for (const w of profile ? netzrollenWurzeln(rolle, profile) : netzrollenWurzeln(rolle)) {
        try { for (const id of quelle.ids(w, { untertypen: true }) ?? []) ids.add(id); } catch { /* Familie im Modell unbekannt */ }
    }
    return [...ids];
}

/**
 * Elemente, die eine BAUFORMREGEL zur Netzrolle macht (Tragfähig, T6) — der
 * ProVI-Proxy „Haltung" ist eine Kante, weil die Regel es sagt, nicht seine
 * Klasse. Je Element die Regel, die gewinnt (dieselbe Wahl wie `bauformAusRegel`
 * überall sonst); nur Kategorien, die eine Netzrollen-Regel überhaupt nennt.
 *
 * @returns {Map<number, object>} localId → Regel
 */
function _regelElemente(engine, modelId, quelle, rolle, regeln) {
    const out = new Map();
    const kategorien = new Set(regeln
        .filter(r => r?.enabled !== false && r?.netzrolle === rolle && r?.bauform)
        .map(r => String(r?.condition?.category ?? '').toUpperCase())
        .filter(Boolean));
    for (const k of kategorien) {
        let ids = [];
        try { ids = quelle.ids(k, { untertypen: true }) ?? []; } catch { continue; }
        for (const id of ids) {
            const regel = bauformAusRegel(regeln, engine._gelaendeKontext(modelId, id, { mitMerkmalen: true }))?.regel;
            if (regel?.netzrolle === rolle) out.set(id, regel);
        }
    }
    return out;
}

export async function leseAchsen(engine) {
    // ROH = wie geliefert. `_achsen`/`_knoten` sind die WIRKSAMEN Sichten
    // (mit den `lage`-Verschiebungen des Journals, siehe `_lagenAnwenden`).
    engine._achsenRoh = new Map();
    engine._knotenRoh = new Map();
    engine._merkmale = new Map();
    engine._achsenHinweise = new Map();
    // Die Regeln reicht der Viewer herein (`setzeNetzregeln`) — die Engine
    // liest keinen Store. Ohne Aufruf gelten die mitgelieferten.
    const regeln = engine._netzregeln ?? MITGELIEFERTE_REGELN;
    const profile = engine._netzprofile ?? null;
    let n = 0;
    for (const api of engine.getWebIfcAPIs()) {
        // In WELTKOORDINATEN, nicht roh: alles andere in der CDE rechnet
        // in der Three-Welt, und die Umrechnung nach m NN steht an genau
        // einer Stelle (`Hoehenbezug`). Zwei Höhenwege wären zwei
        // Wahrheiten — davon hatte dieses Feature genug.
        const off = engine._coordOffsets.get(api.fragmentModelId) ?? null;
        const hinweise = [];
        engine._achsenHinweise.set(api.fragmentModelId, hinweise);
        // Die Merkmale ZUERST: die Regeln fragen danach, und Achsen aus
        // Merkmalen bestehen daraus. Ein Durchlauf über die Beziehungen.
        const merkmale = api.quelle.merkmale();
        engine._merkmale.set(api.fragmentModelId, merkmale);
        let achsen = [];
        try {
            // Welche Familien KANTEN im Netz sind, sagt der Katalog (`netzrolle`
            // am Typprofil, Teil XXIII AE) — nicht eine Liste hier.
            achsen = extractAxisPolylines(api.quelle, { coordOffset: off,
                categories: profile ? netzrollenWurzeln('kante', profile) : netzrollenWurzeln('kante') });
        } catch (fehler) {
            // Vorher: `continue` — alle Achsen des Modells fielen still weg.
            console.warn('cde: achsen lesen', fehler?.message ?? fehler);
            hinweise.push(`Achsen der Datei nicht lesbar: ${fehler?.message ?? fehler}`);
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
        for (const [id, punkt] of api.quelle.platzierungen(_idsDerNetzrolle(api.quelle, 'knoten', profile))) {
            const kZeile = api.quelle.zeile(id) ?? null;
            knoten.set(id, {
                punkt: off
                    ? { x: punkt.x - off.x, y: punkt.y - (off.y ?? 0), z: punkt.z - off.z }
                    : punkt,
                globalId: kZeile?.GlobalId?.value ?? null,
                name: kZeile?.Name?.value ?? '',
            });
        }

        // KNOTEN UND KANTEN AUS REGELN (Tragfähig, T6): Proxys, die eine
        // Bauformregel zur Netzrolle macht. Ihr Ort steht in den Merkmalen,
        // deren Namen die Regel nennt (`knotenAus`/`achseAus`). Nennt sie
        // keine, gibt es nichts zu lesen — dann sagt es der Hinweis, statt
        // dass die Haltung still fehlt.
        const jeKennung = new Map();
        const ohneOrt = (was, zeile, fehlt) => hinweise.push(
            `${was} „${zeile?.Name?.value ?? '?'}" (#${zeile?.expressID ?? '?'}) ohne ${fehlt.join(', ')}`);
        for (const [id, regel] of _regelElemente(engine, api.fragmentModelId, api.quelle, 'knoten', regeln)) {
            const kZeile = api.quelle.zeile(id) ?? null;
            if (!regel.knotenAus) { ohneOrt('Knoten', kZeile, [`Merkmalsangabe an der Regel „${regel.name ?? regel.id}"`]); continue; }
            const k = knotenAusMerkmalen(regel.knotenAus, merkmale.get(id), { off });
            if (k.fehlt) { ohneOrt('Knoten', kZeile, k.fehlt); continue; }
            knoten.set(id, { punkt: k.punkt, globalId: kZeile?.GlobalId?.value ?? null, name: kZeile?.Name?.value ?? '' });
            if (jeKennung.has(k.kennung)) hinweise.push(`Schachtbezeichnung „${k.kennung}" doppelt — die Haltungen hängen am ersten`);
            else jeKennung.set(k.kennung, k);
        }
        for (const [id, regel] of _regelElemente(engine, api.fragmentModelId, api.quelle, 'kante', regeln)) {
            const zeile = api.quelle.zeile(id) ?? null;
            if (!regel.achseAus) { ohneOrt('Haltung', zeile, [`Merkmalsangabe an der Regel „${regel.name ?? regel.id}"`]); continue; }
            const a = achseAusMerkmalen(regel.achseAus, merkmale.get(id), jeKennung);
            if (a.fehlt) { ohneOrt('Haltung', zeile, a.fehlt); continue; }
            karte.set(id, {
                globalId: zeile?.GlobalId?.value ?? null,
                name: zeile?.Name?.value ?? '',
                kategorie: api.quelle.kategorieVon?.(zeile) ?? null,
                anfang: a.anfang, ende: a.ende, polyline: a.polyline,
                laenge: a.laenge, gefaelle: a.gefaelle, dn: a.dn, quelle: a.quelle,
            });
            n += 1;
        }
        engine._knotenRoh.set(api.fragmentModelId, knoten);
    }
    engine._lagenAnwenden();
    return n;
}
