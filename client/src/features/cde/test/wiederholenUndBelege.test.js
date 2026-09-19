// @vitest-environment jsdom
/**
 * Wiederholen und Systembelege (Teil XXIV — Fabios E9, Empfehlungen O2 und O4).
 *
 * Über die echten Stores gegen die echte Ablage (localStorage):
 *   1. WIEDERHOLEN in der offenen Sitzung: „zurück" nimmt den Vorgang aus
 *      dem Entwurf, „wiederholen" bringt ihn mit denselben Kennungen, derselben
 *      Vorgangskennung und demselben Beleg zurück — der Stand ist wie vorher.
 *   2. WIEDERHOLEN nach einem Commit: neue Einträge mit `wiederholungVon`,
 *      ein Commit „Wiederholt: …", das gespeicherte Ergebnis (E9) — und ein
 *      weiteres „zurück" nimmt die Wiederholung, nicht die Rücknahme.
 *   3. Ein neuer Schritt macht das Wiederholen ungültig.
 *   4. JEDER Systemvorgang trägt genau EINEN Beleg `system:<name>` am ersten
 *      Eintrag, die Vorgangskennung ist die Belegkennung, und der Beleg steht
 *      in der gesicherten Datei.
 *   5. Ein Systembeleg ist kein ausführbares Kommando.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { nachId } from '../services/Bearbeitungen.js';
import { KOMMANDO_SCHEMA, pruefeKommando } from '../services/kommando/Kommando.js';
import { SYSTEM_VORGAENGE, systemBeleg } from '../services/kommando/Beleg.js';

const SCHLUESSEL = 'ifc-repo:global:aenderungen';
const datei = () => localStorage.getItem(SCHLUESSEL) ?? '';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const schacht = (neu, id) => ({
    schema: KOMMANDO_SCHEMA, id, werkzeug: 'schacht-zeichnen', ziel: [], neu: [neu],
    eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 0, nord: -0.001, hoehe: 102 }] },
    werte: { name: 'S', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
    wer: 'fabio', wann: '2026-09-18T21:00:00Z',
});
const reihe = (neu, id = 'ko-reihe') => ({
    schema: KOMMANDO_SCHEMA, id, werkzeug: 'reihe', ziel: ['cde-s1'], neu,
    werte: { anzahl: neu.length, ost: 5, nord: 0 }, wer: 'fabio', wann: '2026-09-18T21:01:00Z',
});

/** Ein Schacht und das Subjekt, wie der Viewer es einordnet. */
async function schachtDa() {
    const b = useBearbeitung();
    expect((await b.fuehreAus(schacht('cde-s1', 'ko-schacht'))).ausgefuehrt).toBe(true);
    // Das Subjekt baut niemand von Hand: ohne Oberfläche kommt es aus dem Stand (K3).
    return { b };
}
const standKopie = (ae) => JSON.parse(JSON.stringify([...ae.wirksamerStand('erzeugt')]));

/** Der Kern von O4: ein Vorgang, ein Beleg, am ersten Eintrag, gesichert. */
function einBeleg(geschrieben, name) {
    const liste = (Array.isArray(geschrieben) ? geschrieben : [geschrieben]).filter(Boolean);
    expect(liste.length).toBeGreaterThan(0);
    const vorgaenge = new Set(liste.map(e => e.vorgang));
    expect(vorgaenge.size).toBe(1);
    const mitBeleg = liste.filter(e => e.kommando);
    expect(mitBeleg).toHaveLength(1);
    expect(mitBeleg[0]).toBe(liste[0]);
    const beleg = mitBeleg[0].kommando;
    expect(beleg).toMatchObject({ schema: KOMMANDO_SCHEMA, werkzeug: `system:${name}` });
    expect(beleg.id).toBe([...vorgaenge][0]);
    expect(datei()).toContain(`"werkzeug":"system:${name}"`);
    return beleg;
}

