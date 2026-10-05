// @vitest-environment jsdom
/**
 * Teil XXXI, T8 — die Zahl am Griff (Konzept H8).
 *
 * Vorher: genaue Werte nur im Formular der Tafel — hochkant seit T5 eingeklappt, also aufklappen, Werkzeug suchen,
 * tippen. Jetzt: ein Tipp auf den Griff (ohne Ziehen) öffnet daneben ein Feld mit dem, was der Griff setzt, und dem
 * Wert von jetzt; Übernehmen geht denselben Weg wie das Loslassen eines Zugs (ein Kommando, ein Rückgängig).
 *
 * Echter Weg: Wände über Kommandos, Einordnung wie im Viewer, `useGriffe` (greifen → zugStart → zugEnde ohne
 * Bewegung), geschrieben über das Journal; das Feld selbst montiert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';
import { useGriffe } from '../composables/useGriffe.js';
import CdeGriffZahl from '../components/CdeGriffZahl.vue';
import CdeHudLayer from '../components/CdeHudLayer.vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kommando } from './hilfen/ruebKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 };
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of [kommando('wand-zeichnen', { neu: ['cde-A'], werte: { name: 'A', ...WAND }, eingaben: { zug: [e(0, 0, 100), e(10, 0, 100)] } }),
                     kommando('wand-zeichnen', { neu: ['cde-B'], werte: { name: 'B', ...WAND }, eingaben: { zug: [e(10, 0, 100), e(10, 8, 100)] } })]) {
        const r = await b.fuehreAus(k);
        if (!r.ausgefuehrt) throw new Error(r.grund);
    }
    useIfcStore().modelList.push({ modelId: CDE_MODELL_ID, name: 'Eigenbau' });
});
afterEach(() => repo.setBackend(null));

const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);

async function aufbau(gid = 'cde-A') {
    const engine = {
        knotenGriffe: () => [], schachtAnschluesse: () => [],
        zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => null), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
        zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(), geistLeeren: vi.fn(),
        blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
        strahl: (x, y) => ({ origin: { x, y: 500, z: y }, direction: { x: 0, y: -1, z: 0 } }),
    };
    const nachBauen = vi.fn(async () => ({ angewandt: true }));
    const g = useGriffe({
        engine: ref(engine), bearbeitung: b, aenderungen: ae,
        getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil, getBauform: () => b.einordnung?.bauform ?? null,
        getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
        holeKnotenSubjekt: async () => null, nachBauen, getWer: () => 'Fabio', melde: vi.fn(),
        farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
    });
    b.modusSetzen(true);
    const s = subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand });
    await b.einordne({ ...s, modelId: CDE_MODELL_ID, localId: 7, category: 'IFCWALL', type: 'IFCWALL' }, null);
    g.neuBauen();
    return { engine, g, nachBauen };
}
/** Ein Tipp auf einen Griff — aufsetzen und loslassen, ohne zu ziehen. */
async function tippe(t, griff) {
    t.engine.griffUnter.mockReturnValue(griff.key);
    t.g.greifen({ x: 0, y: 0, typ: 'touch' });
    t.g.zugStart({ x: 0, y: 0, px: { x: 120, y: 80 }, typ: 'touch' });
    await t.g.zugEnde({ abbruch: false });
}

