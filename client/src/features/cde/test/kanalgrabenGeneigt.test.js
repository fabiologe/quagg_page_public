/**
 * Der Kanalgraben folgt der Haltung — Gelände UND Neigung (Teil XXI, P2b/P2c).
 *
 * FABIOS BEFUND (2026-09-17): „Kanalgraben stimmt nicht mit Geländeverlauf und
 * Neigung der Haltung überein." Am Code gemessen waren es drei Dinge:
 *   1. Die Grabentiefe wurde an den ZWEI Segmentenden bestimmt und daraus EINE
 *      Sohlbreite je Segment gebildet. Über eine Haltung in geneigtem Gelände
 *      ist das eine Stufe zu viel oder zu wenig.
 *   2. Die Achshöhe galt fest als Rohrmitte — bei einer Achs-Repräsentation
 *      (isyifc: Sohlniveau) grub der Graben DN/2 zu tief.
 *   3. Die Schachtbaugrube sass auf `Platzierung − Bettung` und blieb damit
 *      über der Grabensohle stehen.
 *
 * Gemessen wird hier am ECHTEN Rezept, an einem Gelände mit Längs- UND
 * Querneigung — in beiden Richtungen, weil ein Graben quer zum Hang links und
 * rechts verschieden tief ausläuft.
 */
import { describe, expect, it } from 'vitest';
import { ABLEITUNGEN, KANALGRABEN_STATION } from '../services/ableitung/Ableitungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAbtasten, rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { rohrsohle } from '../services/Achsbezug.js';

