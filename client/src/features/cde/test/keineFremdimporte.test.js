/**
 * Hausregel: die CDE greift in kein anderes Feature (Stufe 11.6).
 *
 * Fabio, 31.08.2026: *„nicht einfach Querverknüpfungen zu flood3d oder anderen
 * Features setzen — wenn Standalone für /cde innerhalb des Ordners erstellen.
 * KEIN SPAGHETTI."*
 *
 * Der Anlass war konkret: für den Auftragswähler (Stufe 11.3) lag eine fertige
 * `ProjekteApi` in `features/projects/` bereit. Sie zu benutzen wäre eine Zeile
 * weniger gewesen — und eine Abhängigkeit zwischen zwei Werkzeugen, die
 * getrennt gebaut und getrennt angefasst werden sollen. Stattdessen steht in
 * der CDE ein eigener, schmaler `AuftragApi`.
 *
 * Fachliche Doppelung ist der akzeptierte Preis. Verdrahtung nicht — und weil
 * so ein Import beim Schreiben immer wie Wiederverwendung aussieht, prüft es
 * eine Regel statt der Aufmerksamkeit.
 *
 * ERLAUBT bleibt die feature-NEUTRALE Schicht `@/services/…` (die zentrale
 * api-Instanz, `services/tinte/` für Stift und Zeiger-Routing): sie gehört
 * keinem Feature, sondern allen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = new URL('..', import.meta.url).pathname;

function quellDateien(dir, treffer = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== 'test') quellDateien(p, treffer); }
        else if (/\.(vue|js)$/.test(name)) treffer.push(p);
    }
    return treffer;
}

/** `import … from '<pfad>'` — auch mehrzeilig (dort ist es schon einmal schiefgegangen). */
const IMPORT = /(?:import|export)\s[\s\S]{0,400}?from\s+['"]([^'"]+)['"]/g;

describe('Die CDE bleibt für sich', () => {
    it('importiert aus keinem anderen Feature', () => {
        const befunde = [];
        for (const datei of quellDateien(WURZEL)) {
            const code = readFileSync(datei, 'utf8');
            for (const [, pfad] of code.matchAll(IMPORT)) {
                // Alias-Pfade: alles unter features/, das nicht die CDE ist.
                if (pfad.startsWith('@/features/') && !pfad.startsWith('@/features/cde')) {
                    befunde.push(`${datei.replace(WURZEL, '')} → ${pfad}`);
                    continue;
                }
                // Relative Pfade AUFLÖSEN statt raten: `../../stores/x` aus
                // `components/ui/` landet noch in der CDE, aus `services/`
                // dagegen draussen. Ein Muster auf die Punkte kann das nicht
                // unterscheiden — der aufgelöste Pfad schon.
                if (!pfad.startsWith('.')) continue;
                const ziel = resolve(dirname(datei), pfad);
                if (!ziel.startsWith(WURZEL)) {
                    befunde.push(`${datei.replace(WURZEL, '')} → ${pfad}`);
                }
            }
        }
        expect(befunde).toEqual([]);
    });

    it('holt die Auftragsliste über den EIGENEN schmalen Draht', () => {
        // Nicht bloss „kein Import" — der Ersatz muss auch dastehen, sonst
        // wäre die Regel erfüllt und die Sache trotzdem nicht gebaut.
        const api = readFileSync(join(WURZEL, 'services/AuftragApi.js'), 'utf8');
        expect(api).toMatch(/api\.get\(['"`]\/projekte['"`]\)/);
        // Nur IMPORTE zählen — der Kopfkommentar nennt `features/projects`
        // absichtlich, weil dort steht, was hier bewusst NICHT benutzt wird.
        const importe = [...api.matchAll(IMPORT)].map(m => m[1]);
        expect(importe.filter(i => i.includes('features/'))).toEqual([]);
    });

    it('lässt die feature-neutrale Schicht ausdrücklich zu', () => {
        // Gegenprobe zur Regel: `@/services/api` ist erlaubt und wird auch
        // benutzt — sonst prüfte der Test nur, dass niemand etwas tut.
        const api = readFileSync(join(WURZEL, 'services/AuftragApi.js'), 'utf8');
        expect(api).toMatch(/from '@\/services\/api'/);
    });
});
