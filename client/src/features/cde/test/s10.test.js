// @vitest-environment jsdom
/**
 * S10 — die Griffe, die S8/S9 noch als Formularfeld gelassen haben
 * (Teil XVI, 2026-09-09).
 *
 *  1. `Griffe.js` rein: Kanten mit Mitte und Station, Drehgriff, Winkel.
 *  2. Die zwei WIRKUNGEN: Zug wie bisher, TIPP („−" entfernen, „+" einfügen)
 *     bringt seine Werte mit.
 *  3. DIE KREUZPROBE: die Station, die der „+"-Griff nennt, legt den neuen
 *     Stützpunkt wirklich auf die Kantenmitte — Griff und Werkzeug messen
 *     dieselbe Grösse (sonst läuft der Knopf und trifft daneben).
 *  4. Der Katalogeintrag `kante-verschieben` — absolut und idempotent.
 *  5. `useGriffe` am echten Store: ein Tipp legt ohne Zug ab.
 *  6. Das Overlay: Tipp-Griffe sind Würfel, Nebengriffe erscheinen erst
 *     beim Hover und sind bis dahin nicht greifbar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { drehgriffFuer, griffZuWerten, griffeFuer, kantenVon, winkelGrad } from '../services/Griffe.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { IfcOverlay } from '../services/IfcOverlay.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useGriffe } from '../composables/useGriffe.js';

const b = (id) => nachId(id);
/** Ein eigenes Bauteil, wie es der Viewer ans Subjekt hängt. */
const EIGEN = (rezept, punkte, extra = {}) => ({
    globalId: 'cde1', modelId: 'cde-eigenbau', name: 'F1', category: 'IFCANNOTATION',
    lageUmkehrbar: true, versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
    stand: { bauplan: { rezept, kategorie: 'IFCANNOTATION', name: 'F1', parameter: { punkte } } },
    ...extra,
});
const LINIE = [[0, 1, 0], [4, 1, 0], [4, 1, 4]];
const RING = [[0, 5, 0], [4, 5, 0], [4, 5, 4], [0, 5, 4]];

describe('Kanten, Drehgriff, Winkel — rein', () => {
    it('kantenVon: offen n−1 Kanten, Ring n; Mitte und Station stimmen', () => {
        const offen = kantenVon(LINIE, false);
        expect(offen).toHaveLength(2);
        expect(offen[0]).toMatchObject({ i: 0, j: 1, laenge: 4, station: 2, mitte: { x: 2, y: 1, z: 0 } });
        expect(offen[1]).toMatchObject({ i: 1, j: 2, station: 6, mitte: { x: 4, y: 1, z: 2 } });
        const ring = kantenVon(RING, true);
        expect(ring).toHaveLength(4);
        expect(ring[3]).toMatchObject({ i: 3, j: 0, station: 14, mitte: { x: 0, y: 5, z: 2 } });
        expect(kantenVon([[0, 0, 0]], false)).toEqual([]);
    });
    it('drehgriffFuer: Zentrum ist der Schwerpunkt, der Griff liegt ausserhalb', () => {
        const d = drehgriffFuer(RING);
        expect(d.zentrum).toEqual({ x: 2, y: 5, z: 2 });
        expect(d.pos.y).toBe(5);
        expect(d.pos.x).toBeGreaterThan(4);                       // ausserhalb des Rings
        expect(d.pos.z).toBe(2);
        expect(drehgriffFuer([[0, 0, 0]])).toBeNull();            // ein Punkt dreht sich nicht
        expect(drehgriffFuer([[1, 0, 1], [1, 0, 1]])).toBeNull(); // ohne Ausdehnung auch nicht
    });
    it('winkelGrad misst um das Zentrum, in DERSELBEN Richtung wie drehePunktliste', () => {
        const c = { x: 0, y: 0, z: 0 };
        expect(winkelGrad(c, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 2 })).toBeCloseTo(90, 6);
        expect(winkelGrad(c, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: -2 })).toBeCloseTo(-90, 6);
        expect(winkelGrad(c, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 })).toBeCloseTo(0, 6);
        expect(Number.isNaN(winkelGrad(c, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }))).toBe(true);
    });
});

