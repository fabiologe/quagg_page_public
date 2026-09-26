// @vitest-environment jsdom
/**
 * Entf/Rücktaste löschten das gewählte Element, obwohl eine Auswahlliste den Fokus
 * hatte (PixelSelect ist ein <div role="combobox">, IsybauEditor.vue prüfte nur
 * INPUT/TEXTAREA/SELECT). Geprüft am echten Bauteil PixelSelect.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PixelSelect from '../components/common/PixelSelect.vue';
import { fokusInBedienelement } from '../utils/tastatur.js';

describe('Tastatur: Entf gehört dem Bedienelement, nicht der Karte', () => {
    it('Fokus auf PixelSelect, Knopf, Fenster → Taste gehört dem Element', () => {
        const w = mount(PixelSelect, { props: { modelValue: 'a', options: [{ value: 'a', label: 'A' }] }, attachTo: document.body });
        const feld = w.find('[role="combobox"]').element;
        feld.focus();
        expect(document.activeElement).toBe(feld);
        expect(fokusInBedienelement(document.activeElement)).toBe(true);
        w.unmount();

        const knopf = document.createElement('button');
        document.body.appendChild(knopf);
        expect(fokusInBedienelement(knopf)).toBe(true);

        const fenster = document.createElement('div');
        fenster.setAttribute('role', 'dialog');
        const innen = document.createElement('span');
        fenster.appendChild(innen);
        document.body.appendChild(fenster);
        expect(fokusInBedienelement(innen)).toBe(true);
    });

    it('Fokus auf der Seite bzw. der Karte → Taste gehört der Karte', () => {
        expect(fokusInBedienelement(document.body)).toBe(false);
        const karte = document.createElement('div');
        karte.tabIndex = 0;
        document.body.appendChild(karte);
        expect(fokusInBedienelement(karte)).toBe(false);
        expect(fokusInBedienelement(null)).toBe(false);
    });
});
