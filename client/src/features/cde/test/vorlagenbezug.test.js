// @vitest-environment jsdom
/**
 * Die Instanz merkt sich ihre Vorlage (Teil XXIII, A1).
 *
 * Der einzige Befund des Architektur-Audits (2026-09-18) OHNE Rückweg: die
 * Vorgaben einer Vorlage wurden in die Parameter KOPIERT, die Herkunft ging
 * verloren — an ZWEI Stellen, beim Zeichnen aus der Bibliothek und beim
 * Tauschen. Jede Instanz, die so entstand, blieb für immer vorlagenlos.
 *
 * Geprüft wird über den ECHTEN Weg (Lehre vom 17.09.: ein Test, der das
 * angereicherte Subjekt selbst baut, prüft die Anreicherung nicht):
 *   Zeichnen:  useZeichnen.starte → bearbeitung.vorbelegeAusVorlage (derselbe
 *              Aufruf wie IfcViewer.zeichnenStarten) → Punkte → abschliessen
 *   Tauschen:  bearbeitung.einordne (Stand aus dem Journal, `_standVon`) →
 *              starte → setzeWert → ausfuehren
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useZeichnen } from '../composables/useZeichnen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { EINGEBAUTE_VORLAGEN, vorlagenbezugVon } from '../services/Bibliothek.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const DN1000 = EINGEBAUTE_VORLAGEN.find(v => v.id === 'schacht-dn1000');
const DN1200 = { id: 'schacht-dn1200', name: 'Schacht DN 1200', rezept: 'schacht', herkunft: 'buero',
                 vorgaben: { dn: 1200, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT' } };
const VORLAGEN = [...EINGEBAUTE_VORLAGEN, DN1200];
const SOHLE_DECKEL = [{ x: 5, z: 5 }, { x: 5, z: 5.001 }];

function bau() {
    const bearbeitung = useBearbeitung();
    const aenderungen = useAenderungen();
    const zeichnen = useZeichnen({
        bearbeitung, cde: { bearbeiter: 'Fabio' },
        getModellSha: () => 'sha1', getHoehenversatz: () => 0,
    });
    return { bearbeitung, aenderungen, zeichnen };
}

/** Einen Schacht zeichnen — wahlweise aus einer Vorlage, so wie der Viewer es tut. */
async function schachtZeichnen(t, vorlage = null) {
    t.zeichnen.starte('schacht-zeichnen');
    if (vorlage) t.bearbeitung.vorbelegeAusVorlage(vorlage);
    t.bearbeitung.setzeWert('hoehe', 297);
    for (const p of SOHLE_DECKEL) t.zeichnen.setzePunkt(p);
    await t.zeichnen.abschliessen();
    const e = t.aenderungen.eintraege.at(-1);
    return { gid: e.globalId, plan: t.aenderungen.wirksamerStand('erzeugt').get(e.globalId) };
}

describe('Zeichnen aus der Bibliothek — die Herkunft bleibt', () => {
    it('das gezeichnete Bauteil trägt die Id seiner Vorlage', async () => {
        const t = bau();
        const { plan } = await schachtZeichnen(t, DN1000);
        expect(plan.parameter.vorlage).toBe('schacht-dn1000');
        expect(plan.parameter.dn).toBe(1000);
        expect(plan.kategorie).toBe('IFCDISTRIBUTIONCHAMBERELEMENT');
    });

    it('ohne Vorlage gezeichnet: kein Bezug, kein leeres Feld', async () => {
        const t = bau();
        const { plan } = await schachtZeichnen(t);
        expect('vorlage' in plan.parameter).toBe(false);
        expect(vorlagenbezugVon(plan, VORLAGEN)).toBeNull();
    });

    it('so war es vorher — die Vorgaben allein tragen keine Herkunft', async () => {
        // Der alte Weg des Viewers: jede Vorgabe einzeln per `setzeWert`.
        const t = bau();
        t.zeichnen.starte('schacht-zeichnen');
        for (const [f, w] of Object.entries(DN1000.vorgaben)) t.bearbeitung.setzeWert(f, w);
        t.bearbeitung.setzeWert('hoehe', 297);
        for (const p of SOHLE_DECKEL) t.zeichnen.setzePunkt(p);
        await t.zeichnen.abschliessen();
        const plan = t.aenderungen.wirksamerStand('erzeugt').get(t.aenderungen.eintraege.at(-1).globalId);
        expect(plan.parameter.dn).toBe(1000);
        expect(plan.parameter.vorlage).toBeUndefined();
    });
});

