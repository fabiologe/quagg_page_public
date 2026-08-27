import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Die Zeichenflaeche hat drei uebereinanderliegende Ebenen, und ihre
 * Reihenfolge ist eine fachliche Aussage, keine Kosmetik:
 *
 *   unten   Luftbild der EZG-Karte
 *   mitte   Hoehenlinien (WebGL-Canvas)
 *   oben    das Netz mit seinen Beschriftungen
 *
 * Gemeldeter Fehler: "Satellitenbild laedt ueber den Hoehenlinien". Ursache
 * war, dass das Luftbild IN der Netz-SVG steckte — die traegt einen z-index,
 * damit Schaechte ueber den Linien liegen, und hob damit auch das Bild
 * darueber. Zwei Ebenen reichen fuer drei Dinge nicht.
 *
 * Der Test liest den Quelltext statt zu rendern: die echte Stapelung haengt
 * an WebGL und Layout, beides gibt es in jsdom nicht. Geprueft wird deshalb
 * genau das, was der Fehler kaputt gemacht hat — wo das Bild steht und
 * welche z-index-Stufen die drei Ebenen tragen.
 */
const quelle = fs.readFileSync(
    path.resolve(__dirname, '../components/visualizer/IsybauViewer.vue'), 'utf-8');
const themeCss = fs.readFileSync(
    path.resolve(__dirname, '../styles/theme.css'), 'utf-8');

/** z-index einer Regel aus dem <style>-Block holen. */
const zIndexVon = (selektor) => {
    const block = quelle.split(`\n${selektor} {`)[1];
    if (!block) return null;
    const treffer = block.split('}')[0].match(/z-index:\s*([^;]+);/);
    return treffer ? treffer[1].trim() : null;
};

describe('Zeichenflaeche: Luftbild unter den Hoehenlinien, Netz darueber', () => {
    it('das Luftbild sitzt in seiner eigenen Ebene, nicht in der Netz-SVG', () => {
        const ebene = quelle.split('class="ezg-aerial-host"')[1];
        expect(ebene, 'Ebene .ezg-aerial-host fehlt').toBeTruthy();
        // Das <image> muss VOR dem Ende dieser SVG kommen …
        const bisEnde = ebene.split('</svg>')[0];
        expect(bisEnde, 'aerialImageUrl wird nicht in der eigenen Ebene gezeichnet')
            .toContain('ezgLayer.aerialImageUrl.value');
        // … und danach darf in der Netz-SVG kein zweites Bild mehr stehen.
        const nachDerEbene = ebene.split('</svg>').slice(1).join('</svg>');
        expect(nachDerEbene.includes('<image')).toBe(false);
    });

    it('die drei Ebenen stehen in der richtigen Reihenfolge', () => {
        expect(zIndexVon('svg.ezg-aerial-host')).toBe('var(--isy-z-base)');
        expect(zIndexVon('.contour-gpu-host')).toBe('calc(var(--isy-z-base) + 1)');
        expect(zIndexVon('svg')).toBe('calc(var(--isy-z-base) + 2)');
    });

    it('die Zwischenstufe rechnet mit einem Token, das es gibt', () => {
        // calc(var(--isy-z-base) + 1) ist wertlos, wenn das Token fehlt: der
        // z-index waere ungueltig und die Netz-SVG fiele wieder unter die
        // Hoehenlinien.
        expect(themeCss).toMatch(/--isy-z-base:\s*\d+/);
    });

    it('die beiden unteren Ebenen fangen keine Klicks ab', () => {
        for (const selektor of ['svg.ezg-aerial-host', '.contour-gpu-host']) {
            const block = quelle.split(`\n${selektor} {`)[1].split('}')[0];
            expect(block, `${selektor} ohne pointer-events:none`).toContain('pointer-events: none');
        }
    });
});
