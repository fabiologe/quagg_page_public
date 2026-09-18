// @vitest-environment jsdom
/**
 * Griffe — werkzeug-gebundenes Ziehen (Teil XVI, S4).
 *
 *  1. `Griffe.js` rein: welcher Griff an welcher Bauform, an der WIRKSAMEN
 *     Lage, mit welchem Werkzeug und welchen Werten; Ziehebenen-Mathematik.
 *  2. Der Katalogeintrag `stuetzpunkt-verschieben` — nur für Eigenes.
 *  3. `useGriffe` am echten Store: der Drop geht den EINEN Katalogweg.
 *  4. Der Plan liest seine Griffe aus derselben Funktion (Textwächter).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { griffeFuer, griffZuWerten, ziehebene, schnittStrahlEbene, begrenze } from '../services/Griffe.js';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useGriffe } from '../composables/useGriffe.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

const SCHAECHTE = [
    { globalId: 'S1', name: 'S 1', modelId: 'm1', localId: 11, punkt: { x: 0, y: 3, z: 0 }, herkunft: 'geliefert' },
    { globalId: 'S2', name: 'S 2', modelId: 'm1', localId: 12, punkt: { x: 10, y: 3, z: -5 }, herkunft: 'geliefert' },
    { globalId: 'cdeS', name: 'Eigener', modelId: null, localId: null, punkt: { x: 7, y: 0, z: 7 }, herkunft: 'cde' },
];
const PROFIL_ROHR = { felder: { sohlhoeheAnfang: {}, sohlhoeheEnde: {}, profilGroesse: {} } };
const PROFIL_SCHACHT = { felder: { deckelhoehe: {}, sohlhoehe: {} } };

describe('griffeFuer', () => {
    it('Schachtgriffe nur für GELIEFERTE, an der WIRKSAMEN Lage', () => {
        const lageStand = new Map([['S2', { x: 12, y: 3, z: -6 }]]);
        const g = griffeFuer({ schaechte: SCHAECHTE, lageStand });
        expect(g.map(x => x.globalId)).toEqual(['S1', 'S2']);
        expect(g[1]).toMatchObject({ art: 'knoten', achsen: 'XZ', werkzeug: 'schacht-verschieben', felder: ['ost', 'nord'], pos: { x: 12, z: -6 } });
    });

    it('geliefertes Rohr mit Sohl-Rollen: je Ende ein Y-Griff für sohlhoehen-setzen (Forderung)', () => {
        const subjekt = { globalId: 'H1', name: 'H1', achse: { anfang: { x: 0, y: 300, z: 0 }, ende: { x: 20, y: 299.8, z: 0 } }, anker: { x: 10, y: 300, z: 0 } };
        const g = griffeFuer({ subjekt, typprofil: PROFIL_ROHR });
        expect(g).toHaveLength(2);
        expect(g[0]).toMatchObject({ art: 'sohle', ende: 'anfang', achsen: 'Y', werkzeug: 'sohlhoehen-setzen', felder: ['anfang'], forderung: true });
        expect(g[1].pos).toEqual({ x: 20, y: 299.8, z: 0 });
    });

    it('gelieferter Schacht mit Deckel-Rolle: ein Y-Griff am Deckel — nicht zusätzlich die Bezugshöhe', () => {
        const subjekt = { globalId: 'S1', anker: { x: 0, y: 3, z: 0 }, oberkante: 5, bezugshoehe: 1 };
        const g = griffeFuer({ subjekt, typprofil: PROFIL_SCHACHT });
        expect(g.map(x => x.art)).toEqual(['deckel']);
        expect(g[0].pos.y).toBe(5);
    });

    it('nur die Rolle sohlhoehe: ein Griff an der Unterkante für bezugshoehe-setzen', () => {
        const subjekt = { globalId: 'X', anker: { x: 0, y: 3, z: 0 }, bezugshoehe: 1.5 };
        const g = griffeFuer({ subjekt, typprofil: { felder: { sohlhoehe: {} } } });
        expect(g[0]).toMatchObject({ art: 'bezugshoehe', werkzeug: 'bezugshoehe-setzen', pos: { y: 1.5 } });
    });

    it('eigenes Rohr: je Stützpunkt ein XZ-Griff (Shift: Y) für stuetzpunkt-verschieben', () => {
        const subjekt = { globalId: 'cde1', modelId: 'cde-eigenbau', stand: { bauplan: { rezept: 'rohr', parameter: { punkte: [[0, 1, 0], [5, 1, 0], [5, 1, 5]] } } } };
        const g = griffeFuer({ subjekt, subjektHerkunft: 'cde', typprofil: PROFIL_ROHR });
        // Seit S10 stehen daneben Kanten-, Tipp- und Drehgriffe, seit dem
        // Tablet-Rezept zusätzlich je ein Y-NEBENGRIFF (Ersatz für Shift) —
        // die XZ-Stützpunkte bleiben genau drei (ihr Vertrag; den Rest prüft s10).
        const stuetz = g.filter(x => x.art === 'stuetzpunkt' && x.achsen === 'XZ');
        expect(stuetz).toHaveLength(3);
        expect(stuetz[2]).toMatchObject({ art: 'stuetzpunkt', index: 2, achsen: 'XZ', alternativ: 'Y', werkzeug: 'stuetzpunkt-verschieben', herkunft: 'cde', pos: { x: 5, y: 1, z: 5 } });
    });

    it('Gelände und Netz bekommen keine Griffe — und ohne Rollen auch ein Rohr nicht', () => {
        expect(griffeFuer({ subjekt: { globalId: 'DGM', anker: { x: 0, y: 0, z: 0 } }, typprofil: { felder: {} } })).toEqual([]);
        const rohr = { globalId: 'H', achse: { anfang: { x: 0, y: 0, z: 0 }, ende: { x: 1, y: 0, z: 0 } }, anker: { x: 0, y: 0, z: 0 } };
        expect(griffeFuer({ subjekt: rohr, typprofil: { felder: {} } })).toEqual([]);
    });
});

describe('griffZuWerten, ziehebene, schnitt', () => {
    it('ein Schachtgriff liefert Ost/Nord über den Ladeversatz — wie im Plan', () => {
        const g = { art: 'knoten' };
        expect(griffZuWerten(g, { x: 10, y: 3, z: -5 }, { versatz: { x: 1000, y: 0, z: 2000 } })).toEqual({ ost: 1010, nord: -1995 });
    });
    it('Sohle/Deckel/Bezugshöhe liefern m NN; ein Stützpunkt Index + Ort', () => {
        expect(griffZuWerten({ art: 'sohle', ende: 'ende' }, { x: 0, y: 12.4, z: 0 }, { hoehenversatz: 300 })).toEqual({ ende: 312.4 });
        expect(griffZuWerten({ art: 'deckel' }, { x: 0, y: 5, z: 0 }, { hoehenversatz: 0 })).toEqual({ deckel: 5 });
        expect(griffZuWerten({ art: 'stuetzpunkt', index: 2 }, { x: 5, y: 1, z: 5 }, { versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 10 }))
            .toEqual({ index: 2, ost: 5, nord: -5, hoehe: 11 });
        expect(griffZuWerten({ art: 'unbekannt' }, { x: 0, y: 0, z: 0 })).toEqual({});
    });
    it('XZ zieht waagerecht, Y in der senkrechten Ebene zur Kamera', () => {
        expect(ziehebene({ x: 1, y: 2, z: 3 }, 'XZ').normal).toEqual({ x: 0, y: 1, z: 0 });
        const y = ziehebene({ x: 1, y: 2, z: 3 }, 'Y', { x: 0.6, y: -0.8, z: 0 });
        expect(y.normal).toEqual({ x: 1, y: 0, z: 0 });
        expect(ziehebene({ x: 0, y: 0, z: 0 }, 'Y', { x: 0, y: -1, z: 0 }).normal).toEqual({ x: 0, y: 0, z: 1 });   // senkrecht von oben: Rückfall
    });
    it('der Strahl trifft die Ebene — oder nicht (parallel, rückwärts)', () => {
        const ebene = { punkt: { x: 0, y: 5, z: 0 }, normal: { x: 0, y: 1, z: 0 } };
        expect(schnittStrahlEbene({ origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: -1, z: 0 } }, ebene)).toEqual({ x: 0, y: 5, z: 0 });
        expect(schnittStrahlEbene({ origin: { x: 0, y: 10, z: 0 }, direction: { x: 1, y: 0, z: 0 } }, ebene)).toBeNull();
        expect(schnittStrahlEbene({ origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, ebene)).toBeNull();
        expect(begrenze({ x: 1, y: 2, z: 3 }, 'Y')).toEqual({ x: 0, y: 2, z: 0 });
        expect(begrenze({ x: 1, y: 2, z: 3 }, 'XZ')).toEqual({ x: 1, y: 0, z: 3 });
    });
});

describe('stuetzpunkt-verschieben (Katalog)', () => {
    const EIGEN = {
        globalId: 'cde1', modelId: 'cde-eigenbau', category: 'IFCPIPESEGMENT', hoehenversatz: 300,
        versatz: { x: 1000, y: 0, z: 2000 }, lageUmkehrbar: true,
        stand: { bauplan: { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'R1', parameter: { punkte: [[0, 1, 0], [5, 1, 0]], dn: 300 } } },
    };
    it('schreibt einen erzeugt-Eintrag mit DERSELBEN GlobalId und genau einem geänderten Punkt', () => {
        const b = nachId('stuetzpunkt-verschieben');
        const e = b.anwenden(EIGEN, { index: 1, ost: 1008, nord: -2003, hoehe: 302 });
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1', nachher: { rezept: 'rohr', name: 'R1' } });
        expect(e.nachher.parameter.punkte).toEqual([[0, 1, 0], [8, 2, 3]]);
        expect(e.nachher.parameter.dn).toBe(300);
    });
    it('unveränderter Punkt, falscher Index, kein Bauplan → null', () => {
        const b = nachId('stuetzpunkt-verschieben');
        expect(b.anwenden(EIGEN, { index: 0, ost: 1000, nord: -2000, hoehe: 301 })).toBeNull();
        expect(b.anwenden(EIGEN, { index: 5, ost: 1, nord: 1, hoehe: 1 })).toBeNull();
        expect(b.anwenden({ ...EIGEN, stand: {} }, { index: 0, ost: 1, nord: 1, hoehe: 1 })).toBeNull();
    });
    it('erscheint NUR an eigenen Bauteilen', () => {
        const ein = { bauform: 'achse+profil', guete: 'gemessen' };
        expect(passende(ein).some(b => b.id === 'stuetzpunkt-verschieben')).toBe(false);
        expect(passende(ein, { eigenes: true }).some(b => b.id === 'stuetzpunkt-verschieben')).toBe(true);
        expect(b_vorbelegung(EIGEN)).toEqual({ index: 0, ost: 1000, nord: -2000, hoehe: 301 });
    });
});
const b_vorbelegung = (el) => nachId('stuetzpunkt-verschieben').vorbelegung(el);

describe('useGriffe am echten Store — der Drop geht den EINEN Weg', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

    function baue() {
        const b = useBearbeitung();
        const ae = useAenderungen();
        const e = {
            knotenGriffe: () => SCHAECHTE,
            schachtAnschluesse: () => [],
            zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => 'knoten:S1'), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
            zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(),
            blickrichtung: () => ({ x: 0, y: -0.7, z: -0.7 }),
            // Ein senkrechter Strahl von oben auf die XZ-Ebene: Ziel = (x, ·, z) aus den Client-Koordinaten (1 px = 1 m).
            strahl: (x, y) => ({ origin: { x, y: 100, z: y }, direction: { x: 0, y: -1, z: 0 } }),
        };
        const nachBauen = vi.fn(async () => ({ angewandt: true }));
        const melde = vi.fn();
        const g = useGriffe({
            engine: ref(e), bearbeitung: b, aenderungen: ae,
            getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil,
            getVersatz: () => ({ x: 1000, y: 0, z: 2000 }), getHoehenversatz: () => 0,
            holeKnotenSubjekt: async (gid) => ({ globalId: gid, modelId: 'm1', localId: 11, anker: { x: 0, y: 3, z: 0 },
                lage: { ost: 1000, nord: -2000 }, versatz: { x: 1000, y: 0, z: 2000 }, lageUmkehrbar: true, anschluesse: [] }),
            lieferstandVon: () => ({ x: 0, y: 3, z: 0 }),
            nachBauen, getModellSha: () => 'sha1', getWer: () => 'Fabio', melde,
            farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0' }),
        });
        return { b, ae, e, g, nachBauen, melde };
    }

    it('baut die Griffe im Modus und zeigt sie über die Engine', () => {
        const t = baue();
        t.g.neuBauen();
        expect(t.e.zeigeGriffe).toHaveBeenCalled();
        expect(t.g.griffe.value.map(x => x.key)).toEqual(['knoten:S1', 'knoten:S2']);
    });

    it('Maus greift sofort, Finger wartet; ohne Griff unter dem Zeiger nichts', () => {
        const t = baue();
        t.g.neuBauen();
        expect(t.g.greifen({ x: 0, y: 0, typ: 'mouse' })).toBe(true);
        expect(t.g.greifen({ x: 0, y: 0, typ: 'touch' })).toBe('warten');
        t.e.griffUnter.mockReturnValueOnce(null);
        expect(t.g.greifen({ x: 0, y: 0, typ: 'mouse' })).toBe(false);
    });

    it('Zug → Ablegen: starte(schacht-verschieben, {subjekt}) → ost/nord → ausfuehren → nachBauen', async () => {
        const t = baue();
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'mouse' });
        t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'mouse' });
        expect(t.g.zug.value.achsen).toBe('XZ');
        t.g.zugBewegt({ x: 4, y: 3, px: { x: 4, y: 3 }, typ: 'mouse' });     // Strahl von (4, ·, 3)
        expect(t.e.griffVersetzen).toHaveBeenCalledWith('knoten:S1', expect.objectContaining({ x: 4, z: 3 }));
        expect(t.g.pille.value.text).toBe('Ost +4.00 · Nord −3.00 m');       // S7: beide Werte statt der Strecke
        await t.g.zugEnde({ abbruch: false });
        expect(t.nachBauen).toHaveBeenCalledTimes(1);
        const e = t.ae.eintraege;
        expect(e.length).toBeGreaterThan(0);
        expect(e[0]).toMatchObject({ art: 'lage', globalId: 'S1', nachher: { x: 4, y: 3, z: 3 }, basis: { x: 0, y: 3, z: 0 }, modell: 'geliefert' });
        expect(t.b.scharfId).toBeNull();                       // aufgeräumt
        expect(t.g.zug.value).toBeNull();
    });

    it('ein Abbruch oder ein Zug unter 1 cm schreibt nichts und baut die Griffe neu', async () => {
        const t = baue();
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'mouse' });
        t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'mouse' });
        t.g.zugBewegt({ x: 9, y: 9, px: { x: 9, y: 9 }, typ: 'mouse' });
        await t.g.zugEnde({ abbruch: true });
        expect(t.ae.eintraege).toHaveLength(0);
        expect(t.e.zeigeZugbild).toHaveBeenLastCalledWith(null);
        expect(t.e.zeigeGriffe.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('mit scharfem Werkzeug gibt es keine Griffe — der zweite Schlitz tippt auch auf Schächte', async () => {
        const t = baue();
        t.g.neuBauen();
        t.b.starte('kg-setzen', { subjekt: { globalId: 'x' } });
        t.g.neuBauen();
        expect(t.g.griffe.value).toEqual([]);
        expect(t.g.greifen({ x: 0, y: 0, typ: 'mouse' })).toBe(false);
    });
});

describe('Ein Weg für Plan und Raum (Textwächter)', () => {
    it('der Lageplan liest seine Griffe aus griffeFuer — nicht aus einer zweiten Faltung', () => {
        const plan = lies('components/IfcPlanCanvas.vue');
        expect(plan).toMatch(/griffe\.value = griffeFuer\(\{/);
        expect(plan).not.toMatch(/lageStand\.get\(g\.globalId\)/);
    });
    it('der Raum-Griff legt über starte → setzeWert → ausfuehren → nachBauen ab', () => {
        const q = lies('composables/useGriffe.js');
        const fn = q.slice(q.indexOf('async function ablegen'));
        for (const s of ['bearbeitung.starte(griff.werkzeug, { subjekt })', 'bearbeitung.setzeWert(feld, wert)', 'bearbeitung.ausfuehren({', 'await nachBauen?.(eintraege)']) {
            expect(fn, s).toContain(s);
        }
        expect(q).not.toMatch(/setzeAnker|eintragen\(/);
    });
    it('der Zeiger-Stapel sperrt die Kamera für die Dauer des Zugs', () => {
        const h = lies('services/IfcSelectionHandler.js');
        expect(h).toMatch(/kameraSperren\?\.\(true\)/);
        expect(h).toMatch(/kameraSperren\?\.\(false\)/);
        expect(lies('services/IfcCamera.js')).toMatch(/sperren\(an\)/);
    });
});
