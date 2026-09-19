// @vitest-environment jsdom
/**
 * Der Sohlzug im Längsschnitt ist ein Kommando (Teil XXIV, O6).
 *
 * Bis O6 schrieb `LaengsschnittCanvas` seine Einträge selbst: ohne Beleg, am
 * Werkzeugkatalog vorbei. Ein Griff am Schacht zieht zwei Haltungen an
 * VERSCHIEDENEN Enden — dafür hatte „Sohlhöhen festlegen" keine Form. Jetzt:
 * „Sohle am Punkt setzen" (`sohle-ziehen`) — Ziel sind die Haltungen, der Ort
 * ihr gemeinsames Ende, der Wert die Sohle in m NN.
 *
 *   1. Ohne Oberfläche: ein Kommando, zwei Haltungen, ein Vorgang, ein
 *      Rückgängig; das andere Ende bleibt bitgleich.
 *   2. Mehrfach, aber nur, was am Ort endet; kein Ende am Ort = E8.
 *   3. Der Längsschnitt, montiert, mit echtem Zeigerzug: er ruft das Kommando.
 *   4. Am gemischten Knoten: geliefert eine Forderung mit SEINER Basis und
 *      seinem Modell, eigen der Bauplan — in EINEM Vorgang.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { provideViewerApi } from '../composables/viewerApi.js';
import LaengsschnittCanvas from '../components/LaengsschnittCanvas.vue';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T13:00:00Z', ...rest });
const schacht = (gid, ost, sohle) => kommando(`ko-${gid}`, 'schacht-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1000 },
    eingaben: { zug: [{ ost, nord: 0, hoehe: sohle }, { ost, nord: -0.001, hoehe: sohle + 2.5 }] } });
const haltung = (gid, von, nach) => kommando(`ko-${gid}`, 'rohr-zeichnen', { neu: [gid], werte: { name: gid, kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
    eingaben: { zug: [{ knoten: von }, { knoten: nach }] } });
const ziehen = (id, ziel, ost, hoehe) => kommando(id, 'sohle-ziehen', { ziel, eingaben: { zug: [{ ost, nord: 0 }] }, werte: { hoehe } });

/** A (0 | 100,00) — H1 — B (30 | 99,85) — H2 — C (60 | 99,7037 — nicht auf den mm, damit ein Umschreiben auffällt). */
async function strang() {
    const b = useBearbeitung();
    for (const k of [schacht('cde-A', 0, 100), schacht('cde-B', 30, 99.85), schacht('cde-C', 60, 99.7037),
                     haltung('cde-H1', 'cde-A', 'cde-B'), haltung('cde-H2', 'cde-B', 'cde-C')]) {
        expect((await b.fuehreAus(k)).grund, k.id).toBe(null);
    }
    const ae = useAenderungen();
    const plan = (gid) => ae.wirksamerStand('erzeugt').get(gid);
    return { b, ae, plan, sohlen: (gid) => rezeptNach('rohr').sohlen.lies(plan(gid).parameter) };
}

describe('1 — ohne Oberfläche', () => {
    it('ein Kommando am Schacht B: beide Haltungen, je ihr Ende, ein Vorgang', async () => {
        const { b, ae, plan, sohlen } = await strang();
        const vorher = { H1: plan('cde-H1'), H2: plan('cde-H2') };
        const erg = await b.fuehreAus(ziehen('ko-z', ['cde-H1', 'cde-H2'], 30, 99.8));
        expect(erg.grund).toBe(null);
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-H1', 'cde-H2']);
        expect(sohlen('cde-H1')[1]).toBeCloseTo(99.8, 9);          // H1: das ENDE
        expect(sohlen('cde-H2')[0]).toBeCloseTo(99.8, 9);          // H2: der ANFANG
        // Das andere Ende bleibt bitgleich — nur der Ort wird gesetzt.
        expect(plan('cde-H1').parameter.punkte[0]).toEqual(vorher.H1.parameter.punkte[0]);
        expect(plan('cde-H2').parameter.punkte.at(-1)).toEqual(vorher.H2.parameter.punkte.at(-1));
        // Der Beleg: das Kommando, einmal, am ersten Eintrag; ein Vorgang.
        const [e1, e2] = ae.eintraege.slice(-2);
        expect(e1.kommando).toMatchObject({ werkzeug: 'sohle-ziehen', ziel: ['cde-H1', 'cde-H2'], werte: { hoehe: 99.8 } });
        expect(e2.kommando).toBeUndefined();
        expect(e1.vorgang).toBe('ko-z');
        expect(e2.vorgang).toBe('ko-z');

        await ae.zurueck('fabio');                                  // EIN Schritt
        expect(plan('cde-H1')).toEqual(vorher.H1);
        expect(plan('cde-H2')).toEqual(vorher.H2);
    });
});

