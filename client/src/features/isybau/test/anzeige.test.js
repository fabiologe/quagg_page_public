/**
 * Anzeige-Punkte aus der Browserprüfung 2026-09-26 (doc/09: S2, S4, Zeitachse,
 * Haltungsnamen). Reine Funktionen bzw. der Quelltext des PDF-Exports.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatTime } from '../components/modals/results/resultsShared.js';
import { legendenEintraege, AUSLASTUNG_STUFEN, KNOTEN_ZUSTAND, UEBERSTAU_HELL, UEBERSTAU_CSS, knotenUeberstaut, knotenZustand, haltungsZustand, EINSTAU_CSS, DATENQUALITAET, AUSWAHL, FLAECHE } from '../utils/typPalette.js';
import { schriftWinkel, gedrehteHuelle, waehleBeschriftungen, platziereBeschriftungen } from '../utils/geometry2d.js';
import { fmtZahl, formatVolume } from '../components/modals/results/resultsShared.js';

describe('Zeitachse der Ganglinien (formatTime)', () => {
    it('ganze Minuten als h:mm, keine Rundungsreste wie „15:59"', () => {
        expect(formatTime(0)).toBe('0:00');
        expect(formatTime(959.99)).toBe('0:16');
        expect(formatTime(1919.5)).toBe('0:32');
        expect(formatTime(3900)).toBe('1:05');
        expect(formatTime(10800)).toBe('3:00');
    });
});

describe('Legende der 2D-Karte', () => {
    it('ohne Ergebnisse: Kanaltyp', () => {
        const l = legendenEintraege(false);
        expect(l.titel).toBe('Kanaltyp');
        expect(l.eintraege.map(e => e.label)).toContain('Regenwasser');
    });

    it('mit Ergebnissen: Auslastung in denselben Stufen wie Färbung und 3D, dazu Überstau', () => {
        const l = legendenEintraege(true);
        expect(l.titel).toBe('Auslastung');
        expect(l.eintraege.slice(0, AUSLASTUNG_STUFEN.length)).toEqual(
            AUSLASTUNG_STUFEN.map(s => ({ label: s.text, color: s.farbe })));
        expect(l.eintraege.at(-2)).toEqual({ label: 'Haltung eingestaut (gestrichelt)', color: EINSTAU_CSS, gestrichelt: true });
        expect(l.eintraege.at(-1)).toEqual({ label: 'Schacht überstaut', color: UEBERSTAU_CSS });
    });

    it('Überstau hat eine eigene Farbe (Weinrot), keine der Auslastungsstufen — auch im PDF', () => {
        expect(AUSLASTUNG_STUFEN.map(st => st.farbe.toLowerCase())).not.toContain(KNOTEN_ZUSTAND.ueberstau.toLowerCase());
        const pdf = readFileSync(fileURLToPath(new URL('../components/modals/SimulationReportExport.vue', import.meta.url)), 'utf8');
        const rgb = pdf.match(/weinrot:\[(\d+), (\d+), (\d+)\]/).slice(1).map(Number);
        const hex = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
        expect(hex).toBe(KNOTEN_ZUSTAND.ueberstau.toLowerCase());
    });

    // Kontrast gegen den Hintergrund des jeweiligen Modus, gelesen aus theme.css (WCAG, Grafik ≥ 3 : 1).
    it('Überstau-Token: hell = Weinrot, dunkel = helles Weinrot, je ≥ 3 : 1 zum Hintergrund', () => {
        const css = readFileSync(fileURLToPath(new URL('../styles/theme.css', import.meta.url)), 'utf8');
        const block = (kopf) => css.slice(css.indexOf(kopf), css.indexOf('}', css.indexOf(kopf)));
        const token = (b, name) => (b.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
        const lum = (hex) => {
            const k = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
                .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
            return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
        };
        const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const hell = block(':root[data-theme="light"]'), dunkel = block(':root[data-theme="dark"]');
        expect(token(hell, '--isy-ueberstau')).toBe(KNOTEN_ZUSTAND.ueberstau);
        expect(token(dunkel, '--isy-ueberstau')).toBe(UEBERSTAU_HELL);
        expect(kontrast(token(hell, '--isy-ueberstau'), token(hell, '--isy-pixel-bg'))).toBeGreaterThanOrEqual(3);
        expect(kontrast(token(dunkel, '--isy-ueberstau'), token(dunkel, '--isy-pixel-bg'))).toBeGreaterThanOrEqual(3);
        expect(AUSLASTUNG_STUFEN.map(st => st.farbe.toLowerCase())).not.toContain(UEBERSTAU_HELL.toLowerCase());
    });
});

describe('3D: vom Import erzeugte Knoten', () => {
    it('Türkis — keine Farbe, die schon etwas anderes bedeutet', () => {
        const belegt = [...AUSLASTUNG_STUFEN.map(st => st.farbe), ...Object.values(KNOTEN_ZUSTAND), UEBERSTAU_HELL, AUSWAHL, FLAECHE]
            .map(f => f.toLowerCase());
        expect(belegt).not.toContain(DATENQUALITAET.fiktiv.toLowerCase());
        expect(DATENQUALITAET.fiktiv).toBe('#139a9a');
    });
});

describe('Knotenzustand (eine Regel für 2D, 3D, Reiter, PDF)', () => {
    it('überstaut vor eingestaut vor ok', () => {
        expect(knotenUeberstaut({ overflow: true })).toBe(true);
        expect(knotenZustand({ floodingVolume: 21 })).toBe('überstaut');
        expect(knotenZustand({ surcharged: true, overflow: true })).toBe('überstaut');
        expect(knotenZustand({ surcharged: true })).toBe('eingestaut');
        expect(knotenZustand({ pondedVolume: 5 })).toBe('ok'); // Feld setzt der Parser nie
        expect(knotenZustand(undefined)).toBe('ok');
    });
});

describe('Haltungsnamen: Schrift entlang der Haltung, nie auf dem Kopf', () => {
    it('bringt jeden Winkel nach −90…+90°', () => {
        expect(schriftWinkel(0)).toBe(0);
        expect(schriftWinkel(45)).toBe(45);
        expect(schriftWinkel(90)).toBe(90);
        expect(schriftWinkel(135)).toBe(-45);
        expect(schriftWinkel(180)).toBe(0);
        expect(schriftWinkel(-135)).toBe(45);
        expect(schriftWinkel(-90)).toBe(-90);
    });
});

describe('Haltungsnamen: kollisionsfreie Auswahl', () => {
    it('Hülle eines gedrehten Rechtecks', () => {
        expect(gedrehteHuelle(0, 0, 10, 2, 0)).toEqual({ x1: -5, y1: -1, x2: 5, y2: 1 });
        const h = gedrehteHuelle(0, 0, 10, 2, 90);
        expect(h.x1).toBeCloseTo(-1, 9); expect(h.y2).toBeCloseTo(5, 9);
    });

    it('längere Haltung zuerst, überlappende und von Knotenbeschriftungen verdeckte Namen fallen weg', () => {
        const k = (id, x, prio) => ({ id, prio, huelle: gedrehteHuelle(x, 0, 10, 2, 0) });
        const knotenBeschriftung = gedrehteHuelle(100, 0, 10, 2, 0);
        const ids = waehleBeschriftungen(
            [k('kurz', 4, 1), k('lang', 0, 9), k('frei', 30, 5), k('unterKnoten', 102, 8)],
            [knotenBeschriftung]);
        expect([...ids].sort()).toEqual(['frei', 'lang']);
    });

    it('der eigene Fließpfeil blockiert den Namen nicht, ein fremder schon', () => {
        const name = (id, x) => ({ id, prio: 1, huelle: gedrehteHuelle(x, 0, 10, 2, 0) });
        const pfeil = (von, x) => ({ ...gedrehteHuelle(x, 0, 3, 3, 0), von });
        const ids = waehleBeschriftungen([name('A', 0), name('B', 50)], [pfeil('A', 0), pfeil('X', 50)]);
        expect([...ids]).toEqual(['A']);
    });
});

describe('Schachtbeschriftungen: ausweichen, sonst ausblenden', () => {
    const box = (x, y) => ({ x1: x - 5, y1: y - 1, x2: x + 5, y2: y + 1 });
    it('erster freier Platz gewinnt, feste (verschobene) blockieren, nichts frei → −1', () => {
        const { wahl, gesetzt } = platziereBeschriftungen([
            { id: 'A', plaetze: [box(0, 0), box(0, 10)] },
            { id: 'B', plaetze: [box(0, 0), box(0, 10), box(20, 0)] },   // oben belegt → unten belegt → rechts
            { id: 'C', plaetze: [box(0, 0), box(0, 10)] },               // alles belegt → ausgeblendet
            { id: 'V', plaetze: [box(0, 0)], fest: true },               // vom Nutzer verschoben, steht fest
        ]);
        expect(wahl.get('V')).toBe(0);
        expect(wahl.get('A')).toBe(1); // oben ist von V belegt
        expect(wahl.get('B')).toBe(2);
        expect(wahl.get('C')).toBe(-1);
        expect(gesetzt).toHaveLength(3);
    });
});

describe('Dezimalkomma im Ergebnisfenster', () => {
    it('fmtZahl / formatVolume', () => {
        expect(fmtZahl(1234.5, 2)).toBe('1.234,50');
        expect(fmtZahl(0.8, 2)).toBe('0,80');
        expect(fmtZahl(-0.584, 1)).toBe('-0,6');
        expect(fmtZahl(null)).toBe('–');
        expect(fmtZahl(NaN)).toBe('–');
        expect(formatVolume(0)).toBe('0,00');
    });

    // Anzeigetexte der Reiter und des PDF: keine toFixed mehr (liefern Dezimalpunkt).
    for (const datei of ['results/ResultsGeneralTab.vue', 'results/ResultsNodesTab.vue', 'results/ResultsEdgesTab.vue', 'SimulationReportExport.vue']) {
        it(`${datei}: kein toFixed in Anzeigetexten`, () => {
            const q = readFileSync(fileURLToPath(new URL(`../components/modals/${datei}`, import.meta.url)), 'utf8');
            const zeilen = q.split('\n').filter(z => z.includes('toFixed(') && !z.includes('// Zahl, keine Anzeige'));
            expect(zeilen).toEqual([]);
        });
    }
});

describe('PDF-Bericht: nur Zeichen, die die jsPDF-Standardschrift kennt', () => {
    // Ψ kam als „¨", Δt als „"t" im PDF an (Schrift ohne griechische Buchstaben).
    const quelle = readFileSync(fileURLToPath(new URL('../components/modals/SimulationReportExport.vue', import.meta.url)), 'utf8');
    const ohneKommentare = quelle
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(z => z.replace(/\/\/.*$/, '')).join('\n');

    // ≤ und ≥ kamen in der Kartenlegende verstümmelt an (Browserprüfung P1, 2026-09-26)
    it('nur WinAnsi-Zeichen (cp1252) in Zeichenketten, auch in den Stufentexten aus typPalette', () => {
        const cp1252Extra = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
        const ok = (ch) => ch.charCodeAt(0) < 0x100 || cp1252Extra.includes(ch);
        const strings = [...ohneKommentare.matchAll(/(['`])((?:(?!\1)[^\n])*)\1/g)].map(m => m[2]);
        expect(strings.filter(t => [...t].some(ch => !ok(ch)))).toEqual([]);
        const winAnsi = (t) => String(t).replace(/≤/g, 'bis').replace(/≥/g, 'ab');
        for (const st of AUSLASTUNG_STUFEN) expect([...winAnsi(st.text)].every(ok), st.text).toBe(true);
        expect(quelle).toContain('winAnsi(st.text)');
    });

    it('keine griechischen Buchstaben in Zeichenketten', () => {
        const funde = [...ohneKommentare.matchAll(/(['"`])((?:(?!\1).)*[Ͱ-Ͽ](?:(?!\1).)*)\1/g)].map(m => m[0]);
        expect(funde).toEqual([]);
    });
});

// Entscheidung 2026-09-26: Auslastung = Q/Qvoll, Einstau (h/hvoll) getrennt.
// Am echten Lauf: test/e2eTutorialnetz.test.js (R_002: h/hvoll 1,00 bei Q/Qvoll 1 %, vorher „Überlastet“).
describe('Haltungszustand: Q/Qvoll und Einstau getrennt', () => {
    it('eingestaut, aber gering ausgelastet → Status eingestaut, Farbe der Q/Qvoll-Stufe', () => {
        const z = haltungsZustand({ type: 'CONDUIT', maxFlow: 41.2, capacity: 242.1, flowCapacityRatio: 0.17, depthRatio: 1.0 });
        expect(z.auslastung).toBeCloseTo(17.02, 2);
        expect(z.eingestaut).toBe(true);
        expect(z.status).toBe('eingestaut');
        expect(z.farbe).toBe(AUSLASTUNG_STUFEN.at(-1).farbe);
    });
    it('Q/Qvoll > 1 → überlastet (vor eingestaut); exaktes Qvoll vor gerundeter SWMM-Spalte', () => {
        expect(haltungsZustand({ type: 'CONDUIT', maxFlow: 130, capacity: 100, flowCapacityRatio: 1.3, depthRatio: 1 }).status).toBe('überlastet');
        expect(haltungsZustand({ type: 'CONDUIT', maxFlow: 95, capacity: 100, flowCapacityRatio: 1.0, depthRatio: 0.8 }).status).toBe('> 90 %');
        expect(haltungsZustand({ type: 'CONDUIT', flowCapacityRatio: 0.6, depthRatio: 0.5 }).status).toBe('> 50 %');
        expect(haltungsZustand({ type: 'CONDUIT', flowCapacityRatio: 0.3, depthRatio: 0.5, surcharge: { hoursFullBoth: 0.2 } }).status).toBe('eingestaut');
        // 0,01 h ist SWMMs Druck-Untergrenze (statsrpt.c MAX(0.01, t)), kein Vollfüllen
        expect(haltungsZustand({ type: 'CONDUIT', flowCapacityRatio: 0.04, depthRatio: 0.58, surcharge: { hoursFullBoth: 0.01, hoursFullDown: 2.8 } }).eingestaut).toBe(false);
    });
    it('Wehr/Drossel: kein Qvoll → keine Auslastung, keine Farbe', () => {
        const z = haltungsZustand({ type: 'WEIR', maxFlow: 50, depthRatio: 0.4 });
        expect([z.auslastung, z.farbe, z.status]).toEqual([null, null, '–']);
    });
    it('fünf Stufen, fünf verschiedene Farben', () => {
        expect(new Set(AUSLASTUNG_STUFEN.map(s => s.farbe)).size).toBe(5);
    });
});