describe('ein Tipp auf den Griff öffnet die Zahl — mit dem Wert von jetzt', () => {
    it('Wandhöhe: ein Feld „Wandhöhe 2,50 m" am Ort des Tipps; 3,10 übernommen → die Wand ist 3,10 m hoch', async () => {
        const t = await aufbau();
        const g = t.g.griffe.value.find(x => x.feld?.name === 'wandhoehe');
        const n = ae.eintraege.length;
        await tippe(t, g);
        expect(ae.eintraege.length).toBe(n);                                   // der Tipp selbst schreibt nichts
        expect(t.g.zahl.value).toMatchObject({ x: 120, y: 80, felder: [{ name: 'wandhoehe', titel: 'Wandhöhe', einheit: 'm', wert: 2.5 }] });
        await t.g.zahlUebernehmen({ wandhoehe: 3.1 });
        expect(plan('cde-A').parameter.wandhoehe).toBe(3.1);
        expect(ae.eintraege.length).toBe(n + 1);
        expect(t.g.zahl.value).toBe(null);
    });

    it('Eckpunkt im Knoten: Rechtswert, Hochwert, Höhe — 1 m weiter östlich getippt, die Wand B geht mit (T7)', async () => {
        const t = await aufbau();
        const ecke = t.g.griffe.value.find(x => x.key === 'stuetz:cde-A:1');
        await tippe(t, ecke);
        const z = t.g.zahl.value;
        expect(z.felder.map(f => f.name)).toEqual(['ost', 'nord', 'hoehe']);
        expect(z.felder.find(f => f.name === 'ost').wert).toBe(10);
        await t.g.zahlUebernehmen({ ost: 11, nord: 0, hoehe: 100 });
        expect(plan('cde-A').parameter.punkte[1]).toEqual([11, 100, -0]);
        expect(plan('cde-B').parameter.punkte[0]).toEqual([11, 100, -0]);
    });

    it('Höhengriff: nur die Höhe; Drehgriff: „Drehen um 0°" — 90 getippt dreht die Wand', async () => {
        const t = await aufbau();
        await tippe(t, t.g.griffe.value.find(x => x.key === 'stuetz-hoch:cde-A:0'));
        expect(t.g.zahl.value.felder.map(f => f.name)).toEqual(['hoehe']);
        t.g.zahlSchliessen();
        const dreh = t.g.griffe.value.find(x => x.art === 'drehung');
        await tippe(t, dreh);
        expect(t.g.zahl.value.felder).toEqual([expect.objectContaining({ name: 'winkel', einheit: '°', wert: 0 })]);
        await t.g.zahlUebernehmen({ winkel: 90 });
        const [a, c] = plan('cde-A').parameter.punkte;
        expect(Math.abs(a[0] - c[0])).toBeLessThan(1e-6);                      // jetzt in Nord-Süd-Richtung
    });

    it('der Gizmo-Pfeil fragt den Versatz entlang seiner Achse — 2 m nach Osten', async () => {
        const t = await aufbau();
        const s = b.bauteil;
        const pfeil = { key: 'bauteil:cde-A:ost', globalId: 'cde-A', herkunft: 'cde', art: 'bauteil', form: 'pfeil', achsName: 'ost',
                        richtung: { x: 1, y: 0, z: 0 }, pos: { ...s.anker }, anker: { ...s.anker }, werkzeug: 'verschieben', felder: ['ost', 'nord', 'hoehe'] };
        t.g.griffe.value = [...t.g.griffe.value, pfeil];
        await tippe(t, pfeil);
        expect(t.g.zahl.value.felder).toEqual([expect.objectContaining({ name: 'versatz', einheit: 'm', wert: 0 })]);
        const vorher = plan('cde-A').parameter.punkte.map(p => p[0]);
        await t.g.zahlUebernehmen({ versatz: 2 });
        expect(plan('cde-A').parameter.punkte.map(p => p[0])).toEqual(vorher.map(x => x + 2));
    });

    it('ein Tipp daneben oder ein anderes Bauteil schliesst die Zahl', async () => {
        const t = await aufbau();
        await tippe(t, t.g.griffe.value.find(x => x.feld?.name === 'wandhoehe'));
        expect(t.g.zahl.value).not.toBe(null);
        t.engine.griffUnter.mockReturnValue(null);
        t.g.greifen({ x: 0, y: 0, typ: 'touch' });
        expect(t.g.zahl.value).toBe(null);
    });
});

describe('das Feld (`CdeGriffZahl`)', () => {
    const ZAHL = { titel: 'Wandhöhe', x: 100, y: 50, felder: [{ name: 'wandhoehe', titel: 'Wandhöhe', einheit: 'm', wert: 2.5, stellen: 3 }] };

    it('zeigt den Wert mit Komma, nimmt Komma oder Punkt, Enter übernimmt, Esc schliesst', async () => {
        const w = mount(CdeGriffZahl, { props: { zahl: ZAHL }, attachTo: document.body });
        const ein = w.find('input');
        expect(ein.element.value).toBe('2,500');
        expect(ein.attributes('inputmode')).toBe('decimal');                  // die Zahlentastatur auf dem Tablet
        await ein.setValue('3,1');
        await w.find('form').trigger('submit');
        expect(w.emitted('uebernehmen')[0][0]).toEqual({ wandhoehe: 3.1 });
        await ein.setValue('3.25');
        await w.find('form').trigger('submit');
        expect(w.emitted('uebernehmen')[1][0]).toEqual({ wandhoehe: 3.25 });
        await w.find('form').trigger('keydown', { key: 'Escape' });
        expect(w.emitted('schliessen')).toHaveLength(1);
        w.unmount();
    });

    it('eine ungültige Zahl übernimmt nicht — das Feld ist markiert, der Knopf gesperrt', async () => {
        const w = mount(CdeGriffZahl, { props: { zahl: ZAHL }, attachTo: document.body });
        await w.find('input').setValue('3,1x');
        await nextTick();
        expect(w.find('input').classes()).toContain('falsch');
        expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined();
        await w.find('form').trigger('submit');
        expect(w.emitted('uebernehmen')).toBeUndefined();
        w.unmount();
    });

    it('am rechten Bildrand geht das Feld links vom Griff auf (im Tabletlauf lief es sonst hinaus)', async () => {
        const proto = HTMLElement.prototype;
        const alt = { w: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'), p: Object.getOwnPropertyDescriptor(proto, 'offsetParent') };
        Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => 220 });
        Object.defineProperty(proto, 'offsetParent', { configurable: true, get: () => ({ clientWidth: 400 }) });
        try {
            const rechts = mount(CdeGriffZahl, { props: { zahl: { ...ZAHL, x: 300 } } });
            await nextTick();
            expect(rechts.find('form').attributes('style')).toContain('translateX(-100%)');
            rechts.unmount();
            const mitte = mount(CdeGriffZahl, { props: { zahl: { ...ZAHL, x: 100 } } });
            await nextTick();
            expect(mitte.find('form').attributes('style')).not.toContain('translateX');
            mitte.unmount();
        } finally {
            for (const [k, d] of [['offsetWidth', alt.w], ['offsetParent', alt.p]]) {
                if (d) Object.defineProperty(proto, k, d); else delete proto[k];
            }
        }
    });
});

