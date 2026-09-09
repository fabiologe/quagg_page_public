// @vitest-environment jsdom
/**
 * Der Eingabe-Motor (Teil XVI, S3) — am echten Store.
 *
 * Was `zeichnen.test.js` nicht prüft, weil es das Zeichnen im Plan nicht
 * brauchte: EIN Zustand für zwei Flächen, das Starten von aussen (HUD), die
 * Gesten an Feldern, der Fang auf Schächte, die Enter-Regel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useEingabe } from '../composables/useEingabe.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const lies = (p) => readFileSync(WURZEL + p, 'utf8');

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); useBearbeitung().modusSetzen(true); });

const ROHR = {
    modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: 'H1', name: 'H1',
    anker: { x: 10, y: 300, z: 0 }, bezugshoehe: 299.85, oberkante: 300.15, hoehenversatz: 0,
    achse: { anfang: { x: 0, y: 300, z: 0 }, ende: { x: 20, y: 299.8, z: 0 }, laenge: 20, dn: 300,
             polyline: [{ x: 0, y: 300, z: 0 }, { x: 20, y: 299.8, z: 0 }] },
    schachtKnoten: [{ globalId: 'S9', punkt: { x: 60, y: 8, z: 0 }, name: 'S9' }],
    gelaendeQuellen: [{ globalId: 'DGM', name: 'Gelände', cell: 1 }, { globalId: 'DGM2', name: 'Gelände 2', cell: 1 }],
};

function motor(extra = {}) {
    const b = useBearbeitung();
    return useEingabe({ bearbeitung: b, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1',
                        getHoehenversatz: () => 0, ...extra });
}

describe('EIN Zustand für zwei Flächen', () => {
    it('Punkt 1 im Plan, Punkt 2 im Raum — ein Zug, ein Eintrag', async () => {
        const plan = motor();
        const raum = motor();
        expect(plan.starte('linie-zeichnen')).toBe(true);
        expect(raum.aktiv.value).toBe(true);                      // der Raum sieht dasselbe Werkzeug
        plan.setzePunkt({ x: 0, z: 0 });
        expect(raum.aufTreffer({ point: { x: 10, y: 5, z: 0 } })).toBe(true);
        expect(plan.punkte.value).toHaveLength(2);
        expect(raum.punkte.value).toBe(plan.punkte.value);
        const e = await raum.abschliessen();
        expect(e?.art).toBe('erzeugt');
        expect(useAenderungen().eintraege).toHaveLength(1);
        expect(plan.aktiv.value).toBe(false);
    });

    it('ein Zug-Werkzeug, das von AUSSEN scharf wird (HUD), setzt den Motor in Gang', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        expect(b.starte('trasse-aendern', { subjekt: ROHR })).toBe(true);
        expect(m.aktiv.value).toBe(true);
        expect(m.phase.value).toBe('sammeln');
        expect(m.hinweis.value).toMatch(/Trasse ändern: noch 1 Punkt/);
    });

    it('ohne Zug-Schlitz läuft der Motor nicht mit (Formularwerkzeug)', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        b.starte('kg-setzen', { subjekt: ROHR });
        expect(m.aktiv.value).toBe(false);
        expect(m.aufTreffer({ point: { x: 1, y: 1, z: 1 } })).toBe(false);
    });
});

describe('Die Enter-Regel', () => {
    it('genug Punkte + Formular offen → PRÜFEN, dann Backspace öffnet den Zug wieder', async () => {
        const b = useBearbeitung();
        const m = motor();
        m.starte('linie-zeichnen');
        b.setzeWert('kategorie', '');                     // Pflichtfeld leer
        m.setzePunkt({ x: 0, z: 0 }); m.setzePunkt({ x: 5, z: 0 });
        expect(await m.enter()).toBeNull();
        expect(m.phase.value).toBe('pruefen');
        expect(m.zug.value.zeiger).toBeNull();
        expect(m.entferneLetzten()).toBe(true);           // öffnet, nimmt keinen Punkt
        expect(m.phase.value).toBe('sammeln');
        expect(m.punkte.value).toHaveLength(2);
    });

    it('zu wenig Punkte → nichts, mit Grund', async () => {
        const m = motor();
        m.starte('linie-zeichnen');
        m.setzePunkt({ x: 0, z: 0 });
        expect(await m.enter()).toBeNull();
        expect(m.grund.value).toMatch(/Mindestens 2 Punkte/);
        expect(m.phase.value).toBe('sammeln');
    });
});

describe('Gesten an Feldern', () => {
    it('„Station auf der Achse zeigen" füllt das Feld aus dem Treffer — im Grundriss gemessen', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        b.starte('haltung-teilen', { subjekt: ROHR });
        expect(m.starteGeste('station')).toBe(true);
        expect(m.geste.value).toMatchObject({ feld: 'station', art: 'punkt', auf: 'achse' });
        expect(m.aufTreffer({ point: { x: 7.5, y: 320, z: 3 } })).toBe(true);   // 3 m neben der Achse, 20 m drüber
        expect(b.werte.station).toBe(7.5);
        expect(m.geste.value).toBeNull();
        expect(m.aktiv.value).toBe(false);                 // nur die Geste war an — kein Zug
    });

    it('„Gelände antippen" nimmt nur Kandidaten — und sagt sonst warum', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        b.starte('kanalgraben-ableiten', { subjekt: ROHR });
        expect(m.starteGeste('gelaende')).toBe(true);
        expect(m.geste.value.kandidaten).toEqual(['DGM', 'DGM2']);
        expect(m.aufTreffer({ point: { x: 1, y: 1, z: 1 }, globalId: 'H7' })).toBe(true);
        expect(m.grund.value).toMatch(/Kein Kandidat/);
        expect(b.werte.gelaende).toBe('DGM');               // die Vorbelegung steht noch
        m.aufTreffer({ point: { x: 1, y: 1, z: 1 }, globalId: 'DGM2' });
        expect(b.werte.gelaende).toBe('DGM2');
        expect(m.geste.value).toBeNull();
    });

    it('ein Feld ohne Geste lässt sich nicht zeigen; Esc bricht eine Geste ab', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        b.starte('haltung-teilen', { subjekt: ROHR });
        expect(m.starteGeste('gibtsnicht')).toBe(false);
        m.starteGeste('station');
        expect(m.brichGesteAb()).toBe(true);
        expect(m.geste.value).toBeNull();
        expect(m.brichGesteAb()).toBe(false);
    });
});

describe('Der Zug mit Fang und Höchstzahl (Anschliessen)', () => {
    it('der eine Punkt fängt auf die Schachtmitte und wird sofort angewandt', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        b.starte('an-schacht-anschliessen', { subjekt: ROHR });
        expect(m.hoechstPunkte.value).toBe(1);
        expect(m.aufTreffer({ point: { x: 58, y: 8, z: 1 } })).toBe(true);   // 2 m neben S9
        await new Promise(r => setTimeout(r, 0));
        const e = useAenderungen().eintraege;
        expect(e).toHaveLength(1);
        expect(e[0].art).toBe('lage');
        expect(e[0].bezug.ziel).toBe('S9');
        expect(m.aktiv.value).toBe(false);
    });

    it('weit weg von jedem Schacht bleibt der Punkt roh — und anwenden lehnt ab', async () => {
        const b = useBearbeitung();
        const m = motor();
        await b.einordne({ ...ROHR }, null);
        b.starte('an-schacht-anschliessen', { subjekt: ROHR });
        m.aufTreffer({ point: { x: 500, y: 8, z: 500 } });
        await new Promise(r => setTimeout(r, 0));
        // `anwenden` sagt Nein (kein Schacht im Fangradius); `ausfuehren` räumt
        // das Werkzeug — und der Motor nennt den Grund, statt still zu enden.
        expect(useAenderungen().eintraege).toHaveLength(0);
        expect(m.aktiv.value).toBe(false);
        expect(m.grund.value).toBeTruthy();
    });
});

describe('Verklebung im Raum (Textwächter)', () => {
    const viewer = lies('components/IfcViewer.vue');
    it('der Motor ist der ERSTE Tipp-Verbraucher — vor Messen und Notiz', () => {
        const a = viewer.indexOf('_selection.onTipp(tippFuerMotor)');
        const b = viewer.indexOf('_selection.onTipp(async (tipp) => messen.klick');
        expect(a).toBeGreaterThan(-1);
        expect(a).toBeLessThan(b);
    });
    it('Enter und Rücktaste gehen an den Motor, Esc bricht erst die Geste ab', () => {
        expect(viewer).toMatch(/if \(eingabe\.aktiv\.value\) \{\s*if \(e\.key === 'Enter'\)/);
        expect(viewer).toMatch(/eingabe\.entferneLetzten\(\)/);
        expect(viewer).toMatch(/if \(eingabe\.brichGesteAb\(\)\) return;/);
    });
    it('der Treffer geht mit Fang und GlobalId zum Motor; die Leiste kennt ihn', () => {
        expect(viewer).toMatch(/probeTreffer\?\.\(tipp\.x, tipp\.y, \{ fang: true \}\)/);
        expect(viewer).toMatch(/:motor="eingabe"/);
        expect(lies('components/CdeKontextleiste.vue')).toMatch(/\$emit\('geste', g\.name\)/);
    });
    it('useZeichnen ist nur noch die Hülle des Motors — kein zweiter Eingabepfad', () => {
        const z = lies('composables/useZeichnen.js');
        expect(z).toMatch(/return useEingabe\(opts\)/);
        expect(z).not.toMatch(/ref\(\[\]\)/);
        // Kein Composable hält eine eigene Punkteliste — der Zug liegt im Store.
        for (const d of ['composables/useEingabe.js', 'composables/useVorschau.js', 'composables/useZeiger.js']) {
            expect(lies(d), d).not.toMatch(/const punkte = ref\(/);
        }
    });
});
