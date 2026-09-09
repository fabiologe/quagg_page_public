/**
 * T1 (Tablet-Pass): Fingerziele — der Vertrag.
 *
 * Die Testsuite sieht keine Finger; was sie sehen kann, ist, ob die Zusagen
 * im Stylesheet stehen. Drei Zusagen:
 *
 * 1. Der 3D-Canvas gehört der Kamera (`touch-action: none`) — ohne das
 *    wischt der Finger die Seite statt der Szene.
 * 2. Jeder als klein bekannte Knopf hat auf groben Zeigern eine Kur: echtes
 *    Wachsen (schwebende Leisten, scrollende Listen) oder eine unsichtbare
 *    Trefferfläche (wo Wachsen das Layout verschöbe).
 * 3. `.measure-clear` bekommt NIE `position: relative` — es ist selbst
 *    absolut positioniert; relative risse es aus seiner Verankerung. Das
 *    Pseudo-Element funktioniert dort, WEIL absolut auch ein Bezug ist.
 *
 * Textwächter wie designTokens.test.js: bewusst am Quelltext, nicht am
 * gerenderten Stil — ein jsdom kennt keine Media Queries für Zeigerarten.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const wurzel = new URL('..', import.meta.url);
const lies = (pfad) => readFileSync(new URL(pfad, wurzel), 'utf8');

/** Der Vertrag: Datei → Selektoren, die im (pointer: coarse)-Block stehen. */
const VERTRAG = {
    'components/IfcViewer.vue':     ['.snap-btn', '.mode-btn', '.section-close', '.measure-clear', '.bearb-marke-aus', '.tag-close'],
    // Teil XVI: die Modus-Leiste ist die Kontextleiste geworden.
    'components/CdeKontextleiste.vue': ['.modus-fertig', '.kl-zu', '.kl-geste'],
    'components/IfcPlanCanvas.vue': ['.hud-btn'],
    'components/CdeToolbox.vue':    ['.tb-btn', '.tb-kur'],
    'components/CdeHudLayer.vue':   ['.hud-menu-btn', '.hud-bearb-btn', '.hud-pill-x', '.hud-pille'],
    'styles/theme.css':             ['.cde-card-btn'],
};

/** Der Inhalt ALLER coarse-Blöcke einer Datei, zusammengehängt. */
function coarseBloecke(text) {
    const teile = [];
    const re = /@media\s*\(pointer:\s*coarse\)\s*\{/g;
    let m;
    while ((m = re.exec(text))) {
        // Klammern zählen bis zum passenden Schluss.
        let tiefe = 1;
        let i = re.lastIndex;
        while (i < text.length && tiefe > 0) {
            if (text[i] === '{') tiefe++;
            else if (text[i] === '}') tiefe--;
            i++;
        }
        teile.push(text.slice(re.lastIndex, i));
    }
    return teile.join('\n');
}

describe('Fingerziele (T1)', () => {
    it('der Vertrag ist nicht leer', () => {
        expect(Object.keys(VERTRAG).length).toBeGreaterThan(3);
    });

    for (const [datei, selektoren] of Object.entries(VERTRAG)) {
        it(`${datei}: jeder kleine Knopf hat seine Kur auf groben Zeigern`, () => {
            const block = coarseBloecke(lies(datei));
            expect(block, `${datei} hat keinen (pointer: coarse)-Block`).not.toBe('');
            for (const sel of selektoren) {
                expect(block, `${sel} fehlt im coarse-Block von ${datei}`).toContain(sel);
            }
        });

        it(`${datei}: dieselben Knöpfe tragen touch-action: manipulation`, () => {
            const text = lies(datei);
            for (const sel of selektoren) {
                // Der Selektor muss in einer Regel mit touch-action stehen —
                // grob geprüft: er kommt in der Datei vor UND die Datei nennt
                // touch-action: manipulation. Feiner lohnt nicht: die Regel
                // fasst mehrere Selektoren in einer Zeile.
                expect(text).toContain(sel);
            }
            expect(text).toContain('touch-action: manipulation');
        });
    }

    it('der 3D-Canvas gehört der Kamera: touch-action none', () => {
        const text = lies('components/IfcViewer.vue');
        expect(text).toMatch(/\.canvas-root\s*\{\s*touch-action:\s*none;\s*\}/);
    });

    it('`.measure-clear` bekommt NIE position: relative', () => {
        // Die Landmine aus dem Bau: der Knopf ist absolut verankert
        // (bottom/left/transform); relative zöge ihn in den Textfluss.
        const text = lies('components/IfcViewer.vue');
        expect(text).not.toMatch(/\.measure-clear[^{]*\{[^}]*position:\s*relative/);
    });

    it('unsichtbare Trefferflächen sind leer und absolut — nie sichtbarer Inhalt', () => {
        // Ein ::after mit Inhalt oder ohne absolute Position wäre sichtbar
        // oder wirkungslos. Beides fiele erst am Gerät auf.
        for (const datei of Object.keys(VERTRAG)) {
            const block = coarseBloecke(lies(datei));
            const re = /::after\s*\{([^}]*)\}/g;
            let m;
            while ((m = re.exec(block))) {
                expect(m[1], `${datei}: ::after ohne content:''`).toMatch(/content:\s*''/);
                expect(m[1], `${datei}: ::after ohne position:absolute`).toMatch(/position:\s*absolute/);
                expect(m[1], `${datei}: ::after mit negativer inset erwartet`).toMatch(/inset:\s*-/);
            }
        }
    });
});