describe('das Schild der Auswahl weicht den Griffen aus (gefunden im Tabletlauf T8)', () => {
    it('mit Griffen hängt es an der Oberkante und hält mehr Abstand als eine Trefferfläche', async () => {
        const ROHR = { type: 'IFCWALL', name: 'A', modelId: CDE_MODELL_ID, localId: 7, globalId: 'cde-A' };
        const w = mount(CdeHudLayer, { props: { element: ROHR, elementAnker: [5, 102.5, 0], projectToScreen: () => ({ x: 100, y: 100 }), ueberGriffen: true },
                                       global: { stubs: { CdeIcon: { template: '<i />' } } } });
        await nextTick();
        expect(w.find('.hud-menu').classes()).toContain('hud-menu--ueber-griffen');
        await w.setProps({ ueberGriffen: false });
        expect(w.find('.hud-menu').classes()).not.toContain('hud-menu--ueber-griffen');
        w.unmount();
        const css = readFileSync(fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, 'components/CdeHudLayer.vue'), 'utf8');
        expect(css).toMatch(/\.hud-menu\.hud-menu--ueber-griffen \{ transform: translate\(-50%, calc\(-100% - 34px\)\); \}/);
        const v = readFileSync(fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, 'components/IfcViewer.vue'), 'utf8');
        expect(v).toContain(':elementAnker="eingabe.aktiv.value ? null : (griffe.griffe.value.length ? selectionAnchorOben : selectionAnchor)"');
        expect(v).toContain('selectionAnchorOben.value = da ? [(box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2] : null;');
    });
});


describe('Teil XXXII, K2 — das „+" gleitet auf seiner Kante: eingefügt wird, wo man loslässt', () => {
    /** Ein Zug am Griff: aufsetzen, nach (x, z) in Welt ziehen (der Strahl ist senkrecht), loslassen. */
    async function gleite(t, griff, nach, px = { x: 60, y: 0 }) {
        t.engine.griffUnter.mockReturnValue(griff.key);
        t.g.greifen({ x: griff.pos.x, y: griff.pos.z, typ: 'touch' });
        t.g.zugStart({ x: griff.pos.x, y: griff.pos.z, px: { x: 0, y: 0 }, typ: 'touch' });
        t.g.zugBewegt({ x: nach.x, y: nach.z, px, typ: 'touch' });
        const pille = t.g.pille.value?.text ?? null;
        await t.g.zugEnde({ abbruch: false });
        return pille;
    }

    it('Wand 10 m: das „+" (Mitte, Station 5) bis Station 3 geschoben → Knick bei 3,00 m; ein Tipp bleibt die Mitte', async () => {
        const t = await aufbau();
        const plus = t.g.griffe.value.find(x => x.key === 'kante-plus:cde-A:0');
        expect(plus.gleiten).toMatchObject({ feld: 'station', basis: 0 });
        const pille = await gleite(t, plus, { x: 3, z: 0.4 });                  // etwas neben der Kante: projiziert
        expect(pille).toBe('Knickpunkt · Station 3,00 m');
        expect(plan('cde-A').parameter.punkte.map(p => p[0])).toEqual([0, 3, 10]);
    });

    it('weit weg von der Kante losgelassen: nichts wird eingefügt', async () => {
        const t = await aufbau();
        t.engine.projectToScreen = () => ({ x: 0, y: 0 });                       // die Kante liegt am Schirm weit weg vom Finger
        const plus = t.g.griffe.value.find(x => x.key === 'kante-plus:cde-A:0');
        const n = ae.eintraege.length;
        await gleite(t, plus, { x: 3, z: 0 }, { x: 400, y: 300 });
        expect(ae.eintraege.length).toBe(n);
    });
});
