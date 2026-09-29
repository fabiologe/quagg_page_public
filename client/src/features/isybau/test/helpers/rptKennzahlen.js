/**
 * Kennzahlen aus dem SWMM-Originalbericht (.rpt-Text) — mit eigenen regulären
 * Ausdrücken gelesen, NICHT über den RptParser, der ja selbst geprüft wird.
 *
 * Gemeinsam genutzt von test/e2eTutorialnetz.test.js (Durchstich) und
 * test/kennwerteUebungsnetz.test.js (Messlatte der Modellannahmen,
 * doc/GrenzenEvaluierung.md).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pfad = (rel) => fileURLToPath(new URL(rel, import.meta.url));
export const TUTORIAL_XML = readFileSync(pfad('../../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml'), 'latin1');
export const KOSTRA = JSON.parse(readFileSync(pfad('../fixtures/kostra_beispielstandort.json'), 'utf8'));

/** KOSTRA-Zeile einer Wiederkehrzeit ({Dauer: Regenspende}) aus der Fixture. */
export function kostraZeile(T = 'RN_003A') {
    const zeile = {};
    for (const d of Object.keys(KOSTRA)) if (KOSTRA[d]?.[T]) zeile[d] = KOSTRA[d][T];
    return zeile;
}

/**
 * Übungsnetz so herrichten, wie es die Übung verlangt: die drei Profile mit
 * Höhe 0 korrigiert, beide Auslässe als Auslaufbauwerk, fehlende Abflussbeiwerte
 * aus den Programmvorgaben. Die Module kommen als Parameter, weil der Store erst
 * NACH vi.mock(WorkerController) importiert werden darf.
 */
export function uebungsnetzHerrichten(store, { parseIsybauXML, getRunoffCoeff }) {
    store.loadParsedData(parseIsybauXML(TUTORIAL_XML));
    for (const [id, h] of [['R-0030', 0.5], ['80454891V1', 0.3], ['80454893V2', 0.3]]) {
        store.edges.get(id).profile.height = h;
    }
    for (const id of ['AL1_RBB', 'AL2_RRB']) store.nodes.get(id).bauwerkstyp = 5;
    for (const a of store.areaArray) {
        if (!(a.runoffCoeff > 0)) a.runoffCoeff = getRunoffCoeff(a.property, a.function, a.slope);
    }
    return store;
}

/** Ein Bilanzabschnitt („Flow Routing Continuity" …) bis einschließlich Bilanzfehler. */
export const abschnitt = (rpt, titel) => {
    const start = rpt.indexOf(titel);
    if (start < 0) return '';
    const ende = rpt.indexOf('Continuity Error (%)', start);
    return rpt.slice(start, rpt.indexOf('\n', ende));
};

/** Erste Zahl hinter „Label ......" */
export const zahlNach = (text, label) => {
    const m = text.match(new RegExp(label.replace(/[()]/g, '\\$&') + '\\s*\\.+\\s+([-\\d.]+)'));
    return m ? parseFloat(m[1]) : NaN;
};

/** Zweite Zahl hinter „Label ......" — in den Bilanzen die Spalte in mm. */
const mmNach = (text, label) => {
    const m = text.match(new RegExp(label + '\\s*\\.+\\s+[-\\d.]+\\s+([-\\d.]+)'));
    return m ? parseFloat(m[1]) : NaN;
};

export const niederschlagMm = (rpt) => mmNach(rpt, 'Total Precipitation');

/** „Node Depth Summary": Spalte „Reported Max Depth" (Maximum über die Ausgabeschritte). */
export const berichteteMaxTiefe = (rpt, knoten) => {
    const block = rpt.slice(rpt.indexOf('Node Depth Summary'), rpt.indexOf('Node Inflow Summary'));
    const zeile = block.split('\n').find(l => l.trim().split(/\s+/)[0] === knoten);
    return zeile ? parseFloat(zeile.trim().split(/\s+/).pop()) : NaN;
};

/**
 * Die Messgrößen der Grenzen-Evaluierung:
 *  psiEff      Oberflächenabfluss / Niederschlag (Runoff Quantity Continuity)
 *  qAuslaesse  Summe der Spitzenabflüsse aller Auslässe in l/s (Outfall Loading Summary)
 *  ueberstau   Zahl der Knoten in „Node Flooding Summary"
 *  volllauf    Zahl der Haltungen in „Conduit Surcharge Summary"
 *  bilanz      Bilanzfehler Abflusstransport in %
 */
export function kennzahlen(rpt) {
    const runoff = abschnitt(rpt, 'Runoff Quantity Continuity');
    const niederschlag = mmNach(runoff, 'Total Precipitation');
    const oberflaeche = mmNach(runoff, 'Surface Runoff');

    const zeilenIn = (titel, leer, bis, muster) => {
        const i = rpt.indexOf(titel);
        if (i < 0 || leer.test(rpt.slice(i, i + 300))) return 0;
        // Der Titel ist mit Sternchen unterstrichen — erst dahinter nach dem Ende suchen
        const nachTitel = rpt.indexOf('\n', rpt.indexOf('***', i + titel.length));
        const j = rpt.indexOf(bis, nachTitel);
        return rpt.slice(i, j > 0 ? j : undefined).split('\n').filter(l => muster.test(l)).length;
    };
    const ueberstau = zeilenIn('Node Flooding Summary', /No nodes were flooded/, '\n  ****',
        /^\s+\S+\s+[\d.]+\s+[\d.]+\s+\d+\s+\d{2}:\d{2}/);
    const volllauf = zeilenIn('Conduit Surcharge Summary', /No conduits were surcharged/, 'Analysis begun',
        /^\s+\S+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+/);

    const ol = rpt.indexOf('Outfall Loading Summary');
    const olBlock = ol < 0 ? '' : rpt.slice(ol, rpt.indexOf('Link Flow Summary', ol));
    const qAuslaesse = olBlock.split('\n')
        .map(l => l.trim().split(/\s+/))
        .filter(p => p.length >= 5 && p[0] !== 'System' && Number.isFinite(parseFloat(p[1])) && Number.isFinite(parseFloat(p[3])))
        .reduce((s, p) => s + parseFloat(p[3]) * 1000, 0);

    return {
        niederschlag,
        psiEff: oberflaeche / niederschlag,
        qAuslaesse,
        ueberstau,
        volllauf,
        bilanz: zahlNach(abschnitt(rpt, 'Flow Routing Continuity'), 'Continuity Error (%)'),
    };
}

/** Flächengewichteter Abflussbeiwert der Eingabe (Σ ψ·A / Σ A). */
export const psiEingabe = (areas) => {
    const summeA = areas.reduce((s, a) => s + (+a.size || 0), 0);
    return areas.reduce((s, a) => s + (+a.size || 0) * (+a.runoffCoeff || 0), 0) / summeA;
};
