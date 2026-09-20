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
    { id: 'planinhalt-setzen', el: zug(), werte: [{ inhalte: [{ id: 'pi-1', wert: { art: 'text', x: 1, z: 2, text: 'A', groesse: 2.5, winkel: 0 } }, { id: 'pi-2', wert: null }] }] },
    { id: 'rotstift-zeichnen', el: zug(), werte: [{ striche: [{ id: 'rs-1', wert: { rev: 0, tool: 'stift', farbe: '#d32f2f', breiteMm: 0.6, points: [[0, 0, 0.5], [1, 1, 0.5]] } }], titel: 'Radieren' }] },

    // ── Merkmale und Masse an eigenen Bauteilen ──
    { id: 'rohr-dn-setzen', el: eigen('cde-H1'), werte: [{ dn: 400 }] },
    { id: 'schacht-dn-setzen', el: eigen('cde-S1'), werte: [{ dn: 1200 }] },
    { id: 'pfosten-laenge-setzen', el: eigen('cde-PF1'), werte: [{ laenge: 0.2 }] },
    { id: 'platte-dicke-setzen', el: eigen('cde-PL1'), werte: [{ dicke: 0.4 }] },
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
