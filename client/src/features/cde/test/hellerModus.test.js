// @vitest-environment jsdom
/**
 * Der helle Modus (Kassensturz H6, Abnahme 2026-09-12 K1).
 *
 * Fabio: „Es fehlt noch ein Hell-Modus (im selben Style wie Quagg-PDF)."
 * Die Werte kommen aus der Palette von Quagg-PDF; wo eine Farbe als SCHRIFT
 * dient, ist sie einen Hauch tiefer, bis sie auf jeder hellen Fläche 4,5:1
 * hält (WCAG AA). Gerechnet wird hier, nicht geschätzt.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { createPinia, setActivePinia } from 'pinia';
import { useFarbmodus } from '../stores/useFarbmodus.js';
import { IfcEngine } from '../services/IfcEngine.js';

// Unter jsdom zeigt import.meta.url nicht auf die Datei — der Pfad geht vom Arbeitsordner `client/` aus.
const WURZEL = join(process.cwd(), 'src/features/cde/');
const THEME = readFileSync(join(WURZEL, 'styles/theme.css'), 'utf8');
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');

function block(selektor) {
    const a = THEME.indexOf(`${selektor} {`);
    return a < 0 ? '' : THEME.slice(a, THEME.indexOf('\n}', a));
}
const tokens = (text) => new Map([...text.replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/(--cde-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const DUNKEL = tokens(block(':root'));
const HELL = tokens(block(':root[data-cde-modus="hell"]'));

// ── WCAG 2.1 ───────────────────────────────────────────────────────────────
const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const leucht = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const kontrast = (a, b) => { const [x, y] = [leucht(a), leucht(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const ueber = (rgb, alpha, grund) => rgb.map((c, i) => Math.round(c * alpha + grund[i] * (1 - alpha)));
const farbe = (name) => hex(HELL.get(name));

describe('heller Modus — die Tokens', () => {
    it('jede Farbe der Oberfläche hat einen hellen Wert — nur Papier und Hinweisplakette bleiben', () => {
        // Konstant: das Papier (ein Ausdruck ist weiß), die Hinweisplakette und
        // Weiß als Schrift auf kräftiger Farbe. Was aus anderen Tokens gemischt
        // wird (`var(…)`), zieht von selbst mit.
        const konstant = /^--cde-(papier|hinweis|text-invert)/;
        const literal = (v) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(v) && !v.includes('var(');
        const fehlen = [...DUNKEL].filter(([n, v]) => literal(v) && !konstant.test(n) && !HELL.has(n)).map(([n]) => n);
        expect(fehlen).toEqual([]);
        for (const n of ['--cde-float-tint', '--cde-farbschema', '--cde-szene', '--cde-szene-raster', '--cde-text-auf-farbe']) {
            expect(HELL.has(n), n).toBe(true);
        }
        expect([...HELL.keys()].filter(n => konstant.test(n))).toEqual([]);     // ein Ausdruck ist in beiden Modi weiß
        expect([...HELL.keys()].filter(n => !DUNKEL.has(n))).toEqual([]);      // kein Tippfehler, kein Waisen-Token
        expect(HELL.get('--cde-farbschema')).toBe('light');
    });

    it('jede Schriftfarbe hält auf jeder hellen Fläche 4,5:1', () => {
        const szene = farbe('--cde-szene');
        const flaechen = {
            bg: farbe('--cde-bg'), 'bg-alt': farbe('--cde-bg-alt'), 'bg-deep': farbe('--cde-bg-deep'),
            surface: farbe('--cde-surface'),
            float: ueber(HELL.get('--cde-float-tint').split(/\s+/).map(Number), 0.95, szene),
        };
        const schrift = ['text', 'text-bright', 'text-soft', 'text-dim', 'text-mute', 'text-faint', 'text-dimmer',
            'accent', 'accent-soft', 'danger', 'danger-soft', 'success', 'success-strong', 'warn', 'warn-soft',
            'issue', 'issue-soft', 'merkmal', 'merkmal-soft', 'violet', 'amber', 'amber-soft', 'terrain', 'terrain-soft'];
        const zuSchwach = [];
        for (const s of schrift) {
            for (const [f, grund] of Object.entries(flaechen)) {
                const k = kontrast(farbe(`--cde-${s}`), grund);
                if (k < 4.5) zuSchwach.push(`${s} auf ${f}: ${k.toFixed(2)}`);
            }
        }
        expect(zuSchwach).toEqual([]);
    });

    it('Schrift auf Akzent- und Warnknopf: Weiß, nicht der helle Grund (der hätte 4,4:1)', () => {
        const auf = farbe('--cde-text-auf-farbe');
        expect(kontrast(auf, farbe('--cde-accent'))).toBeGreaterThanOrEqual(4.5);
        expect(kontrast(auf, farbe('--cde-warn'))).toBeGreaterThanOrEqual(4.5);
        // Im Dunkeln bleibt es beim tiefen Grund — dort ändert sich nichts.
        expect(DUNKEL.get('--cde-text-auf-farbe')).toBe('var(--cde-bg-deep)');
        for (const [datei, regel] of [['components/CdeKopfleiste.vue', '.kl-ausgeben'], ['components/IfcViewer.vue', '.action-btn.primary'],
                                      ['views/CdeView.vue', '.cde-zoom-btn']]) {
            const quelle = lies(datei);
            const a = quelle.indexOf(`${regel} {`);
            expect(quelle.slice(a, quelle.indexOf('}', a)), `${datei} ${regel}`).toContain('color: var(--cde-text-auf-farbe)');
        }
    });

    it('`data-cde-modus` statt `data-theme` — isybau färbt jeden Knopf unter html[data-theme]', () => {
        const isybau = readFileSync(join(WURZEL, '../isybau/styles/theme.css'), 'utf8');
        expect(isybau).toMatch(/html\[data-theme\] button/);                  // der Grund steht noch
        const quellen = [];
        (function sammle(dir) {
            for (const n of readdirSync(dir)) {
                if (n === 'test') continue;
                const p = join(dir, n);
                if (statSync(p).isDirectory()) sammle(p);
                else if (/\.(vue|js)$/.test(n)) quellen.push(p);
            }
        })(WURZEL);
        const treffer = quellen.filter(p => /dataset\.theme\b|setAttribute\(\s*['"]data-theme/.test(readFileSync(p, 'utf8')));
        expect(treffer).toEqual([]);
    });
});

describe('heller Modus — Schalter und Gedächtnis', () => {
    beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.cdeModus; setActivePinia(createPinia()); });

    it('dunkel ist die Vorgabe; umschalten spiegelt auf <html> und merkt es sich je Gerät', () => {
        const m = useFarbmodus();
        expect(m.modus).toBe('dunkel');
        m.spiegeln();
        expect(document.documentElement.dataset.cdeModus).toBe('dunkel');
        m.umschalten();
        expect(m.hell).toBe(true);
        expect(document.documentElement.dataset.cdeModus).toBe('hell');
        expect(localStorage.getItem('cde-farbmodus')).toBe('hell');

        setActivePinia(createPinia());
        expect(useFarbmodus().modus).toBe('hell');                           // der nächste Start weiß es
        useFarbmodus().abraeumen();
        expect(document.documentElement.dataset.cdeModus).toBeUndefined();
    });

    it('die Schale spiegelt beim Start und räumt beim Verlassen ab', () => {
        const view = lies('views/CdeView.vue');
        expect(view).toContain('farbmodus.spiegeln();');
        expect(view).toContain('onBeforeUnmount(() => farbmodus.abraeumen());');
    });

    it('Szene, Lageplan und Längsschnitt ziehen beim Wechsel mit', () => {
        const viewer = lies('components/IfcViewer.vue');
        expect(viewer).toContain('watch(() => farbmodus.modus, szenenFarbenAnwenden);');
        expect(viewer).toMatch(/await engine\.value\.init\(canvasRef\.value\);\s*\n\s*szenenFarbenAnwenden\(\);/);
        for (const d of ['components/IfcPlanCanvas.vue', 'components/LaengsschnittCanvas.vue']) {
            expect(lies(d), d).toContain('watch(() => farbmodus.modus, baldZeichnen);');
        }
    });

    it('die Engine: Grund und Raster aus dem Modus — ein Stil mit eigenem Grund bleibt stehen', () => {
        const szene = { background: null };
        const e = Object.create(IfcEngine.prototype);
        Object.assign(e, { _getWorld: () => ({ scene: { three: szene } }), _sceneGrid: { config: { color: new THREE.Color(0xbbbbbb) } } });
        e.setzeSzenenfarben({ grund: '#e9e7e2', raster: '#8c877d' });
        expect(szene.background.getHexString()).toBe('e9e7e2');
        expect(e._sceneGrid.config.color.getHexString()).toBe('8c877d');
        e.setzeSzenenfarben({ grund: '#202932', raster: 'none' });
        expect(e._sceneGrid.config.color.getHexString()).toBe('bbbbbb');   // der Standard der Bibliothek kommt zurück
        e.setBackgroundColor('#ffffff');                                     // Planungslayer
        e.setzeSzenenfarben({ grund: '#e9e7e2' });
        expect(szene.background.getHexString()).toBe('ffffff');
        e.setBackgroundColor(null);
        expect(szene.background.getHexString()).toBe('e9e7e2');             // vorher #1a1a2e — ein Ton, den die Szene nie hatte
    });
});
