// @vitest-environment jsdom
/**
 * „+ Satz" fragt „Kopie" oder „neu" (Kassensturz S5, K2).
 *
 * Bis 2026-09-19 fragte ein `prompt` nur nach dem Namen; der neue Satz bekam
 * die Modellauswahl, nie den Verlauf. Hier ist der Dialog echt montiert, mit
 * den echten Stores und dem echten Journal — nachgebildet ist nur das
 * Anlegen des Satzes beim Server (`satzAnlegen`), wie in `satzMigration`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import SatzNeuDialog from '../components/SatzNeuDialog.vue';

let angelegt;
beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    angelegt = [];
    const basis = repo._backend;
    const cde = useCdeStore();
    // Der Server legt an und führt den Satz danach in seiner Liste — hier direkt.
    const satzAnlegen = vi.fn(async (daten) => {
        const satz = { id: `s-neu-${angelegt.length + 1}`, zweck: 'variante', ...daten };
        angelegt.push(satz);
        cde.saetze = [...cde.saetze, satz];
        return satz;
    });
    repo.setBackend(new Proxy(basis, {
        get(ziel, k) {
            if (k === 'satzAnlegen') return satzAnlegen;
            const v = ziel[k];
            return typeof v === 'function' ? v.bind(ziel) : v;
        },
    }));
});
afterEach(() => { repo.setBackend(null); document.body.innerHTML = ''; });

const bald = () => new Promise(r => setTimeout(r, 20));
const kg = (gid, wert) => ({ art: 'kg', globalId: gid, nachher: wert, wer: 'fabio' });

/** Satz „Variante Nord" (Modell aaa) ist aktiv; mit `versionen` Versionen im Verlauf. */
async function aktiverSatz({ versionen }) {
    const cde = useCdeStore();
    const ae = useAenderungen();
    await ae.bereit;
    cde.saetze = [{ id: 's1', name: 'Variante Nord', zweck: 'variante', enthaelt: ['aaa'] }];
    await cde.setzeSatz('s1');
    await ae.setzeSatz('s1');
    for (let i = 0; i < versionen; i++) {
        await ae.eintragen(kg('A', String(310 + i)));
        await ae.commitSitzung(`Arbeit ${i + 1}`, { wer: 'fabio' });
    }
    return { cde, ae };
}

async function oeffne() {
    const w = mount(SatzNeuDialog, { props: { offen: false }, attachTo: document.body, global: { stubs: { teleport: true } } });
    await w.setProps({ offen: true });
    await nextTick();
    return w;
}
async function lege(w, name, art) {
    await w.find('.sn-name').setValue(name);
    if (art) await w.find(`input[value="${art}"]`).setValue(true);
    await w.find('.sn-btn.primaer').trigger('click');
    await bald();
}

describe('„+ Satz" im Dialog', () => {
    it('Kopie ist vorgewählt, wenn der aktive Satz einen Verlauf hat — und der neue Satz beginnt mit ihm', async () => {
        const { ae } = await aktiverSatz({ versionen: 2 });
        const w = await oeffne();
        expect(w.find('input[value="kopie"]').element.checked).toBe(true);
        expect(w.text()).toContain('Kopie von „Variante Nord“');
        expect(w.text()).toContain('2 Versionen');

        await lege(w, '  Variante Süd  ');
        expect(angelegt).toEqual([expect.objectContaining({ name: 'Variante Süd', enthaelt: ['aaa'] })]);
        const [{ kopiert, warnung, satz }] = w.emitted('angelegt').at(-1);
        expect(kopiert).toBe(2);                                        // vorher: nie etwas
        expect(warnung).toBe(null);
        // Der Verlauf ist der des neuen Satzes — geladen, mit Geschichte.
        expect(ae.satzId).toBe(satz.id);
        expect(ae.commits.map(c => c.nachricht)).toEqual(['Arbeit 1', 'Arbeit 2']);
        expect(ae.wirksamerStand('kg').get('A')).toBe('311');
        // Getrennte Wege: ein Schritt im neuen Satz lässt den alten stehen.
        await ae.eintragen(kg('A', '399'));
        await ae.setzeSatz('s1');
        expect(ae.wirksamerStand('kg').get('A')).toBe('311');
        w.unmount();
    });

    it('„Neu beginnen": dieselben Modelle, kein Verlauf', async () => {
        const { ae } = await aktiverSatz({ versionen: 1 });
        const w = await oeffne();
        await lege(w, 'Leer', 'neu');
        const [{ kopiert, satz }] = w.emitted('angelegt').at(-1);
        expect(kopiert).toBe(0);
        expect(angelegt[0].enthaelt).toEqual(['aaa']);
        expect(ae.satzId).toBe(satz.id);
        expect(ae.commits).toEqual([]);
        expect(ae.wirksamerStand('kg').has('A')).toBe(false);
        w.unmount();
    });

    it('ohne Verlauf ist die Kopie nicht wählbar, „neu" vorgewählt', async () => {
        await aktiverSatz({ versionen: 0 });
        const w = await oeffne();
        expect(w.find('input[value="kopie"]').element.disabled).toBe(true);
        expect(w.find('input[value="neu"]').element.checked).toBe(true);
        expect(w.text()).toContain('hat noch keinen Verlauf');
        w.unmount();
    });

    it('ohne Namen legt er nichts an', async () => {
        await aktiverSatz({ versionen: 1 });
        const w = await oeffne();
        expect(w.find('.sn-btn.primaer').element.disabled).toBe(true);
        await w.find('.sn-name').setValue('   ');
        await w.find('.sn-name').trigger('keydown', { key: 'Enter' });
        await bald();
        expect(angelegt).toEqual([]);
        w.unmount();
    });
});
