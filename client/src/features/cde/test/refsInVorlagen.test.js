/**
 * Refs aus Composables brauchen in der Vorlage `.value` (31.08.2026).
 *
 * DER FUND: Fabio sah einen gelben Knopf im 3D-Bereich, der nichts tut. Es war
 * kein Knopf, sondern der Mess-Hinweis — dauerhaft sichtbar und ohne Text:
 *
 *     <div v-if="messen.meldung">… {{ messen.meldung.text }}</div>
 *
 * `messen` ist ein SCHLICHTES OBJEKT aus `useMessen()`. Vue entpackt Refs nur
 * auf oberster Ebene der `setup`-Rückgabe — ein Ref als Eigenschaft eines
 * gewöhnlichen Objekts bleibt in der Vorlage das Ref selbst. Also:
 *
 *     messen.meldung        immer truthy (ein Ref-Objekt ist truthy)
 *     messen.meldung.text   immer undefined
 *
 * Dasselbe traf `messen.aktiv` (Mess-Cursor immer an), `schnitt.leisteOffen`
 * (Schnittleiste immer sichtbar), `schnitt.position` (Anzeige „Y ___ m" ohne
 * Wert) und `schnitt.modus` (keine Modus-Taste je hervorgehoben) — vier
 * sichtbare Fehler aus EINER Ursache, entstanden bei der Composable-Zerlegung
 * in Stufe 5.
 *
 * Das Tückische: im SKRIPT stand überall korrekt `messen.aktiv.value`. Nur die
 * Vorlage wich ab, und dort meldet niemand etwas — `@vue/compiler-sfc`
 * übersetzt es anstandslos, und kein Test rendert diese Komponente.
 *
 * Dieser Wächter liest die Composables, sammelt ihre zurückgegebenen Refs und
 * prüft dann jede Vorlage darauf, dass sie sie mit `.value` anfasst.
 * Pinia-Stores sind ausgenommen: die entpacken selbst.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = new URL('..', import.meta.url).pathname;

function dateien(dir, endung, treffer = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'test') dateien(p, endung, treffer); }
        else if (name.endsWith(endung)) treffer.push(p);
    }
    return treffer;
}

/**
 * Welche Namen gibt ein Composable als REF zurück?
 *
 * Gesucht wird `const x = ref(…)` bzw. `computed(…)` und danach, ob `x` in der
 * Rückgabe steht. Funktionen und schlichte Werte bleiben aussen vor — sie
 * brauchen kein `.value`.
 */
function refsAus(quelle) {
    const deklariert = new Set(
        [...quelle.matchAll(/const\s+([A-Za-zäöüÄÖÜ_$][\w$]*)\s*=\s*(?:ref|shallowRef|computed)\s*\(/g)]
            .map(m => m[1]),
    );
    const rueckgabe = quelle.match(/return\s*\{([\s\S]*?)\}\s*;?\s*\}?\s*$/m);
    if (!rueckgabe) return new Set();
    const genannt = new Set(
        rueckgabe[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean),
    );
    return new Set([...deklariert].filter(n => genannt.has(n)));
}

/** Der Name, unter dem ein Composable in einer Komponente angelegt wird. */
function bindungen(komponente, composableName) {
    const namen = new Set();
    const muster = new RegExp(`const\\s+([A-Za-zäöüÄÖÜ_$][\\w$]*)\\s*=\\s*${composableName}\\s*\\(`, 'g');
    for (const m of komponente.matchAll(muster)) namen.add(m[1]);
    return namen;
}

describe('Refs aus Composables werden in Vorlagen mit .value angefasst', () => {
    it('greift keine Vorlage einen Ref ohne .value ab', () => {
        // 1. Welche Composables geben welche Refs zurück?
        const refsJeComposable = new Map();
        for (const datei of dateien(join(WURZEL, 'composables'), '.js')) {
            const quelle = readFileSync(datei, 'utf8');
            const name = datei.split('/').pop().replace('.js', '');
            const refs = refsAus(quelle);
            if (refs.size) refsJeComposable.set(name, refs);
        }
        expect(refsJeComposable.size, 'keine Composables mit Refs gefunden — der Test prüft dann nichts')
            .toBeGreaterThan(0);

        // 2. Jede Vorlage darauf prüfen.
        const befunde = [];
        for (const datei of dateien(WURZEL, '.vue')) {
            const code = readFileSync(datei, 'utf8');
            const grenze = code.indexOf('<script');
            if (grenze < 0) continue;
            const vorlage = code.slice(0, grenze);

            for (const [composable, refs] of refsJeComposable) {
                for (const bindung of bindungen(code, composable)) {
                    for (const ref of refs) {
                        // `bindung.ref` ohne folgendes `.value`
                        const muster = new RegExp(`\\b${bindung}\\.${ref}\\b(?!\\s*\\.value)`, 'g');
                        for (const _ of vorlage.matchAll(muster)) {
                            befunde.push(`${datei.replace(WURZEL, '')}: ${bindung}.${ref} ohne .value`);
                        }
                    }
                }
            }
        }
        expect([...new Set(befunde)]).toEqual([]);
    });

    it('erkennt die Refs von useMessen und useSchnitt — sonst prüft er ins Leere', () => {
        // Gegenprobe zur Erkennung selbst: findet sie die Refs nicht, wäre der
        // Test oben grün, ohne irgendetwas zu messen.
        const messen = refsAus(readFileSync(join(WURZEL, 'composables/useMessen.js'), 'utf8'));
        expect([...messen].sort()).toEqual(['aktiv', 'hinweis', 'meldung']);

        const schnitt = refsAus(readFileSync(join(WURZEL, 'composables/useSchnitt.js'), 'utf8'));
        expect([...schnitt].sort()).toEqual(['aktiv', 'leisteOffen', 'modus', 'position']);
    });
});
