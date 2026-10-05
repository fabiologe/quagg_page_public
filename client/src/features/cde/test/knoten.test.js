// @vitest-environment jsdom
/**
 * Teil XXXI, T7 — Knoten: zusammenfallende Punkte ziehen gemeinsam (E-T3).
 *
 * Vorher [gelesen, Konzept § 2]: zwei Wände, die sich an einer Ecke treffen, wussten nichts voneinander — zog man die
 * Ecke der einen, riss die andere ab. Jetzt: liegt ein Punkt eines anderen eigenen Bauteils an derselben Stelle (auf
 * die Netztoleranz genau), trägt der Eckgriff diese Partner; der Zug bewegt alle in EINEM Kommando. Ein Tipp auf
 * „Knoten lösen" nimmt sie heraus — geschrieben wird dabei nichts.
 *
 * Echter Weg: Wände über Kommandos, Einordnung wie im Viewer, `useGriffe` mit Engine-Attrappe (nur Zeichnen und
 * Strahl), geschrieben über das Journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';
import { knotenPartner } from '../services/Griffe.js';
import { useGriffe } from '../composables/useGriffe.js';
import { kommando } from './hilfen/ruebKommandos.js';
import { Speicher } from './hilfen/vorlagenKommandos.js';

let b, ae;
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5 };
const wand = (gid, a, c) => kommando('wand-zeichnen', { neu: [gid], werte: { name: gid, ...WAND }, eingaben: { zug: [e(...a, 100), e(...c, 100)] } });

beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    // A und B treffen sich in (10 | 0); C liegt 2 mm daneben (über der Toleranz), D darüber (andere Höhe).
    for (const k of [wand('cde-A', [0, 0], [10, 0]), wand('cde-B', [10, 0], [10, 8]), wand('cde-C', [10.002, 0], [20, 0]),
                     kommando('wand-zeichnen', { neu: ['cde-D'], werte: { name: 'D', ...WAND }, eingaben: { zug: [e(10, 0, 102.5), e(10, -6, 102.5)] } })]) {
        const r = await b.fuehreAus(k);
        if (!r.ausgefuehrt) throw new Error(r.grund);
    }
    useIfcStore().modelList.push({ modelId: CDE_MODELL_ID, name: 'Eigenbau' });
});
afterEach(() => repo.setBackend(null));

const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
const punkt = (gid, i) => plan(gid).parameter.punkte[i];

function aufbau() {
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
    return { engine, g, nachBauen };
}
async function tippeAn(gid) {
    const s = subjektAusStand(gid, { wirksamerStand: ae.wirksamerStand });
    await b.einordne({ ...s, modelId: CDE_MODELL_ID, localId: 7, category: 'IFCWALL', type: 'IFCWALL' }, null);
}
/** Ein Griff, Zeiger in Welt x/z (der Strahl ist senkrecht): greifen → ziehen → loslassen. */
async function zug(t, griff, nach) {
    t.engine.griffUnter.mockReturnValue(griff.key);
    t.g.greifen({ x: griff.pos.x, y: griff.pos.z, typ: 'mouse' });
    t.g.zugStart({ x: griff.pos.x, y: griff.pos.z, px: { x: 0, y: 0 }, typ: 'mouse' });
    t.g.zugBewegt({ x: nach.x, y: nach.z, px: { x: 60, y: 0 }, typ: 'mouse', altKey: true });
    return t.g.zugEnde({ abbruch: false });
}
async function tipp(t, griff) {
    t.engine.griffUnter.mockReturnValue(griff.key);
    t.g.greifen({ x: 0, y: 0, typ: 'touch' });
    t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'touch' });
    return t.g.zugEnde({ abbruch: false });
}

describe('wer im Knoten liegt', () => {
    it('B teilt die Ecke mit A; C liegt 2 mm daneben, D 2,5 m darüber — beide nicht', () => {
        const stand = ae.wirksamerStand('erzeugt');
        expect(knotenPartner(punkt('cde-A', 1), 'cde-A', stand)).toEqual(['cde-B']);
        expect(knotenPartner(punkt('cde-A', 0), 'cde-A', stand)).toEqual([]);
    });
});