describe('1 — Wiederholen in der offenen Sitzung', () => {
    it('dieselben Kennungen, derselbe Vorgang, derselbe Beleg — der Stand wie vor dem Zurück', async () => {
        const { b } = await schachtDa();
        const ae = useAenderungen();
        await b.fuehreAus(reihe(['cde-k1', 'cde-k2']));
        const vorher = standKopie(ae);
        expect(ae.kannWiederholen).toBe(false);

        const gegen = await ae.zurueck('fabio');
        expect(gegen.map(g => g.globalId).sort()).toEqual(['cde-k1', 'cde-k2']);
        expect(ae.wirksamerStand('erzeugt').has('cde-k1')).toBe(false);
        expect(ae.kannWiederholen).toBe(true);

        const wieder = await ae.wiederholen('fabio');
        expect(wieder.map(e => e.globalId)).toEqual(['cde-k1', 'cde-k2']);
        expect(new Set(wieder.map(e => e.vorgang))).toEqual(new Set(['ko-reihe']));
        expect(wieder[0].kommando).toMatchObject({ id: 'ko-reihe', werkzeug: 'reihe', neu: ['cde-k1', 'cde-k2'] });
        expect(standKopie(ae)).toEqual(vorher);
        expect(ae.kannWiederholen).toBe(false);
        // Im Entwurf, nicht in einem Commit — die Sitzung ist wie vorher.
        expect(ae.sitzung.schrittIds).toEqual(expect.arrayContaining(wieder.map(e => e.id)));
    });
});

describe('2 — Wiederholen nach einem Commit', () => {
    it('neue Einträge mit `wiederholungVon`, ein Commit, das gespeicherte Ergebnis', async () => {
        const { b } = await schachtDa();
        const ae = useAenderungen();
        await b.fuehreAus(reihe(['cde-k1', 'cde-k2']));
        await ae.commitSitzung('Schächte', { wer: 'fabio' });
        const nachReihe = standKopie(ae);
        const originale = ae.eintraege.filter(e => e.vorgang === 'ko-reihe').map(e => e.id);

        const gegen = await ae.zurueck('fabio');
        const zb = einBeleg(gegen, 'zuruecknehmen');
        // Der Rücknahme-Beleg nennt, WAS zurückgenommen wurde.
        expect(zb.werte).toEqual({ vorgang: 'ko-reihe' });
        expect(ae.wirksamerStand('erzeugt').has('cde-k1')).toBe(false);

        const wieder = await ae.wiederholen('fabio');
        const wb = einBeleg(wieder, 'wiederholen');
        expect(wb.werte).toEqual({ vorgang: 'ko-reihe' });
        expect(wieder.map(e => e.wiederholungVon).sort()).toEqual([...originale].sort());
        expect(standKopie(ae)).toEqual(nachReihe);
        expect(ae.commits.at(-1).nachricht).toMatch(/^Wiederholt: /);
        expect(ae.commits.at(-1).schrittIds).toEqual(wieder.map(e => e.id));
        expect(datei()).toContain('"wiederholungVon"');

        // Das nächste „zurück" nimmt die WIEDERHOLUNG zurück, nicht die Rücknahme.
        await ae.zurueck('fabio');
        expect(ae.wirksamerStand('erzeugt').has('cde-k1')).toBe(false);
        expect(ae.wirksamerStand('erzeugt').has('cde-s1')).toBe(true);
    });

    it('der Stapel: zweimal zurück, zweimal wiederholen — in umgekehrter Reihenfolge', async () => {
        const { b } = await schachtDa();
        const ae = useAenderungen();
        await ae.commitSitzung('Schacht', { wer: 'fabio' });
        await b.fuehreAus(reihe(['cde-k1']));
        await ae.commitSitzung('Reihe', { wer: 'fabio' });
        const ende = standKopie(ae);

        await ae.zurueck('fabio');
        await ae.zurueck('fabio');
        expect(ae.wirksamerStand('erzeugt').size).toBe(0);
        await ae.wiederholen('fabio');
        expect([...ae.wirksamerStand('erzeugt').keys()]).toEqual(['cde-s1']);
        await ae.wiederholen('fabio');
        expect(standKopie(ae)).toEqual(ende);
        expect(ae.kannWiederholen).toBe(false);
    });
});

describe('3 — ein neuer Schritt macht das Wiederholen ungültig', () => {
    it('zurück, dann etwas anderes — nichts mehr zu wiederholen', async () => {
        const { b } = await schachtDa();
        const ae = useAenderungen();
        await b.fuehreAus(reihe(['cde-k1']));
        await ae.zurueck('fabio');
        expect(ae.kannWiederholen).toBe(true);
        await b.fuehreAus(schacht('cde-s2', 'ko-zweiter'));
        expect(ae.kannWiederholen).toBe(false);
        expect(await ae.wiederholen('fabio')).toEqual([]);
        expect(ae.wirksamerStand('erzeugt').has('cde-k1')).toBe(false);
    });
});