describe('Tauschen — der Bezug wandert mit', () => {
    async function tausche(t, gid, vorlageId) {
        // Seit Teil XXV (V3) ist die Bibliothek eine Eingabe des KATALOGS, keine
        // Liste am Subjekt: der Store lädt sie mit `ladeProfile`, hier der Test.
        t.bearbeitung.vorlagen = VORLAGEN;
        await t.bearbeitung.einordne({ globalId: gid, modelId: 'cde-eigenbau', localId: 1,
                                       category: 'IFCDISTRIBUTIONCHAMBERELEMENT' }, null);
        expect(t.bearbeitung.starte('koerper-tauschen')).toBeTruthy();
        t.bearbeitung.setzeWert('vorlage', vorlageId);
        return t.bearbeitung.ausfuehren({ wer: 'Fabio' });
    }

    it('DN 1000 → DN 1200: Masse UND Herkunft, dieselbe GlobalId', async () => {
        const t = bau();
        const { gid } = await schachtZeichnen(t, DN1000);
        await tausche(t, gid, 'schacht-dn1200');
        const plan = t.aenderungen.wirksamerStand('erzeugt').get(gid);
        expect(plan.parameter.dn).toBe(1200);
        expect(plan.parameter.vorlage).toBe('schacht-dn1200');
        expect(vorlagenbezugVon(plan, VORLAGEN)).toMatchObject({ id: 'schacht-dn1200', name: 'Schacht DN 1200', fehlt: false, abweichend: [] });
    });

    it('ein Bauteil, das zufällig schon die Masse hat, bekommt trotzdem seine Herkunft', async () => {
        // Vorher: „gleich → nichts zu tun" — der Bezug entstand nie.
        const t = bau();
        const { gid } = await schachtZeichnen(t);          // DN 1000 aus der Rezept-Vorgabe, ohne Vorlage
        expect(t.aenderungen.wirksamerStand('erzeugt').get(gid).parameter.dn).toBe(1000);
        await tausche(t, gid, 'schacht-dn1000');
        expect(t.aenderungen.wirksamerStand('erzeugt').get(gid).parameter.vorlage).toBe('schacht-dn1000');
    });

    it('dieselbe Vorlage ein zweites Mal: kein Schritt', async () => {
        const t = bau();
        const { gid } = await schachtZeichnen(t, DN1000);
        const vorher = t.aenderungen.eintraege.length;
        await tausche(t, gid, 'schacht-dn1000');
        expect(t.aenderungen.eintraege.length).toBe(vorher);
    });
});

describe('Die Instanz darf abweichen — der Bezug bleibt', () => {
    it('geänderte Vorlage: die Abweichung ist sichtbar, feldgenau', async () => {
        const t = bau();
        const { plan } = await schachtZeichnen(t, DN1000);
        const spaeter = VORLAGEN.map(v => (v.id === 'schacht-dn1000' ? { ...v, vorgaben: { ...v.vorgaben, dn: 1100 } } : v));
        expect(vorlagenbezugVon(plan, spaeter)).toMatchObject({
            id: 'schacht-dn1000', fehlt: false, abweichend: [{ feld: 'dn', soll: 1100, ist: 1000 }],
        });
    });

    it('„1000" aus dem Formular und 1000 aus der Vorlage sind dasselbe Mass', () => {
        const plan = { rezept: 'schacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', parameter: { vorlage: 'schacht-dn1000', dn: '1000' } };
        expect(vorlagenbezugVon(plan, VORLAGEN).abweichend).toEqual([]);
    });

    it('gelöschte Vorlage: „fehlt" — das Bauteil behält seine Werte', async () => {
        const t = bau();
        const { plan } = await schachtZeichnen(t, DN1200);
        const ohne = VORLAGEN.filter(v => v.id !== 'schacht-dn1200');
        expect(vorlagenbezugVon(plan, ohne)).toMatchObject({ id: 'schacht-dn1200', fehlt: true, name: null });
        expect(plan.parameter.dn).toBe(1200);
    });

    it('eine Vorgabe, die kein Rezeptfeld ist, ist keine Abweichung', () => {
        const fremd = [{ ...DN1000, vorgaben: { ...DN1000.vorgaben, farbe: 'rot' } }];
        const plan = { rezept: 'schacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', parameter: { vorlage: 'schacht-dn1000', dn: 1000 } };
        expect(vorlagenbezugVon(plan, fremd).abweichend).toEqual([]);
    });

    it('ein anderer IFC-Typ als die Vorlage ist eine Abweichung', () => {
        const plan = { rezept: 'schacht', kategorie: 'IFCFLOWFITTING', parameter: { vorlage: 'schacht-dn1000', dn: 1000 } };
        expect(vorlagenbezugVon(plan, VORLAGEN).abweichend).toEqual([
            { feld: 'kategorie', soll: 'IFCDISTRIBUTIONCHAMBERELEMENT', ist: 'IFCFLOWFITTING' },
        ]);
    });
});

