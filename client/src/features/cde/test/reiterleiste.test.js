// @vitest-environment jsdom
/**
 * Die Reiterleiste (Kassensturz H1/H2, Abnahme 2026-09-12 E7).
 *
 * Vorher standen sieben Tafel-Knöpfe als Symbole oben in der Kopfleiste; was
 * sie taten, sagte nur der Tooltip. H1 legte sie mit Namen an beide Ränder,
 * H2 machte Werkzeuge und Merkmale zur Tafel „Bauteil". Fabio in der
 * Abnahme: EINE Leiste statt zwei — die Struktur öffnet weiter links, damit
 * Struktur und Bauteil zugleich offen sein können.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CdeReiterleiste from '../components/CdeReiterleiste.vue';
import { usePanels, PANEL_DEFS } from '../stores/usePanels.js';
import { useAnsicht } from '../stores/useAnsicht.js';

const STUB = { global: { stubs: { CdeIcon: { template: '<i />' } } } };
const namen = (w) => w.findAll('.cr-knopf').map(k => k.text());

describe('CdeReiterleiste — eine Leiste für alle Tafeln', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('im 3D: Struktur, dann Bauteil, Verlauf, Mengen, Notizen — ein Strich trennt links von rechts', () => {
        const w = mount(CdeReiterleiste, STUB);
        expect(namen(w)).toEqual(['Struktur', 'Bauteil', 'Verlauf', 'Mengen', 'Notizen']);
        expect(w.findAll('.cr-trenner')).toHaveLength(1);
        w.unmount();
    });

    it('im Lageplan kommt der Planinhalt dazu — und geht mit ihm', async () => {
        const ansicht = useAnsicht();
        const w = mount(CdeReiterleiste, STUB);
        ansicht.setzeStand({ hatModell: true });
        ansicht.setzeModus('lageplan');
        await w.vm.$nextTick();
        expect(namen(w)).toEqual(['Struktur', 'Bauteil', 'Verlauf', 'Mengen', 'Notizen', 'Plan']);
        ansicht.setzeModus('3d');
        await w.vm.$nextTick();
        expect(namen(w)).not.toContain('Plan');
        w.unmount();
    });

    it('Struktur und Bauteil können zugleich offen sein — rechts bleibt es bei einer Tafel', async () => {
        const p = usePanels();
        const w = mount(CdeReiterleiste, STUB);
        const knopf = (name) => w.findAll('.cr-knopf').find(k => k.text() === name);

        await knopf('Bauteil').trigger('click');
        await knopf('Struktur').trigger('click');
        expect(p.isOpen('bauteil')).toBe(true);
        expect(p.isOpen('struktur')).toBe(true);
        expect(knopf('Struktur').attributes('title')).toContain('öffnet links');

        await knopf('Verlauf').trigger('click');
        expect(p.isOpen('verlauf')).toBe(true);
        expect(p.isOpen('bauteil')).toBe(false);
        expect(p.isOpen('struktur')).toBe(true);

        await knopf('Verlauf').trigger('click');
        expect(p.isOpen('verlauf')).toBe(false);
        w.unmount();
    });

    it('jede Beschriftung passt in die Leiste: höchstens 10 Zeichen', () => {
        for (const d of PANEL_DEFS) expect((d.kurz ?? d.titel).length, d.id).toBeLessThanOrEqual(10);
    });
});
