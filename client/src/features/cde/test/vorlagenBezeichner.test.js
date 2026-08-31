/**
 * Bezeichner in VORLAGEN müssen existieren (31.08.2026).
 *
 * DER ANLASS: `/cde` warf beim Rendern
 *
 *     Property "onStoreyVisible" was accessed during render but is not defined
 *     TypeError: Cannot set properties of null (setting '__vnode')
 *
 * `IfcStoreyNav` emittierte `set-visible`, die Engine konnte
 * `setStoreyVisible` — nur der Handler dazwischen fehlte. Und er war nicht der
 * einzige: dieselbe Prüfung fand VIER weitere, alle aus der
 * Composable-Zerlegung in Stufe 5:
 *
 *     onFileUpload / onFileUploadAdd   liegen in useModellAblage, wurden aber
 *                                      nie herausgeholt → „IFC laden" tat nichts
 *     resetSection / hideSection       hiessen inzwischen zuruecksetzen und
 *                                      leisteAusblenden; die Vorlage rief die
 *                                      alten englischen Namen
 *
 * WARUM `lintUndef.test.js` das nicht fing: der prüft mit eslint `no-undef`
 * das SKRIPT. Bezeichner in Vorlagen sind für eslint keine Variablen — sie
 * werden zur Laufzeit auf dem Komponenten-Kontext gesucht.
 *
 * WIE ES HIER GEHT: `compileScript({ inlineTemplate: true })` übersetzt die
 * Vorlage INNERHALB des setup-Geltungsbereichs. Was dort aufgelöst werden kann,
 * steht als lokale Variable im erzeugten Code; was NICHT aufgelöst werden kann,
 * wird zu `_ctx.name` — und genau das sind die Kandidaten. Kein Muster, keine
 * Heuristik: es ist das Urteil des Vue-Übersetzers selbst.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileScript, parse } from '@vue/compiler-sfc';

const WURZEL = new URL('..', import.meta.url).pathname;

function vueDateien(dir, treffer = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'test') vueDateien(p, treffer); }
        else if (name.endsWith('.vue')) treffer.push(p);
    }
    return treffer;
}

/**
 * Bezeichner, die eine Vorlage benutzt, ohne dass `setup` sie kennt.
 *
 * `$`-Namen (`$route`, `$slots`, …) bleiben aussen vor: die stellt Vue selbst
 * bereit und sie sind kein Versehen.
 */
export function unaufgeloest(datei) {
    const quelle = readFileSync(datei, 'utf8');
    const { descriptor, errors } = parse(quelle, { filename: datei });
    if (errors.length || !descriptor.scriptSetup || !descriptor.template) return [];
    let erzeugt;
    try {
        erzeugt = compileScript(descriptor, { id: 'pruefung', inlineTemplate: true }).content;
    } catch {
        return [];        // Übersetzungsfehler fängt der SFC-Lauf, nicht dieser Test
    }
    return [...new Set(
        [...erzeugt.matchAll(/_ctx\.([A-Za-zäöüÄÖÜ_$][\w$]*)/g)]
            .map(m => m[1])
            .filter(n => !n.startsWith('$')),
    )];
}

describe('Vorlagen benutzen keine Bezeichner, die es nicht gibt', () => {
    it('löst jede Vorlage der CDE vollständig auf', () => {
        const befunde = [];
        for (const datei of vueDateien(WURZEL)) {
            for (const name of unaufgeloest(datei)) {
                befunde.push(`${datei.replace(WURZEL, '')}: ${name}`);
            }
        }
        expect(befunde).toEqual([]);
    });

    it('erkennt einen erfundenen Bezeichner — sonst prüft er ins Leere', () => {
        // Gegenprobe zur Erkennung selbst, an einer echten Datei mit einer
        // künstlich eingefügten Bindung.
        const datei = join(WURZEL, 'components/IfcViewer.vue');
        const quelle = readFileSync(datei, 'utf8');
        const kaputt = quelle.replace('<div class="standalone-shell">',
            '<div class="standalone-shell" @click="gibtEsNichtWirklich">');
        const { descriptor } = parse(kaputt, { filename: datei });
        const erzeugt = compileScript(descriptor, { id: 'pruefung', inlineTemplate: true }).content;
        expect(erzeugt).toMatch(/_ctx\.gibtEsNichtWirklich/);
    });
});
