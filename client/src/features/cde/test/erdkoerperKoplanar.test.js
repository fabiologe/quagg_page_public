/**
 * Erdkörper und Geländeanzeige — dieselbe Fläche, nicht fast dieselbe
 * (Teil XXI, P1b; Fabio 2026-09-17: „zittert und überlappt").
 *
 * DER BEFUND. Der Deckel eines Auftrags IST das geformte Gelände: beide
 * entstehen aus demselben Rasterstand. Sie entstehen aber auf zwei Wegen —
 * der Körper auf dem feinen Korridor (aus der TIN abgetastet, Ursprung =
 * Korridorbox), die Anzeige auf dem groben Raster plus Flicken (aus dem
 * GROBEN Raster abgetastet, Ursprung = grobes Gitter). Zwei Flächen, die
 * dasselbe meinen und sich um Zentimeter durchdringen, flimmern.
 *
 * GEMESSEN WIRD ZWISCHEN DEN KNOTEN. An den Knoten stimmen beide Wege oft
 * überein; sichtbar wird der Unterschied dort, wo zwei Dreiecke einander
 * schneiden. Deshalb tastet dieser Test beide Flächen auf einem feinen
 * Punktgitter ab — dieselbe Grösse, die das Auge sieht.
 */
import { describe, expect, it } from 'vitest';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, geometrieAusTeil, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';
import { makeHeightSampler } from '../services/geometry/HeightSampler.js';
import { dreieckeAusRaster, dreieckeMitFlicken } from '../services/geometry/SurfaceOps.js';

/** Ein welliges Gelände als TIN — die Quelle, aus der jedes Raster abgetastet wird. */
function gelaende() {
    const h = (x, z) => 300 + 0.35 * Math.sin(x / 9) + 0.25 * Math.cos(z / 7) + 0.02 * x;
    const t = [];
    for (let x = 0; x < 60; x++) for (let z = 0; z < 60; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = gelaende();
const ZELLE = 2;
const hNn = (x, z) => 600 + 0.35 * Math.sin(x / 9) + 0.25 * Math.cos(z / 7) + 0.02 * x;   // Welt + Höhenversatz 300

/**
 * Die Quelle liefert JEDE verlangte Form — mit `bereich` UND `gitter`, genau wie
 * `IfcEngine._quellFormVon`. Eine Attrappe, die `gitter` verschluckt, prüfte eine
 * Schnittstelle, die es nicht gibt.
 */
const holeQuellForm = async (gid, form, opts = {}) => {
    if (gid !== 'DGM1' || form !== 'raster') return null;
    return rasterAusMesh({ mesh: NETZ }, {
        cell: opts.cell ?? ZELLE, bereich: opts.bereich ?? null, gitter: opts.gitter ?? null }).ergebnis;
};
const standAus = (...listen) => new Map(listen.flat().map(s => [s.globalId, s.nachher]));
const lauf = (stand) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });

const vorgang = (ops, name) => ableitungsSchritte({
    rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: ZELLE }, operationen: ops, name });
const anzeige = (vorgaenge) => ableitungsSchritte({
    rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: ZELLE }, operationen: [] })
    .map(s => ({ ...s, nachher: { ...s.nachher, parameter: { ...s.nachher.parameter, vorgaenge } } }));
const idVon = (schritte) => schritte[0].nachher.ableitung;
const teil = (schritte, rolle) => schritte.find(s => s.nachher.rolle === rolle);

const ecken = [[14, 14], [34, 14], [34, 34], [14, 34]];
const GRUBE = { art: 'grube', parameter: {
    umriss: ecken.map(([x, z]) => ({ x, y: hNn(x, z), z })), sohle: 597.5, neigung: 1.5 } };
const FUELLEN = { art: 'schuettung', parameter: {
    umriss: ecken.map(([x, z]) => ({ x, y: hNn(x, z), z })), ziel: 'ur', hoehe: 0, neigung: 1.5 } };
// Ein schmales Gerinne — 1,5 m Sohle in 2-m-Zellen zwingt den feinen Korridor
// (`_zuFeinFuerZelle`), und genau dann tasten Körper und Anzeige verschieden ab.
const GERINNE = { art: 'gerinne', parameter: {
    achse: [{ x: 10, z: 24 }, { x: 44, z: 26 }], sohlbreite: 1.5, boeschung: 1.5,
    sohleAnfang: 598.6, sohleEnde: 598.2 } };

/** Die gezeichnete Anzeigefläche — Raster + Flicken, wie `geometrieAusTeil` sie baut. */
function flaecheAusTeil(t) {
    const netz = t.flicken?.length ? dreieckeMitFlicken(t.daten, t.flicken) : dreieckeAusRaster(t.daten);
    const s = makeHeightSampler(netz.positions, netz.triCount);
    return (x, z) => s.sample(x, z);
}

/** Die OBERSEITE eines Körpers als Fläche — der Sampler nimmt ohnehin das höchste Dreieck. */
function deckelFlaeche({ positions, triCount }) {
    const s = makeHeightSampler(positions, triCount);
    return (x, z) => s.sample(x, z);
}

