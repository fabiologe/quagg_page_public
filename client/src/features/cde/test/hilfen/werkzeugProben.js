/**
 * PROBEN FÜR JEDES KATALOGWERKZEUG (Teil XXIV, Fahrplan R4).
 *
 * K1 verlangte: „für alle Werkzeuge dieselben Schritte wie vorher" — die
 * Auswertung eines Kommandos (`werteAus`) muss liefern, was der direkte Aufruf
 * des Werkzeugs liefert. `werkzeugGold.js` hatte Proben für 15 der damals 58;
 * seine Liste ist an eine eingefrorene Fixture gebunden (A6) und bleibt, wie
 * sie ist. Hier kommen die übrigen dazu.
 *
 * Die Subjekte kommen, wo es geht, aus einer kleinen EIGENEN WELT, gebaut mit
 * den echten Zeichenwerkzeugen und gelesen über `subjektAusStand` — so, wie
 * der Viewer ein eigenes Bauteil sieht (K3). Gelieferte Subjekte sind
 * nachgebaut wie in den Fachtests (Achse, Strang, Knoten, Anker).
 *
 * Jede Probe muss wenigstens einmal Schritte liefern (der Test prüft das),
 * sonst bewiese der Vergleich nichts. Ein Werkzeug ohne Probe steht in
 * `OHNE_PROBE`, mit Grund.
 */
import { nachId } from '../../services/Bearbeitungen.js';
import { ableitungsSchritte, mitKennungen } from '../../services/Bauteilrezepte.js';
import { subjektAusStand } from '../../services/kommando/Subjekt.js';
import { kandidatenAus } from '../../services/kommando/Kandidaten.js';
import { rahmenOhneBezug } from '../../services/kommando/Kommando.js';
import { PROBEN as PROBEN_A6 } from './werkzeugGold.js';

const HV = 300;                                   // Höhenversatz: Welt-Y = m NN − 300
const P = (x, nn, z) => ({ x, y: nn - HV, z });

/** Ein Zeichenwerkzeug direkt anwenden, mit fester Kennung — der Stand danach. */
function zeichne(stand, id, gid, werte, punkte) {
    const b = nachId(id);
    const schritte = mitKennungen(() => gid, () => b.anwenden({ punkte, hoehenversatz: HV }, werte, { zug: [] }));
    for (const s of [].concat(schritte ?? []).filter(Boolean)) stand.set(s.globalId, s.nachher);
}