describe('4 — jeder Systemvorgang trägt genau einen Beleg', () => {
    const kg = (gid, wert) => ({ art: 'kg', globalId: gid, nachher: wert, wer: 'fabio' });

    it('Commit zurücknehmen (revert)', async () => {
        const ae = useAenderungen();
        await ae.eintragen(kg('A', '310'));
        await ae.eintragen(kg('B', '320'));
        const c = await ae.commitSitzung('KG', { wer: 'fabio' });
        const beleg = einBeleg(await ae.revertiereCommit(c.id, 'fabio'), 'revert');
        expect(beleg.werte).toEqual({ commit: c.id });
        expect(beleg.ziel.sort()).toEqual(['A', 'B']);
    });

    it('Konflikt: meiner gilt, verwerfen, übertragen', async () => {
        const ae = useAenderungen();
        const a = await ae.eintragen(kg('A', '310'));
        const b = await ae.eintragen(kg('B', '320'));
        const c = await ae.eintragen(kg('C', '330'));
        await ae.commitSitzung('KG', { wer: 'fabio' });
        einBeleg(await ae.hebeBasisAn(a.id, '300', 'fabio'), 'basis-heben');
        einBeleg(await ae.verwerfeEinen(b.id, 'fabio'), 'verwerfen');
        const beide = await ae.uebertrageAuf(c.id, 'C2', { wer: 'fabio' });
        const beleg = einBeleg(beide, 'uebertragen');
        expect(beleg.werte).toEqual({ eintrag: c.id, nach: 'C2' });
        expect(ae.wirksamerStand('kg').get('C2')).toBe('330');
    });

    it('Rebase, Übernahme, eine Art verwerfen', async () => {
        const ae = useAenderungen();
        await ae.eintragen(kg('A', '310'));
        await ae.commitSitzung('KG', { wer: 'fabio' });
        const { schritte } = await ae.rebaseAuf({ abbildung: { A: 'B' }, wer: 'fabio',
                                                   von: { revision: 1 }, nach: { revision: 2 } });
        const rb = einBeleg(schritte, 'rebase');
        expect(rb.werte.abbildung).toEqual({ A: 'B' });

        await ae.uebernimm('planinhalt', [{ id: 'p1', text: 'Hinweis' }], 'Übernahme Planinhalte', { wer: 'fabio' });
        einBeleg(ae.eintraege.filter(e => e.art === 'planinhalt'), 'uebernahme');

        await ae.eintragen(kg('D', '340'));
        einBeleg(await ae.verwerfe('kg', 'fabio'), 'art-verwerfen');
        expect(ae.wirksamerStand('kg').size).toBe(0);
    });

    it('Vorgang entfernen', async () => {
        const ae = useAenderungen();
        const b = useBearbeitung();
        const gelaende = { globalId: 'DGM-1', modelId: 'netz.ifc', localId: 42, name: 'Urgelände', hoehenversatz: 300,
                           quellmass: { pruefmass: { triCount: 900, spanX: 200, spanY: 12, spanZ: 200 }, cell: 0.5 } };
        const umriss = [{ x: 0, y: 4, z: 0 }, { x: 10, y: 4, z: 0 }, { x: 10, y: 4, z: 10 }, { x: 0, y: 4, z: 10 }];
        const schritte = nachId('graben-ausheben').anwenden(gelaende, { mass: 2 }, { zug: umriss });
        for (const s of schritte) await ae.eintragen({ ...s, wer: 'fabio' });
        const ableitung = schritte.find(s => s.nachher?.rezept === 'erdbau').nachher.ableitung;
        b.modusSetzen(true);
        const beleg = einBeleg(await b.entferneVorgang(ableitung, { wer: 'fabio' }), 'vorgang-entfernen');
        expect(beleg.werte).toEqual({ ableitung });
    });
});

describe('5 — ein Systembeleg ist ein Nachweis, kein Kommando', () => {
    it('pruefeKommando und fuehreAus lehnen ihn ab; jeder Name ist bekannt', async () => {
        const beleg = systemBeleg('revert', { ziel: ['A'], werte: { commit: 'c-1' }, wer: 'fabio' });
        expect(pruefeKommando(beleg)).toEqual([expect.stringMatching(/ist ein Systembeleg/)]);
        const erg = await useBearbeitung().fuehreAus(beleg);
        expect(erg.ausgefuehrt).toBe(false);
        expect(useAenderungen().anzahl).toBe(0);
        expect(() => systemBeleg('gibt-es-nicht')).toThrow();
        expect(Object.keys(SYSTEM_VORGAENGE)).not.toContain('auftrag-heben');
    });
});