/** Gelände mit Längs- und Querneigung: 8 % in x, −5 % in z. */
const H = (x, z) => 300 + 0.08 * x - 0.05 * z;
function gelaende() {
    const t = [];
    for (let x = 0; x < 80; x++) for (let z = 0; z < 40; z++) {
        const a = [x, H(x, z), z], b = [x + 1, H(x + 1, z), z];
        const c = [x + 1, H(x + 1, z + 1), z + 1], d = [x, H(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = gelaende();

// Eine Haltung quer über den Hang: (5,5) → (35,35), 2 % Gefälle, DN 400.
const A = { x: 5, z: 5 }, B = { x: 35, z: 35 };
const LAENGE = Math.hypot(B.x - A.x, B.z - A.z);
const DN = 400, BETTUNG = 0.1;
// Tief genug, dass die Grabentiefe die 4-m-Stufe der DIN EN 1610 Tabelle 2
// überschreitet (2,85 m am Anfang, 4,60 m am Ende): nur dann zeigt sich, ob
// die Sohlbreite der Tiefe folgt oder für die ganze Haltung gilt.
const Y_A = 297.4, Y_B = Y_A - 0.02 * LAENGE;          // Achshöhe (hier: Sohle)
const ACHSE = [{ x: A.x, y: Y_A, z: A.z }, { x: B.x, y: Y_B, z: B.z }];
const SCHACHT = { x: B.x, y: Y_B + 0.35, z: B.z };     // Platzierung ÜBER der Sohle

const holeQuellForm = async (gid, form, o = {}) => {
    if (gid === 'DGM1' && form === 'raster') {
        return rasterAusMesh({ mesh: NETZ }, { cell: o.cell ?? 1, bereich: o.bereich ?? null, gitter: o.gitter ?? null }).ergebnis;
    }
    // Eine Achs-Repräsentation: ihre Höhe IST die Sohle.
    if (gid === 'H1' && form === 'linie') return { punkte: ACHSE, dn: DN, achsbezug: 'sohle', quelle: 'axisRep' };
    // Die Hülle kennt die Schachtsohle — sie liegt unter der Platzierung.
    if (gid === 'S2' && form === 'knoten') return { ...SCHACHT, name: 'S2', unterkante: Y_B - 0.05 };
    return null;
};

const werte = (extra = {}) => [{ art: 'kanalgraben', parameter: {
    umfang: 'haltung', achsbezug: 'quelle', wandform: 'boeschung', boden: 'nichtbindig', winkelGrad: 45,
    wanddickeMm: 0, breite: null, bettung: BETTUNG, schachtMass: 1.0, dn: null, ...extra } }];

async function lauf(op = werte(), quellen = { rohre: ['H1'], schaechte: ['S2'], gelaende: 'DGM1' }) {
    const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen, raster: { cell: 1 }, operationen: op, name: 'Haltung' });
    const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 },
        vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
    const l = neuerAbleitungslauf({ stand: new Map([...schritte, ...anzeige].map(s => [s.globalId, s.nachher])),
                                    rezeptNach, holeQuellForm, kernel: erzeugeKernel() });
    const rg = await l.baue(schritte[0].globalId);
    const rd = await l.baue(anzeige[0].globalId);
    return { l, rg, rd, a: l.ableitungen.get(schritte[0].nachher.ableitung), schritte };
}

/** Punkt auf der Achse bei Anteil t — und die Sohle, die dort gelten muss. */
const auf = (t) => ({ x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, y: Y_A + (Y_B - Y_A) * t });

describe('Der Achsbezug entscheidet über jede Höhe des Grabens', () => {
    it('„aus der Quelle" liest eine Achs-Repräsentation als SOHLE — nicht als Rohrmitte', async () => {
        const { a } = await lauf();
        expect(a.kennzahlen.achsbezug).toBe('sohle');
        expect(a.kennzahlen.achsbezugWahl).toBe('quelle');
        expect(a.kennzahlen.stationen).toBe(KANALGRABEN_STATION);
    });

    it('die Grabensohle liegt eine Bettung unter der Achse — nicht DN/2 tiefer', async () => {
        const { rd } = await lauf();
        const p = auf(0.5);
        const soll = rohrsohle(p.y, { achsbezug: 'sohle', dn: DN }) - BETTUNG;
        expect(rasterAbtasten(rd.teil.daten, p.x, p.z)).toBeCloseTo(soll, 2);
        // Der ALTE Weg (Achse = Rohrmitte) läge um r = 0,20 m tiefer — genau
        // der Unterschied, den Fabio als „stimmt nicht überein" gesehen hat.
        const alt = p.y - DN / 2000 - BETTUNG;
        expect(Math.abs(soll - alt)).toBeCloseTo(0.2, 9);
        expect(rasterAbtasten(rd.teil.daten, p.x, p.z)).not.toBeCloseTo(alt, 2);
    });

    it('wer „Rohrmitte" einstellt, bekommt den alten Stand — der Regler wirkt', async () => {
        const { rd, a } = await lauf(werte({ achsbezug: 'mitte' }));
        expect(a.kennzahlen.achsbezug).toBe('mitte');
        const p = auf(0.5);
        expect(rasterAbtasten(rd.teil.daten, p.x, p.z)).toBeCloseTo(p.y - DN / 2000 - BETTUNG, 2);
    });
});

describe('Die Sohle folgt der Haltung über ihre ganze Länge', () => {
    it('an fünf Stationen stimmt das Raster auf einen Zentimeter mit der Haltung überein', async () => {
        const { rd } = await lauf();
        const abweichungen = [];
        for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const p = auf(t);
            const soll = rohrsohle(p.y, { achsbezug: 'sohle', dn: DN }) - BETTUNG;
            abweichungen.push(Math.abs(rasterAbtasten(rd.teil.daten, p.x, p.z) - soll));
        }
        expect(Math.max(...abweichungen)).toBeLessThanOrEqual(0.01);
    });

    it('die Stationen stehen im Bauplan der Operation — eine Operation je Haltung', async () => {
        const { a } = await lauf();
        // Eine Haltung → EIN Gerinne (vorher eines je Segment) + eine Baugrube.
        expect(a.kennzahlen.operationen).toBe(2);
        expect(a.kennzahlen.rohre).toBe(1);
    });
});

describe('Die Sohlbreite ist eine Stufenfunktion der Tiefe, nicht ein Wert je Haltung', () => {
    it('am tiefen Ende breiter als am flachen — beide nach DIN EN 1610', async () => {
        const { a } = await lauf();
        const k = a.kennzahlen;
        // Das Gelände steigt mit x um 8 %, die Sohle fällt mit 2 %: das Ende
        // der Haltung liegt deutlich tiefer unter Gelände als ihr Anfang.
        expect(k.tiefeMax).toBeGreaterThan(2.5);
        expect(k.sohlbreite).toBeGreaterThan(k.sohlbreiteMin);
        expect(k.regel).toMatch(/DIN EN 1610/);
    });
});

