// @vitest-environment jsdom
/**
 * Pfadschritte im Journal (Teil XXIII, A7a/b; Befund B17).
 *
 * Im Speicher bleibt jeder Schritt ein voller Bauplan; die DATEI speichert
 * einen `erzeugt`-Schritt ab Schreibstufe 3 als Pfadänderung gegen den vorigen
 * Stand desselben Bauteils. Geprüft am echten Weg: Eckzüge über den Store,
 * `_sichern` in die Ablage, neues Laden, Undo danach.
 *
 * Und der Schutz (Leitplanke 4): ein Journal, das mehr verlangt, als der
 * Client kennt — oder eine fehlende Grundlage hat —, wird gelesen, nie
 * überschrieben.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';
import { entfalte, patchAus, setzeSchreibStufeFuerTests, verdichte, wendeAn } from '../services/JournalFormat.js';
import { predefinedTypeVon } from '../services/Bauteilrezepte.js';

const SCHLUESSEL = 'ifc-repo:global:aenderungen';
const gespeichert = () => localStorage.getItem(SCHLUESSEL);

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });
afterEach(() => setzeSchreibStufeFuerTests(2));

describe('Pfade: diff und anwenden', () => {
    it('patchAus → wendeAn ergibt genau den neuen Wert, ohne den alten zu verändern', () => {
        const alt = { a: 1, b: { c: [1, 2, { d: 'x' }], e: null }, f: [1, 2] };
        const neu = { a: 1, b: { c: [1, 5, { d: 'y', z: true }] }, f: [1, 2, 3], g: 'neu' };
        const kopie = JSON.parse(JSON.stringify(alt));
        const p = patchAus(alt, neu);
        expect(wendeAn(alt, p)).toEqual(neu);
        expect(alt).toEqual(kopie);
        expect(p.map(x => x.pfad.join('.'))).toEqual(['b.e', 'b.c.1', 'b.c.2.d', 'b.c.2.z', 'f', 'g']);
    });
    it('verdichte → entfalte ist die Identität — auch über mehrere Bauteile', () => {
        const b = (x) => ({ rezept: 'erdbau', parameter: { operationen: [{ art: 'grube', parameter: { umriss: [{ x, y: 1, z: 0 }, { x: 5, y: 1, z: 5 }] } }] } });
        const schritte = [
            { id: 's1', art: 'erzeugt', globalId: 'A', nachher: b(0), vorher: null },
            { id: 's2', art: 'kg', globalId: 'A', nachher: '410', vorher: null },
            { id: 's3', art: 'erzeugt', globalId: 'B', nachher: b(9), vorher: null },
            { id: 's4', art: 'erzeugt', globalId: 'A', nachher: b(1), vorher: b(0) },
            { id: 's5', art: 'erzeugt', globalId: 'A', nachher: b(2), vorher: b(1) },
        ];
        const { schritte: dicht, verdichtet } = verdichte(schritte);
        expect(verdichtet).toBeGreaterThan(0);
        expect(dicht[3].nachher._pfade.basis).toBe('s1');
        expect(dicht[4].nachher._pfade.basis).toBe('s4');
        const { schritte: voll, fehlend } = entfalte(JSON.parse(JSON.stringify(dicht)));
        expect(fehlend).toEqual([]);
        expect(voll).toEqual(schritte);
    });
});

// ── am echten Weg ─────────────────────────────────────────────────────────
const ring = (dx) => Array.from({ length: 12 }, (_, i) => {
    const w = (i / 12) * Math.PI * 2;
    return { x: 20 + dx + Math.cos(w) * 8, y: 600 + i * 0.01, z: 20 + Math.sin(w) * 8 };
});
const plan = (rolle) => ({
    rezept: 'erdbau', rolle, ableitung: 'ab-1', name: `Ur · Ausheben · ${rolle}`,
    kategorie: rolle === 'aushub' ? 'IFCEARTHWORKSCUT' : 'IFCEARTHWORKSFILL',
    parameter: {
        quellen: { gelaende: 'DGM1' }, quellBasis: { gelaende: null }, raster: { cell: 1 },
        // VIER Operationen — die Messung des Plans.
        operationen: [0, 30, 60, 90].map(dx => ({ art: 'grube', parameter: { umriss: ring(dx), sohle: 597.5, neigung: 1.5 } })),
    },
});
const resolverLeer = { forElements: () => ({ async getForm(form) { return { form, data: null, perElement: [], warnings: [] }; } }) };

async function zwanzigEckzuege() {
    const ae = useAenderungen();
    await ae.eintragen({ art: 'erzeugt', globalId: 'cde-aushub', nachher: plan('aushub'), modell: 'cde' });
    await ae.eintragen({ art: 'erzeugt', globalId: 'cde-auftrag', nachher: plan('auftrag'), modell: 'cde' });
    const b = useBearbeitung();
    for (let k = 0; k < 20; k++) {
        await b.einordne({ globalId: 'cde-aushub', modelId: CDE_MODELL_ID, localId: 7, hoehenversatz: 0, versatz: { x: 0, y: 0, z: 0 } }, resolverLeer);
        expect(b.starte('erdbau-stuetzpunkt-verschieben', { subjekt: b.bauteil })).toBe(true);
        b.setzeWert('op', k % 4); b.setzeWert('feld', 'umriss'); b.setzeWert('index', k % 12);
        b.setzeWert('ost', 20 + k * 0.5); b.setzeWert('nord', -(20 + k * 0.25)); b.setzeWert('hoehe', 600 + k * 0.01);
        await b.ausfuehren({ wer: 'pruefer', subjekt: b.bauteil, modell: 'cde' });
    }
    return ae;
}

describe('20 Eckzüge an einem Vorgang mit vier Operationen', () => {
    // GEMESSEN 2026-09-18: 203 649 → 25 616 Zeichen, Faktor 8,0. Der Plan
    // erwartete > 10; was bleibt, sind je Schritt die Metadaten (Kennung,
    // Zeit, Vorgang, Bearbeiter — rund die Hälfte eines verdichteten
    // Schritts) und die zwei vollen Anfangsstände.
    it('Stufe 2 (heute) gegen Stufe 3: die Datei schrumpft etwa um das Achtfache', async () => {
        await zwanzigEckzuege();
        const voll = gespeichert().length;
        localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true);
        setzeSchreibStufeFuerTests(3);
        await zwanzigEckzuege();
        const dicht = gespeichert().length;
        process.stderr.write(`JOURNAL 20 Eckzüge: ${voll} → ${dicht} Zeichen (Faktor ${(voll / dicht).toFixed(1)})\n`);
        expect(voll / dicht).toBeGreaterThan(7);
        expect(JSON.parse(gespeichert()).mindestClient).toBe(3);
    });

    it('neu geladen: derselbe Stand, und Undo läuft wie vorher', async () => {
        setzeSchreibStufeFuerTests(3);
        const ae = await zwanzigEckzuege();
        const vorher = JSON.parse(JSON.stringify([...ae.wirksamerStand('erzeugt')]));
        const eintraege = JSON.parse(JSON.stringify(ae.eintraege));

        // Nichts Abgeleitetes in der Datei (B15): der PredefinedType der
        // Ableitungsteile fehlt dort — und die Ableitung liefert denselben.
        expect(gespeichert()).not.toMatch(/"predefinedType"/);
        const ohnePt = (x) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'predefinedType' ? undefined : v)));

        setActivePinia(createPinia());                    // ein neuer Tab
        const neu = useAenderungen();
        await neu.bereit;
        expect(neu.nurLesen).toBeNull();
        expect(ohnePt(neu.eintraege)).toEqual(ohnePt(eintraege));
        expect(ohnePt([...neu.wirksamerStand('erzeugt')])).toEqual(ohnePt(vorher));
        const vorherPt = new Map(vorher.map(([g, w]) => [g, w.predefinedType]));
        for (const [g, w] of neu.wirksamerStand('erzeugt')) expect(predefinedTypeVon(w), g).toBe(vorherPt.get(g));

        await neu.zurueck('pruefer');
        const nachUndo = neu.wirksamerStand('erzeugt').get('cde-aushub').parameter.operationen[3].parameter.umriss[7];
        // Der letzte Zug (k = 19: Operation 3, Ecke 7) ist zurückgenommen —
        // dort steht wieder, was k = 7 an DIESELBE Ecke gezogen hatte.
        expect(nachUndo).toEqual({ x: 20 + 7 * 0.5, y: 600 + 7 * 0.01, z: 20 + 7 * 0.25 });
    });
});

describe('Schutz: lesen, nie überschreiben', () => {
    it('ein Journal einer NEUEREN CDE (mindestClient 4) wird gezeigt, aber nicht überschrieben', async () => {
        const fremd = { version: 2, mindestClient: 4, commits: [{ id: 'c1', nachricht: 'x', wer: 'petra', wann: 1,
            schritte: [{ id: 's1', art: 'kg', globalId: 'G1', nachher: '410', vorher: null, wann: 1 }] }], sitzung: null,
            schreibstand: { zaehler: 3, marke: 'FREMD', wer: 'petra', wann: 1 } };
        localStorage.setItem(SCHLUESSEL, JSON.stringify(fremd));
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.nurLesen?.grund).toMatch(/neueren CDE/);
        expect(ae.wirksamerStand('kg').get('G1')).toBe('410');
        expect(await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '420' })).toBeNull();
        expect(JSON.parse(gespeichert())).toEqual(fremd);                // unberührt
        // Und die Bearbeitung sagt, warum.
        const b = useBearbeitung();
        await b.einordne({ globalId: 'G2', modelId: 'm', localId: 1, category: 'IFCWALL' }, null);
        b.starte('kg-setzen'); b.setzeWert('kg', '420');
        expect(await b.ausfuehren({ wer: 'x' })).toBeNull();
        expect(b.letzterGrund).toMatch(/neueren CDE/);
    });

    it('eine fehlende Grundlage macht das Journal nur lesbar — geraten wird nicht', async () => {
        const kaputt = { version: 2, mindestClient: 3, commits: [{ id: 'c1', nachricht: 'x', wer: 'p', wann: 1,
            schritte: [{ id: 's2', art: 'erzeugt', globalId: 'A', nachher: { _pfade: { basis: 's1', patch: [] } }, vorher: null }] }],
            sitzung: null };
        localStorage.setItem(SCHLUESSEL, JSON.stringify(kaputt));
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.nurLesen?.grund).toMatch(/unvollständig/);
        expect(await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '420' })).toBeNull();
        expect(JSON.parse(gespeichert())).toEqual(kaputt);
    });

    it('Stufe 2 (A7a ausgeliefert) schreibt, wie es immer schrieb — kein mindestClient, kein Pfad', async () => {
        await zwanzigEckzuege();
        const roh = JSON.parse(gespeichert());
        expect(roh.mindestClient).toBeUndefined();
        expect(gespeichert()).not.toContain('_pfade');
    });
});
