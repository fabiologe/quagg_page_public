// @vitest-environment jsdom
/**
 * Teil XXXII, Block 3 — O4 „Aufs Gelände legen" und O5 „Reihe entlang einer Achse".
 *
 * Echter Weg: Bauteile über Kommandos, beide Werkzeuge über `fuehreAus` ins Journal. Die Geländehöhen liegen beim
 * Drapieren ABSOLUT im Kommando (im Viewer vorbelegt aus dem Sampler) — hier nennt sie der Test, wie ein Skript.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { kommando } from './hilfen/ruebKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
const neue = (vorher) => [...ae.wirksamerStand('erzeugt').keys()].filter(g => !vorher.has(g));
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of [
        // Die Achse: ein L — 40 m nach Osten, dann 30 m nach Norden.
        kommando('rohr-zeichnen', { neu: ['cde-A'], werte: { name: 'Strasse', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
                                    eingaben: { zug: [e(0, 0, 100), e(40, 0, 102), e(40, 30, 102)] } }),
        // Der Leitpfosten 2 m neben dem Anfang der Achse (Süden).
        kommando('pfosten-zeichnen', { neu: ['cde-P'], werte: { name: 'Leitpfosten', kategorie: 'IFCSIGN', hoehe: '', laenge: 1, breite: 0.12, tiefe: 0.3 },
                                       eingaben: { zug: [e(0, -2, 100)] } }),
    ]) {
        const r = await b.fuehreAus(k);
        if (!r.ausgefuehrt) throw new Error(`${k.werkzeug}: ${r.grund}`);
    }
});
afterEach(() => repo.setBackend(null));

describe('O4 — aufs Gelände legen', () => {
    it('jeder Punkt auf seine Geländehöhe plus Abstand, Lage bleibt, dieselbe Kennung', async () => {
        const vor = plan('cde-A').parameter.punkte.map(p => [...p]);
        const r = await b.fuehreAus(kommando('aufs-gelaende-legen', { ziel: ['cde-A'], werte: { abstand: -1.5, hoehen: [101, 103, 104] } }));
        expect(r.ausgefuehrt, r.grund).toBe(true);
        const nach = plan('cde-A').parameter.punkte;
        expect(nach.map(p => p[1])).toEqual([99.5, 101.5, 102.5]);
        expect(nach.map(p => [p[0], p[2]])).toEqual(vor.map(p => [p[0], p[2]]));
        expect(plan('cde-A').rezept).toBe('rohr');
    });

    it('ohne Gelände unter jedem Punkt: abgelehnt mit Grund, nichts geschrieben; schon dort: kein Schritt', async () => {
        const n = ae.eintraege.length;
        const r = await b.fuehreAus(kommando('aufs-gelaende-legen', { ziel: ['cde-A'], werte: { abstand: 0, hoehen: [101, null, 104] } }));
        expect(r.ausgefuehrt).toBe(false);
        expect(r.grund).toMatch(/kein Gelände/);
        expect(ae.eintraege.length).toBe(n);
        const y = plan('cde-A').parameter.punkte.map(p => p[1]);
        const gleich = await b.fuehreAus(kommando('aufs-gelaende-legen', { ziel: ['cde-A'], werte: { abstand: 0, hoehen: y } }));
        expect(gleich.ausgefuehrt).toBe(false);
        expect(ae.eintraege.length).toBe(n);
    });

    it('der Katalog: an eigenen Punkt-/Linien-/Flächenbauteilen; die Höhen sind ein verborgenes Feld, vorbelegt vom Subjekt', () => {
        for (const bauform of ['punkt', 'linie', 'achse+profil', 'flaeche', 'flaeche+dicke']) {
            expect(passende({ bauform, guete: 'gemessen' }, { eigenes: true }).map(w => w.id), bauform).toContain('aufs-gelaende-legen');
        }
        expect(passende({ bauform: 'achse+profil', guete: 'gemessen' }, { eigenes: false }).map(w => w.id)).not.toContain('aufs-gelaende-legen');
        const w = nachId('aufs-gelaende-legen');
        expect(w.felder.find(f => f.name === 'hoehen')).toMatchObject({ typ: 'liste', verborgen: true });
        // Vorbelegt aus der Höhenabfrage, die der Viewer hereinreicht (hier: eine schiefe Ebene).
        expect(w.vorbelegung({ globalId: 'cde-A' }, { kandidatenVon: b.kandidatenVon })).toMatchObject({ hoehen: [] });
        b.setzeHoehenquelle((x, z) => 90 + x / 10 + z / 100);
        expect(w.vorbelegung({ globalId: 'cde-A' }, { kandidatenVon: b.kandidatenVon }).hoehen).toEqual([90, 94, 93.7]);
    });
});

describe('O5 — Reihe entlang einer Achse', () => {
    const reihe = (werte) => b.fuehreAus(kommando('reihe', { ziel: ['cde-P'], werte: { anzahl: 5, ost: 5, nord: 0, ...werte } }),
                                         { kennungsgeber: () => `cde-r${Math.random().toString(36).slice(2, 8)}` });

    it('Achsen sind eigene offene Punktlisten — nicht das Subjekt, keine Fläche', () => {
        const k = b.kandidatenVon('eigene:achse', { globalId: 'cde-P' });
        expect(k.map(x => x.id)).toEqual(['cde-A']);
    });

    it('Kopien alle 25 m auf der Achse, der seitliche Abstand bleibt, nach dem Knick zur Achse gedreht, Höhe folgt', async () => {
        const vorher = new Set(ae.wirksamerStand('erzeugt').keys());
        const r = await reihe({ entlang: 'cde-A', abstand: 25, ausrichten: 'ja' });
        expect(r.ausgefuehrt, r.grund).toBe(true);
        const kopien = neue(vorher).map(plan);
        // Achse 70 m lang, Original bei Station 0 → Stationen 25, 50 (die 75 liegt hinter dem Ende).
        expect(kopien).toHaveLength(2);
        const mitte = (p) => { const q = p.parameter.punkte[0]; return { x: q[0], y: q[1], z: q[2] }; };
        // Station 25: 2 m südlich der Achse (x = 25, Nord −2 → z = +2), Höhe 100 + 25/40·2 = 101,25.
        expect(mitte(kopien[0]).x).toBeCloseTo(25, 6);
        expect(mitte(kopien[0]).z).toBeCloseTo(2, 6);
        expect(mitte(kopien[0]).y).toBeCloseTo(101.25, 6);
        // Station 50: 10 m nach dem Knick, Achse zeigt nach Norden (−z); „rechts" der Fahrtrichtung bleibt rechts:
        // vorher Süden einer Ost-Achse, jetzt Osten einer Nord-Achse → x = 42, Nord 10 → z = −10.
        expect(mitte(kopien[1]).x).toBeCloseTo(42, 6);
        expect(mitte(kopien[1]).z).toBeCloseTo(-10, 6);
        expect(mitte(kopien[1]).y).toBeCloseTo(102, 6);
        expect(kopien.every(k => k.rezept === 'pfosten' && !k.parameter.anschluss)).toBe(true);
    });

    it('ohne Ausrichten: dieselbe Station, aber nicht gedreht — der seitliche Versatz bleibt in Welt', async () => {
        const vorher = new Set(ae.wirksamerStand('erzeugt').keys());
        await reihe({ entlang: 'cde-A', abstand: 25, ausrichten: 'nein' });
        const q = plan(neue(vorher)[1]).parameter.punkte[0];
        expect(q[0]).toBeCloseTo(40, 6);       // Achspunkt (40 | −10) + Versatz (0 | Süd 2)
        expect(q[2]).toBeCloseTo(-8, 6);
    });

    it('über den Store, wie aus der Tafel: die Achse aus der Auswahlliste', async () => {
        const vorher = new Set(ae.wirksamerStand('erzeugt').keys());
        b.modusSetzen(true);
        await b.einordne({ globalId: 'cde-P', modelId: 'cde-eigenbau', localId: 1, category: 'IFCSIGN', name: '' }, null);
        expect(b.starte('reihe')).toBeTruthy();
        expect(b.felder.find(f => f.name === 'entlang').optionen.map(o => o.wert)).toContain('cde-A');
        b.setzeWert('entlang', 'cde-A'); b.setzeWert('abstand', 25);
        await b.ausfuehren({ wer: 'Fabio' });
        expect(b.letzterGrund).toBe('');
        expect(neue(vorher)).toHaveLength(2);
    });

    it('ohne Achse: die gerade Reihe wie bisher (Ost/Nord)', async () => {
        const vorher = new Set(ae.wirksamerStand('erzeugt').keys());
        await reihe({ entlang: '', anzahl: 2, ost: 5, nord: 0 });
        expect(neue(vorher).map(g => plan(g).parameter.punkte[0][0])).toEqual([5, 10]);
    });
});

describe('der Viewer', () => {
    it('reicht dem Store die Höhenabfrage des Geländes herein — denselben Sampler wie beim Zeichnen', async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const v = readFileSync(fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, 'components/IfcViewer.vue'), 'utf8');
        expect(v).toContain('bearbeitung.setzeHoehenquelle((x, z) => engine.value?.hoeheAn?.(x, z));');
        // … und baut den Sampler nach jedem Aufbau vor — `hoeheAn` liest nur einen fertigen (Browserprobe: Höhen leer).
        expect(v).toMatch(/setzeHoehenquelle\([^\n]*\);\n\s*engine\.value\?\.gelaendeSampler\?\.\(\)/);
    });
});
