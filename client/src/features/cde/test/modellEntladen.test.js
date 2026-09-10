/**
 * Modelle entladen (2026-09-03) — Fabios Befund: „das Rausladen funktioniert
 * nicht, da sollte einfach ein X sein."
 *
 * Es WAR eins da. Zwei Dinge standen davor:
 *
 * 1. Der Name war ein anonymes Flex-Kind. Flex-Kinder haben `min-width: auto`
 *    und schrumpfen deshalb nicht unter ihre Textbreite; ein langer Dateiname
 *    schob den Knopf aus dem 200-px-Chip, und `overflow: hidden` schnitt ihn
 *    mit ab. Sichtbar war nur der harte Schnitt mitten im Namen.
 * 2. `removeModel` hat entladen und danach die halbe Nacharbeit ausgelassen:
 *    Projektbezug, Welt- und Höhenversatz, Achsen und Journalstand blieben
 *    auf dem verschwundenen Modell stehen.
 *
 * Beides sind Textwächter am Quelltext — ein jsdom rendert keine Flexbox mit
 * echten Breiten, und der Viewer braucht WebGL. Was sie halten können, ist
 * die Zusage.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const VIEWER = readFileSync(new URL('../components/IfcViewer.vue', import.meta.url), 'utf8');

describe('Der Modell-Chip', () => {
    it('trägt den Namen in EIGENEM Element — sonst verdrängt er den Knopf', () => {
        // Seit Stufe 0 (Aushub-Fachmodell) steht im Chip nicht mehr der rohe
        // Modellname, sondern `modellTagText` — das Eigenbau-Modell heisst
        // „Eigenbau · n Bauteile". Das EIGENE Element bleibt die Zusage.
        expect(VIEWER).toMatch(/<span class="model-tag-name">\{\{ modellTagText\(m, eigenbauAnzahl\) \}\}<\/span>/);
        const block = VIEWER.slice(VIEWER.indexOf('.model-tag-name {'), VIEWER.indexOf('.model-tag-name {') + 200);
        expect(block).toMatch(/min-width:\s*0/);
        expect(block).toMatch(/text-overflow:\s*ellipsis/);
    });

    it('der Chip selbst schneidet nichts mehr ab und lässt sich nicht markieren', () => {
        const ab = VIEWER.indexOf('.model-tag {');
        const block = VIEWER.slice(ab, VIEWER.indexOf('}', ab)).replace(/\/\*[\s\S]*?\*\//g, '');
        expect(block).not.toMatch(/overflow:\s*hidden/);
        expect(block).toMatch(/user-select:\s*none/);
    });

    it('das X ist verdrahtet, nennt das Modell beim Namen und ist auf dem Finger treffbar', () => {
        expect(VIEWER).toMatch(/class="tag-close"\s+@click="removeModel\(m\.modelId\)"/);
        expect(VIEWER).toMatch(/:title="`\$\{m\.name\} entladen`"/);
        const coarse = VIEWER.slice(VIEWER.indexOf('@media (pointer: coarse)'));
        expect(coarse).toMatch(/\.tag-close \{ position: relative|\.tag-close \{ position:relative|, \.tag-close \{ position: relative/);
        expect(coarse).toMatch(/\.tag-close::after/);
    });
});

describe('Das Entladen zieht den Modellstand nach', () => {
    /** Der Rumpf von `removeModel` — bis zur nächsten Deklaration. */
    const rumpf = (() => {
        const ab = VIEWER.indexOf('async function removeModel(');
        return VIEWER.slice(ab, VIEWER.indexOf('\n/**', ab + 10));
    })();

    it('entlädt, vergisst, zieht nach und entwertet das Fachmodell', () => {
        expect(rumpf).toContain('unloadModel(modelId)');
        expect(rumpf).toContain('ablage.vergiss(modelId)');
        // DER Punkt: derselbe Nachzug wie beim Laden, nicht eine zweite Liste.
        expect(rumpf).toContain('_modellmengeNachziehen()');
        // Und der Journalstand — sonst geistern Achsen und Verdecktes weiter.
        expect(rumpf).toMatch(/entwerteNach\(\['erzeugt', 'lage'\]\)/);
    });

    it('EIN Weg für beide: das Laden ruft denselben Nachzug', () => {
        const laden = VIEWER.slice(VIEWER.indexOf('async function _onModelLoaded()'));
        expect(laden.slice(0, 600)).toContain('_modellmengeNachziehen()');
    });

    it('der Nachzug setzt Bezug, Rahmen, Höhenversatz und Achsen — in dieser Reihenfolge', () => {
        const ab = VIEWER.indexOf('async function _modellmengeNachziehen()');
        const block = VIEWER.slice(ab, ab + 1800);
        const reihenfolge = ['_bezuegeNeuBestimmen()', 'setzeWeltversatz', 'setzeHoehenversatz', 'leseAchsen()', 'setModelList'];
        let letzte = -1;
        for (const marke of reihenfolge) {
            const i = block.indexOf(marke);
            expect(i, marke).toBeGreaterThan(letzte);
            letzte = i;
        }
    });
});
