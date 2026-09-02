/**
 * Die Totes-Zonen-Falle (2026-09-02): ein top-level `watch(...)`, dessen
 * GETTER einen erst SPÄTER deklarierten Store anfasst, kompiliert sauber,
 * besteht jede Suite (die Komponente wird nie gemountet) — und killt in
 * der echten App den ganzen Viewer beim Setup („Cannot access 'x' before
 * initialization"). Dieselbe Klasse wie der defineExpose-Vorfall, nur mit
 * const statt Bezeichner.
 *
 * Der Wächter ist grob und genau deshalb ehrlich: er prüft für jede
 * `const x = useXyz(…)`-Deklaration, dass kein früherer watch-Getter `x`
 * benutzt. Falsch-positiv wäre ein Getter, der `x` nur im CALLBACK nennt —
 * darum wird nur die GETTER-Klammer gelesen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

function getterVon(text, start) {
    // watch( <getter> , … ) — die erste Top-Klammer nach `watch(` bis zum
    // Komma auf Tiefe 1.
    let i = text.indexOf('(', start) + 1;
    let tiefe = 1;
    const von = i;
    while (i < text.length && tiefe > 0) {
        const z = text[i];
        if (z === '(') tiefe++;
        else if (z === ')') tiefe--;
        else if (z === ',' && tiefe === 1) break;
        i++;
    }
    return text.slice(von, i);
}

describe('Setup-Reihenfolge: kein watch-Getter vor seiner Store-Deklaration', () => {
    const dateien = readdirSync(join(WURZEL, 'components'))
        .filter(n => n.endsWith('.vue'))
        .map(n => `components/${n}`)
        .concat(readdirSync(join(WURZEL, 'views'))
            .filter(n => n.endsWith('.vue')).map(n => `views/${n}`));

    it('über alle Komponenten des Features', () => {
        const verstoesse = [];
        for (const datei of dateien) {
            const text = readFileSync(join(WURZEL, datei), 'utf8');
            const skript = text.slice(text.indexOf('<script'));
            // Store-/Composable-Konsten: const x = useIrgendwas(
            const decls = [...skript.matchAll(/const (\w+)\s*=\s*use[A-Z]\w*\(/g)]
                .map(m => ({ name: m[1], pos: m.index }));
            for (const m of skript.matchAll(/\bwatch(?:Effect)?\(/g)) {
                const getter = getterVon(skript, m.index);
                for (const d of decls) {
                    if (d.pos > m.index && new RegExp(`\\b${d.name}\\b`).test(getter)) {
                        verstoesse.push(`${datei}: watch bei ${m.index} liest „${d.name}" vor der Deklaration`);
                    }
                }
            }
        }
        expect(verstoesse).toEqual([]);
    });
});