describe('Die Herkunft ist eine Aussage, keine Geometrie', () => {
    it('`parameter.vorlage` ändert am gebauten Körper nichts', async () => {
        const t = bau();
        const { plan } = await schachtZeichnen(t, DN1000);
        const mit = rezeptNach('schacht').baue(plan.parameter);
        const { vorlage: _v, ...ohneParam } = plan.parameter;
        const ohne = rezeptNach('schacht').baue(ohneParam);
        const pos = (g) => Array.from(g?.geometrie?.attributes?.position?.array ?? g?.attributes?.position?.array ?? g?.positions ?? []);
        expect(pos(mit).length).toBeGreaterThan(0);
        expect(pos(mit)).toEqual(pos(ohne));
    });

    it('eine Vorlage nennt nie selbst eine Herkunft — sonst zeigte die neue auf die alte', () => {
        const t = bau();
        t.zeichnen.starte('schacht-zeichnen');
        t.bearbeitung.vorbelegeAusVorlage({ ...DN1000, vorgaben: { ...DN1000.vorgaben, vorlage: 'irgendwas' } });
        expect(t.bearbeitung.werte.vorlage).toBe('schacht-dn1000');
    });
});

/**
 * Der Chip im Semantik-Fenster — MONTIERT, nicht als Quelltext gelesen. Der
 * Zustand kommt über dieselben Stores wie im Viewer: ein gezeichnetes Bauteil
 * im Verlauf, die Auswahl im IFC-Store, das eingeordnete Subjekt (mit den
 * Vorlagen, die `IfcViewer` für eigene Bauteile anhängt) im Bearbeitungs-Store.
 */
describe('Das Semantik-Fenster sagt, woher das Bauteil stammt', () => {
    async function fenster(vorlagenImSubjekt) {
        const { mount, flushPromises } = await import('@vue/test-utils');
        const { defineComponent, h } = await import('vue');
        const { provideViewerApi } = await import('../composables/viewerApi.js');
        const { useIfcStore } = await import('../stores/useIfcStore.js');
        const IfcSemanticWindow = (await import('../components/IfcSemanticWindow.vue')).default;

        const t = bau();
        const { gid } = await schachtZeichnen(t, DN1000);
        if (vorlagenImSubjekt) t.bearbeitung.vorlagen = vorlagenImSubjekt;
        await t.bearbeitung.einordne({ globalId: gid, modelId: 'cde-eigenbau', localId: 1,
                                       category: 'IFCDISTRIBUTIONCHAMBERELEMENT' }, null);
        useIfcStore().setElement({ globalId: gid, type: 'IFCDISTRIBUTIONCHAMBERELEMENT', name: 'S1' });
        const Huelle = defineComponent({ setup() { provideViewerApi({}); return () => h(IfcSemanticWindow); } });
        const w = mount(Huelle, { global: { stubs: { CdeIcon: { template: '<i />' }, IfcSidebar: { template: '<div />' } } } });
        await flushPromises();
        return w;
    }

    it('„Aus Vorlage Schacht DN 1000" — ohne Abweichung', async () => {
        const w = await fenster(VORLAGEN);
        const chip = w.find('.vorlage-hinweis');
        expect(chip.exists()).toBe(true);
        expect(chip.text()).toMatch(/Aus Vorlage\s+Schacht DN 1000$/);
        w.unmount();
    });

    it('die Vorlage änderte sich: „· 1 Abweichung", der Titel nennt Feld, Soll und Ist', async () => {
        const spaeter = VORLAGEN.map(v => (v.id === 'schacht-dn1000' ? { ...v, vorgaben: { ...v.vorgaben, dn: 1100 } } : v));
        const w = await fenster(spaeter);
        const chip = w.find('.vorlage-hinweis');
        expect(chip.text()).toMatch(/1 Abweichung/);
        expect(chip.find('span').attributes('title')).toBe('dn: Vorlage 1100, hier 1000');
        w.unmount();
    });

    it('gelöscht: „gibt es nicht mehr" — und farblich abgesetzt', async () => {
        const w = await fenster(VORLAGEN.filter(v => v.id !== 'schacht-dn1000'));
        const chip = w.find('.vorlage-hinweis');
        expect(chip.classes()).toContain('vorlage-hinweis--fehlt');
        expect(chip.text()).toMatch(/gibt es nicht mehr/);
        w.unmount();
    });

    it('ohne geladene Vorlagenliste: nur die Id, KEIN Urteil', async () => {
        const w = await fenster(null);
        const chip = w.find('.vorlage-hinweis');
        expect(chip.text()).toMatch(/Aus Vorlage\s+schacht-dn1000/);
        expect(chip.classes()).not.toContain('vorlage-hinweis--fehlt');
        w.unmount();
    });
});