describe('griffeFuer am eigenen Bauteil — Stützpunkt, „−", Kante, „+", Drehung', () => {
    const griffe = (punkte, rezept = 'flaeche') =>
        griffeFuer({ subjekt: EIGEN(rezept, punkte), subjektHerkunft: 'cde' });

    it('ein Ring mit vier Ecken: 4 Stützpunkte (+4 in der Höhe) + 4 „−" + 4 Kanten + 4 „+" + 1 Drehung', () => {
        const g = griffe(RING);
        const zaehle = (art, achsen = null) => g.filter(x => x.art === art && (!achsen || x.achsen === achsen)).length;
        expect([zaehle('stuetzpunkt', 'XZ'), zaehle('stuetzpunkt', 'Y'), zaehle('stuetzpunkt-weg'),
                zaehle('kante'), zaehle('kante-plus'), zaehle('drehung')])
            .toEqual([4, 4, 4, 4, 4, 1]);
        expect(g.filter(x => x.wirkung === 'tipp')).toHaveLength(8);
    });

    it('der HÖHENGRIFF ersetzt die Shift-Taste: gleiches Werkzeug, Achse Y, als Nebengriff versetzt', () => {
        const hoch = griffe(RING).find(x => x.key === 'stuetz-hoch:cde1:2');
        expect(hoch).toMatchObject({ art: 'stuetzpunkt', index: 2, achsen: 'Y', rolle: 'hoehe',
                                     zeigtBei: 'stuetz:cde1:2', werkzeug: 'stuetzpunkt-verschieben' });
        expect(hoch.wirkung).toBeUndefined();                       // er wird GEZOGEN, nicht getippt
        // Die drei Nebengriffe einer Ecke sitzen an DREI Stellen — sonst nicht einzeln zu treffen.
        const neben = griffe(RING).filter(x => x.zeigtBei === 'stuetz:cde1:2' || x.zeigtBei === 'kante:cde1:2');
        const orte = new Set(neben.map(x => `${x.nebenVersatz.x}/${x.nebenVersatz.y}`));
        expect(orte.size).toBe(neben.length);
        // Und er rechnet wie sein Zug-Griff.
        expect(griffZuWerten(hoch, { x: 4, y: 9, z: 4 }, {})).toEqual({ index: 2, ost: 4, nord: -4, hoehe: 9 });
    });
    it('die Tipp-Griffe hängen als Nebengriffe an ihrem Zug-Griff und bringen ihre Werte mit', () => {
        const g = griffe(RING);
        const weg = g.find(x => x.art === 'stuetzpunkt-weg' && x.index === 2);
        expect(weg).toMatchObject({ wirkung: 'tipp', rolle: 'entfernen', zeigtBei: 'stuetz:cde1:2',
                                    werkzeug: 'stuetzpunkt-entfernen', werte: { index: 2 } });
        const plus = g.find(x => x.art === 'kante-plus' && x.index === 0);
        expect(plus).toMatchObject({ wirkung: 'tipp', rolle: 'einfuegen', zeigtBei: 'kante:cde1:0',
                                     werkzeug: 'stuetzpunkt-einfuegen', werte: { station: 2 } });
        // Zug-Griffe tragen keine Wirkung — die Vorgabe ist „ziehen".
        expect(g.find(x => x.art === 'kante').wirkung).toBeUndefined();
    });
    it('KEIN „−", wenn nichts mehr übrig bliebe: Linie 2 Punkte, Ring 3 Punkte', () => {
        expect(griffe([[0, 0, 0], [4, 0, 0]], 'linie').some(x => x.art === 'stuetzpunkt-weg')).toBe(false);
        expect(griffe([[0, 0, 0], [4, 0, 0], [4, 0, 4]], 'linie').some(x => x.art === 'stuetzpunkt-weg')).toBe(true);
        expect(griffe([[0, 0, 0], [4, 0, 0], [4, 0, 4]]).some(x => x.art === 'stuetzpunkt-weg')).toBe(false);
        expect(griffe(RING).some(x => x.art === 'stuetzpunkt-weg')).toBe(true);
    });
    it('eine offene Linie hat hinter dem letzten Punkt keine Kante; der Ring schliesst zurück', () => {
        expect(griffe(LINIE, 'linie').filter(x => x.art === 'kante').map(x => [x.index, x.index2])).toEqual([[0, 1], [1, 2]]);
        expect(griffe(RING).filter(x => x.art === 'kante').map(x => [x.index, x.index2])).toEqual([[0, 1], [1, 2], [2, 3], [3, 0]]);
    });
    it('griffZuWerten: die Kantenmitte ist der Zielwert, die Drehung liefert den Winkel', () => {
        const kante = griffe(RING).find(x => x.art === 'kante' && x.index === 0);
        expect(griffZuWerten(kante, { x: 2, y: 6, z: -1 }, { versatz: { x: 100, y: 0, z: 200 }, hoehenversatz: 10 }))
            .toEqual({ index: 0, ost: 102, nord: -199, hoehe: 16 });
        const dreh = griffe(RING).find(x => x.art === 'drehung');
        const c = dreh.zentrum;
        expect(griffZuWerten(dreh, { x: c.x, y: c.y, z: c.z + 3 }, {})).toEqual({ winkel: 90 });
        expect(griffZuWerten(dreh, { x: c.x, y: c.y, z: c.z }, {})).toEqual({});      // im Zentrum kein Winkel
    });
    it('geliefert bleibt geliefert: kein Kanten-, Tipp- oder Drehgriff ohne Bauplan', () => {
        const g = griffeFuer({ subjekt: { globalId: 'H1', achse: { anfang: { x: 0, y: 3, z: 0 }, ende: { x: 9, y: 3, z: 0 } }, anker: { x: 4, y: 3, z: 0 } },
                               typprofil: { felder: { sohlhoeheAnfang: {}, sohlhoeheEnde: {} } } });
        expect(g.every(x => !['kante', 'kante-plus', 'stuetzpunkt-weg', 'drehung'].includes(x.art))).toBe(true);
    });
});

