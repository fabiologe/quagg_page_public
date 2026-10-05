// @vitest-environment jsdom
/**
 * Teil XXXII, R1 — die Formleiste hochkant: Mass · Rückgängig · Fertig, unten, 44-px-Ziele (H7 aus Teil XXXI).
 *
 * Die Leiste selbst (montiert) und ihre Anbindung im Viewer: dieselbe Bedingung wie das Einklappen der Blätter, aus
 * demselben Store; „Rückgängig" gibt erst das Serien-Werkzeug frei; „Fertig" leert die Auswahl.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import CdeFormleiste from '../components/CdeFormleiste.vue';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

describe('die Leiste', () => {
    it('zeigt das Mass, Rückgängig und Fertig — und meldet beide Knöpfe', async () => {
        const w = mount(CdeFormleiste, { props: { text: 'Ost +1,20 m', zugLaeuft: true, kannZurueck: true } });
        expect(w.find('.fl-mass').text()).toBe('Ost +1,20 m');
        expect(w.find('.fl-mass').classes()).toContain('fl-mass--zug');
        const [zurueck, fertig] = w.findAll('button');
        expect(zurueck.text()).toContain('Rückgängig');
        expect(fertig.text()).toContain('Fertig');
        await zurueck.trigger('click'); await fertig.trigger('click');
        expect(w.emitted('rueckgaengig')).toHaveLength(1);
        expect(w.emitted('fertig')).toHaveLength(1);
    });

    it('nichts zurückzunehmen: Rückgängig gesperrt', () => {
        const w = mount(CdeFormleiste, { props: { kannZurueck: false } });
        expect(w.findAll('button')[0].attributes('disabled')).toBeDefined();
    });

    it('nur hochkant sichtbar, jedes Ziel 44 px', () => {
        const css = lies('components/CdeFormleiste.vue');
        expect(css).toMatch(/\.formleiste \{\s*display: none;/);
        expect(css).toMatch(/@media \(max-width: 900px\) \{\s*\.formleiste \{ display: flex; \}/);
        expect(css).toMatch(/\.fl-knopf \{[^}]*min-height: 44px; min-width: 44px;/);
    });
});

describe('im Viewer', () => {
    const v = lies('components/IfcViewer.vue');
    it('beim Formen: Bearbeiten an, Bauteil gewählt, kein Zeichnen, kein Messen — wie das Einklappen der Blätter', () => {
        expect(v).toContain('const formleisteZeigen = computed(() => !!bearbeitung.modusAn && !!bearbeitung.bauteil?.globalId');
        expect(v).toContain('&& !eingabe.aktiv.value && !messen.aktiv.value && !annotationActive.value);');
        expect(lies('composables/useTafelnHochkant.js')).toContain('!!bearbeitung?.modusAn && !!bearbeitung?.bauteil?.globalId');
    });
    it('das Mass ist die Pille des Griffs (unter dem Finger), Rückgängig gibt erst das Serien-Werkzeug frei, Fertig leert', () => {
        expect(v).toContain('const formleisteText = computed(() => griffe.pille.value?.text || rueckmeldung.value?.text');
        expect(v).toMatch(/async function formleisteZurueck\(\) \{\s*if \(bearbeitung\.scharf && !eingabe\.aktiv\.value\) bearbeitung\.abbrechen\(\);[\s\S]*?await rueckgaengigPerTaste\(false\);/);
        expect(v).toMatch(/function formleisteFertig\(\) \{[\s\S]*?auswahlLeeren\(\);\s*\}/);
        expect(v).toContain(":class=\"{ 'ueber-formleiste': formleisteZeigen }\"");
    });
});