/** Die eigene Welt: drei Schächte, zwei Haltungen (erklärt an den Schächten), Linie, Fläche, Platte, Pfosten. */
function welt() {
    const erzeugt = new Map();
    const S = [['cde-S1', 0, 0], ['cde-S2', 20, 0], ['cde-S3', 40, 6]];
    for (const [gid, x, z] of S) zeichne(erzeugt, 'schacht-zeichnen', gid, { name: gid.slice(4), kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 }, [P(x, 97, z), P(x, 100, z)]);
    const knoten = (gid, x, nn, z) => ({ ...P(x, nn, z), knoten: gid, hoeheFest: true });
    zeichne(erzeugt, 'rohr-zeichnen', 'cde-H1', { name: 'H1', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            [knoten('cde-S1', 0, 97, 0), P(10, 96.95, 2), knoten('cde-S2', 20, 96.9, 0)]);
    zeichne(erzeugt, 'rohr-zeichnen', 'cde-H2', { name: 'H2', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 400 },
            [knoten('cde-S2', 20, 96.9, 0), knoten('cde-S3', 40, 96.7, 6)]);
    zeichne(erzeugt, 'linie-zeichnen', 'cde-L1', { name: 'L1', kategorie: 'IFCKERB', hoehe: '' },
            [P(0, 100, 20), P(10, 100.1, 20), P(20, 100.2, 25)]);
    zeichne(erzeugt, 'flaeche-zeichnen', 'cde-F1', { name: 'F1', kategorie: 'IFCSLAB', hoehe: '' },
            [P(0, 100, 30), P(10, 100, 30), P(10, 100, 40), P(0, 100, 40)]);
    // Eine ZWEITE Fläche, überlappend — der Partner für „Flächen vereinigen".
    // Seit V3 kommt er aus dem Journal, nicht aus einer Liste am Subjekt.
    zeichne(erzeugt, 'flaeche-zeichnen', 'cde-F2', { name: 'F2', kategorie: 'IFCSLAB', hoehe: '' },
            [P(5, 100, 35), P(15, 100, 35), P(15, 100, 45), P(5, 100, 45)]);
    zeichne(erzeugt, 'platte-zeichnen', 'cde-PL1', { name: 'PL1', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.3 },
            [P(20, 100, 30), P(30, 100, 30), P(30, 100, 40), P(20, 100, 40)]);
    zeichne(erzeugt, 'pfosten-zeichnen', 'cde-PF1', { name: 'PF1', kategorie: 'IFCSIGN', hoehe: '', laenge: 0.12, breite: 0.12, tiefe: 1.1 },
            [P(50, 100, 50)]);
    // Teil XXVI, Z2: eine Wand und ein Streifenfundament — beides eine Linie mit Rechteckprofil.
    zeichne(erzeugt, 'wand-zeichnen', 'cde-W1', { name: 'W1', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 },
            [P(100, 100, 0), P(110, 100, 0)]);
    zeichne(erzeugt, 'streifenfundament-zeichnen', 'cde-FU1', { name: 'FU1', kategorie: 'IFCFOOTING', hoehe: '', breite: 0.6, dicke: 0.4 },
            [P(100, 99.6, 10), P(110, 99.6, 10)]);
    // Teil XXVI, Z8: eine Überlaufschwelle — eine niedrige Wand mit Quagg_Entlastung.
    zeichne(erzeugt, 'ueberlaufschwelle-zeichnen', 'cde-SW1', { name: 'SW1', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5 },
            [P(130, 100, 0), P(134, 100, 0)]);
    // Teil XXVIII, V5: die Einbauten — Rechen, Drossel, Tauchwand, Sauberkeitsschicht, Bettung.
    zeichne(erzeugt, 'rechen-zeichnen', 'cde-RE1', { name: 'RE1', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.5 },
            [P(140, 100, 0), P(143, 100, 0)]);
    zeichne(erzeugt, 'drossel-zeichnen', 'cde-DR1', { name: 'DR1', kategorie: 'IFCVALVE', hoehe: '', dn: 200 },
            [P(145, 100, 0), P(146, 100, 0)]);
    zeichne(erzeugt, 'tauchwand-zeichnen', 'cde-TW1', { name: 'TW1', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1 },
            [P(150, 101, 0), P(153, 101, 0)]);
    zeichne(erzeugt, 'sauberkeitsschicht-zeichnen', 'cde-SK1', { name: 'SK1', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.1 },
            [P(160, 99.5, 0), P(165, 99.5, 0), P(165, 99.5, 4), P(160, 99.5, 4)]);
    zeichne(erzeugt, 'rigole-zeichnen', 'cde-RG1', { name: 'RG1', kategorie: 'IFCCOURSE', hoehe: '', dicke: 1.2, hohlraumanteil: 30 },
            [P(180, 99.5, 0), P(200, 99.5, 0), P(200, 99.5, 2), P(180, 99.5, 2)]);
    zeichne(erzeugt, 'bettung-zeichnen', 'cde-BT1', { name: 'BT1', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.2 },
            [P(170, 99.4, 0), P(175, 99.4, 0), P(175, 99.4, 4), P(170, 99.4, 4)]);
    // Teil XXVI, Z6: ein Raum — der Hohlraum, aus einem Umriss nach oben.
    zeichne(erzeugt, 'raum-zeichnen', 'cde-RA1', { name: 'RA1', hoehe: '', raumhoehe: 2.5 },
            [P(120, 100, 0), P(124, 100, 0), P(124, 100, 3), P(120, 100, 3)]);
    // Teil XXVI, Z5e: ein Bauwerk (Behälter ohne Körper) — die Wand W1 gehört dazu.
    erzeugt.set('cde-BW1', { rezept: 'bauwerk', kategorie: null, name: 'BW1', bauform: 'netz', parameter: { art: 'anlage' } });
    const w1 = erzeugt.get('cde-W1');
    erzeugt.set('cde-W1', { ...w1, parameter: { ...w1.parameter, teilVon: 'cde-BW1' } });
    // Teil XXVIII, V1/V3: eine Kammer aus der Vorlage (Bauwerk cde-VK0, Teile cde-VK1 … VK7);
    // die Längswand Nord (VK2) von Hand dicker — die Abweichung, die „Angleichen" zurückholt.
    {
        let i = 0;
        const schritte = mitKennungen(() => `cde-VK${i++}`, () => nachId('bauwerk-aus-vorlage-rechteckkammer').anwenden(
            { punkte: [P(200, 100, 0)], hoehenversatz: HV },
            { name: 'VK', hoehe: '', laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25 }, { zug: [] }));
        for (const s of schritte) erzeugt.set(s.globalId, s.nachher);
        const wn = erzeugt.get('cde-VK2');
        erzeugt.set('cde-VK2', { ...wn, parameter: { ...wn.parameter, dicke: 0.5 } });
    }
    // Ein Erdbau-Vorgang mit zwei Operationen (Grube, Gerinne) — die Punkthöhen stehen in m NN.
    let n = 0;
    const vorgang = mitKennungen((art) => (art === 'operation' ? `op-probe${n++}` : `cde-EB${n++}`), () => ableitungsSchritte({
        rezept: 'erdbau', quellen: { gelaende: '1Ur0Gelaende0Vertrag00' }, raster: { cell: 1 }, name: 'Urgelände · Probe',
        operationen: [
            { art: 'grube', parameter: { umriss: [{ x: 60, y: 100, z: 60 }, { x: 80, y: 100, z: 60 }, { x: 80, y: 100, z: 75 }, { x: 60, y: 100, z: 75 }], sohle: 98, neigung: 1.5 } },
            { art: 'gerinne', parameter: { achse: [{ x: 60, z: 90 }, { x: 90, z: 90 }], sohlbreite: 1, boeschung: 1.5, sohleAnfang: 98, sohleEnde: 97.8 } },
        ],
    }));
    for (const s of vorgang) erzeugt.set(s.globalId, s.nachher);
    return erzeugt;
}

export const WELT = welt();
const AUSHUB = [...WELT].find(([, p]) => p.rezept === 'erdbau' && p.rolle === 'aushub')?.[0];
const wirksamerStand = (art) => (art === 'erzeugt' ? WELT : new Map());
const eigen = (gid) => subjektAusStand(gid, { wirksamerStand, rahmen: rahmenOhneBezug({ hoehenversatz: HV }) });

// ── Gelieferte Subjekte ──────────────────────────────────────────────────────
const G_ANFANG = P(100, 97.5, 0), G_ENDE = P(130, 97.2, 0), G_WEITER = P(160, 96.9, 0);
const ROHR_G = {
    globalId: '2Rohr0Haltung000000001', category: 'IFCPIPESEGMENT', name: 'H-001', hoehenversatz: HV, modelId: 'netz.ifc',
    anker: { x: 115, y: -2.65, z: 0 }, versatz: { x: 0, y: 0, z: 0 }, bezugshoehe: -2.8, oberkante: -2.5, lageUmkehrbar: true,
    achse: { anfang: G_ANFANG, ende: G_ENDE, polyline: [G_ANFANG, G_ENDE], laenge: 30, dn: 300, achsbezug: 'sohle', quelle: 'axisRep' },
    strang: [
        { globalId: '2Rohr0Haltung000000001', name: 'H-001', anfang: G_ANFANG, ende: G_ENDE, dn: 300, achsbezug: 'sohle', laenge: 30 },
        { globalId: '2Rohr0Haltung000000002', name: 'H-002', anfang: G_ENDE, ende: G_WEITER, dn: 300, achsbezug: 'sohle', laenge: 30 },
    ],
    knotenImNetz: [{ globalId: '3Schacht000000000000A1', punkt: { ...G_ANFANG } }, { globalId: '3Schacht000000000000A2', punkt: { ...G_ENDE } }],
    stand: { kg: '411' },
    gelaendeQuellen: [{ globalId: '1Ur0Gelaende0Vertrag00', name: 'Urgelände', herkunft: 'geliefert', pruefmass: { n: 4 }, cell: 1 }],
    quellmass: { pruefmass: { triCount: 48 } },
};
const SCHACHT_G = {
    globalId: '3Schacht000000000000A2', category: 'IFCDISTRIBUTIONCHAMBERELEMENT', name: 'SA2', hoehenversatz: HV, modelId: 'netz.ifc',
    anker: { x: 130, y: -1.7, z: 0 }, versatz: { x: 0, y: 0, z: 0 }, bezugshoehe: -2.8, oberkante: -0.6, lageUmkehrbar: true,
    anschluesse: [
        { globalId: '2Rohr0Haltung000000001', ende: 'ende', fern: G_ANFANG, punkt: G_ENDE, achse: ROHR_G.achse },
        { globalId: '2Rohr0Haltung000000002', ende: 'anfang', fern: G_WEITER, punkt: G_ENDE,
          achse: { anfang: G_ENDE, ende: G_WEITER, polyline: [G_ENDE, G_WEITER], laenge: 30, dn: 300, achsbezug: 'sohle' } },
    ],
    stand: {},
    gelaendeQuellen: ROHR_G.gelaendeQuellen,
    quellmass: { pruefmass: { triCount: 96, spanX: 1.2, spanY: 2.2, spanZ: 1.2 }, cell: 0.5 },
};
const UR = { globalId: '1Ur0Gelaende0Vertrag00', category: 'IFCGEOGRAPHICELEMENT', name: 'Urgelände',
             hoehenversatz: HV, quellmass: { pruefmass: { n: 4, summe: 12.5 }, cell: 2 }, modellSha: 'sha-ur' };

/**
 * Der Kandidaten-Auföser der Probenwelt (V3): die eigenen Flächen aus dem
 * Journal, dazu EINE Vorlage der Bibliothek. Dieselbe Funktion, die der Store
 * ohne Oberfläche baut — hier nur mit der Probenwelt als Quelle.
 */
export const VORLAGEN = Object.freeze([
    { id: 'vl-dn1200', name: 'Schacht DN 1200', rezept: 'schacht', vorgaben: { dn: 1200 } },
    // Teil XXIX, G5: eine Baugruppe — ein Schacht mit angeschlossener Haltung.
    { id: 'bg-test', name: 'Schacht mit Haltung', art: 'baugruppe', rezept: 'bauwerk', werkzeug: 'baugruppe-setzen', bauwerk: { art: 'anlage' },
      vorgaben: {}, teile: [
        { rolle: 'schacht', rezept: 'schacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', name: 'S', parameter: { punkte: [[0, 0, 0], [0, 2.5, 0]], dn: 1000 } },
        { rolle: 'haltung', rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H', parameter: { punkte: [[0, 0, 0], [10, -0.05, 0]], dn: 300, anschluss: { anfang: { rolle: 'schacht' } } } },
      ] },
]);
const KANDIDATEN = kandidatenAus({ wirksamerStand, vorlagen: VORLAGEN });

/** Die Erzeugen-Subjekte: das Gezeichnete an der Stelle des angeklickten Bauteils. */
const zug = (...punkte) => ({ punkte, hoehenversatz: HV });

/** Proben, die über A6 hinausgehen — je Werkzeug, mit Subjekt und Werten (und Zug, wo es einen gibt). */
const NEU = [
    // ── Erzeugen ──
    { id: 'linie-zeichnen', el: zug(P(0, 100, 0), P(10, 100, 0)), zug: [P(0, 100, 0), P(10, 100, 0)], werte: [{ name: 'L', kategorie: 'IFCKERB', hoehe: '' }] },
    { id: 'flaeche-zeichnen', el: zug(P(0, 100, 0), P(5, 100, 0), P(5, 100, 5)), zug: [P(0, 100, 0), P(5, 100, 0), P(5, 100, 5)],
      werte: [{ name: 'F', kategorie: 'IFCSLAB', hoehe: 100.5 }] },
    { id: 'rohr-zeichnen', el: zug(P(0, 97, 0), P(20, 96.9, 0)), zug: [P(0, 97, 0), P(20, 96.9, 0)],
      werte: [{ name: 'R', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 }] },
    { id: 'schacht-zeichnen', el: zug(P(0, 97, 0), P(0, 100, 0)), zug: [P(0, 97, 0), P(0, 100, 0)],
      werte: [{ name: 'S', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 }] },
    { id: 'pfosten-zeichnen', el: zug(P(3, 100, 3)), zug: [P(3, 100, 3)],
      werte: [{ name: 'P', kategorie: 'IFCSIGN', hoehe: '', laenge: 0.12, breite: 0.12, tiefe: 1.1 }] },
    { id: 'platte-zeichnen', el: zug(P(0, 100, 0), P(5, 100, 0), P(5, 100, 5), P(0, 100, 5)), zug: [P(0, 100, 0), P(5, 100, 0), P(5, 100, 5), P(0, 100, 5)],
      werte: [{ name: 'PL', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.25 }] },
    { id: 'wand-zeichnen', el: zug(P(0, 100, 0), P(10, 100, 0)), zug: [P(0, 100, 0), P(10, 100, 0)],
      werte: [{ name: 'W', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 }] },
    { id: 'streifenfundament-zeichnen', el: zug(P(0, 99.6, 0), P(10, 99.6, 0)), zug: [P(0, 99.6, 0), P(10, 99.6, 0)],
      werte: [{ name: 'FU', kategorie: 'IFCFOOTING', hoehe: '', breite: 0.6, dicke: 0.4 }] },
    { id: 'ueberlaufschwelle-zeichnen', el: zug(P(0, 101.9, 0), P(4, 101.9, 0)), zug: [P(0, 101.9, 0), P(4, 101.9, 0)],
      werte: [{ name: 'SW', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5, ueberfallbeiwert: 0.6 }] },
    { id: 'bauwerk-anlegen', el: zug(), werte: [{ name: 'Kammer', art: 'anlage' }] },
    // Teil XXVIII, V1: ein Bauwerk aus einer Vorlage — ein Punkt, die Werte der Vorlage.
    { id: 'bauwerk-aus-vorlage-rechteckkammer', el: zug(P(0, 100, 0)), zug: [P(0, 100, 0)],
      werte: [{ name: 'Kammer', hoehe: '', laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25 }] },
    // V4: der Zweikammer-RÜB.
    { id: 'bauwerk-aus-vorlage-zweikammer-rueb', el: zug(P(300, 100, 0)), zug: [P(300, 100, 0)],
      werte: [{ name: 'RÜB', hoehe: '', laenge: 4, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25,
                ueberlaufhoehe: 2.4, schwelle: 0.5 }] },
    { id: 'raum-zeichnen', el: zug(P(0, 100, 0), P(4, 100, 0), P(4, 100, 3), P(0, 100, 3)),
      zug: [P(0, 100, 0), P(4, 100, 0), P(4, 100, 3), P(0, 100, 3)], werte: [{ name: 'R', hoehe: '', raumhoehe: 2.5 }] },
    { id: 'raum-raumhoehe-setzen', el: eigen('cde-RA1'), werte: [{ raumhoehe: 3 }] },
    // Teil XXVIII, V5: die Einbauten — je eines zeichnen, je Feld ein Setzer.
    { id: 'rechen-zeichnen', el: zug(P(0, 100, 0), P(3, 100, 0)), zug: [P(0, 100, 0), P(3, 100, 0)],
      werte: [{ name: 'RE', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.5, stababstand: 0.02, reinigungsart: 'maschinell' }] },
    { id: 'drossel-zeichnen', el: zug(P(0, 100, 0), P(1, 100, 0)), zug: [P(0, 100, 0), P(1, 100, 0)],
      werte: [{ name: 'DR', kategorie: 'IFCVALVE', hoehe: '', dn: 200, drosselabfluss: 25, stauhoehe: 2.4, kennlinie: 'Hersteller' }] },
    { id: 'tauchwand-zeichnen', el: zug(P(0, 101, 0), P(3, 101, 0)), zug: [P(0, 101, 0), P(3, 101, 0)],
      werte: [{ name: 'TW', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1 }] },
    { id: 'sauberkeitsschicht-zeichnen', el: zug(P(0, 99.5, 0), P(5, 99.5, 0), P(5, 99.5, 4), P(0, 99.5, 4)),
      zug: [P(0, 99.5, 0), P(5, 99.5, 0), P(5, 99.5, 4), P(0, 99.5, 4)], werte: [{ name: 'SK', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.1 }] },
    { id: 'rigole-zeichnen', el: zug(P(0, 99.5, 0), P(20, 99.5, 0), P(20, 99.5, 2), P(0, 99.5, 2)),
      zug: [P(0, 99.5, 0), P(20, 99.5, 0), P(20, 99.5, 2), P(0, 99.5, 2)],
      werte: [{ name: 'RG', kategorie: 'IFCCOURSE', hoehe: '', dicke: 1.2, hohlraumanteil: 30, kf: 0.0001 }] },
    { id: 'bettung-zeichnen', el: zug(P(0, 99.4, 0), P(5, 99.4, 0), P(5, 99.4, 4), P(0, 99.4, 4)),
      zug: [P(0, 99.4, 0), P(5, 99.4, 0), P(5, 99.4, 4), P(0, 99.4, 4)], werte: [{ name: 'BT', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.2 }] },
    ...Object.entries({
        'cde-RE1': ['rechen', { stabtiefe: 0.1, rechenhoehe: 1.8, stababstand: 0.02, reinigungsart: 'Hand', predefinedType: 'WATERFILTER', objektTyp: 'Feinrechen' }],
        'cde-DR1': ['drossel', { dn: 250, drosselabfluss: 30, stauhoehe: 2.2, kennlinie: 'Messung 2026-10-02', predefinedType: 'ISOLATING', objektTyp: 'Wirbeldrossel' }],
        'cde-TW1': ['tauchwand', { dicke: 0.25, wandhoehe: 1.2, tragend: 'ja', aussen: 'ja', predefinedType: 'SOLIDWALL', objektTyp: 'Prallwand' }],
        'cde-SK1': ['sauberkeitsschicht', { dicke: 0.08, tragend: 'ja', predefinedType: 'BASESLAB', objektTyp: 'Blinding' }],
        'cde-BT1': ['bettung', { dicke: 0.25, tragend: 'ja', predefinedType: 'BASESLAB', objektTyp: 'Kiesbett' }],
        'cde-PF1': ['pfosten', { predefinedType: 'PICTORAL', objektTyp: 'Warnschild' }],
        'cde-S1': ['schacht', { predefinedType: 'MANHOLE', objektTyp: 'Drosselschacht' }],
        'cde-RG1': ['rigole', { dicke: 1.5, hohlraumanteil: 35, kf: 0.0002, versickerungsflaeche: 44, herleitung: 'Versuch 2026-10-02',
                                predefinedType: 'CORE', objektTyp: 'Kiesrigole' }],
    }).flatMap(([gid, [rezept, werte]]) => Object.entries(werte).map(([feld, wert]) =>
        ({ id: `${rezept}-${feld}-setzen`, el: eigen(gid), werte: [{ [feld]: wert }] }))),
    { id: 'planinhalt-setzen', el: zug(), werte: [{ inhalte: [{ id: 'pi-1', wert: { art: 'text', x: 1, z: 2, text: 'A', groesse: 2.5, winkel: 0 } }, { id: 'pi-2', wert: null }] }] },
    { id: 'rotstift-zeichnen', el: zug(), werte: [{ striche: [{ id: 'rs-1', wert: { rev: 0, tool: 'stift', farbe: '#d32f2f', breiteMm: 0.6, points: [[0, 0, 0.5], [1, 1, 0.5]] } }], titel: 'Radieren' }] },

    // ── Merkmale und Masse an eigenen Bauteilen ──
    { id: 'rohr-dn-setzen', el: eigen('cde-H1'), werte: [{ dn: 400 }] },
    { id: 'schacht-dn-setzen', el: eigen('cde-S1'), werte: [{ dn: 1200 }] },
    { id: 'pfosten-laenge-setzen', el: eigen('cde-PF1'), werte: [{ laenge: 0.2 }] },
    { id: 'platte-dicke-setzen', el: eigen('cde-PL1'), werte: [{ dicke: 0.4 }] },
    { id: 'wand-dicke-setzen', el: eigen('cde-W1'), werte: [{ dicke: 0.25 }] },
    { id: 'wand-wandhoehe-setzen', el: eigen('cde-W1'), werte: [{ wandhoehe: 3 }] },
    { id: 'streifenfundament-breite-setzen', el: eigen('cde-FU1'), werte: [{ breite: 0.8 }] },
    { id: 'streifenfundament-dicke-setzen', el: eigen('cde-FU1'), werte: [{ dicke: 0.5 }] },
    // Teil XXVI, Z3: Felder, die zugleich ein bSI-Merkmal sind.
    { id: 'platte-tragend-setzen', el: eigen('cde-PL1'), werte: [{ tragend: 'nein' }] },
    { id: 'wand-tragend-setzen', el: eigen('cde-W1'), werte: [{ tragend: 'nein' }] },
    { id: 'wand-aussen-setzen', el: eigen('cde-W1'), werte: [{ aussen: 'nein' }] },
    { id: 'streifenfundament-tragend-setzen', el: eigen('cde-FU1'), werte: [{ tragend: 'nein' }] },
    // Fund 8: die Ausführung (PredefinedType) und der Objekttyp.
    { id: 'platte-predefinedType-setzen', el: eigen('cde-PL1'), werte: [{ predefinedType: 'BASESLAB' }] },
    { id: 'platte-objektTyp-setzen', el: eigen('cde-PL1'), werte: [{ objektTyp: 'Sohlplatte' }] },
    { id: 'wand-predefinedType-setzen', el: eigen('cde-W1'), werte: [{ predefinedType: 'RETAININGWALL' }] },
    { id: 'wand-objektTyp-setzen', el: eigen('cde-W1'), werte: [{ objektTyp: 'Kammerwand' }] },
    { id: 'streifenfundament-predefinedType-setzen', el: eigen('cde-FU1'), werte: [{ predefinedType: 'PAD_FOOTING' }] },
    { id: 'streifenfundament-objektTyp-setzen', el: eigen('cde-FU1'), werte: [{ objektTyp: 'Wandfundament' }] },
    { id: 'raum-predefinedType-setzen', el: eigen('cde-RA1'), werte: [{ predefinedType: 'EXTERNAL' }] },
    { id: 'raum-objektTyp-setzen', el: eigen('cde-RA1'), werte: [{ objektTyp: 'Speicherraum' }] },
    // Z8: die Überlaufschwelle und der Speicherraum (Quagg_Entlastung, Quagg_Speicherraum).
    { id: 'ueberlaufschwelle-wandhoehe-setzen', el: eigen('cde-SW1'), werte: [{ wandhoehe: 0.7 }] },
    { id: 'ueberlaufschwelle-ueberlaufart-setzen', el: eigen('cde-SW1'), werte: [{ ueberlaufart: 'Notüberlauf' }] },
    { id: 'ueberlaufschwelle-schwellenlaenge-setzen', el: eigen('cde-SW1'), werte: [{ schwellenlaenge: 3.5 }] },
    { id: 'ueberlaufschwelle-ueberfallbeiwert-setzen', el: eigen('cde-SW1'), werte: [{ ueberfallbeiwert: 0.58 }] },
    { id: 'ueberlaufschwelle-herleitung-setzen', el: eigen('cde-SW1'), werte: [{ herleitung: 'Messung 2026-10-01' }] },
    { id: 'ueberlaufschwelle-predefinedType-setzen', el: eigen('cde-SW1'), werte: [{ predefinedType: 'SOLIDWALL' }] },
    { id: 'ueberlaufschwelle-objektTyp-setzen', el: eigen('cde-SW1'), werte: [{ objektTyp: 'Trennschwelle' }] },
    { id: 'raum-betriebswasser-setzen', el: eigen('cde-RA1'), werte: [{ betriebswasser: 102 }] },
    { id: 'bauwerk-zuordnen', el: eigen('cde-PL1'), werte: [{ bauwerk: 'cde-BW1' }], kandidaten: KANDIDATEN },
    { id: 'bauwerk-loesen', el: eigen('cde-W1'), werte: [{}] },
    { id: 'bauwerk-bauwerkstyp-setzen', el: eigen('cde-BW1'), werte: [{ bauwerkstyp: 'RRB' }] },
    // Teil XXVII, B2: das Bauwerk als Ganzes — die Teile kommen aus dem Kandidaten-Auflöser.
    // Teil XXVII, B5: die Wand W1 auf die Platte PL1 stellen.
    { id: 'auf-bauteil-stellen', el: eigen('cde-W1'), werte: [{ bauteil: 'cde-PL1', mass: 'oberkante', versatz: 0 }], kandidaten: KANDIDATEN },
    // Teil XXVII, B4: eine Rohrdurchführung — das eigene Rohr durch die Wand W1.
    { id: 'durchfuehrung-setzen', el: eigen('cde-H1'), werte: [{ wirt: 'cde-W1', ringspalt: 0.05 }], kandidaten: KANDIDATEN },
    // Teil XXVII, B3: eine Kernbohrung in der Wand W1.
    { id: 'oeffnung-setzen', el: eigen('cde-W1'), werte: [{ form: 'rund', station: 5, unterkante: 1, durchmesser: 0.3, breite: '', hoehe: '' }] },
    // Teil XXIX, G2: das Formular — zwei Maße und eine Kostengruppe in EINEM Kommando.
    { id: 'eigenschaften-setzen', el: eigen('cde-W1'), werte: [{ dicke: 0.4, wandhoehe: 3, kg: '331', gewerk: 'wasserbau' }],
      kandidaten: KANDIDATEN },
    { id: 'vorlage-werte-setzen', el: eigen('cde-VK0'),
      werte: [{ laenge: 5, breite: 3, lichteHoehe: 2.5, wand: 0.3, boden: 0.4, decke: 0.25 }], kandidaten: KANDIDATEN },
    { id: 'an-vorlage-angleichen', el: eigen('cde-VK0'), werte: [{ rolle: '' }, { rolle: 'laengswandNord' }], kandidaten: KANDIDATEN },
    // Teil XXIX, G4: das Bauwerk wird gewöhnlich — die Teile bleiben.
    { id: 'von-vorlage-loesen', el: eigen('cde-VK0'), werte: [{}], kandidaten: KANDIDATEN },
    { id: 'bauwerk-verschieben', el: eigen('cde-BW1'), werte: [{ ost: 10, nord: 0, hoehe: 0 }], kandidaten: KANDIDATEN },
    { id: 'bauwerk-kopieren', el: eigen('cde-BW1'), werte: [{ ost: 10, nord: 0, hoehe: 0 }], kandidaten: KANDIDATEN },
    { id: 'bauwerk-drehen', el: eigen('cde-BW1'), werte: [{ winkel: 90 }], kandidaten: KANDIDATEN },
    { id: 'bauwerk-spiegeln', el: eigen('cde-BW1'), werte: [{ achse: 0, kopie: 'nein' }], kandidaten: KANDIDATEN },
    { id: 'merkmalssatz-setzen', el: eigen('cde-L1'), werte: [{ satz: 'Pset_Test', merkmale: [{ name: 'A', value: 1 }] }] },
    { id: 'bauform-auslegen', el: { ...ROHR_G, stand: {} }, werte: [{ bauform: 'achse+profil' }] },
    { id: 'loeschen', el: eigen('cde-L1'), werte: [{}] },
    { id: 'fliessrichtung-setzen', el: ROHR_G, werte: [{ richtung: 'umgekehrt' }] },
    { id: 'strang-umbenennen', el: ROHR_G, werte: [{ muster: 'K-{n:02}', beginnBei: 3 }] },
    { id: 'strang-massnahme', el: ROHR_G, werte: [{ massnahme: 'erneuerung' }] },
    { id: 'strang-gefaelle-setzen', el: eigen('cde-H1'), werte: [{ anfang: 97.2, ende: 96.6 }] },
    { id: 'sohle-ziehen', el: eigen('cde-H1'), zug: [P(20, 96.8, 0)], werte: [{ hoehe: 96.8 }] },

    // ── Lage an eigenen Bauteilen ──
    { id: 'verschieben', el: eigen('cde-PF1'), werte: [{ ost: 52, nord: -50, hoehe: 100 }] },
    { id: 'verschieben', el: ROHR_G, werte: [{ ost: 116, nord: 1, hoehe: 297.35 }] },
    // Die A6-Probe hält das Nein fest (ohne Versatz); hier das Ja.
    { id: 'bezugshoehe-setzen', el: ROHR_G, werte: [{ hoehe: 297 }] },
    { id: 'stuetzpunkt-verschieben', el: eigen('cde-L1'), werte: [{ index: 1, ost: 11, nord: -21, hoehe: 100.3 }] },
    { id: 'kante-verschieben', el: eigen('cde-L1'), werte: [{ index: 0, ost: 5, nord: -21, hoehe: 100.05 }] },
    { id: 'stuetzpunkt-einfuegen', el: eigen('cde-L1'), werte: [{ station: 5 }] },
    { id: 'stuetzpunkt-entfernen', el: eigen('cde-L1'), werte: [{ index: 1 }] },
    { id: 'kopieren', el: eigen('cde-PF1'), werte: [{ ost: 2, nord: 0, hoehe: 0 }] },
    { id: 'reihe', el: eigen('cde-PF1'), werte: [{ anzahl: 3, ost: 5, nord: 0 }] },
    { id: 'drehen', el: eigen('cde-F1'), werte: [{ winkel: 30 }] },
    { id: 'spiegeln', el: eigen('cde-F1'), werte: [{ achse: 45, kopie: 'nein' }, { achse: 0, kopie: 'ja' }] },
    { id: 'linie-teilen', el: eigen('cde-L1'), werte: [{ station: 12 }] },
    { id: 'linie-trimmen', el: eigen('cde-L1'), werte: [{ ende: 'ende', laenge: 15 }] },
    { id: 'linie-versetzen', el: eigen('cde-L1'), werte: [{ abstand: 2, ergebnis: 'kopie' }] },
    { id: 'linie-umkehren', el: eigen('cde-L1'), werte: [{}] },
    { id: 'flaeche-versetzen', el: eigen('cde-F1'), werte: [{ abstand: 1, ergebnis: 'ersetzen' }] },
    { id: 'flaeche-teilen', el: eigen('cde-F1'), zug: [P(5, 100, 28), P(5, 100, 42)], werte: [{}] },
    // Seit Teil XXV (V3) tragen diese beiden keine LISTE am Subjekt mehr: was
    // sie ausser ihrem Ziel brauchen, löst der Kontext auf (`kandidaten`).
    // Teil XXIX, G-T1: eine Schicht auf dem Gelände — als Fläche und als Band; das Gelände ist Quelle.
    { id: 'gelaendeschicht-zeichnen', el: zug(P(80, 100, 60), P(90, 100, 60), P(90, 100, 70), P(80, 100, 70)),
      zug: [P(80, 100, 60), P(90, 100, 60), P(90, 100, 70), P(80, 100, 70)],
      werte: [{ name: 'Steinschüttung', kategorie: 'IFCCOURSE', predefinedType: 'ARMOUR', objektTyp: '', dicke: 0.4, abstand: '',
                richtung: 'lot', gelaende: '1Ur0Gelaende0Vertrag00' }] },
    { id: 'gelaendeschicht-band-zeichnen', el: zug(P(80, 100, 60), P(100, 100, 60)), zug: [P(80, 100, 60), P(100, 100, 60)],
      werte: [{ name: 'Weg', kategorie: 'IFCCOURSE', predefinedType: 'PAVEMENT', objektTyp: '', dicke: 0.15, breite: 2.5, abstand: '',
                richtung: 'lot', gelaende: '1Ur0Gelaende0Vertrag00' }] },
    // G5: eine Baugruppe setzen — ein Punkt, gedreht.
    { id: 'baugruppe-setzen', el: zug(P(120, 100, 40)), zug: [P(120, 100, 40)], werte: [{ vorlage: 'bg-test', name: 'BG', hoehe: '', drehung: 30 }],
      kandidaten: KANDIDATEN },
    // G-T2: ein Raum zwischen Gelände und Spiegel.
    { id: 'muldenraum-zeichnen', el: zug(P(80, 100, 60), P(90, 100, 60), P(90, 100, 70), P(80, 100, 70)),
      zug: [P(80, 100, 60), P(90, 100, 60), P(90, 100, 70), P(80, 100, 70)],
      werte: [{ name: 'Dauerstau', predefinedType: 'EXTERNAL', objektTyp: '', oben: 99.5, unten: '', gelaende: '1Ur0Gelaende0Vertrag00' }] },
    { id: 'flaeche-vereinigen', el: eigen('cde-F1'), werte: [{ andere: 'cde-F2' }], kandidaten: KANDIDATEN },
    { id: 'koerper-tauschen', el: eigen('cde-S1'), werte: [{ vorlage: 'vl-dn1200' }], kandidaten: KANDIDATEN },

    // ── Netz ──
    { id: 'haltung-teilen', el: eigen('cde-H1'), werte: [{ station: 10 }] },
    { id: 'haltung-teilen', el: ROHR_G, werte: [{ station: 12 }] },
    { id: 'schacht-einfuegen', el: eigen('cde-H1'), werte: [{ station: 10, deckel: 100.2, durchmesser: 1000 }] },
    { id: 'schacht-verschieben', el: eigen('cde-S2'), werte: [{ ost: 21, nord: -1 }] },
    { id: 'schacht-verschieben', el: SCHACHT_G, werte: [{ ost: 131, nord: -1, mitfuehren: 'forderung' }] },
    { id: 'schacht-entfernen', el: eigen('cde-S2'), werte: [{}] },
    // Das Ende von H1 (an S2) an S3 hängen — getippt 30 cm neben S3.
    { id: 'an-schacht-anschliessen', el: eigen('cde-H1'), zug: [P(40.2, 96.7, 6.2)], werte: [{}] },
    { id: 'trasse-aendern', el: ROHR_G, zug: [P(100, 97.5, 0), P(115, 97.35, 3), P(130, 97.2, 0)], werte: [{}] },

    // ── Gelände und Ableitungen ──
    { id: 'kanalgraben-ableiten', el: ROHR_G, werte: [{ gelaende: '1Ur0Gelaende0Vertrag00', umfang: 'strang', achsbezug: 'quelle', wandform: 'verbau',
                                                      boden: 'nichtbindig', winkel: '', breite: '', wanddicke: 0, bettung: 0.1, schachtMass: 1, dn: '', auflockerung: 1.2 }] },
    { id: 'bauwerksgrube-ableiten', el: SCHACHT_G, werte: [{ gelaende: '1Ur0Gelaende0Vertrag00', arbeitsraum: '', wandform: 'boeschung', boden: 'nichtbindig',
                                                          winkel: '', sohle: '', auflockerung: 1.2 }] },
    { id: 'erdbau-stuetzpunkt-verschieben', el: eigen(AUSHUB), werte: [{ op: 0, feld: 'umriss', index: 1, ost: 81, nord: -61, hoehe: 100.2 },
                                                                   { op: 0, feld: 'umriss', index: 2, ost: 80, nord: -75, hoehe: 99.5, bezug: 'innen' }] },
    { id: 'erdbau-mass-setzen', el: eigen(AUSHUB), werte: [{ op: 1, feld: 'sohlbreite', wert: 2 }, { op: 1, feld: 'boeschung', wert: 2 }] },
    // Teil XXXII, K1: einen Knickpunkt einfügen (0,5 m hinter Ecke 1) und eine Ecke entfernen.
    { id: 'erdbau-stuetzpunkt-einfuegen', el: eigen(AUSHUB), werte: [{ op: 0, feld: 'umriss', index: 1, abstand: 0.5 }] },
    { id: 'erdbau-stuetzpunkt-entfernen', el: eigen(AUSHUB), werte: [{ op: 0, feld: 'umriss', index: 1 }] },
    // Den ganzen Vorgang zurücknehmen (V5): das Ziel ist EIN Teil, die übrigen
    // kommen aus dem Kontext (`vorgang:teile`).
    { id: 'vorgang-entfernen', el: eigen(AUSHUB), werte: [{}], kandidaten: KANDIDATEN },
    { id: 'aussparung-ableiten', el: { ...SCHACHT_G, koerperQuellen: [{ globalId: 'cde-PL1', name: 'PL1' }] }, werte: [{ werkzeug: 'cde-PL1' }] },
];

/**
 * Werkzeuge OHNE Probe — mit Grund. Ziel ≤ 5 (Fahrplan R4).
 */
export const OHNE_PROBE = Object.freeze({
});

/** A6 plus die neuen — für den K1-Vergleich. */
export const PROBEN_ALLE = [...PROBEN_A6, ...NEU];