describe('Quer zum Hang läuft die Böschung links und rechts verschieden weit aus', () => {
    it('die Oberkanten liegen nicht symmetrisch zur Achse', async () => {
        const { rd } = await lauf();
        const p = auf(0.5);
        // Quer zur Achse (Achse läuft 45°, Querrichtung ist (1,-1)/√2)
        const q = (d) => ({ x: p.x + d * Math.SQRT1_2, z: p.z - d * Math.SQRT1_2 });
        const beruehrt = (d) => {
            const s = q(d);
            const vorher = H(s.x, s.z);
            const nachher = rasterAbtasten(rd.teil.daten, s.x, s.z);
            return Number.isFinite(nachher) && vorher - nachher > 0.01;
        };
        // Der äusserste berührte Punkt je Seite — in Dezimetern abgetastet.
        const weite = (vorzeichen) => {
            let letzte = 0;
            for (let d = 0.1; d <= 14; d += 0.1) if (beruehrt(vorzeichen * d)) letzte = d;
            return letzte;
        };
        const links = weite(-1), rechts = weite(1);
        expect(links).toBeGreaterThan(0);
        expect(rechts).toBeGreaterThan(0);
        // Quer zur Achse steigt das Gelände um rund 9 %; bei 1:1 wandert die
        // Oberkante bergauf näher heran als bergab. Ein symmetrischer Graben
        // wäre das Zeichen dafür, dass die Böschung das Gelände nicht trifft.
        expect(Math.abs(links - rechts)).toBeGreaterThan(0.15);
    });
});

describe('Die Schachtbaugrube schliesst an die Grabensohle an', () => {
    it('die Baugrube liegt NICHT über dem Graben — und tiefer als die Platzierung', async () => {
        const { rd } = await lauf();
        const amSchacht = rasterAbtasten(rd.teil.daten, B.x, B.z);
        const imGraben = rasterAbtasten(rd.teil.daten, auf(0.93).x, auf(0.93).z);
        // Tiefer darf sie sein (der Schacht sitzt unter der Rohrsohle) — HÖHER
        // nicht: genau das war der Absatz, den die alte Regel erzeugte.
        expect(amSchacht).toBeLessThanOrEqual(imGraben + 0.02);
        // Die Platzierung des Schachts liegt 0,35 m ÜBER der Sohle; die alte
        // Regel (`Platzierung − Bettung`) hätte die Grube dort enden lassen.
        expect(amSchacht).toBeLessThan(SCHACHT.y - BETTUNG - 0.2);
    });

    it('ohne Hülle zählen die Sohlen der anschliessenden Haltung', async () => {
        const ohneHuelle = async (gid, form, o = {}) => {
            if (gid === 'S2' && form === 'knoten') return { ...SCHACHT, name: 'S2' };   // keine `unterkante`
            return holeQuellForm(gid, form, o);
        };
        const schritte = ableitungsSchritte({ rezept: 'kanalgraben', quellen: { rohre: ['H1'], schaechte: ['S2'], gelaende: 'DGM1' },
            raster: { cell: 1 }, operationen: werte(), name: 'Haltung' });
        const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 },
            vorgaenge: [{ ableitung: schritte[0].nachher.ableitung }] });
        const l = neuerAbleitungslauf({ stand: new Map([...schritte, ...anzeige].map(s => [s.globalId, s.nachher])),
                                        rezeptNach, holeQuellForm: ohneHuelle, kernel: erzeugeKernel() });
        await l.baue(schritte[0].globalId);
        const rd = await l.baue(anzeige[0].globalId);
        const amSchacht = rasterAbtasten(rd.teil.daten, B.x, B.z);
        // Die Haltung endet hier auf `Y_B` (Sohle) — die Grube reicht bis darunter.
        expect(amSchacht).toBeLessThanOrEqual(Y_B - BETTUNG + 0.02);
    });
});

describe('Der feine Korridor und das grobe Raster sagen dasselbe', () => {
    it('die Anzeige weicht an den Stationen höchstens eine halbe Zelle ab', async () => {
        const { a, rd } = await lauf();
        expect(a.kennzahlen.korridor).toBe(true);
        expect(a.kennzahlen.zellweite).toBeLessThan(a.kennzahlen.zellweiteDgm);
        for (const t of [0.25, 0.5, 0.75]) {
            const p = auf(t);
            const soll = rohrsohle(p.y, { achsbezug: 'sohle', dn: DN }) - BETTUNG;
            expect(Math.abs(rasterAbtasten(rd.teil.daten, p.x, p.z) - soll)).toBeLessThanOrEqual(a.kennzahlen.zellweiteDgm / 2);
        }
    });
});