/**
 * Die UNTERSEITE eines Körpers — bei einem Aushub die Sohle, und die IST die
 * Anzeige nach dem Schnitt. Derselbe Sampler, am y gespiegelt: sein „höchstes
 * Dreieck" ist dann das tiefste.
 */
function sohleFlaeche({ positions, triCount }) {
    const p = Float64Array.from(positions);
    for (let i = 1; i < p.length; i += 3) p[i] = -p[i];
    const s = makeHeightSampler(p, triCount);
    return (x, z) => { const y = s.sample(x, z); return y == null ? null : -y; };
}

/**
 * Der grösste Abstand zweier Flächen auf einem feinen Punktgitter im Bereich
 * `box` — die Grösse, die man als Durchdringung sieht.
 */
function groessterAbstand(a, b, box, schritt = 0.25) {
    let max = 0, gemessen = 0;
    for (let x = box.x0; x <= box.x1; x += schritt) {
        for (let z = box.z0; z <= box.z1; z += schritt) {
            const ha = a(x, z), hb = b(x, z);
            if (ha == null || hb == null || !Number.isFinite(ha) || !Number.isFinite(hb)) continue;
            max = Math.max(max, Math.abs(ha - hb));
            gemessen++;
        }
    }
    return { max, gemessen };
}

describe('Der Deckel eines Erdkörpers liegt AUF der Geländeanzeige, nicht neben ihr', () => {
    it('Grube, dann Auffüllen bis GOK: Auftragsdeckel und Anzeige sind eine Fläche', async () => {
        const A = vorgang([GRUBE], 'Ur'), B = vorgang([FUELLEN], 'Ur');
        const Z = anzeige([{ ableitung: idVon(A), titel: 'Ausheben' }, { ableitung: idVon(B), titel: 'Auffüllen' }]);
        const l = lauf(standAus(A, B, Z));
        const auftrag = await l.baue(teil(B, 'auftrag').globalId);
        const z = await l.baue(Z[0].globalId);
        expect(auftrag.ok && z.ok).toBe(true);

        const { max, gemessen } = groessterAbstand(
            deckelFlaeche(auftrag.teil.daten), flaecheAusTeil(z.teil), { x0: 15, x1: 33, z0: 15, z1: 33 });
        expect(gemessen).toBeGreaterThan(4000);
        console.log(`  [Messung] Auffuellung bis GOK: ${gemessen} Punkte, groesster Abstand ${max.toFixed(3)} m`);
        expect(max).toBeLessThan(0.005);
    });

    it('die offene Grube: Sohle, Böschung und Rand liegen auf der Anzeige — auch am Knick', async () => {
        // Ohne Korridor (die Grube ist gross): beide Flächen kommen aus DEMSELBEN
        // groben Raster — aber der Körper trianguliert jede Zelle über die
        // Diagonale 00–11, die Anzeige über die flachere. An einem Knick (Rand
        // der Grube, Sohlkante) können daraus zwei verschiedene Flächen werden.
        const A = vorgang([GRUBE], 'Ur');
        const Z = anzeige([{ ableitung: idVon(A), titel: 'Ausheben' }]);
        const l = lauf(standAus(A, Z));
        const aushub = await l.baue(teil(A, 'aushub').globalId);
        const z = await l.baue(Z[0].globalId);
        const { max, gemessen } = groessterAbstand(
            sohleFlaeche(aushub.teil.daten), flaecheAusTeil(z.teil), { x0: 12, x1: 36, z0: 12, z1: 36 });
        expect(gemessen).toBeGreaterThan(4000);
        console.log(`  [Messung] offene Grube: ${gemessen} Punkte, groesster Abstand ${max.toFixed(3)} m`);
        expect(max).toBeLessThan(0.01);
    });

    it('ein schmales Gerinne (feiner Korridor): Aushubdeckel und Anzeige ebenso', async () => {
        // Hier tastet der Körper die TIN ab, die Anzeige das grobe Raster —
        // gemessen 2026-09-17 vor der Kur: 0,24 m Durchdringung.
        const A = vorgang([GERINNE], 'Ur');
        const Z = anzeige([{ ableitung: idVon(A), titel: 'Gerinne' }]);
        const l = lauf(standAus(A, Z));
        const aushub = await l.baue(teil(A, 'aushub').globalId);
        const z = await l.baue(Z[0].globalId);
        expect(aushub.ok && z.ok).toBe(true);
        expect(l.ableitungen.get(idVon(A)).kennzahlen.korridor).toBe(true);   // der Fall, um den es geht

        // Die SOHLE des Aushubs ist das Gelände NACH dem Schnitt — genau das,
        // was die Anzeige zeigt. (Sein Deckel ist das Gelände davor.)
        const { max, gemessen } = groessterAbstand(
            sohleFlaeche(aushub.teil.daten), flaecheAusTeil(z.teil), { x0: 12, x1: 42, z0: 20, z1: 30 });
        expect(gemessen).toBeGreaterThan(3000);
        console.log(`  [Messung] schmales Gerinne: ${gemessen} Punkte, groesster Abstand ${max.toFixed(3)} m`);
        // Vor der Kur: 0,085 m (Körper aus der TIN, Anzeige aus dem groben
        // Raster, beide auf eigenem Gitter). Danach: die Dicke des Randkeils.
        expect(max).toBeLessThan(0.01);
    });
});
