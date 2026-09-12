/**
 * Die Auswahllisten der CDE (Abnahme 2026-09-12, F1/F2).
 *
 * Fabio: „Alle Dropdown-Menüs in der CDE sind noch nicht lesbar bis auf die
 * beiden, die wir händisch überarbeitet haben — erstelle einen einheitlichen
 * Style. Bei Kostengruppen reicht es nicht, die Zahl zu schreiben."
 *
 * Firefox malt das aufgeklappte Popup eines <select> nach `color-scheme` und
 * den Farben der Optionen — ohne beides hell, mit hellem Text. Jetzt: EIN
 * Stil in theme.css für jede Liste; keine Komponente pflegt einen eigenen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kgOptionen, KG_LOOKUP } from '../services/Din276Defaults.js';
import { BEARBEITUNGEN } from '../services/Bearbeitungen.js';

const WURZEL = new URL('..', import.meta.url).pathname;
const theme = readFileSync(join(WURZEL, 'styles/theme.css'), 'utf8');

function vueDateien(dir, aus = []) {
    for (const e of readdirSync(join(WURZEL, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) vueDateien(p, aus);
        else if (e.name.endsWith('.vue')) aus.push(p);
    }
    return aus;
}
const stile = (text) => [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

describe('Auswahllisten — ein Stil für alle', () => {
    it('theme.css gibt jeder Liste in der CDE Schema und Optionsfarben — über Tokens', () => {
        expect(theme).toMatch(/--cde-farbschema:\s*dark/);
        expect(theme).toMatch(/\.cde-view select,\s*\.cde-dialog select,[^{]*\{\s*color-scheme:\s*var\(--cde-farbschema\)/);
        // Datums- und Zeitfelder öffnen ebenfalls ein Popup des Browsers — dasselbe Schema.
        expect(theme).toMatch(/\.cde-view input:is\(\[type="date"\]/);
        expect(theme).toMatch(/\.cde-view :is\(option, optgroup\),\s*\.cde-dialog :is\(option, optgroup\)\s*\{[^}]*color:\s*var\(--cde-text\)[^}]*background-color:\s*var\(--cde-surface\)/);
        expect(theme).toMatch(/\.cde-view option:disabled,\s*\.cde-dialog option:disabled\s*\{[^}]*color:\s*var\(--cde-text-dim\)/);
    });

    it('keine Komponente pflegt einen eigenen Listen-Stil (kein base-select, kein color-scheme, keine Optionsfarben)', () => {
        const eigene = [];
        for (const d of [...vueDateien('components'), ...vueDateien('views')]) {
            const css = stile(readFileSync(join(WURZEL, d), 'utf8'));
            if (/appearance:\s*base-select|::picker\(select\)|color-scheme\s*:|(^|[\s,}])option\b[^{]*\{/m.test(css)) eigene.push(d);
        }
        expect(eigene).toEqual([]);
    });
});

describe('Kostengruppen mit Namen', () => {
    it('der ganze Baum: Wert = Code, Titel = „Code · Wortlaut"', () => {
        const o = kgOptionen();
        expect(o).toHaveLength(KG_LOOKUP.size);
        expect(o.find(x => x.wert === '511')?.titel).toBe('511 · Geländebearbeitung (Abtrag/Auftrag)');
        for (const x of o) expect(x.titel.startsWith(`${x.wert} · `), x.wert).toBe(true);
    });

    it('„Kostengruppe setzen" zeigt Code UND Wortlaut — vorher nur die Zahl, und 511 fehlte', () => {
        const kg = BEARBEITUNGEN.find(b => b.id === 'kg-setzen');
        const optionen = kg.felder[0].rueckfall.optionen;
        expect(optionen.length).toBeGreaterThanOrEqual(KG_LOOKUP.size);
        expect(optionen.find(x => x.wert === '511')?.titel).toContain('Geländebearbeitung');
        const nurZahl = optionen.filter(x => x.titel === x.wert);
        // Nur Codes, die eine Regel kennt, der Baum aber nicht, bleiben ohne Wortlaut.
        for (const x of nurZahl) expect(KG_LOOKUP.has(x.wert)).toBe(false);
    });
});
