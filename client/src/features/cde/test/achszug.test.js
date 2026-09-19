// @vitest-environment jsdom
/**
 * Achszug — das Bauteil am Auswahlpunkt festhalten und entlang GENAU EINER
 * Achse schieben (Teil XVI, S5).
 *
 * Fabio: „einen Auswahlpunkt festzuhalten und dabei das Objekt an einer X, Y
 * oder Z Achse zu verschieben (wie bei Flood3) — wir müssen uns nur klar sein,
 * wie wir diese Bearbeitung anwenden bezogen auf die einzelnen Bauformen."
 *
 * Geprüft wird hier die ganze Kette: der reine Achswähler (Hysterese,
 * Totzone, steile Sicht), der Bauteil-Griff je Bauform, das Werkzeug
 * `verschieben` (geliefert → lage, eigen → Bauplan wandert, Schacht führt
 * Anschlüsse nach), und der Zug am echten Store: Aufnehmen schaltet das
 * Werkzeug scharf, jede Bewegung schreibt die Felder (die Vorschau liest sie),
 * Ablegen geht den EINEN Weg, Abbruch räumt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import {
    ACHSEN, ACHS_NAMEN, SNAP_FANGEN_GRAD, SNAP_LOESEN_GRAD, TOTZONE_PX,
    achsenErlaubt, achsenAufSchirm, achsPassung, waehleAchse, deltaFuer, deltaXZAusSchirm, ebeneBrauchbar, zugText,
} from '../services/Achszug.js';
import { griffeFuer, griffZuWerten } from '../services/Griffe.js';
import { felderFuer, nachId, passende } from '../services/Bearbeitungen.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useGriffe } from '../composables/useGriffe.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

// Schirm: Draufsicht — Ost läuft nach rechts, Nord nach oben, die Höhe ist ein Punkt.
const DRAUFSICHT = { ost: [10, 0], nord: [0, -10], hoehe: [0, 0] };
// Schräg: alle drei Achsen sichtbar.
const SCHRAEG = { ost: [10, 2], nord: [-3, -8], hoehe: [0, -9] };

describe('Achszug (rein)', () => {
    it('Bauformen: Gelände wird nicht geschoben, alles andere in Ost, Nord und Höhe', () => {
        expect(achsenErlaubt('hoehenfeld')).toEqual([]);
        expect(achsenErlaubt(null)).toEqual([]);
        for (const bf of Object.keys(BAUFORMEN).filter(b => b !== 'hoehenfeld')) {
            expect(achsenErlaubt(bf), bf).toEqual(['ost', 'nord', 'hoehe']);
        }
        // Nord liegt auf −z, wie das Netz aus web-ifc.
        expect(ACHSEN.nord.richtung).toEqual({ x: 0, y: 0, z: -1 });
        expect(ACHS_NAMEN).toEqual(['ost', 'nord', 'hoehe']);
    });

    it('achsenAufSchirm: Pixel je Meter aus der Projektion, null wo sie versagt', () => {
        const projiziere = (p) => ({ x: p.x * 5, y: -p.z * 5 - p.y * 2 });
        const s = achsenAufSchirm({ punkt: { x: 0, y: 0, z: 0 }, projiziere });
        expect(s.ost).toEqual([5, 0]);
        expect(s.nord).toEqual([0, 5]);
        expect(s.hoehe).toEqual([0, -2]);
        expect(achsenAufSchirm({ punkt: { x: 0, y: 0, z: 0 }, projiziere: () => null }).ost).toBeNull();
    });

    it('achsPassung: Abweichung in Grad und Meter entlang der Achse; degeneriert = 999', () => {
        expect(achsPassung(20, 0, [10, 0])).toMatchObject({ dev: 0, t: 2 });
        expect(achsPassung(-20, 0, [10, 0]).t).toBeCloseTo(-2);
        expect(achsPassung(10, 10, [10, 0]).dev).toBeCloseTo(45);
        expect(achsPassung(10, 0, [0, 0]).dev).toBe(999);
        expect(achsPassung(10, 0, [1, 0]).dev).toBe(999);          // < 2 px/m
        expect(achsPassung(0, 0, [10, 0]).dev).toBe(999);
    });

    it('Totzone: unter 8 px wird gehalten, keine Achse gewählt', () => {
        const w = waehleAchse({ achse: null }, { sdx: 3, sdy: 2, schirm: SCHRAEG });
        expect(w.halten).toBe(true);
        expect(w.achse).toBeNull();
        expect(TOTZONE_PX).toBe(8);
    });

    it('die Achse folgt der Zugrichtung — und lässt erst bei 26° wieder los (Hysterese)', () => {
        let z = { achse: null };
        let w = waehleAchse(z, { sdx: 30, sdy: 1, schirm: DRAUFSICHT });
        expect(w.achse).toBe('ost');
        expect(w.t).toBeCloseTo(3, 3);
        // 20° daneben: unter der Lösegrenze — bleibt Ost.
        z = w.zustand;
        w = waehleAchse(z, { sdx: 30, sdy: 30 * Math.tan((20 * Math.PI) / 180), schirm: DRAUFSICHT });
        expect(w.achse).toBe('ost');
        // 40° daneben: Ost gelöst; Nord bei 50° ist zu weit weg → keine Achse.
        w = waehleAchse(w.zustand, { sdx: 30, sdy: 30 * Math.tan((40 * Math.PI) / 180), schirm: DRAUFSICHT });
        expect(w.achse).toBeNull();
        // Senkrecht nach oben: Nord.
        w = waehleAchse(w.zustand, { sdx: 0, sdy: -30, schirm: DRAUFSICHT });
        expect(w.achse).toBe('nord');
        expect(w.t).toBeCloseTo(3, 3);
        expect(SNAP_FANGEN_GRAD).toBeLessThan(SNAP_LOESEN_GRAD);
    });

    it('nur ERLAUBTE Achsen kommen in Frage; Strg erzwingt die Höhe', () => {
        const w = waehleAchse({ achse: null }, { sdx: 30, sdy: 1, schirm: DRAUFSICHT, erlaubt: ['nord', 'hoehe'] });
        expect(w.achse).toBeNull();
        const h = waehleAchse({ achse: 'ost' }, { sdx: 30, sdy: 1, schirm: SCHRAEG, erzwinge: 'hoehe' });
        expect(h.achse).toBe('hoehe');
        expect(h.steil).toBe(false);
        // Von oben ist die Höhe ein Punkt — steil, t unbrauchbar.
        const s = waehleAchse({ achse: null }, { sdx: 0, sdy: -20, schirm: DRAUFSICHT, erzwinge: 'hoehe' });
        expect(s.steil).toBe(true);
        expect(Number.isNaN(s.t)).toBe(true);
    });

    it('deltaFuer: Ost/Nord aus dem Ebenenschnitt (nur die gewählte Komponente), Höhe aus der Passung — steil aus Pixeln', () => {
        const start = { x: 1, y: 5, z: 2 };
        expect(deltaFuer({ achse: 'ost', hit: { x: 4, y: 5, z: 9 }, start })).toEqual({ x: 3, y: 0, z: 0 });
        expect(deltaFuer({ achse: 'nord', hit: { x: 4, y: 5, z: 9 }, start })).toEqual({ x: 0, y: 0, z: 7 });
        expect(deltaFuer({ achse: 'nord', hit: null, start, t: 2 })).toEqual({ x: 0, y: 0, z: -2 });
        expect(deltaFuer({ achse: 'hoehe', t: 1.5 })).toEqual({ x: 0, y: 1.5, z: 0 });
        expect(deltaFuer({ achse: 'hoehe', t: NaN, steil: true, sdy: -20, meterJePixel: 0.5 })).toEqual({ x: 0, y: 10, z: 0 });
        expect(deltaFuer({ achse: null })).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('ebeneBrauchbar: ein waagerechter Blick trifft die waagerechte Ebene nicht — ab ~11° schon', () => {
        expect(ebeneBrauchbar({ direction: { x: -1, y: 0, z: 0 } })).toBe(false);
        expect(ebeneBrauchbar({ direction: { x: -0.98, y: 0.17, z: 0 } })).toBe(false);
        expect(ebeneBrauchbar({ direction: { x: -0.9, y: -0.44, z: 0 } })).toBe(true);
        expect(ebeneBrauchbar({ direction: { x: 0, y: -1, z: 0 } })).toBe(true);
        expect(ebeneBrauchbar(null)).toBe(false);
    });

    it('deltaXZAusSchirm löst den Zug in der Ebene aus zwei sichtbaren Achsen — und aus einer, wenn die andere degeneriert', () => {
        // Draufsicht: Ost nach rechts, Nord nach oben (10 px/m)
        const d = deltaXZAusSchirm(30, -20, DRAUFSICHT);
        expect(d.x).toBeCloseTo(3); expect(d.z).toBeCloseTo(-2);
        // Schräg: beide Achsen sichtbar, das System löst exakt
        const s = deltaXZAusSchirm(10, 2, SCHRAEG);                    // = 1 m Ost
        expect(s.x).toBeCloseTo(1); expect(s.z).toBeCloseTo(0);
        // Seitenansicht entlang Ost: nur Nord bleibt
        const seite = deltaXZAusSchirm(40, 7, { ost: [0, 0], nord: [4, 0], hoehe: [0, -4] });
        expect(seite.x).toBe(0); expect(seite.z).toBeCloseTo(-10);
        expect(deltaXZAusSchirm(5, 5, { ost: null, nord: null })).toEqual({ x: 0, z: 0 });
    });

    it('zugText nennt alle drei Werte, die aktive Achse zuerst; Nord ist −z', () => {
        expect(zugText({ x: 1.2, y: 0, z: -3 }, 'nord')).toBe('▸ Nord +3.00 · Ost +1.20 · Höhe +0.00 m');
        expect(zugText({ x: 0, y: -0.5, z: 0 }, null)).toBe('Ost +0.00 · Nord +0.00 · Höhe −0.50 m');
    });
});

const ROHR = {
    globalId: 'R1', modelId: 'm1', localId: 5, category: 'IFCPIPESEGMENT', name: 'R1',
    anker: { x: 2, y: 3, z: 1 }, auswahlpunkt: { x: 4, y: 3.2, z: 1 },
    lage: { ost: 1002, nord: -2001, hoehe: 303 }, versatz: { x: 1000, y: 0, z: 2000 }, hoehenversatz: 300,
    lageUmkehrbar: true, box: { min: { x: 0, y: 2.8, z: 0.8 }, max: { x: 10, y: 3.2, z: 1.2 } },
};
const EIGEN = {
    globalId: 'cde1', modelId: 'cde-eigenbau', category: 'IFCPIPESEGMENT', name: 'E1',
    anker: { x: 2.5, y: 1, z: 0 }, lage: { ost: 1002.5, nord: -2000, hoehe: 301 },
    versatz: { x: 1000, y: 0, z: 2000 }, hoehenversatz: 300, lageUmkehrbar: true,
    stand: { bauplan: { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'E1', parameter: { punkte: [[0, 1, 0], [5, 1, 0]], dn: 300 } } },
};

describe('Der Bauteil-Griff (griffeFuer / griffZuWerten)', () => {
    it('sitzt am AUSWAHLPUNKT, kennt den Anker und bedient verschieben mit Ost/Nord/Höhe', () => {
        const g = griffeFuer({ subjekt: ROHR, bauform: 'achse+profil' }).find(x => x.art === 'bauteil');
        expect(g).toMatchObject({
            key: 'bauteil:R1', pos: { x: 4, y: 3.2, z: 1 }, anker: { x: 2, y: 3, z: 1 }, achsen: 'XYZ',
            achsenErlaubt: ['ost', 'nord', 'hoehe'], werkzeug: 'verschieben', felder: ['ost', 'nord', 'hoehe'], herkunft: 'geliefert',
        });
    });
    it('ohne Auswahlpunkt am Anker; am Gelände, ohne Bauform und ohne umkehrbare Lage gar nicht', () => {
        const { auswahlpunkt, ...ohne } = ROHR;
        expect(griffeFuer({ subjekt: ohne, bauform: 'koerper' }).find(x => x.art === 'bauteil').pos).toEqual({ x: 2, y: 3, z: 1 });
        expect(griffeFuer({ subjekt: ROHR, bauform: 'hoehenfeld' }).some(x => x.art === 'bauteil')).toBe(false);
        expect(griffeFuer({ subjekt: ROHR }).some(x => x.art === 'bauteil')).toBe(false);
        expect(griffeFuer({ subjekt: { ...ROHR, lageUmkehrbar: false }, bauform: 'netz' }).some(x => x.art === 'bauteil')).toBe(false);
    });
    it('eigenes Bauteil: der Griff trägt Herkunft cde', () => {
        const g = griffeFuer({ subjekt: EIGEN, bauform: 'achse+profil', subjektHerkunft: 'cde' }).find(x => x.art === 'bauteil');
        expect(g).toMatchObject({ herkunft: 'cde', werkzeug: 'verschieben' });
    });
    it('griffZuWerten: Griff und Anker wandern um dasselbe Delta — Ost/Nord über den Versatz, Höhe in m NN', () => {
        const g = griffeFuer({ subjekt: ROHR, bauform: 'achse+profil' }).find(x => x.art === 'bauteil');
        const w = griffZuWerten(g, { x: 7, y: 5.2, z: -1 }, { versatz: ROHR.versatz, hoehenversatz: 300 });
        // Delta (+3, +2, −2) am Anker (2, 3, 1) → (5, 5, −1): ost 1005, nord −(−1+2000) = −1999, hoehe 305
        expect(w).toEqual({ ost: 1005, nord: -1999, hoehe: 305 });
    });
});

describe('verschieben (Katalog)', () => {
    const b = () => nachId('verschieben');
    it('steht an jeder Bauform ausser dem Gelände — auch am Netz, wo es das einzig Ehrliche ist', () => {
        for (const bf of Object.keys(BAUFORMEN)) {
            const da = passende({ bauform: bf, guete: 'unbekannt' }).some(x => x.id === 'verschieben');
            expect(da, bf).toBe(bf !== 'hoehenfeld');
        }
    });
    it('geliefert: EIN lage-Eintrag mit dem absoluten Anker (Ost/Nord/m NN → Welt)', () => {
        const e = b().anwenden(ROHR, { ost: 1005, nord: -1999, hoehe: 305 });
        expect(e).toEqual([{ art: 'lage', globalId: 'R1', nachher: { x: 5, y: 5, z: -1 } }]);
        expect(b().anwenden(ROHR, { ost: 1002, nord: -2001, hoehe: 303 })).toBeNull();       // unverändert
        expect(b().anwenden({ ...ROHR, lageUmkehrbar: false }, { ost: 1, nord: 1, hoehe: 1 })).toBeNull();
        expect(b().vorbelegung(ROHR)).toEqual({ ost: 1002, nord: -2001, hoehe: 303 });
    });
    it('eigen: der BAUPLAN wandert als erzeugt mit derselben GlobalId — alle Punkte, auch in der Höhe', () => {
        const e = b().anwenden(EIGEN, { ost: 1003.5, nord: -2002, hoehe: 302 });
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1', nachher: { rezept: 'rohr', name: 'E1' } });
        // Delta (+1, +1, +2) auf jeden Punkt
        expect(e.nachher.parameter.punkte).toEqual([[1, 2, 2], [6, 2, 2]]);
        expect(e.nachher.parameter.dn).toBe(300);
    });
    it('ein Schacht führt seine Anschlüsse nach — als Forderung, mit DERSELBEN Logik wie „Schacht verschieben"', () => {
        const schacht = { ...ROHR, globalId: 'S1', anschluesse: [{ globalId: 'H1', ende: 'anfang', anfang: { x: 2, y: 3, z: 1 }, ende_: { x: 30, y: 2, z: 1 } }] };
        const e = b().anwenden(schacht, { ost: 1005, nord: -1999, hoehe: 303, mitfuehren: 'forderung' });
        expect(e.map(x => x.art)).toEqual(['lage', 'parametrik']);
        expect(e[1]).toMatchObject({ globalId: 'H1', nachher: { anschlusspunkt: { ende: 'anfang', ost: 1005, nord: -1999 } } });
        const wirklich = b().anwenden(schacht, { ost: 1005, nord: -1999, hoehe: 303, mitfuehren: 'wirklich' });
        expect(wirklich.map(x => x.art)).toEqual(['lage', 'geloescht', 'erzeugt']);
        // Seit Stufe 4 (Teil XXIV, K4b, ausgeliefert 2026-09-19) speichert eine neue Kante ihre SOHLE
        // (`achsbezug: 'sohle'`): die Achse hier sagt ihren Bezug nicht (Rohrmitte) — also y − DN/2.
        expect(wirklich[2].nachher.parameter.punkte[0]).toEqual([5, 2.85, -1]);
        expect(wirklich[2].nachher.parameter.achsbezug).toBe('sohle');
        // Der Regler erscheint NUR mit Anschlüssen.
        expect(felderFuer(b(), null, ROHR).map(f => f.name)).toEqual(['ost', 'nord', 'hoehe']);
        expect(felderFuer(b(), null, schacht).map(f => f.name)).toContain('mitfuehren');
        expect(b().vorbelegung(schacht).mitfuehren).toBe('forderung');
    });
});

describe('useGriffe am echten Store — der Achszug', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

    function baue({ subjekt = ROHR } = {}) {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const e = {
            knotenGriffe: () => [],
            schachtAnschluesse: () => [],
            zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => `bauteil:${subjekt.globalId}`), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
            zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(),
            blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
            // Draufsicht: Schirm-x = 10·Welt-x, Schirm-y = 10·Welt-z (10 px je m); die Höhe ist ein Punkt.
            projectToScreen: ([x, , z]) => ({ x: x * 10, y: z * 10 }),
            pixelmass: () => 0.5,
            strahl: (x, y) => ({ origin: { x, y: 100, z: y }, direction: { x: 0, y: -1, z: 0 } }),
        };
        const nachBauen = vi.fn(async () => ({ angewandt: true }));
        const melde = vi.fn();
        const g = useGriffe({
            engine: ref(e), bearbeitung: b, aenderungen: ae,
            getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil, getBauform: () => b.einordnung?.bauform ?? null,
            getVersatz: () => subjekt.versatz, getHoehenversatz: () => subjekt.hoehenversatz,
            holeKnotenSubjekt: async () => null,
            lieferstandVon: () => ({ x: 2, y: 3, z: 1 }),
            nachBauen, getModellSha: () => 'sha1', getWer: () => 'Fabio', melde,
            farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
        });
        return { b, ae, e, g, nachBauen, melde };
    }

    it('das eingeordnete Bauteil bekommt seinen Griff am Auswahlpunkt — von selbst, sobald die Bauform steht', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        await nextTick();                                   // der Watcher, nicht ein Aufruf von Hand
        const g = t.g.griffe.value.find(x => x.key === 'bauteil:R1');
        expect(g?.pos).toEqual({ x: 4, y: 3.2, z: 1 });
    });

    it('Aufnehmen schaltet verschieben scharf, der Zug nach rechts wählt Ost, die Felder folgen LIVE, Ablegen schreibt EINE lage', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        t.g.neuBauen();
        expect(t.g.greifen({ x: 4, y: 1, typ: 'mouse' })).toBe(true);
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        expect(t.b.scharfId).toBe('verschieben');                       // die Vorschau läuft ab jetzt
        expect(t.g.zug.value.achsen).toBe('XYZ');
        expect(t.e.overlayZeige).toHaveBeenCalledWith('fang', expect.arrayContaining([expect.objectContaining({ art: 'linie' })]));
        // 3 px: Totzone — nichts bewegt sich.
        t.g.zugBewegt({ x: 4.3, y: 1, px: { x: 43, y: 10 }, typ: 'mouse' });
        expect(t.g.zug.value.achse).toBeNull();
        expect(t.g.zug.value.bewegt).toBe(false);
        // 10 m nach rechts: Ost.
        t.g.zugBewegt({ x: 14, y: 1.3, px: { x: 140, y: 13 }, typ: 'mouse' });
        expect(t.g.zug.value.achse).toBe('ost');
        expect(t.e.griffVersetzen).toHaveBeenLastCalledWith('bauteil:R1', { x: 14, y: 3.2, z: 1 });
        expect(t.b.werte).toMatchObject({ ost: 1012, nord: -2001, hoehe: 303 });
        expect(t.g.pille.value.text).toMatch(/^▸ Ost \+10\.00/);
        const achsen = t.e.overlayZeige.mock.calls.at(-1)[1];
        expect(achsen.find(l => l.opacity === 0.95).farbe).toBe('#f00');    // die gewählte Achse leuchtet in ihrer Farbe
        // Griffe bleiben während des Zugs — trotz scharfem Werkzeug.
        t.g.neuBauen();
        expect(t.g.griffe.value.some(x => x.key === 'bauteil:R1')).toBe(true);
        await t.g.zugEnde({ abbruch: false });
        expect(t.nachBauen).toHaveBeenCalledTimes(1);
        expect(t.ae.eintraege).toHaveLength(1);
        expect(t.ae.eintraege[0]).toMatchObject({ art: 'lage', globalId: 'R1', nachher: { x: 12, y: 3, z: 1 }, basis: { x: 2, y: 3, z: 1 }, modell: 'geliefert' });
        expect(t.b.scharfId).toBeNull();
        expect(t.g.zug.value).toBeNull();
        expect(t.e.overlayLeere).toHaveBeenCalledWith('fang');
    });

    it('Seitenansicht (Kamera waagerecht auf Bauteilhöhe): Nord kommt aus der Bildschirmpassung, nicht aus der Kanten-Ebene', async () => {
        const t = baue();
        // Blick entlang −x; Nord (−z) läuft nach rechts (4 px/m), die Höhe nach oben; Ost ist ein Punkt.
        t.e.blickrichtung = () => ({ x: -1, y: 0, z: 0 });
        t.e.projectToScreen = ([, y, z]) => ({ x: -z * 4, y: -y * 4 });
        t.e.strahl = () => ({ origin: { x: 100, y: 3.2, z: 1 }, direction: { x: -1, y: 0, z: 0 } });
        await t.b.einordne(ROHR, null);
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'mouse' });
        t.g.zugStart({ x: 0, y: 0, px: { x: -4, y: -12.8 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 0, y: 0, px: { x: 36, y: -12.8 }, typ: 'mouse' });        // 40 px nach rechts = 10 m Nord
        expect(t.g.zug.value.achse).toBe('nord');
        expect(t.g.zug.value.pos.z).toBeCloseTo(1 - 10, 6);
        expect(t.b.werte.nord).toBeCloseTo(-2001 + 10, 3);
        await t.g.zugEnde({ abbruch: false });
        expect(t.ae.eintraege[0].nachher).toEqual({ x: 2, y: 3, z: -9 });
    });

    it('Strg erzwingt die Höhe — von oben aus Pixeln × Meter je Pixel', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        t.g.neuBauen();
        t.g.greifen({ x: 4, y: 1, typ: 'mouse' });
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 4, y: 1, px: { x: 40, y: -10 }, typ: 'mouse', ctrlKey: true });   // 20 px nach oben × 0,5 m/px
        expect(t.g.zug.value.achse).toBe('hoehe');
        expect(t.b.werte.hoehe).toBeCloseTo(313, 3);
        await t.g.zugEnde({ abbruch: false });
        expect(t.ae.eintraege[0].nachher).toEqual({ x: 2, y: 13, z: 1 });
    });

    it('Werkzeug aus dem Menü scharf: der Griff bleibt, der Zug füttert es, Abbruch stellt die Werte her und lässt es scharf', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        expect(t.b.starte('verschieben', { subjekt: ROHR })).toBe(true);
        t.b.setzeWert('hoehe', 305);                                 // eine Nutzer-Entscheidung im Formular
        await nextTick();
        expect(t.g.griffe.value.map(x => x.key)).toEqual(['bauteil:R1']);   // nur der Griff des Werkzeugs, keine Sohlen
        t.g.greifen({ x: 4, y: 1, typ: 'mouse' });
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        expect(t.g.zug.value.warScharf).toBe(true);
        t.g.zugBewegt({ x: 14, y: 1, px: { x: 140, y: 10 }, typ: 'mouse' });
        expect(t.b.werte.ost).toBe(1012);
        expect(t.b.werte.hoehe).toBe(303);                           // der Griff schreibt alle drei Felder
        await t.g.zugEnde({ abbruch: true });
        expect(t.b.scharfId).toBe('verschieben');                    // bleibt scharf — der Nutzer hat es gewählt
        expect(t.b.werte.hoehe).toBe(305);                           // sein Wert steht wieder
        expect(t.ae.eintraege).toHaveLength(0);
        // und ein Zug mit Drop übernimmt OHNE Neustart (die Werte bleiben, ausfuehren läuft)
        t.g.greifen({ x: 4, y: 1, typ: 'mouse' });
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 14, y: 1, px: { x: 140, y: 10 }, typ: 'mouse' });
        await t.g.zugEnde({ abbruch: false });
        expect(t.ae.eintraege[0]).toMatchObject({ art: 'lage', nachher: { x: 12, y: 3, z: 1 } });
        expect(t.b.scharfId).toBeNull();
    });

    it('Abbruch (Esc / pointercancel) räumt das Werkzeug und schreibt nichts', async () => {
        const t = baue();
        await t.b.einordne(ROHR, null);
        t.g.neuBauen();
        t.g.greifen({ x: 4, y: 1, typ: 'mouse' });
        t.g.zugStart({ x: 4, y: 1, px: { x: 40, y: 10 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 24, y: 1, px: { x: 240, y: 10 }, typ: 'mouse' });
        await t.g.zugEnde({ abbruch: true });
        expect(t.b.scharfId).toBeNull();
        expect(t.ae.eintraege).toHaveLength(0);
        expect(t.e.zeigeZugbild).toHaveBeenLastCalledWith(null);
    });

    it('eigenes Rohr: der Zug schreibt erzeugt mit gewandertem Bauplan', async () => {
        const t = baue({ subjekt: EIGEN });
        // Der Bauplan eines eigenen Bauteils lebt im JOURNAL — `einordne` liest
        // den Stand von dort, nicht aus dem hereingereichten Objekt.
        await t.ae.eintragen({ art: 'erzeugt', globalId: 'cde1', nachher: EIGEN.stand.bauplan, modell: 'cde' });
        await t.b.einordne(EIGEN, null);
        expect(t.b.bauteil.stand?.bauplan?.rezept).toBe('rohr');
        t.g.neuBauen();
        t.g.greifen({ x: 2.5, y: 0, typ: 'mouse' });
        t.g.zugStart({ x: 2.5, y: 0, px: { x: 25, y: 0 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 2.5, y: -10, px: { x: 25, y: -100 }, typ: 'mouse' });   // nach oben auf dem Schirm = Nord (−z)
        expect(t.g.zug.value.achse).toBe('nord');
        await t.g.zugEnde({ abbruch: false });
        expect(t.ae.eintraege).toHaveLength(2);
        const e = t.ae.eintraege.at(-1);
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1', modell: 'cde' });
        expect(e.nachher.parameter.punkte).toEqual([[0, 1, -10], [5, 1, -10]]);
    });
});

describe('Verklebung (Textwächter)', () => {
    it('der Viewer reicht die Bauform an die Griffe und hängt den Auswahlpunkt ans Subjekt', () => {
        const v = lies('components/IfcViewer.vue');
        expect(v).toMatch(/getBauform: \(\) => bearbeitung\.einordnung\?\.bauform \?\? null/);
        expect(v).toMatch(/angereichert\.auswahlpunkt = pkt \?\?/);
    });
    it('die Griffe überleben das scharfe Werkzeug des eigenen Zugs — und werden mitten im Zug nicht umgebaut', () => {
        const g = lies('composables/useGriffe.js');
        expect(g).toMatch(/const bereit = computed\(\(\) => !!bearbeitung\?\.modusAn\)/);
        // Mit scharfem Werkzeug bleiben GENAU die Griffe, die es bedienen — am gewählten Bauteil.
        // Seit Teil XXII vorher gesiebt (`sichtbar`: Eckgriffe nur mit „Ecken ziehen").
        expect(g).toMatch(/sichtbar\.filter\(g => g\.werkzeug === scharf && \(!gid \|\| g\.globalId === gid\)\)/);
        expect(g).toMatch(/if \(zug\.value\) return;\s*\/\/ mitten im Zug nicht umbauen/);
    });
    it('Schacht verschieben und Verschieben teilen sich die Anschluss-Logik', () => {
        const k = lies('services/Bearbeitungen.js');
        // zwei Aufrufer + eine Definition
        expect(k.match(/_anschluesseNachfuehren\(el, werte/g)?.length).toBe(3);
        expect(lies('services/Achszug.js')).not.toMatch(/from 'three'|from 'vue'/);
    });
});
