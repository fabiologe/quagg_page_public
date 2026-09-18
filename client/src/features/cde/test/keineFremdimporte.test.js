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

    it('der Geometrie-Kernel importiert nur nach unten: eigene Dateien, gelaende/, tinte/, npm', () => {
        // Teil XIV, G1: `services/geometrie/` ist die reine Rechenschicht —
        // kein Journal, keine Engine, kein three, kein Vue. Dieselben Dateien
        // laufen im Worker und in vitest ohne jsdom. Erlaubt sind die
        // Raster-Ops (`gelaende/Operationen.js`, Kernel-Material aus der Zeit
        // vor dem Kernel) und die neutrale Schicht. Seit Teil XXIII A8 gibt es
        // `geometry/` nicht mehr: SurfaceOps, MeshOps & Co. SIND der Kern.
        const kernel = join(WURZEL, 'services/geometrie');
        const befunde = [];
        for (const datei of quellDateien(kernel)) {
            const code = readFileSync(datei, 'utf8');
            for (const [, pfad] of code.matchAll(IMPORT)) {
                const relativ = pfad.startsWith('.');
                const ziel = relativ ? resolve(dirname(datei), pfad) : null;
                const erlaubt = pfad.startsWith('@/services/tinte/')
                    || (relativ && (ziel.startsWith(kernel)
                        || ziel.startsWith(join(WURZEL, 'services/gelaende'))))
                    || (!relativ && !pfad.startsWith('@/') && !pfad.startsWith('three'));
                if (!erlaubt) befunde.push(`${datei.replace(WURZEL, '')} → ${pfad}`);
            }
            // Float32 hat im Kernel nichts zu suchen — ein Volumen aus
            // Float32-Koordinaten in Landesgrösse ist eine Schätzung.
            if (/Float32Array/.test(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/'[^']*Float32[^']*'/g, ''))) {
                befunde.push(`${datei.replace(WURZEL, '')} → Float32Array`);
            }
        }
        expect(befunde).toEqual([]);
    });

    it('der Kernel-Worker lädt TRANSITIV weder three noch web-ifc noch das Wörterbuch', () => {
        // Der Fall vom 2026-09-07: alle direkten Importe des Kernels waren
        // erlaubt — aber SurfaceOps holte den Sampler aus TerrainMesh, und
        // TerrainMesh zieht über MeshAcquire three, web-ifc und das 4.3-
        // Wörterbuch. Der Worker-Chunk wuchs von 26 kB auf 4,7 MB, und kein
        // Wächter sah es, weil jeder nur EINE Stufe prüfte. Deshalb hier die
        // ganze Hülle: von kernel.worker.js aus jeden relativen Import
        // verfolgen, und in KEINEM Modul darf Schweres stehen.
        const start = join(WURZEL, 'services/geometrie/kernel.worker.js');
        // `@/services/tinte/` ist die neutrale Schicht (reine Geometrie, kein
        // three) — im Kernel ausdrücklich erlaubt, siehe die Regel darüber.
        const schwer = [/^three/, /^web-ifc/, /^@thatopen/, /entity-schema/, /^@\/(?!services\/tinte\/)/, /^vue/];
        const gesehen = new Set();
        const offen = [start];
        const befunde = [];
        while (offen.length) {
            const datei = offen.pop();
            if (gesehen.has(datei)) continue;
            gesehen.add(datei);
            const code = readFileSync(datei, 'utf8');
            for (const [, pfad] of code.matchAll(IMPORT)) {
                if (schwer.some(r => r.test(pfad))) befunde.push(`${datei.replace(WURZEL, '')} → ${pfad}`);
                if (!pfad.startsWith('.')) continue;
                const ziel = resolve(dirname(datei), pfad);
                offen.push(ziel.endsWith('.js') ? ziel : `${ziel}.js`);
            }
        }
        expect(befunde).toEqual([]);
        // Und die Hülle bleibt klein: wer hier 40 überschreitet, hat wieder
        // eine Anwendungsdatei in den Worker gezogen.
        expect(gesehen.size).toBeLessThan(40);
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
