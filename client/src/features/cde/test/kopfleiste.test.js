// @vitest-environment jsdom
/**
 * Die Kopfleiste (Kassensturz H1, 2026-09-12).
 *
 * Gezählt wird, was man in der gemounteten Leiste bedienen kann — dieselbe
 * Grösse wie im Audit: 21 Bedienelemente vorher, 11 davon nur als Symbol.
 * Jetzt: Projekt, Satz, vier Ansichten, Ausgeben, ⋯ — und nur ⋯ ohne Wort.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CdeKopfleiste from '../components/CdeKopfleiste.vue';
import { useCdeStore } from '../stores/useCdeStore.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { repo } from '../services/RepoFacade.js';

const STUB = { global: { stubs: { CdeIcon: { template: '<i />' } } } };

function mitProjekt() {
    const cde = useCdeStore();
    cde.auftrag = { id: 42069, nummer: '42069', name: 'BlazeIT', bauherr: 'Stadt Musterhausen', lph: '5' };
    cde.saetze = [
        { id: 's1', name: 'Bestand', enthaelt: [] },
        { id: 's2', name: 'Durchstich Verbund', enthaelt: [] },
    ];
    cde.aktiverSatzId = 's1';
    cde.dokumente = [{ sha256: 'a', name: 'Gelaende.ifc' }, { sha256: 'b', name: 'Kanal.ifc' }];
    return cde;
}

/** Was man in der Leiste bedienen kann, solange kein Menü offen ist. */
function bedienelemente(w) {
    return w.findAll('button, select, input, a').filter(e => !e.element.closest('.kl-menue'));
}

/** Den Projektordner vortäuschen — `repo.remote` hängt sonst am Backend. */
function mitOrdner(an) {
    const vorher = Object.getOwnPropertyDescriptor(repo, 'remote');
    Object.defineProperty(repo, 'remote', { configurable: true, get: () => an });
    return () => {
        if (vorher) Object.defineProperty(repo, 'remote', vorher);
        else delete repo.remote;
    };
}

function montiert() {
    return mount(CdeKopfleiste, { attachTo: document.body, ...STUB });
}

describe('CdeKopfleiste — was oben steht', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('8 Bedienelemente statt 21 — und nur „Mehr" ohne Wort (vorher 11)', () => {
        mitProjekt();
        const w = montiert();
        const alle = bedienelemente(w);
        expect(alle).toHaveLength(8);
        const nurSymbol = alle.filter(e => !e.text().trim());
        expect(nurSymbol.map(e => e.attributes('aria-label'))).toEqual(['Mehr']);
        expect(w.find('.kl-ansichten').text()).toBe('3DLageplanLängsschnittDokumente2');
        w.unmount();
    });

    it('ohne Projekt: kein Satz, dafür „Kein Projekt"', () => {
        const w = montiert();
        expect(w.text()).toContain('Kein Projekt');
        expect(w.find('.kl-satz').exists()).toBe(false);
        expect(bedienelemente(w)).toHaveLength(6);   // vier Ansichten, Ausgeben, Mehr
        w.unmount();
    });
});

