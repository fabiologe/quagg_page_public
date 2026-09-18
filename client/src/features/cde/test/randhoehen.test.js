// @vitest-environment jsdom
/**
 * Randhöhen als Verweis (Teil XXIII, A7; Audit „Bearbeitungsstruktur", S3).
 *
 * Die Probe aus dem Audit: wertet eine Änderung am Planum die Auffüllung
 * darauf neu aus? Für Körper und Massen ja — nur der RAND der Auffüllung war
 * ein Geländeschnappschuss vom Zeichnen. Senkte man das Planum darunter,
 * begann die Böschung einen Meter in der Luft.
 *
 * Jetzt trägt jeder gezeichnete Randpunkt `gelaende` (Abstand zum Gelände VOR
 * seinem Vorgang), und die Ableitung tastet neu ab. Ein Punkt ohne das Feld
 * (Altjournal, gezogener Punkt) rechnet wie bisher.
 */
import { describe, expect, it } from 'vitest';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh, rasterAbtasten } from '../services/geometrie/ops/Raster.js';
import { formeNach } from '../services/gelaende/Operationen.js';
import { nachId } from '../services/Bearbeitungen.js';

const VERSATZ = 300;
function gelaende() {
    const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z], c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const urRaster = () => rasterAusMesh({ mesh: gelaende() }, { cell: 1 }).ergebnis;
const holeQuellForm = async (gid, form) => (gid === 'DGM1' && form === 'raster' ? urRaster() : null);
const UR = { globalId: 'DGM1', name: 'Ur', hoehenversatz: VERSATZ, quellmass: { cell: 1 } };

// Planum A in NN (Welt = NN − 300), mit Abtrag unter das Gelände (~600–600,6 NN).
const PLANUM = (hoehe) => ({ art: 'planum', parameter: { umriss: [{ x: 4, z: 4 }, { x: 36, z: 4 }, { x: 36, z: 36 }, { x: 4, z: 36 }], hoehe } });
const vorgang = (ops, name) => ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, operationen: ops, name });

/** B über das WERKZEUG „Auffüllen": der Zug liegt auf dem Gelände nach A (so tastet der Viewer). */
function auffuellungAufA(hoeheA) {
    const nachA = formeNach(urRaster(), [{ ...PLANUM(hoeheA), parameter: { ...PLANUM(hoeheA).parameter, hoehe: hoeheA - VERSATZ } }]).raster;
    const zug = [[12, 12], [28, 12], [28, 28], [12, 28]].map(([x, z]) => ({ x, y: rasterAbtasten(nachA, x, z), z }));
    const schritte = nachId('auffuellen').anwenden(UR, { ziel: 'hoehe', mass: 1, neigung: 1.5 }, { zug });
    return schritte.find(s => s.art === 'erzeugt' && s.nachher.rezept === 'erdbau').nachher.parameter.operationen;
}

async function baueB({ hoeheA, opsB }) {
    const A = vorgang([PLANUM(hoeheA)], 'A');
    const B = vorgang(opsB, 'B');
    const stand = new Map([...A, ...B].map(s => [s.globalId, s.nachher]));
    const lauf = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: VERSATZ });
    const r = await lauf.baue(B[0].globalId);
    expect(r.ok).toBe(true);
    const a = lauf.ableitungen.get(B[0].nachher.ableitung);
    return { a, vorher: lauf.ableitungen.get(A[0].nachher.ableitung).teile?.dgm?.daten ?? null, dgmB: r };
}

describe('Die Auffüllung folgt dem Planum darunter', () => {
    const opsB = auffuellungAufA(599.5);

    it('der gezeichnete Rand trägt den Verweis — und die gemessene Höhe als Rückfall', () => {
        expect(opsB[0].art).toBe('schuettung');
        for (const q of opsB[0].parameter.umriss) {
            expect(q.gelaende).toBe(0);
            expect(q.y).toBeCloseTo(599.5, 3);
        }
    });

    it('A um 1 m gesenkt: der Rand folgt — die Masse wächst, wie der Böschungskörper es verlangt', async () => {
        const oben = await baueB({ hoeheA: 599.5, opsB });
        const unten = await baueB({ hoeheA: 598.5, opsB });
        const plus = unten.a.kennzahlen.auftragRaster - oben.a.kennzahlen.auftragRaster;
        // ERWARTUNG, gerechnet: Krone absolut (Randmittel + 1 m = 600,5 NN),
        // Böschung 1 : 1,5 ab dem Rand. Dicke vorher min(1, d/1,5), nachher
        // min(2, d/1,5) — d der Abstand zum Rand. NICHT „Fläche × 1 m" (das gilt
        // nur für senkrechte Wände): die Böschung frisst Krone.
        let erwartet = 0;
        const n = 400, seite = 16;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const x = (i + 0.5) / n * seite, z = (j + 0.5) / n * seite;
            const d = Math.min(x, z, seite - x, seite - z);
            erwartet += (Math.min(2, d / 1.5) - Math.min(1, d / 1.5)) * (seite / n) ** 2;
        }
        process.stderr.write(`RAND Auftrag B: ${oben.a.kennzahlen.auftragRaster.toFixed(1)} → ${unten.a.kennzahlen.auftragRaster.toFixed(1)} m³ (+${plus.toFixed(1)}, gerechnet +${erwartet.toFixed(1)})\n`);
        expect(Math.abs(plus - erwartet) / erwartet).toBeLessThan(0.05);
    });

    it('ohne Verweis (Altjournal) steht der Rand in der Luft: die Böschung beginnt 1 m über dem gesenkten Planum', async () => {
        const alt = opsB.map(op => ({ ...op, parameter: { ...op.parameter, umriss: op.parameter.umriss.map(({ gelaende, ...q }) => q) } }));
        const mit = await baueB({ hoeheA: 598.5, opsB });
        const ohne = await baueB({ hoeheA: 598.5, opsB: alt });
        // Mehr Masse OHNE Verweis: der Rand liegt auf der alten Höhe, die Böschung
        // setzt einen Meter höher an.
        expect(ohne.a.kennzahlen.auftragRaster).toBeGreaterThan(mit.a.kennzahlen.auftragRaster + 10);
    });

    it('ein zweiter Lauf ändert nichts (Idempotenz: abgetastet wird das Gelände VOR dem Vorgang)', async () => {
        const eins = await baueB({ hoeheA: 598.5, opsB });
        const zwei = await baueB({ hoeheA: 598.5, opsB });
        expect(zwei.a.kennzahlen.auftragRaster).toBeCloseTo(eins.a.kennzahlen.auftragRaster, 9);
    });
});