describe('DIE KREUZPROBE: der „+"-Griff und sein Werkzeug messen dieselbe Station', () => {
    it('offene Linie: der eingefügte Punkt landet EXAKT auf der Kantenmitte', () => {
        const el = EIGEN('linie', LINIE);
        for (const plus of griffeFuer({ subjekt: el, subjektHerkunft: 'cde' }).filter(x => x.art === 'kante-plus')) {
            const e = b('stuetzpunkt-einfuegen').anwenden(el, plus.werte);
            expect(e, `Kante ${plus.index}`).not.toBeNull();
            const neu = e.nachher.parameter.punkte[plus.index + 1];
            expect(neu[0]).toBeCloseTo(plus.pos.x, 6);
            expect(neu[1]).toBeCloseTo(plus.pos.y, 6);
            expect(neu[2]).toBeCloseTo(plus.pos.z, 6);
        }
    });
    it('geschlossener Ring: auch die letzte Kante trifft — sie zählt beim Einfügen mit', () => {
        const el = EIGEN('flaeche', RING);
        const plus = griffeFuer({ subjekt: el, subjektHerkunft: 'cde' }).find(x => x.art === 'kante-plus' && x.index === 3);
        const e = b('stuetzpunkt-einfuegen').anwenden(el, plus.werte);
        const punkte = e.nachher.parameter.punkte;
        expect(punkte).toHaveLength(5);
        expect(punkte[4][0]).toBeCloseTo(plus.pos.x, 6);
        expect(punkte[4][2]).toBeCloseTo(plus.pos.z, 6);
    });
    it('der „−"-Griff nennt einen Index, den sein Werkzeug wirklich entfernt', () => {
        const el = EIGEN('flaeche', RING);
        const weg = griffeFuer({ subjekt: el, subjektHerkunft: 'cde' }).find(x => x.art === 'stuetzpunkt-weg' && x.index === 1);
        const e = b('stuetzpunkt-entfernen').anwenden(el, weg.werte);
        expect(e.nachher.parameter.punkte).toEqual([RING[0], RING[2], RING[3]]);
    });
});

describe('Katalog: Kante verschieben', () => {
    it('beide Endpunkte wandern um dasselbe Delta, die übrigen stehen', () => {
        const e = b('kante-verschieben').anwenden(EIGEN('flaeche', RING), { index: 0, ost: 2, nord: -3, hoehe: 5 });
        // alte Mitte der Kante 0–1: (2, 5, 0) → Ziel (2, 5, 3): Δ = (0, 0, +3)
        expect(e.nachher.parameter.punkte).toEqual([[0, 5, 3], [4, 5, 3], [4, 5, 4], [0, 5, 4]]);
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1' });
    });
    it('ABSOLUT und damit idempotent: zweimal auf denselben Zielwert ergibt dieselbe Lage', () => {
        const werte = { index: 0, ost: 2, nord: -3, hoehe: 5 };
        const einmal = b('kante-verschieben').anwenden(EIGEN('flaeche', RING), werte);
        const el2 = EIGEN('flaeche', einmal.nachher.parameter.punkte);
        expect(b('kante-verschieben').anwenden(el2, werte)).toBeNull();       // steht schon dort
    });
    it('der Ring schliesst zurück, die offene Linie hat hinter dem letzten Punkt keine Kante', () => {
        expect(b('kante-verschieben').anwenden(EIGEN('flaeche', RING), { index: 3, ost: 0, nord: -2, hoehe: 6 })
            .nachher.parameter.punkte).toEqual([[0, 6, 0], [4, 5, 0], [4, 5, 4], [0, 6, 4]]);
        expect(b('kante-verschieben').anwenden(EIGEN('linie', LINIE), { index: 2, ost: 0, nord: 0, hoehe: 1 })).toBeNull();
    });
    it('steht nur an eigenen Bauteilen, und „drehen" ist per Griff füllbar', () => {
        expect(passende({ bauform: 'flaeche', guete: 'gemessen' }).map(x => x.id)).not.toContain('kante-verschieben');
        expect(passende({ bauform: 'flaeche', guete: 'gemessen' }, { eigenes: true }).map(x => x.id)).toContain('kante-verschieben');
        expect(b('drehen').felder[0].aus).toEqual({ geste: 'griff' });
        expect(b('kante-verschieben').felder[0].aus).toEqual({ geste: 'griff' });
    });
});

