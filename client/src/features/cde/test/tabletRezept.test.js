// @vitest-environment jsdom
/**
 * DAS TABLET-REZEPT (2026-09-09) — die Regeln, nach denen Bearbeitung auf dem
 * Finger funktioniert, und ihre Wächter.
 *
 * Am iPad hochkant (834 × 1112, echtes Touch) gemessen, nicht vermutet:
 * ZEHN Bedienelemente lagen ausserhalb des Bildes — darunter JEDER
 * Panel-Knopf, also Toolbox, Verlauf und Prüfliste. Und die Nebengriffe aus
 * S10 hingen am Schweben, das es auf dem Finger nicht gibt.
 *
 * Die vier Regeln, die daraus folgen:
 *
 *  R1  Kein Werkzeug hängt am SCHWEBEN. Was der Zeiger zeigt, muss der Finger
 *      antippen können — ein Tipp auf den Zug-Griff öffnet seine Gruppe.
 *  R2  Keine Modifikatortaste ist PFLICHT. Sie darf abkürzen (Alt lässt das
 *      Raster frei, Strg erzwingt die Höhe), aber jede Funktion braucht einen
 *      Weg ohne Tastatur — für die Höhe am Stützpunkt ist das ein eigener Griff.
 *  R3  HOCHKANT ist kein Sonderfall. Kein Bedienelement liegt ausserhalb.
 *  R4  Ein Tipp SCHREIBT NICHT. Geschrieben wird, was gezogen oder bestätigt
 *      wurde; ein Tipp zeigt höchstens mehr an.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { griffeFuer } from '../services/Griffe.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useGriffe } from '../composables/useGriffe.js';

// jsdom liefert `import.meta.url` ohne file:-Schema — deshalb der Pfadweg
// der übrigen jsdom-Wächter (griffe.test.js).
const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (pfad) => readFileSync(WURZEL + pfad, 'utf8');

const RING = [[0, 5, 0], [4, 5, 0], [4, 5, 4], [0, 5, 4]];
const EIGEN = () => ({
    globalId: 'cde1', modelId: 'cde-eigenbau', name: 'F1', category: 'IFCANNOTATION',
    lageUmkehrbar: true, versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
    stand: { bauplan: { rezept: 'flaeche', kategorie: 'IFCANNOTATION', name: 'F1', parameter: { punkte: RING } } },
});

describe('R1 — der Finger kann nicht schweben, also öffnet ein TIPP die Gruppe', () => {
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

    function baue() {
        const bearbeitung = useBearbeitung();
        const ae = useAenderungen();
        const subjekt = EIGEN();
        const e = {
            knotenGriffe: () => [],
            zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => 'stuetz:cde1:0'), griffHervorheben: vi.fn(),
            griffVersetzen: vi.fn(), zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(),
            geistLeeren: vi.fn(), blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
            strahl: (x, y) => ({ origin: { x, y: 100, z: y }, direction: { x: 0, y: -1, z: 0 } }),
        };
        const nachBauen = vi.fn(async () => ({ angewandt: true }));
        const g = useGriffe({
            engine: ref(e), bearbeitung, aenderungen: ae,
            getSubjekt: () => subjekt, getTypprofil: () => null, getBauform: () => 'flaeche',
            getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
            holeKnotenSubjekt: async () => null, nachBauen,
            getModellSha: () => 'sha1', getWer: () => 'Fabio', melde: vi.fn(),
            farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
        });
        return { g, e, nachBauen, bearbeitung };
    }

    it('Aufsetzen und Loslassen OHNE Zug öffnet die Nebengriffe — und schreibt nichts (R4)', async () => {
        const t = baue();
        t.g.neuBauen();
        expect(t.g.greifen({ x: 0, y: 0, typ: 'touch' })).toBe('warten');   // der Finger armiert erst
        t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'touch' });
        expect(await t.g.zugEnde({})).toBeNull();
        expect(t.nachBauen).not.toHaveBeenCalled();
        expect(t.g.offeneGruppe.value).toBe('stuetz:cde1:0');
        expect(t.e.griffHervorheben).toHaveBeenCalledWith('stuetz:cde1:0');
    });

    it('die offene Gruppe überlebt den Neuaufbau — sonst schlösse sie sich bei jedem Journalschritt', () => {
        const t = baue();
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'touch' });
        t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'touch' });
        t.g.zugEnde({});
        t.e.griffHervorheben.mockClear();
        t.g.neuBauen();
        expect(t.e.griffHervorheben).toHaveBeenCalledWith('stuetz:cde1:0');
    });

    it('ein Tipp NEBEN die Griffe schliesst sie wieder', () => {
        const t = baue();
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'touch' });
        t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'touch' });
        t.g.zugEnde({});
        t.e.griffUnter.mockReturnValueOnce(null);
        expect(t.g.greifen({ x: 500, y: 500, typ: 'touch' })).toBe(false);
        expect(t.g.offeneGruppe.value).toBeNull();
    });

    it('ein ABBRUCH (Esc, pointercancel) öffnet nichts', async () => {
        const t = baue();
        t.g.neuBauen();
        t.g.greifen({ x: 0, y: 0, typ: 'touch' });
        t.g.zugStart({ x: 0, y: 0, px: { x: 0, y: 0 }, typ: 'touch' });
        await t.g.zugEnde({ abbruch: true });
        expect(t.g.offeneGruppe.value).toBeNull();
    });
});

describe('R2 — keine Modifikatortaste ist Pflicht', () => {
    it('die Höhe am Stützpunkt hat einen eigenen Griff, nicht nur die Shift-Taste', () => {
        const g = griffeFuer({ subjekt: EIGEN(), subjektHerkunft: 'cde' });
        const xz = g.filter(x => x.art === 'stuetzpunkt' && x.achsen === 'XZ');
        const y = g.filter(x => x.art === 'stuetzpunkt' && x.achsen === 'Y');
        expect(y).toHaveLength(xz.length);
        // Beide bedienen DASSELBE Werkzeug — der Griff ist ein zweiter Weg, keine zweite Sache.
        expect(new Set(g.filter(x => x.art === 'stuetzpunkt').map(x => x.werkzeug)).size).toBe(1);
    });

    it('Shift bleibt die Abkürzung zum selben Ziel (Textwächter)', () => {
        const t = lies('composables/useGriffe.js');
        expect(t).toMatch(/shiftKey/);                      // die Abkürzung darf bleiben …
        expect(lies('services/Griffe.js')).toMatch(/stuetz-hoch/);   // … weil es den Weg ohne sie gibt
    });

    it('Nebengriffe derselben Ecke liegen an VERSCHIEDENEN Orten — sonst nicht einzeln zu treffen', () => {
        const g = griffeFuer({ subjekt: EIGEN(), subjektHerkunft: 'cde' });
        const neben = g.filter(x => x.zeigtBei === 'stuetz:cde1:0');
        expect(neben.length).toBeGreaterThan(1);
        for (const n of neben) expect(n.nebenVersatz, n.key).toBeTruthy();
        expect(new Set(neben.map(x => `${x.nebenVersatz.x}/${x.nebenVersatz.y}`)).size).toBe(neben.length);
    });
});

describe('R3 — hochkant liegt nichts ausserhalb', () => {
    // Die Kopfzeile ist seit dem Kassensturz (H1) eine eigene Komponente.
    const css = lies('components/CdeKopfleiste.vue');
    const hochkant = css.slice(css.indexOf('@media (max-width: 900px)'));

    it('die Kopfzeile bricht um, statt zu überlaufen', () => {
        expect(hochkant).toMatch(/\.cde-bar\s*\{[^}]*flex-wrap:\s*wrap/);
    });

    it('der Abstandhalter fällt weg — flex: 1 füllt die Zeile und verhindert den Umbruch', () => {
        expect(hochkant).toMatch(/\.cde-spacer\s*\{\s*display:\s*none/s);
    });

    it('die Knöpfe der Kopfzeile sind 40 × 40 gross', () => {
        expect(hochkant).toMatch(/\.cde-bar button[^}]*min-height:\s*40px/s);
        expect(hochkant).toMatch(/\.cde-bar button\s*\{\s*min-width:\s*40px/);
    });
});