describe('der Knoten am Griff', () => {
    it('die Ecke von A trägt B als Partner (grün) und einen „lösen"-Knopf; die freie Ecke nicht', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-A');
        t.g.neuBauen();
        const knoten = t.g.griffe.value.find(x => x.key === 'stuetz:cde-A:1');
        expect(knoten.werte).toEqual({ mit: ['cde-B'] });
        expect(knoten.farbrolle).toBe('ok');
        expect(t.g.griffe.value.find(x => x.key === 'loesen:cde-A:1')).toMatchObject({ wirkung: 'loesen', zeigtBei: 'stuetz:cde-A:1' });
        expect(t.g.griffe.value.find(x => x.key === 'stuetz:cde-A:0').werte).toBeUndefined();
        expect(t.g.griffe.value.some(x => x.key === 'loesen:cde-A:0')).toBe(false);
    });

    it('die Ecke 1 m nach Süden gezogen: A UND B bewegen ihren Punkt — ein Vorgang, C und D bleiben', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-A');
        t.g.neuBauen();
        const knoten = t.g.griffe.value.find(x => x.key === 'stuetz:cde-A:1');
        const n = ae.eintraege.length;
        const vorher = { c: punkt('cde-C', 0), d: punkt('cde-D', 0) };
        await zug(t, knoten, { x: knoten.pos.x, z: knoten.pos.z + 1 });
        expect(punkt('cde-A', 1)).toEqual([10, 100, 1]);
        expect(punkt('cde-B', 0)).toEqual([10, 100, 1]);                     // vorher: riss ab
        expect(punkt('cde-B', 1)).toEqual([10, 100, -8]);                    // das andere Ende bleibt
        expect(punkt('cde-C', 0)).toEqual(vorher.c);
        expect(punkt('cde-D', 0)).toEqual(vorher.d);
        const neu = ae.eintraege.slice(n);
        expect(neu.map(x => x.globalId).sort()).toEqual(['cde-A', 'cde-B']);
        expect(new Set(neu.map(x => x.vorgang)).size).toBe(1);               // EIN Rückgängig
    });

    it('„Knoten lösen" (ein Tipp, schreibt nichts): danach zieht nur A — und „verbinden" stellt es wieder her', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-A');
        t.g.neuBauen();
        const n = ae.eintraege.length;
        await tipp(t, t.g.griffe.value.find(x => x.key === 'loesen:cde-A:1'));
        expect(ae.eintraege.length).toBe(n);
        expect(t.nachBauen).not.toHaveBeenCalled();
        const knoten = t.g.griffe.value.find(x => x.key === 'stuetz:cde-A:1');
        expect(knoten.werte).toBeUndefined();
        expect(t.g.griffe.value.find(x => x.key === 'loesen:cde-A:1').titel).toBe('Knoten verbinden');
        await zug(t, knoten, { x: knoten.pos.x, z: knoten.pos.z + 1 });
        expect(punkt('cde-A', 1)).toEqual([10, 100, 1]);
        expect(punkt('cde-B', 0)).toEqual([10, 100, 0]);                     // gelöst: B bleibt
        // Ein anderes Bauteil gewählt: gelöst gilt nicht mehr.
        await tippeAn('cde-B');
        expect(t.g.geloest.value.size).toBe(0);
    });
});

describe('der Kantengriff nimmt die Knoten an beiden Enden mit (T7, Fabio: „lets go")', () => {
    it('Wandkante 1 m nach Süden: beide Enden von A wandern, B folgt an seinem Ende — ein Vorgang', async () => {
        const t = aufbau();
        b.modusSetzen(true);
        await tippeAn('cde-A');
        t.g.neuBauen();
        const kante = t.g.griffe.value.find(x => x.key === 'kante:cde-A:0');
        expect(kante.werte).toEqual({ mit: ['cde-B'] });
        const n = ae.eintraege.length;
        await zug(t, kante, { x: kante.pos.x, z: kante.pos.z + 1 });
        expect(punkt('cde-A', 0)).toEqual([0, 100, 1]);
        expect(punkt('cde-A', 1)).toEqual([10, 100, 1]);
        expect(punkt('cde-B', 0)).toEqual([10, 100, 1]);
        expect(punkt('cde-B', 1)).toEqual([10, 100, -8]);
        const neu = ae.eintraege.slice(n);
        expect(neu.map(x => x.globalId).sort()).toEqual(['cde-A', 'cde-B']);
        expect(new Set(neu.map(x => x.vorgang)).size).toBe(1);
    });

    it('zwei Platten mit gemeinsamer Kante: die Nachbarplatte zieht BEIDE Ecken mit, in einem Eintrag', async () => {
        const platte = (gid, x0) => kommando('platte-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCSLAB', hoehe: '', dicke: 0.3 },
            eingaben: { umriss: [e(x0, 20, 100), e(x0 + 5, 20, 100), e(x0 + 5, 15, 100), e(x0, 15, 100)] } });
        for (const k of [platte('cde-P1', 0), platte('cde-P2', 5)]) expect((await b.fuehreAus(k)).ausgefuehrt).toBe(true);
        const t = aufbau();
        b.modusSetzen(true);
        const s = subjektAusStand('cde-P1', { wirksamerStand: ae.wirksamerStand });
        await b.einordne({ ...s, modelId: CDE_MODELL_ID, localId: 8, category: 'IFCSLAB', type: 'IFCSLAB' }, null);
        t.g.neuBauen();
        // Die gemeinsame Kante von P1 ist die von (5|20) nach (5|15) — die zweite.
        const kante = t.g.griffe.value.find(x => x.art === 'kante' && Math.abs(x.pos.x - 5) < 1e-9);
        expect(kante.werte).toEqual({ mit: ['cde-P2'] });
        expect(kante).toBeTruthy();
        const vorher = plan('cde-P2').parameter.punkte.map(p => [...p]);
        const n = ae.eintraege.length;
        await zug(t, kante, { x: kante.pos.x + 1, z: kante.pos.z });
        const p2 = plan('cde-P2').parameter.punkte;
        const gewandert = p2.filter((q, i) => Math.abs(q[0] - vorher[i][0] - 1) < 1e-9);
        expect(gewandert).toHaveLength(2);                                  // beide Ecken der gemeinsamen Kante
        expect(ae.eintraege.slice(n).filter(x => x.globalId === 'cde-P2')).toHaveLength(1);
    });
});