describe('useGriffe: ein Tipp legt ohne Zug ab', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

    function baue(punkte = RING) {
        const bearbeitung = useBearbeitung();
        const ae = useAenderungen();
        const subjekt = EIGEN('flaeche', punkte);
        const e = {
            knotenGriffe: () => [],
            zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => 'stuetz-weg:cde1:1'), griffHervorheben: vi.fn(),
            griffVersetzen: vi.fn(), zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(),
            geistLeeren: vi.fn(), blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
            strahl: (x, y) => ({ origin: { x, y: 100, z: y }, direction: { x: 0, y: -1, z: 0 } }),
        };
        const nachBauen = vi.fn(async () => ({ angewandt: true }));
        const melde = vi.fn();
        const g = useGriffe({
            engine: ref(e), bearbeitung, aenderungen: ae,
            getSubjekt: () => subjekt, getTypprofil: () => null, getBauform: () => 'flaeche',
            getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
            holeKnotenSubjekt: async () => null,
            nachBauen, getModellSha: () => 'sha1', getWer: () => 'Fabio', melde,
            farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
        });
        // Seit K5 stehen Griffe nur mit scharfem Werkzeug — hier die Familie
        // der Stützpunkte (Zug-, Tipp- und Drehgriffe gehören dazu).
        const scharf = (id = 'stuetzpunkt-verschieben') => bearbeitung.starte(id, { subjekt });
        return { bearbeitung, ae, e, g, nachBauen, melde, subjekt, scharf };
    }

    it('baut Zug- und Tipp-Griffe und reicht dem Overlay die Rollenfarben', () => {
        const t = baue();
        t.scharf();
        t.g.neuBauen();
        expect(t.g.griffe.value.some(x => x.wirkung === 'tipp')).toBe(true);
        expect(t.e.zeigeGriffe.mock.calls[0][1]).toMatchObject({ farbeEntfernen: '#f00', farbeEinfuegen: '#0f0' });
    });

    it('Tipp auf „−": kein Zug nötig, der Eintrag entfernt den genannten Stützpunkt', async () => {
        const t = baue();
        t.scharf();
        t.g.neuBauen();
        expect(t.g.greifen({ x: 0, y: 0, typ: 'mouse' })).toBe(true);
        t.g.zugStart({ x: 0, y: 0, px: { x: 10, y: 10 }, typ: 'mouse' });
        expect(t.g.zug.value.wirkung).toBe('tipp');
        expect(t.g.pille.value.text).toBe('Stützpunkt entfernen');
        t.g.zugBewegt({ x: 9, y: 9, px: { x: 19, y: 19 }, typ: 'mouse' });    // ein Tipp bewegt nichts
        expect(t.g.zug.value.pos).toEqual(t.g.griffe.value.find(x => x.key === 'stuetz-weg:cde1:1').pos);
        const eintrag = await t.g.zugEnde({});                                // OHNE Bewegung — trotzdem wirksam
        // Kein Fehlschlag unterwegs: mit scharfem „Stützpunkt verschieben" war
        // der Tipp auf den Nebengriff still wirkungslos, weil `starte` sein
        // eigenes `scharfId` gleich wieder löschte (Kur 2026-09-21).
        expect(t.melde.mock.calls.map(c => c[0])).toEqual([]);
        expect(eintrag).toMatchObject({ art: 'erzeugt', globalId: 'cde1' });
        expect(eintrag.nachher.parameter.punkte).toEqual([RING[0], RING[2], RING[3]]);
        expect(t.nachBauen).toHaveBeenCalled();
        expect(t.bearbeitung.scharfId).toBeNull();                            // das Werkzeug räumt sich weg
    });

    it('Esc bricht auch den Tipp ab — nichts wird geschrieben', async () => {
        const t = baue();
        t.scharf();
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'mouse' });
        t.g.zugStart({ x: 0, y: 0, px: { x: 10, y: 10 }, typ: 'mouse' });
        expect(await t.g.zugEnde({ abbruch: true })).toBeNull();
        expect(t.nachBauen).not.toHaveBeenCalled();
    });

    it('Drehgriff: der Zug läuft auf dem Kreis und füllt den Winkel, im 5°-Raster', () => {
        const t = baue();
        t.e.griffUnter.mockReturnValue('drehung:cde1');
        // Der Drehgriff gehört zu `drehen` — eine eigene Familie (K5).
        t.scharf('drehen');
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'mouse' });
        const dreh = t.g.griffe.value.find(x => x.key === 'drehung:cde1');
        t.g.zugStart({ x: dreh.pos.x, y: dreh.pos.z, px: { x: 0, y: 0 }, typ: 'mouse' });
        expect(t.g.zug.value.radius).toBeGreaterThan(0);
        // Der Strahl bildet (x, y) auf (x, ·, z) ab: senkrecht über dem Zentrum + 5 in z ⇒ +90°
        const c = dreh.zentrum;
        t.g.zugBewegt({ x: c.x, y: c.z + 5, px: { x: 5, y: 5 }, typ: 'mouse' });
        expect(t.g.zug.value.winkel).toBe(90);
        expect(t.bearbeitung.werte.winkel).toBe(90);
        expect(t.g.pille.value.text).toContain('90,0°');
        // Der Griff bleibt auf seinem Kreis.
        const p = t.g.zug.value.pos;
        expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(t.g.zug.value.radius, 6);
    });
});

