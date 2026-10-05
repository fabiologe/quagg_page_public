// @vitest-environment jsdom
/**
 * Präzise zeichnen ohne Formular (Teil XXX, B5) — am echten Store und Motor.
 *
 * Messlauf vorher (ohne Projekt, echte Maus und Tasten): ein Klick 6 px neben das Ende einer eigenen Wand lag
 * 469 mm daneben; eine Länge liess sich nicht tippen; die Pille sagte nur den Ort; eine „waagerechte" Wand wich 22–42°
 * von Ost ab. Nachher: 0 mm, 5,000 m, „L … m · …°", 0°.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import CdeWerkzeugKarte from '../components/CdeWerkzeugKarte.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useEingabe } from '../composables/useEingabe.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import {
    eigeneFangkandidaten, liesZahl, orthoPunkt, punktNachMass, streckeMass, tippeInZahl, zeichenfang,
} from '../services/Zeichenhilfe.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');
const nah = (a, b, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

function motor(extra = {}) {
    return useEingabe({ bearbeitung: useBearbeitung(), cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                        getHoehenversatz: () => 0, ...extra });
}

describe('Strecke, Winkel, rechte Winkel — gerechnet wie im Lageplan (0° = Ost, 90° = Nord = −z)', () => {
    it('Länge im Grundriss und Winkel', () => {
        expect(streckeMass({ x: 0, z: 0 }, { x: 3, y: 9, z: -4 })).toEqual({ laenge: 5, winkel: expect.any(Number) });
        nah(streckeMass({ x: 0, z: 0 }, { x: 0, z: -2 }).winkel, 90);
        nah(streckeMass({ x: 0, z: 0 }, { x: -2, z: 0 }).winkel, 180);
        nah(streckeMass({ x: 0, z: 0 }, { x: 0, z: 2 }).winkel, 270);
    });

    it('die erste Strecke rastet auf Ost/Nord, die Länge ist die Projektion', () => {
        const p = orthoPunkt({ x: 10, y: 7, z: -1 }, { x: 0, z: 0 });
        nah(p.x, 10); nah(p.z, 0); expect(p.y).toBe(7);
        const q = orthoPunkt({ x: 1, z: -10 }, { x: 0, z: 0 });
        nah(q.x, 0); nah(q.z, -10);
    });

    it('danach rechtwinklig zur vorigen Strecke — auch wenn die schräg liegt', () => {
        // Vorige Strecke unter 30°; der Zeiger liegt fast senkrecht dazu.
        const a = { x: 0, z: 0 }, b = { x: Math.cos(Math.PI / 6) * 10, z: -Math.sin(Math.PI / 6) * 10 };
        const p = orthoPunkt({ x: b.x - 3, z: b.z - 5.5 }, b, a);
        nah(streckeMass(b, p).winkel, 120, 1e-9);
    });

    it('der Punkt aus getippter Länge — mit Winkel, sonst in Zeigerrichtung', () => {
        const p = punktNachMass({ x: 2, y: 5, z: 3 }, { laenge: 5, winkel: 90 });
        nah(p.x, 2); nah(p.z, -2); expect(p.y).toBe(5);
        const q = punktNachMass({ x: 0, z: 0 }, { laenge: 5, richtung: 180 });
        nah(q.x, -5); nah(q.z, 0);
        expect(punktNachMass({ x: 0, z: 0 }, { laenge: 0 })).toBe(null);
    });

    it('getippte Zahlen: Komma wie Punkt, ein Komma, ein führendes Minus', () => {
        expect(liesZahl('5,25')).toBe(5.25);
        expect(liesZahl('-12.5')).toBe(-12.5);
        expect(liesZahl('abc')).toBe(null);
        expect(tippeInZahl('5', ',')).toBe('5,');
        expect(tippeInZahl('5,2', '.')).toBe(null);
        expect(tippeInZahl('', '-')).toBe('-');
        expect(tippeInZahl('5', '-')).toBe(null);
    });
});

describe('Fang auf eigene Bauteile', () => {
    const stand = new Map([
        ['W1', { rezept: 'wand', name: 'Wand Nord', parameter: { punkte: [[0, 0, 0], [10, 0, 0]] } }],
        ['R1', { rezept: 'rohr', name: 'H1', parameter: { punkte: [[0, 1, 5], [5, 1, 5], [10, 1, 5]], dn: 300 } }],
        ['S1', { rezept: 'schacht', name: 'S1', parameter: { punkte: [[20, 0, 0], [20, 2, 0]], dn: 1000 } }],
        ['A1', { rezept: 'erdbau', ableitung: 'ab', parameter: { operationen: [] } }],
        ['W2', { rezept: 'wand', name: 'gelöscht', parameter: { punkte: [[50, 0, 0], [60, 0, 0]] } }],
    ]);

    it('Wandpunkte, Achsenden und Stützpunkte, Knoten — keine Ableitung, nichts Verborgenes', () => {
        const k = eigeneFangkandidaten(stand, { rezeptNach, verdeckt: new Set(['W2']) });
        const art = (gid) => k.filter(x => x.globalId === gid).map(x => x.art).sort();
        expect(art('W1')).toEqual(['stuetzpunkt', 'stuetzpunkt']);
        expect(art('R1')).toEqual(['achsende', 'achsende', 'stuetzpunkt']);
        expect(art('S1')).toEqual(['knoten']);
        expect(art('A1')).toEqual([]);
        expect(art('W2')).toEqual([]);
    });

    // Draufsicht 1:1 — ein Meter ist ein Pixel, so lässt sich der Radius (14 px) genau setzen.
    const projiziere = (p) => ({ x: p.x, y: p.z });

    it('der Klick neben ein Wandende landet genau darauf', () => {
        const eigene = eigeneFangkandidaten(stand, { rezeptNach });
        const f = zeichenfang({ punkt: { x: 10.3, y: 0, z: 0.2 }, eigene, projiziere });
        expect(f?.punkt).toEqual({ x: 10, y: 0, z: 0 });
    });

    it('eine nähere Ecke der Bibliothek gewinnt; bei rechten Winkeln zählt eine Kante nicht', () => {
        const ecke = { art: 'ecke', name: 'Ecke', punkt: { x: 10.2, y: 0, z: 0 } };
        expect(zeichenfang({ punkt: { x: 10.25, y: 0, z: 0 }, bibliothek: ecke, eigene: [], projiziere })?.art).toBe('ecke');
        const kante = { art: 'kante', name: 'Kante', punkt: { x: 3, y: 0, z: 2 } };
        expect(zeichenfang({ punkt: { x: 3, y: 0, z: 2.1 }, bibliothek: kante, eigene: [], projiziere })?.art).toBe('kante');
        expect(zeichenfang({ punkt: { x: 3, y: 0, z: 2.1 }, bibliothek: kante, eigene: [], projiziere, ortho: true })).toBe(null);
    });
});

describe('Länge tippen und rechte Winkel im Motor', () => {
    it('„5", Enter: der zweite Punkt liegt 5 m weit in Zeigerrichtung — auch neben einem Knoten', async () => {
        const m = motor({ getKnoten: () => [{ globalId: 'S9', punkt: { x: 4.9, y: 0, z: -0.1 }, name: 'S9' }] });
        expect(m.starte('rohr-zeichnen')).toBe(true);
        m.setzePunkt({ x: 0, y: 0, z: 0 });
        m.bewegeZeiger({ x: 3, y: 0, z: 0.0001 });
        expect(m.massMoeglich.value).toBe(true);
        expect(m.tippeMass('5')).toBe(true);
        expect(m.setzeMassPunkt()).toBe(true);
        const [a, b] = m.punkte.value;
        nah(Math.hypot(b.x - a.x, b.z - a.z), 5, 1e-9);
        expect(b.knoten).toBeUndefined();                          // die Zahl gilt, der Knotenfang zieht nicht
        expect(m.massAktiv.value).toBe(false);                      // das Getippte ist verbraucht
    });

    it('Tab wechselt zum Winkel: „4", Tab, „90" setzt den Punkt nach Nord', () => {
        const m = motor();
        m.starte('wand-zeichnen');
        m.setzePunkt({ x: 1, y: 0, z: 1 });
        m.tippeMass('4'); m.massFeld(); m.tippeMass('9'); m.tippeMass('0');
        expect(m.mass.value).toMatchObject({ laenge: '4', winkel: '90', feld: 'winkel' });
        m.setzeMassPunkt();
        const b = m.punkte.value[1];
        nah(b.x, 1); nah(b.z, -3);
    });

    it('ohne gesetzten Punkt gibt es nichts zu tippen; eine Null wird nicht gesetzt', () => {
        const m = motor();
        m.starte('wand-zeichnen');
        expect(m.tippeMass('5')).toBe(false);
        m.setzePunkt({ x: 0, y: 0, z: 0 });
        m.setzeMass('laenge', '0');
        expect(m.setzeMassPunkt()).toBe(false);
        expect(m.grund.value).toMatch(/Länge/);
        expect(m.punkte.value).toHaveLength(1);
    });

    it('Rechtwinklig als Schalter: der Punkt rastet; ein gefangener Punkt nicht; der Schalter bleibt nach dem Zug', async () => {
        const b = useBearbeitung();
        const m = motor();
        m.starte('wand-zeichnen');
        m.setzeOrtho(true);
        m.setzePunkt({ x: 0, y: 0, z: 0 });
        m.setzePunkt({ x: 10, y: 0, z: -1.5 });
        nah(m.punkte.value[1].z, 0);
        m.setzePunkt({ x: 13, y: 0, z: -4 }, { gefangen: true });
        expect(m.punkte.value[2]).toMatchObject({ x: 13, z: -4 });
        b.abbrechen();
        expect(b.eingabe.ortho).toBe(true);
    });

    it('Umschalt (pro Punkt): der Treffer aus dem Raum trägt `ortho`', () => {
        const m = motor();
        m.starte('wand-zeichnen');
        m.aufTreffer({ point: { x: 0, y: 0, z: 0 } });
        m.aufTreffer({ point: { x: 8, y: 0, z: 2 }, ortho: true });
        nah(m.punkte.value[1].z, 0);
        m.aufTreffer({ point: { x: 8, y: 0, z: 2 } });                // ohne: wie geklickt
        expect(m.punkte.value[2]).toMatchObject({ x: 8, z: 2 });
    });

    it('die Strecke für die Pille', () => {
        const m = motor();
        m.starte('wand-zeichnen');
        expect(m.strecke.value).toBe(null);
        m.setzePunkt({ x: 0, y: 0, z: 0 });
        m.bewegeZeiger({ x: 3, y: 0, z: -4 });
        expect(m.strecke.value.laenge).toBe(5);
    });

    it('die getippte Wand wird ein Bauplan mit genau dieser Länge', async () => {
        const m = motor();
        m.starte('wand-zeichnen');
        m.setzePunkt({ x: 2, y: 0, z: 2 });
        m.bewegeZeiger({ x: 9, y: 0, z: 2 });
        m.tippeMass('7'); m.tippeMass(','); m.tippeMass('2'); m.tippeMass('5');
        m.setzeMassPunkt();
        const e = await m.abschliessen();
        const p = e.nachher.parameter.punkte;
        nah(Math.hypot(p[1][0] - p[0][0], p[1][2] - p[0][2]), 7.25, 1e-9);
        expect(useAenderungen().eintraege).toHaveLength(1);
    });
});

describe('die Tafel — dasselbe ohne Tastatur (Tablet)', () => {
    it('„Rechtwinklig" schaltet, Länge und „Punkt setzen" setzen den Punkt', async () => {
        const m = motor();
        m.starte('wand-zeichnen');
        const w = mount(CdeWerkzeugKarte, { props: { motor: m }, global: { stubs: { CdeIcon: { template: '<i />' } } } });
        const knopf = (t) => w.findAll('button').find(b => b.text().trim() === t);
        expect(w.find('.wk-mass').exists()).toBe(false);          // vor dem ersten Punkt gibt es nichts zu tippen
        await knopf('Rechtwinklig').trigger('click');
        expect(m.orthoAn.value).toBe(true);
        m.setzePunkt({ x: 0, y: 0, z: 0 });
        m.bewegeZeiger({ x: 0, y: 0, z: -3 });
        await w.vm.$nextTick();
        await w.findAll('.wk-mass input')[0].setValue('6,5');
        await knopf('Punkt setzen').trigger('click');
        const b = m.punkte.value[1];
        nah(b.x, 0); nah(b.z, -6.5);
        w.unmount();
    });
});

describe('der Viewer (Textwächter für die Reihenfolge, die nur im Browser auffiel)', () => {
    const viewer = lies('components/IfcViewer.vue');
    it('Umschalt gilt im MOMENT des Tipps — vor dem Strahl im Worker', () => {
        const a = viewer.indexOf('const ortho = !!tipp.shiftKey || umschaltGedrueckt.value;');
        const b = viewer.indexOf('await engine.value?.probeTreffer?.(tipp.x, tipp.y, { fang: true }), { ortho })');
        expect(a).toBeGreaterThan(-1);
        expect(a).toBeLessThan(b);
    });
    it('Esc beim Tippen nimmt erst das Getippte zurück, nicht das Werkzeug', () => {
        const a = viewer.indexOf("if (e.key === 'Escape' && eingabe.massAktiv.value) { eingabe.massLeeren(); return; }");
        const b = viewer.indexOf("if (e.key === 'Escape' && bearbeitung.werkzeug) {");
        expect(a).toBeGreaterThan(-1);
        expect(a).toBeLessThan(b);
    });
});
