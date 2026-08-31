// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PixelSelect from '../components/common/PixelSelect.vue';

/**
 * Das eigene Auswahlfeld ersetzt das native <select> — samt allem, was ein
 * <select> von sich aus konnte. Genau das wird hier geprueft: oeffnen,
 * waehlen, Tastatur, Escape. Faellt eines davon aus, ist das Feld zwar huebsch,
 * aber schlechter bedienbar als das, was es abgeloest hat.
 */
const OPTIONEN = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma', disabled: true },
    { value: 4, label: 'Delta' },
];

const bauen = (props = {}) => mount(PixelSelect, {
    props: { modelValue: 'a', options: OPTIONEN, ...props },
    attachTo: document.body,
});

let feld;
afterEach(() => { feld?.unmount(); document.body.innerHTML = ''; });

const liste = () => document.querySelector('.isy-select-liste');
const eintraege = () => [...document.querySelectorAll('.isy-select-liste__eintrag')];

describe('PixelSelect: aufklappen und waehlen', () => {
    it('zeigt die Beschriftung des gewaehlten Wertes, nicht den Wert selbst', () => {
        feld = bauen({ modelValue: 4 });
        expect(feld.text()).toBe('Delta');
    });

    it('faellt auf den Platzhalter zurueck, wenn nichts passt', () => {
        feld = bauen({ modelValue: null, placeholder: '– wählen –' });
        expect(feld.text()).toBe('– wählen –');
    });

    it('oeffnet die Liste erst auf Klick — und haengt sie an <body>', async () => {
        feld = bauen();
        expect(liste()).toBeNull();
        await feld.trigger('click');
        expect(liste()).not.toBeNull();
        // <Teleport>: die Liste darf NICHT im Tabellenkasten haengen, sonst
        // schneidet dessen overflow sie ab.
        expect(liste().parentElement).toBe(document.body);
        expect(eintraege().map(e => e.textContent)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
    });

    it('meldet Wert UND change — in dieser Reihenfolge', async () => {
        feld = bauen();
        await feld.trigger('click');
        await eintraege()[1].click();
        expect(feld.emitted('update:modelValue')).toEqual([['b']]);
        expect(feld.emitted('change')).toEqual([['b']]);
        // Der Aufrufer haengt sein @change an den NEUEN Wert (updateRoughness,
        // handleTypeChange) — deshalb muss das Modell vorher stehen.
        const reihenfolge = Object.keys(feld.emitted());
        expect(reihenfolge.indexOf('update:modelValue')).toBeLessThan(reihenfolge.indexOf('change'));
    });

    it('ein gesperrter Eintrag ist nicht waehlbar', async () => {
        feld = bauen();
        await feld.trigger('click');
        await eintraege()[2].click();
        expect(feld.emitted('update:modelValue')).toBeUndefined();
    });

    it('derselbe Wert loest nichts aus', async () => {
        feld = bauen({ modelValue: 'b' });
        await feld.trigger('click');
        await eintraege()[1].click();
        expect(feld.emitted('update:modelValue')).toBeUndefined();
    });

    it('gesperrtes Feld oeffnet gar nicht', async () => {
        feld = bauen({ disabled: true });
        await feld.trigger('click');
        expect(liste()).toBeNull();
    });
});

describe('PixelSelect: Tastatur', () => {
    it('Pfeil ab oeffnet, ein weiterer wandert, Enter waehlt', async () => {
        feld = bauen({ modelValue: 'a' });
        await feld.trigger('keydown', { key: 'ArrowDown' });
        expect(liste()).not.toBeNull();
        await feld.trigger('keydown', { key: 'ArrowDown' });
        await feld.trigger('keydown', { key: 'Enter' });
        expect(feld.emitted('update:modelValue')).toEqual([['b']]);
        expect(liste()).toBeNull();
    });

    it('ueberspringt gesperrte Eintraege', async () => {
        feld = bauen({ modelValue: 'b' });
        await feld.trigger('keydown', { key: 'ArrowDown' }); // oeffnet auf 'b'
        await feld.trigger('keydown', { key: 'ArrowDown' }); // 'Gamma' ist gesperrt -> 'Delta'
        await feld.trigger('keydown', { key: 'Enter' });
        expect(feld.emitted('update:modelValue')).toEqual([[4]]);
    });

    it('Tippen springt zum Eintrag', async () => {
        feld = bauen();
        await feld.trigger('keydown', { key: 'd' });
        await feld.trigger('keydown', { key: 'Enter' });
        expect(feld.emitted('update:modelValue')).toEqual([[4]]);
    });

    it('Escape schliesst die Liste — auch wenn der Fokus noch im Feld steht', async () => {
        feld = bauen();
        await feld.trigger('click');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(liste()).toBeNull();
    });

    it('haelt spaetere Escape-Lauscher auf', async () => {
        // Wer sich NACH dem Aufklappen anmeldet, darf nicht mehr drankommen.
        // Die Datenmaske haengt allerdings schon seit ihrem Mounten an window
        // — sie kommt also VOR diesem Feld dran und weicht deshalb von sich
        // aus zurueck, solange eine Liste offen ist (siehe IsybauModals.vue).
        feld = bauen();
        await feld.trigger('click');
        const spaeter = vi.fn();
        window.addEventListener('keydown', spaeter, true);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(spaeter).not.toHaveBeenCalled();
        window.removeEventListener('keydown', spaeter, true);
    });

    it('ein Klick daneben schliesst', async () => {
        feld = bauen();
        await feld.trigger('click');
        expect(liste()).not.toBeNull();
        document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(liste()).toBeNull();
    });
});

describe('PixelSelect: Barrierefreiheit', () => {
    it('traegt die Rollen und Zustaende einer Combobox', async () => {
        feld = bauen();
        expect(feld.attributes('role')).toBe('combobox');
        expect(feld.attributes('aria-haspopup')).toBe('listbox');
        expect(feld.attributes('aria-expanded')).toBe('false');
        expect(feld.attributes('tabindex')).toBe('0');
        await feld.trigger('click');
        expect(feld.attributes('aria-expanded')).toBe('true');
        expect(liste().getAttribute('role')).toBe('listbox');
        // Der Fokus bleibt auf dem Feld; welcher Eintrag dran ist, sagt
        // aria-activedescendant.
        expect(feld.attributes('aria-activedescendant')).toBe(eintraege()[0].id);
        expect(eintraege()[0].getAttribute('aria-selected')).toBe('true');
    });

    it('gesperrt heisst auch fuer Hilfsmittel gesperrt', () => {
        feld = bauen({ disabled: true });
        expect(feld.attributes('aria-disabled')).toBe('true');
        expect(feld.attributes('tabindex')).toBe('-1');
    });
});