describe('Overlay: Würfel für Tipp-Griffe, Nebengriffe erst beim Hover', () => {
    function baue() {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(0, 60, 0);
        return new IfcOverlay({ getWorld: () => ({ scene: { three: scene }, camera: { three: camera } }) });
    }
    const GRIFFE = [
        { key: 'stuetz:cde1:0', pos: { x: 0, y: 0, z: 0 } },
        { key: 'stuetz-weg:cde1:0', pos: { x: 0, y: 0, z: 0 }, wirkung: 'tipp', rolle: 'entfernen', zeigtBei: 'stuetz:cde1:0' },
        { key: 'kante:cde1:0', pos: { x: 2, y: 0, z: 0 } },
    ];

    it('Tipp-Griffe sind Würfel und sitzen über ihrem Zug-Griff; Nebengriffe starten unsichtbar', () => {
        const o = baue();
        expect(o.zeigeGriffe(GRIFFE, { radius: 0.2 })).toBe(3);
        const weg = o._griffe.get('stuetz-weg:cde1:0');
        expect(weg.kugel.geometry.type).toBe('BoxGeometry');
        expect(o._griffe.get('stuetz:cde1:0').kugel.geometry.type).toBe('SphereGeometry');
        expect(weg.kugel.position.y).toBeGreaterThan(0);
        expect(weg.kugel.visible).toBe(false);
        expect(weg.versteckt).toBe(true);
    });

    it('Hover auf dem Zug-Griff zeigt seine Nebengriffe — und macht sie erst dann greifbar', () => {
        const o = baue();
        o.zeigeGriffe(GRIFFE, { radius: 0.2 });
        expect(o.griffUnter(0, 0)).not.toBe('stuetz-weg:cde1:0');    // verborgen ⇒ kein Ziel
        o.griffHervorheben('stuetz:cde1:0');
        const weg = o._griffe.get('stuetz-weg:cde1:0');
        expect(weg.kugel.visible).toBe(true);
        expect(weg.versteckt).toBe(false);
        // Hover auf dem Nebengriff selbst hält seine Gruppe offen …
        o.griffHervorheben('stuetz-weg:cde1:0');
        expect(o._griffe.get('stuetz-weg:cde1:0').kugel.visible).toBe(true);
        // … der Wechsel auf einen anderen Zug-Griff schliesst sie.
        o.griffHervorheben('kante:cde1:0');
        expect(o._griffe.get('stuetz-weg:cde1:0').kugel.visible).toBe(false);
    });
});