describe('CdeKopfleiste — die drei Menüs', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('der Projekt-Knopf zeigt die Stammdaten und führt zur Akte', async () => {
        mitProjekt();
        const w = montiert();
        await w.find('.kl-projekt').trigger('click');
        const menue = w.find('.kl-menue');
        expect(menue.text()).toContain('Stadt Musterhausen');
        expect(menue.text()).toContain('Geändert wird in der Projekt-Akte.');
        const akte = menue.find('a');
        expect(akte.attributes('href')).toBe('/intern/projects?projekt=42069');
        expect(akte.attributes('target')).toBe('_blank');
        w.unmount();
    });

    it('das Satz-Menü wählt, legt an, benennt um und löscht — über Ereignisse an die Schale', async () => {
        mitProjekt();
        const w = montiert();
        expect(w.find('.kl-satz').text()).toContain('Bestand');

        await w.find('.kl-satz').trigger('click');
        const eintraege = w.findAll('.kl-menue .kl-eintrag').map(e => e.text());
        expect(eintraege).toEqual(['Bestand', 'Durchstich Verbund', 'ohne Satz', 'Neuer Satz …', 'Umbenennen …', 'Löschen …']);

        // Den aktiven noch einmal zu wählen, meldet nichts.
        await w.findAll('.kl-menue .kl-eintrag')[0].trigger('click');
        expect(w.emitted('satz-waehlen')).toBeUndefined();

        await w.find('.kl-satz').trigger('click');
        await w.findAll('.kl-menue .kl-eintrag')[1].trigger('click');
        expect(w.emitted('satz-waehlen')).toEqual([['s2']]);
        expect(w.find('.kl-menue').exists()).toBe(false);

        await w.find('.kl-satz').trigger('click');
        await w.findAll('.kl-menue .kl-eintrag').find(e => e.text() === 'Neuer Satz …').trigger('click');
        expect(w.emitted('satz-neu')).toHaveLength(1);
        w.unmount();
    });

    it('ohne aktiven Satz sind Umbenennen und Löschen gesperrt', async () => {
        const cde = mitProjekt();
        cde.aktiverSatzId = null;
        const w = montiert();
        expect(w.find('.kl-satz').text()).toContain('ohne Satz');
        await w.find('.kl-satz').trigger('click');
        const knopf = (t) => w.findAll('.kl-menue .kl-eintrag').find(e => e.text() === t);
        expect(knopf('Umbenennen …').attributes('disabled')).toBeDefined();
        expect(knopf('Löschen …').attributes('disabled')).toBeDefined();
        expect(knopf('Neuer Satz …').attributes('disabled')).toBeUndefined();
        w.unmount();
    });

    it('„Mehr" trägt das Seltene: Bauformen, heller Modus, Tastenkürzel', async () => {
        mitProjekt();
        const w = montiert();
        await w.find('.kl-mehr').trigger('click');
        expect(w.findAll('.kl-menue .kl-eintrag').map(e => e.text())).toEqual(['Bauformen zuordnen …', 'Heller Modus', 'Tastenkürzel ?']);
        await w.findAll('.kl-menue .kl-eintrag')[0].trigger('click');
        expect(w.emitted('bauformen')).toHaveLength(1);
        w.unmount();
    });

    // Kassensturz H6: der helle Modus wohnt im Seltenen — kein Dauerplatz oben.
    it('„Heller Modus" schaltet um, zeigt den Haken und merkt es sich', async () => {
        mitProjekt();
        const w = montiert();
        const eintrag = async () => { await w.find('.kl-mehr').trigger('click'); return w.findAll('.kl-menue .kl-eintrag').find(e => e.text() === 'Heller Modus'); };
        let e = await eintrag();
        expect(e.attributes('role')).toBe('menuitemcheckbox');
        expect(e.attributes('aria-checked')).toBe('false');
        await e.trigger('click');
        expect(document.documentElement.dataset.cdeModus).toBe('hell');
        expect(localStorage.getItem('cde-farbmodus')).toBe('hell');
        expect(w.find('.kl-menue').exists()).toBe(false);
        e = await eintrag();
        expect(e.attributes('aria-checked')).toBe('true');
        expect(e.classes()).toContain('an');
        await e.trigger('click');
        expect(document.documentElement.dataset.cdeModus).toBe('dunkel');
        w.unmount();
    });

    it('Esc und ein Tipp daneben schliessen das Menü — und das Esc geht nicht weiter', async () => {
        mitProjekt();
        const w = montiert();
        await w.find('.kl-satz').trigger('click');
        let weiter = false;
        const lauscher = () => { weiter = true; };
        document.addEventListener('keydown', lauscher);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await w.vm.$nextTick();
        expect(w.find('.kl-menue').exists()).toBe(false);
        expect(weiter).toBe(false);

        await w.find('.kl-satz').trigger('click');
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await w.vm.$nextTick();
        expect(w.find('.kl-menue').exists()).toBe(false);

        // Geschlossen lässt die Leiste Esc durch — sonst bräche kein Werkzeug mehr ab.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(weiter).toBe(true);
        document.removeEventListener('keydown', lauscher);
        w.unmount();
    });
});

describe('CdeKopfleiste — Ansicht und Ausgeben', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });

    it('„Dokumente" gibt es nur mit Projekt; die Taste steht im Tooltip', async () => {
        mitProjekt();
        const ansicht = useAnsicht();
        const w = montiert();
        const dok = () => w.findAll('.kl-ansicht').find(k => k.text().startsWith('Dokumente'));

        expect(dok().attributes('disabled')).toBeDefined();
        expect(dok().attributes('title')).toContain('nur in einem Projekt');

        ansicht.setzeStand({ hatProjekt: true });
        await w.vm.$nextTick();
        expect(dok().attributes('disabled')).toBeUndefined();
        expect(dok().attributes('title')).toBe('Dokumente [4]');
        await dok().trigger('click');
        expect(ansicht.modus).toBe('dokumente');
        expect(dok().attributes('aria-pressed')).toBe('true');
        w.unmount();
    });

    it('Ausgeben: ohne Projektordner gesperrt und sagt warum; mit Ordner und Satz meldet es sich', async () => {
        mitProjekt();
        let zurueck = mitOrdner(false);
        let w = montiert();
        expect(w.find('.kl-ausgeben').attributes('disabled')).toBeDefined();
        expect(w.find('.kl-ausgeben').attributes('title')).toContain('Projektordner');
        w.unmount();
        zurueck();

        zurueck = mitOrdner(true);
        w = montiert();
        expect(w.find('.kl-ausgeben').attributes('disabled')).toBeUndefined();
        expect(w.find('.kl-ausgeben').attributes('title')).toContain('Bestand');
        await w.find('.kl-ausgeben').trigger('click');
        expect(w.emitted('ausgeben')).toHaveLength(1);
        w.unmount();
        zurueck();
    });
});
