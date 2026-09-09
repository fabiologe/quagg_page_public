// @vitest-environment jsdom
/**
 * CdeDialog und die Esc-Taste (Nachprüfung Teil XVI, 2026-09-08).
 *
 * Der Dialog hört in der CAPTURE-Phase am document auf Escape — ein offener
 * Dialog soll jeden anderen Empfänger schlagen. Bis heute tat er das auch
 * GESCHLOSSEN: Commit- und Übergabedialog sind in der CdeView immer gemountet,
 * und kein Escape erreichte mehr den Viewer (Messen, Notiz, scharfe
 * Bearbeitung) oder den Lageplan. Der Headless-Lauf sah das Ereignis bis
 * `document:capture` und nicht weiter. `viewerRender.test.js` konnte es nicht
 * sehen — es mountet den Viewer ohne die Schale.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CdeDialog from '../components/ui/CdeDialog.vue';

const stubs = { CdeIcon: { template: '<i />' } };
let wrappers = [];
afterEach(() => { for (const w of wrappers) w.unmount(); wrappers = []; });

function escape() {
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    return ev;
}

function lauscherAmDocument() {
    const gesehen = [];
    const fn = (e) => { if (e.key === 'Escape') gesehen.push(e.target?.tagName ?? 'document'); };
    document.addEventListener('keydown', fn);
    return { gesehen, ab: () => document.removeEventListener('keydown', fn) };
}

describe('CdeDialog — Esc nur, wenn er offen ist', () => {
    it('geschlossen lässt er Escape durch (Viewer und Lageplan hören am document)', () => {
        const a = mount(CdeDialog, { props: { titel: 'Sitzung', offen: false }, global: { stubs } });
        const b = mount(CdeDialog, { props: { titel: 'Übergabe', offen: false }, global: { stubs } });
        wrappers.push(a, b);
        const l = lauscherAmDocument();
        try {
            escape();
            expect(l.gesehen).toEqual(['BODY']);
            expect(a.emitted('close')).toBeUndefined();
            expect(b.emitted('close')).toBeUndefined();
        } finally { l.ab(); }
    });

    it('offen schliesst er sich und hält das Ereignis an', () => {
        const a = mount(CdeDialog, { props: { titel: 'Sitzung', offen: true }, global: { stubs } });
        wrappers.push(a);
        const l = lauscherAmDocument();
        try {
            escape();
            expect(a.emitted('close')).toHaveLength(1);
            expect(l.gesehen).toEqual([]);   // capture am document schlägt die Bubble-Empfänger
        } finally { l.ab(); }
    });

    it('andere Tasten fasst er nie an', () => {
        const a = mount(CdeDialog, { props: { titel: 'Sitzung', offen: true }, global: { stubs } });
        wrappers.push(a);
        const l = lauscherAmDocument();
        try {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
            expect(a.emitted('close')).toBeUndefined();
        } finally { l.ab(); }
    });
});