describe('2 — nur, was am Ort endet', () => {
    it('Mehrfach am Schacht A: H1 bekommt den Anfang, H2 endet dort nicht — übersprungen, gezählt', async () => {
        const { b, sohlen } = await strang();
        const erg = await b.fuehreAus(ziehen('ko-a', ['cde-H1', 'cde-H2'], 0, 100.1));
        expect(erg.eintraege.map(e => e.globalId)).toEqual(['cde-H1']);
        expect(erg.grund).toMatch(/1 übersprungen/);
        expect(sohlen('cde-H1')[0]).toBeCloseTo(100.1, 9);
    });

    it('kein Ende am Ort (1 cm daneben): abgelehnt, mit Grund — das Journal bleibt', async () => {
        const { b, ae } = await strang();
        const n = ae.eintraege.length;
        const erg = await b.fuehreAus(ziehen('ko-x', ['cde-H1'], 30.01, 99.8));
        expect(erg.ausgefuehrt).toBe(false);
        expect(erg.grund).toMatch(/kein Ende liegt am Punkt/);
        expect(ae.eintraege.length).toBe(n);
    });
});

// ── Der Längsschnitt, montiert ─────────────────────────────────────────────
//
// jsdom zeichnet nicht: ein Zeichenkontext, der die Kreise der Griffe
// mitschreibt (dort sitzen sie auf dem Bild), eine feste Grösse der Leinwand,
// ein ResizeObserver ohne Wirkung. Alles andere ist die echte Komponente.
function zeichenkontext(kreise) {
    const leer = new Proxy(function () {}, { get: () => leer, apply: () => leer });
    const werte = {};
    return new Proxy(werte, {
        get: (t, k) => (k in t ? t[k]
            : k === 'arc' ? (x, y, r) => kreise.push({ x, y, r })
            : k === 'measureText' ? () => ({ width: 10 })
            : () => leer),
        set: (t, k, v) => { t[k] = v; return true; },
    });
}
const KASTEN = { left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 };
const bald = () => new Promise(r => setTimeout(r, 40));

