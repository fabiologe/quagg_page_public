/**
 * Die Proben für den Goldstandard der Werkzeuge, die A6 aus Daten erzeugt
 * (Teil XXIII). Dieselben Eingaben liefen VOR dem Umbau durch die alten
 * Hooks (Fixture `werkzeuge_vor_a6.json`) und laufen jetzt durch die neuen.
 * Zufallskennungen (`cde-…`, `ab-…`) werden in der Reihenfolge ihres
 * Auftretens ersetzt — verglichen wird alles andere.
 */
import { nachId } from '../../services/Bearbeitungen.js';

const UR = { globalId: '1Ur0Gelaende0Vertrag00', category: 'IFCGEOGRAPHICELEMENT', name: 'Urgelände',
             hoehenversatz: 300, quellmass: { pruefmass: { n: 4, summe: 12.5 }, cell: 2 }, modellSha: 'sha-ur' };
const RING = [{ x: 0, y: 10, z: 0 }, { x: 20, y: 10.5, z: 0 }, { x: 20, y: 11, z: 15 }, { x: 0, y: 10.4, z: 15 }];
const LINIE = [{ x: 0, y: 10, z: 0 }, { x: 30, y: 9.4, z: 5 }, { x: 55, y: 9.1, z: 5 }];

const ROHR = {
    globalId: '2Rohr0Haltung000000001', category: 'IFCPIPESEGMENT', name: 'H-001', hoehenversatz: 300,
    anker: { x: 5, y: -1.2, z: 3 }, bezugshoehe: -1.6, oberkante: -0.8,
    achse: { anfang: { x: 0, y: -1.5, z: 0 }, ende: { x: 10, y: -1.7, z: 6 }, laenge: 11.66, dn: 300 },
    stand: { profilGroesse: 400, sohlhoeheAnfang: 298.45, kg: '411', din277: null, massnahme: 'renovierung' },
};
const NACKT = { globalId: '3Fundament0A0000000001', category: 'IFCFOOTING', name: 'F1', hoehenversatz: 300,
                anker: { x: 1, y: 2, z: 3 }, stand: {} };

export const PROBEN = [
    // ── Gelände ──
    { id: 'gerinne-einschneiden', el: UR, zug: LINIE, werte: [
        { sohleAnfang: 308.2, sohleEnde: 307.6, sohlbreite: 1.2, boeschung: 2 },
        { sohleAnfang: 308.2, sohleEnde: '', sohlbreite: '', boeschung: '' },
        { sohleAnfang: '' } ] },
    { id: 'graben-ausheben', el: UR, zug: RING, werte: [
        { mass: 2, neigung: 1.5, auflockerung: 1.25 }, { mass: 3, neigung: '' }, { mass: 0 } ] },
    { id: 'auffuellen', el: UR, zug: RING, werte: [
        { ziel: 'hoehe', mass: 1, neigung: 1.5 }, { ziel: 'ur' }, { ziel: 'hoehe', mass: -1 } ] },
    { id: 'boeschung-anschliessen', el: UR, zug: LINIE, werte: [
        { kante: 1, seite: 'rechts', neigung: 1.5 }, { kante: -0.5, seite: 'links', neigung: 2 }, { neigung: 0 } ] },
    { id: 'planum-herstellen', el: { ...UR, bezugshoehe: 309.4 }, zug: RING, werte: [
        { hoehe: 309.5, neigung: 1.5 }, { hoehe: 309.5, neigung: '' }, { hoehe: '' } ] },
    // ── Setzer ──
    { id: 'profilgroesse-setzen', el: ROHR, werte: [{ groesse: 500 }, { groesse: 'HEB 200' }] },
    { id: 'profilform-setzen', el: ROHR, werte: [{ profilform: 'trapez' }] },
    { id: 'staerke-setzen', el: NACKT, werte: [{ dicke: 0.35 }] },
    { id: 'sohlhoehen-setzen', el: ROHR, werte: [{ anfang: 298.4, ende: 298.1 }, { anfang: 'x', ende: 1 }] },
    { id: 'sohlhoehen-setzen', el: { ...ROHR, stand: {} }, werte: [{ anfang: 298.4, ende: 298.1 }] },
    { id: 'deckelhoehe-setzen', el: ROHR, werte: [{ deckel: 301.2 }, { deckel: '' }] },
    { id: 'deckelhoehe-setzen', el: { ...ROHR, stand: { deckelhoehe: 301.05 } }, werte: [{ deckel: 301.2 }] },
    { id: 'bezugshoehe-setzen', el: ROHR, werte: [{ hoehe: 298 }] },
    { id: 'bezugshoehe-setzen', el: { ...NACKT, anker: null }, werte: [{ hoehe: 298 }] },
    { id: 'kg-setzen', el: ROHR, werte: [{ kg: '412' }, { kg: '' }] },
    { id: 'din277-setzen', el: ROHR, werte: [{ din277: 'NUF 1' }, { din277: null }] },
    { id: 'massnahme-setzen', el: ROHR, werte: [{ massnahme: 'erneuerung' }, { massnahme: '' }] },
    { id: 'umbenennen', el: ROHR, werte: [{ muster: 'H-{n:03}', beginnBei: 7 }, { muster: '{alt}-neu', beginnBei: 1 }, { muster: '' }],
      kontexte: [{}, { nummer: 2 }] },
];

/** Alles, was ein Werkzeug zu diesen Eingaben sagt — mit ersetzten Zufallskennungen. */
export function goldVon() {
    const aus = [];
    for (const p of PROBEN) {
        const b = nachId(p.id);
        const r = { id: p.id, gruppe: b.gruppe, art: b.art, eingabe: b.eingabe ?? null, mindestPunkte: b.mindestPunkte ?? null,
                    bauform: b.bauform, mehrfach: !!b.mehrfach, nurFestlegung: !!b.nurFestlegung,
                    brauchtRolle: b.brauchtRolle ?? null, hoehenAus: b.hoehenAus ?? null,
                    felder: b.felder, vorbelegung: b.vorbelegung?.(p.el) ?? null,
                    nachZug: b.nachZug && p.zug ? b.nachZug(p.el, p.zug) : null, anwenden: [] };
        for (const w of p.werte) {
            for (const k of p.kontexte ?? [{}]) r.anwenden.push(b.anwenden(p.el, w, { ...k, zug: p.zug ?? [] }) ?? null);
        }
        aus.push(r);
    }
    return normiere(aus);
}

function normiere(wert) {
    const karte = new Map();
    // `gelaende` an Umriss-/Linienpunkten kam mit A7 (Randhöhe als Verweis) —
    // eine bewusste Ergänzung, geprüft in `randhoehen.test.js`; hier bleibt
    // die A6-Frage „sagen die Werkzeuge sonst dasselbe?".
    const json = JSON.stringify(wert, (k, v) => (k === 'gelaende' && typeof v === 'number' ? undefined
        : typeof v === 'string' && /^(cde|ab)-[a-z0-9]+-[a-z0-9]+$/.test(v)
        ? (karte.has(v) ? karte.get(v) : (karte.set(v, `ID${karte.size}`), karte.get(v))) : v));
    return JSON.parse(json);
}
