/**
 * Der Vorschlag ist SICHTBAR (2026-09-07) — Textwächter über Panel, Toolbox
 * und Herleitung. Die Signatur selbst prüft formsignatur.test.js; hier
 * steht, dass ihr Ergebnis auch dort ankommt, wo ein Mensch es sieht und
 * bestätigen kann. Ein Vorschlag, den niemand sieht, wäre wieder Raterei.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const wurzel = new URL('..', import.meta.url);
const lies = (p) => readFileSync(new URL(p, wurzel), 'utf8');

describe('Panel „Bauformen"', () => {
    const view = lies('views/CdeView.vue');
    it('misst je Zeile ein Beispiel und zeigt Form, Güte und Grund', () => {
        expect(view).toContain('viewerRef.value?.getFormsignatur?.(v.beispiel.modelId, v.beispiel.localId)');
        expect(view).toMatch(/<th[^>]*>Gemessen<\/th>/);
        expect(view).toContain(':title="v.geometrie?.grund ?? \'\'"');
        expect(view).toContain("'bf-guete--' + v.geometrie.guete");
    });
    it('führt die Kategorie-Zeile und nennt gestrichene Typen beim Namen', () => {
        expect(view).toContain('ganze Kategorie');
        expect(view).toContain('viewerRef.value?.getFremdeTypen?.()');
        expect(view).toContain('Nicht im IFC-4.3-Wörterbuch, strukturell erkannt');
    });
    it('verwirft die Messung eines überholten Laufs', () => {
        expect(view).toMatch(/const lauf = \+\+_messLauf[\s\S]{0,600}if \(lauf !== _messLauf\) return;/);
    });
});

describe('Toolbox', () => {
    const tb = lies('components/CdeToolbox.vue');
    it('zeigt den gemessenen Grund und bietet die Bestätigung als Auslegung an', () => {
        expect(tb).toMatch(/<dt>Gemessen<\/dt>/);
        // Kassensturz E4: über den Viewer, der die Bearbeitung einschaltet — nicht mehr am Modus vorbei grau.
        expect(tb).toMatch(/Als Auslegung übernehmen[\s\S]{0,200}@click="auslegen"|@click="auslegen"[\s\S]{0,200}Als Auslegung übernehmen/);
        expect(tb).toContain("function auslegen() { return werkzeug('bauform-auslegen', { bauform: herleitung.value.bauform }); }");
        // Nur, wenn die Geometrie wirklich vorgeschlagen hat — nicht bei netz.
        expect(tb).toMatch(/v-if="herleitung\.quelle === 'geometrie'"[\s\S]{0,400}Als Auslegung übernehmen/);
    });
});

describe('Herleitung', () => {
    it('reicht den Grund durch und erklärt den Vorschlag', () => {
        const h = lies('services/Herleitung.js');
        expect(h).toContain('grund: einordnung?.grund ?? null');
        expect(h).toContain("stufe: 'vorschlag'");
    });
});

describe('Der Gelände-Sampler fragt die Geometrie, wenn niemand etwas erklärt hat', () => {
    it('die Engine reicht bauformAusGeometrie hinein und urteilt dreiwertig', () => {
        const e = lies('services/IfcEngine.js');
        expect(e).toContain('bauformAusGeometrie: (m, l) => this.formsignaturVon({ modelId: m, localId: l })');
        expect(e).toMatch(/return b == null \? null : b === 'hoehenfeld'/);
    });
});