async function montiere(api) {
    const kreise = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => zeichenkontext(kreise));
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(KASTEN);
    globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} };
    const Huelle = defineComponent({ setup() { provideViewerApi(api); return () => h(LaengsschnittCanvas); } });
    const w = mount(Huelle, { attachTo: document.body });
    await bald();
    kreise.length = 0;
    await w.find('canvas').trigger('dblclick');                // „passend einstellen" zeichnet neu
    await bald();
    return { w, griffe: () => kreise.filter(k => k.r === 5) };
}
/** Ein Zeigerereignis, wie der Browser es schickt (jsdom kennt kein PointerEvent). */
function zeiger(el, typ, x, y) {
    const ev = new MouseEvent(typ, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
    el.dispatchEvent(ev);
}
async function ziehGriff(w, g, dyPx) {
    const cv = w.find('canvas').element;
    zeiger(cv, 'pointerdown', g.x, g.y);
    zeiger(cv, 'pointermove', g.x, g.y + dyPx);
    zeiger(cv, 'pointerup', g.x, g.y + dyPx);
    await bald();
}
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('3 — der Längsschnitt ruft das Kommando', () => {
    it('Griff an B nach oben gezogen: EIN Kommando „sohle-ziehen", beide Haltungen, einmal angewandt', async () => {
        const { b, ae, sohlen } = await strang();
        b.modusSetzen(true);
        await b.einordne(subjektAusStand('cde-H1', { wirksamerStand: ae.wirksamerStand }), null);
        const wendeEintragAn = vi.fn(async () => ({}));
        const { w, griffe } = await montiere({ wendeEintragAn, modellShaVon: () => 'sha-cde', lieferstandVon: () => null });
        expect(griffe()).toHaveLength(3);                          // A, B, C
        const n = ae.eintraege.length;

        await ziehGriff(w, griffe()[1], -30);                      // B, 30 px höher

        const neu = ae.eintraege.slice(n);
        expect(neu.map(e => e.globalId)).toEqual(['cde-H1', 'cde-H2']);
        const k = neu[0].kommando;
        expect(k.werkzeug).toBe('sohle-ziehen');
        expect(k.ziel).toEqual(['cde-H1', 'cde-H2']);
        expect(k.eingaben.zug).toHaveLength(1);
        expect(k.eingaben.zug[0].ost).toBeCloseTo(30, 9);          // der Ort: Schacht B
        expect(k.eingaben.zug[0].nord).toBeCloseTo(0, 9);
        expect(k.werte.hoehe).toBeGreaterThan(99.85);              // nach oben gezogen, auf mm gerundet
        expect(Math.round(k.werte.hoehe * 1000) / 1000).toBe(k.werte.hoehe);
        expect(sohlen('cde-H1')[1]).toBeCloseTo(k.werte.hoehe, 9);
        expect(sohlen('cde-H2')[0]).toBeCloseTo(k.werte.hoehe, 9);
        expect(new Set(neu.map(e => e.vorgang))).toEqual(new Set([k.id]));
        expect(wendeEintragAn).toHaveBeenCalledTimes(1);
        expect(wendeEintragAn.mock.calls[0][0]).toHaveLength(2);
        w.unmount();
    });

    it('ein Tipp (unter 5 mm) schreibt nichts', async () => {
        const { b, ae } = await strang();
        b.modusSetzen(true);
        await b.einordne(subjektAusStand('cde-H1', { wirksamerStand: ae.wirksamerStand }), null);
        const { w, griffe } = await montiere({ wendeEintragAn: vi.fn(), modellShaVon: () => null, lieferstandVon: () => null });
        const n = ae.eintraege.length;
        await ziehGriff(w, griffe()[1], 0.3);                     // ≈ 2,5 mm bei dieser Lupe
        expect(ae.eintraege.length).toBe(n);
        w.unmount();
    });
});

describe('4 — der gemischte Knoten: geliefert und eigen, ein Vorgang', () => {
    it('G (geliefert) endet an A, H1 (eigen) beginnt dort: Forderung mit G-Basis, Bauplan für H1', async () => {
        const { b, ae, sohlen, plan } = await strang();
        b.modusSetzen(true);
        // Ein gelieferter Zulauf, wie `strangMitAchsen` ihn aus der Engine bringt —
        // eine Achse aus der Extrusion: ihre Höhen sind die ROHRMITTE (Sohle = y − DN/2).
        const G = { globalId: '2Gelief0Zulauf00000001', name: 'G', dn: 300, laenge: 30, achsbezug: 'mitte',
                    anfang: { x: -30, y: 100.27, z: 0 }, ende: { x: 0, y: 100.15, z: 0 },
                    punkte: [{ x: -30, y: 100.27, z: 0 }, { x: 0, y: 100.15, z: 0 }] };
        const eigen = subjektAusStand('cde-H1', { wirksamerStand: ae.wirksamerStand });
        await b.einordne({ ...eigen, strang: [G, ...eigen.strang] }, null);
        const basisG = { x: -15, y: 100.06, z: 0 };
        const wendeEintragAn = vi.fn(async () => ({}));
        const { w, griffe } = await montiere({
            wendeEintragAn,
            modellShaVon: (gid) => (gid === G.globalId ? 'sha-netz' : 'sha-cde'),
            lieferstandVon: (gid) => (gid === G.globalId ? basisG : null),
        });
        expect(griffe()).toHaveLength(4);                          // G-Anfang, A, B, C
        const n = ae.eintraege.length;
        const h1Anfang = plan('cde-H1').parameter.punkte[0];

        await ziehGriff(w, griffe()[1], 20);                       // A, 20 px tiefer

        const [eg, eh] = ae.eintraege.slice(n);
        const hoehe = eg.kommando.werte.hoehe;
        expect(hoehe).toBeLessThan(100);
        // Geliefert: die volle Rollenkarte, der Anfang behält seine wirksame SOHLE
        // (100,27 − 0,15) — dieselbe, die der Längsschnitt zeigt.
        expect(eg).toMatchObject({ art: 'parametrik', globalId: G.globalId, modell: 'geliefert', basis: basisG, modellSha: 'sha-netz',
                                   nachher: { sohlhoeheAnfang: 100.12, sohlhoeheEnde: hoehe } });
        // Eigen: der Bauplan, am Anfang — das Ende bleibt; SEIN Modell, keine fremde Basis.
        expect(eh).toMatchObject({ art: 'erzeugt', globalId: 'cde-H1', modell: 'cde', modellSha: 'sha-cde' });
        expect(eh.basis).toBeUndefined();
        expect(sohlen('cde-H1')[0]).toBeCloseTo(hoehe, 9);
        expect(plan('cde-H1').parameter.punkte[0]).not.toEqual(h1Anfang);
        expect(eg.vorgang).toBe(eh.vorgang);
        expect(eg.vorgang).toBe(eg.kommando.id);
        w.unmount();
    });
});

describe('5 — Direktschreiber: keiner mehr (O6)', () => {
    // Oberflächenteile, die am Kommandoweg vorbei ins Journal schreiben. Vor O6
    // drei (Cockpit, Merkmalsfenster, Längsschnitt), jetzt keiner — neu dazu
    // kommt auch keiner: ein Fenster setzt sein Kommando über `useKommandoweg`.
    const ERLAUBT = [];
    it('keine Komponente schreibt selbst ins Journal', () => {
        const direkt = readdirSync(WURZEL + 'components').filter(f => f.endsWith('.vue'))
            .filter(f => /\baenderungen\.(eintragen|eintragenVorgang)\(/.test(readFileSync(WURZEL + 'components/' + f, 'utf8')));
        expect(direkt.sort()).toEqual(ERLAUBT);
    });
});
