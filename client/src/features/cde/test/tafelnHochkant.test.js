// @vitest-environment jsdom
/**
 * Teil XXXI, T5 — hochkant klappen die Blätter beim Formen ein (E-T5).
 *
 * Tabletlauf T0: Zeichenfläche hochkant 820 × 519 px = 44 % des Schirms, darunter zwei Blätter zu 42dvh. Jetzt: im
 * Bearbeiten-Modus mit gewähltem Bauteil (dort stehen seit T3 alle Griffe) bleibt von den Blättern nur der Kopf; ein
 * Tipp darauf klappt auf, bis ein anderes Bauteil gewählt wird. Ein scharf geschaltetes Werkzeug klappt NICHT auf (ein
 * Griffzug tut das — das Bild spränge mitten im Zug).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useTafelnHochkant } from '../composables/useTafelnHochkant.js';
import CdePanel from '../components/ui/CdePanel.vue';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');
const WAND = { globalId: 'cde-W', modelId: 'cde-eigenbau', localId: 3, category: 'IFCWALL', type: 'IFCWALL', name: 'W' };
const ROHR = { globalId: 'cde-R', modelId: 'cde-eigenbau', localId: 4, category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT', name: 'R' };

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

describe('die Regel (`useTafelnHochkant`) am echten Store', () => {
    it('eingeklappt nur im Bearbeiten-Modus mit gewähltem Bauteil', async () => {
        const b = useBearbeitung();
        const t = useTafelnHochkant(b);
        await b.einordne(WAND, null);
        expect(t.eingeklappt.value).toBe(false);                 // ohne Modus: Tipp wählt nur aus, die Tafel bleibt
        b.modusSetzen(true);
        expect(t.eingeklappt.value).toBe(true);
        await b.einordne(null, null);
        expect(t.eingeklappt.value).toBe(false);                 // nichts gewählt: nichts zu formen
    });

    it('aufgeklappt bleibt es — auch wenn ein Werkzeug scharf wird —, bis ein ANDERES Bauteil gewählt wird', async () => {
        const b = useBearbeitung();
        const t = useTafelnHochkant(b);
        b.modusSetzen(true);
        await b.einordne(WAND, null);
        t.aufklappen();
        expect(t.eingeklappt.value).toBe(false);
        b.starte('drehen', { subjekt: b.bauteil });
        await b.einordne(WAND, null);                            // dasselbe neu eingeordnet (nach jedem Zug)
        expect(t.eingeklappt.value).toBe(false);
        await b.einordne(ROHR, null);
        expect(t.eingeklappt.value).toBe(true);
        t.aufklappen(); b.modusSetzen(false); b.modusSetzen(true);
        expect(t.eingeklappt.value).toBe(true);                  // Modus aus und an: wieder eingeklappt
    });

    it('ein scharf geschaltetes Werkzeug klappt NICHT auf (Griffzug)', async () => {
        const b = useBearbeitung();
        const t = useTafelnHochkant(b);
        b.modusSetzen(true);
        await b.einordne(WAND, null);
        b.starte('drehen', { subjekt: b.bauteil });
        expect(t.eingeklappt.value).toBe(true);
    });
});

describe('das Blatt (`CdePanel`)', () => {
    it('eingeklappt: Klasse, Knopf ≥ 44 px hochkant, der Kopf klappt auf; aufgeklappt: der Knopf klappt ein', async () => {
        const w = mount(CdePanel, { props: { titel: 'Bauteil', eingeklappt: true }, slots: { default: '<p class="inhalt">x</p>' },
                                    global: { stubs: { CdeIcon: { template: '<i />' } } } });
        expect(w.find('section.cde-panel').classes()).toContain('eingeklappt');
        expect(w.find('.cp-klapp').attributes('aria-expanded')).toBe('false');
        await w.find('.cp-head').trigger('click');
        expect(w.emitted('aufklappen')).toHaveLength(1);
        await w.find('.cp-close').trigger('click');               // Schliessen klappt nicht nebenbei auf
        expect(w.emitted('close')).toHaveLength(1);
        expect(w.emitted('aufklappen')).toHaveLength(1);
        await w.setProps({ eingeklappt: false });
        await w.find('.cp-head').trigger('click');
        expect(w.emitted('aufklappen')).toHaveLength(1);          // offen: ein Tipp auf den Kopf tut nichts
        await w.find('.cp-klapp').trigger('click');
        expect(w.emitted('einklappen')).toHaveLength(1);
        const css = lies('components/ui/CdePanel.vue');
        const hochkant = css.slice(css.indexOf('@media (max-width: 900px)'));
        expect(hochkant).toMatch(/\.eingeklappt \.cp-body \{ display: none; \}/);
        expect(hochkant).toMatch(/\.cp-klapp \{ display: flex; min-width: 44px; min-height: 44px; \}/);
        w.unmount();
    });

    it('die Ansicht gibt beiden Blättern die Regel, und das eingeklappte Blatt gibt seine Zeilenhöhe frei', () => {
        const v = lies('views/CdeView.vue');
        expect(v.match(/:eingeklappt="tafeln\.eingeklappt\.value"/g)).toHaveLength(2);
        expect(v.match(/@aufklappen="tafeln\.aufklappen\(\)"/g)).toHaveLength(2);
        expect(v).toContain('const tafeln = useTafelnHochkant(useBearbeitung());');
        const hochkant = v.slice(v.indexOf('@media (max-width: 900px)'));
        expect(hochkant).toMatch(/\.cde-workspace > \.cde-panel\.eingeklappt \{ height: auto; \}/);
    });
});