describe('ein GELIEFERTER Schacht im Knoten — wie „Schacht verschieben" (Fabio 2026-10-05)', () => {
    /** Ein gelieferter Schacht bei (30 | −5) — Platzierung 98, also tiefer als das Rohrende —, eine gelieferte Haltung daran. */
    const SG = { globalId: 'S-G', name: 'S 12', modelId: 'm1', localId: 41, herkunft: 'geliefert', punkt: { x: 30, y: 98, z: 5 } };
    const SUBJEKT = { globalId: 'S-G', name: 'S 12', modelId: 'm1', localId: 41, category: 'IFCDISTRIBUTIONCHAMBERELEMENT',
                      anker: { x: 30, y: 98, z: 5 }, versatz: { x: 0, y: 0, z: 0 }, lage: { ost: 30, nord: -5 }, lageUmkehrbar: true,
                      modellSha: 'sha-lieferung',
                      // Wie die Engine es meldet: auch das EIGENE Rohr hängt am Schacht (sein Ende liegt dort).
                      anschluesse: [{ globalId: 'H-G', name: 'H 7', ende: 'anfang', kategorie: 'IFCPIPESEGMENT',
                                      anfang: { x: 30, y: 98.2, z: 5 }, ende_: { x: 50, y: 98, z: 5 } },
                                    { globalId: 'cde-R', name: 'Zulauf', ende: 'ende', kategorie: 'IFCPIPESEGMENT',
                                      anfang: { x: 10, y: 100, z: 5 }, ende_: { x: 30, y: 99.8, z: 5 } }] };

    it('das Rohrende am Schacht: Partner ist der Schacht; der Zug schreibt Rohr, Schachtlage und Forderung — ein Vorgang', async () => {
        expect((await b.fuehreAus(kommando('rohr-zeichnen', { neu: ['cde-R'], werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [e(10, -5, 100), e(30, -5, 99.8)] } }))).ausgefuehrt).toBe(true);
        const t = aufbau();
        t.engine.knotenGriffe = () => [SG];
        const lieferstand = vi.fn((g) => (g === 'S-G' ? { x: 30, y: 98, z: 5 } : undefined));
        const g = useGriffe({
            engine: ref(t.engine), bearbeitung: b, aenderungen: ae,
            getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil, getBauform: () => b.einordnung?.bauform ?? null,
            getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
            holeKnotenSubjekt: async (gid) => (gid === 'S-G' ? SUBJEKT : null), lieferstandVon: lieferstand,
            nachBauen: t.nachBauen, getWer: () => 'Fabio', melde: vi.fn(),
            farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
        });
        b.modusSetzen(true);
        const s = subjektAusStand('cde-R', { wirksamerStand: ae.wirksamerStand });
        await b.einordne({ ...s, modelId: CDE_MODELL_ID, localId: 9, category: 'IFCPIPESEGMENT', type: 'IFCPIPESEGMENT' }, null);
        g.neuBauen();
        const ende = g.griffe.value.find(x => x.key === 'stuetz:cde-R:1');
        expect(ende.werte).toEqual({ mit: ['S-G'] });                          // Grundriss gleich, Höhe nicht — zählt
        const n = ae.eintraege.length;
        await zug({ ...t, g }, ende, { x: 32, z: 5 });
        const neu = ae.eintraege.slice(n);
        expect(new Set(neu.map(x => x.vorgang)).size).toBe(1);
        const rohr = neu.find(x => x.globalId === 'cde-R');
        expect(rohr.nachher.parameter.punkte[1][0]).toBeCloseTo(32, 9);
        const lage = neu.find(x => x.globalId === 'S-G');
        expect(lage).toMatchObject({ art: 'lage', modell: 'geliefert', modellSha: 'sha-lieferung' });
        expect(lage.nachher).toMatchObject({ x: 32, y: 98, z: 5 });             // im Grundriss mit, die Höhe bleibt
        expect(lage.basis).toEqual({ x: 30, y: 98, z: 5 });                   // der Lieferstand — der Drei-Wege-Vergleich
        const forderung = neu.find(x => x.globalId === 'H-G');
        expect(forderung).toMatchObject({ art: 'parametrik', nachher: { anschlusspunkt: { ende: 'anfang', ost: 32, nord: -5 } } });
        expect(neu.filter(x => x.globalId === 'cde-R')).toHaveLength(1);       // das eigene Rohr nur EINMAL
    });
});
