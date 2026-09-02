// @vitest-environment jsdom
/**
 * Der Bearbeiten-Modus (Stufe 12.0d).
 *
 * Fabios Ansage: „es soll eigentlich auch nix außerhalb des Editors an
 * Bearbeitungen stattfinden, es ist ein Modus sozusagen — wir haben aber
 * einige Buttons und Sachen wie Ziehen, was außerhalb eigentlich nichts zu
 * tun hat."
 *
 * Bearbeiten war über SIEBEN Einstiege gleichzeitig möglich: Werkzeugleiste,
 * Taste G, Kontextmenü am Bauteil, Toolbox, Befehlspalette, Zeichenwerkzeuge
 * im Lageplan und der Griff selbst. Keiner davon fragte, ob überhaupt
 * bearbeitet werden soll.
 *
 * DIESE DATEI IST DER WÄCHTER DER SPERRE. Sie prüft nicht, ob Knöpfe
 * ausgeblendet sind — das ist Darstellung und kann sich ändern —, sondern dass
 * KEIN Weg am Modus vorbeiführt. Ein Einstieg, der die Sperre umgeht, ist
 * schlimmer als gar keine Sperre: er macht sie unglaubwürdig.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import * as THREE from 'three';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useZeichnen } from '../composables/useZeichnen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const ROHR = {
    modelId: 'm1', localId: 42, category: 'IFCPIPESEGMENT', globalId: '3xY',
    anker: { x: 0, y: 15, z: 0 }, bezugshoehe: 14, oberkante: 16, hoehenversatz: 0,
};

const resolverEchteAchse = {
    forElements: () => ({
        async getForm(form) {
            if (form === 'axis') {
                return { form, perElement: [{ polyline: [[0, 0, 0], [1, 0, 0]], source: 'axisRep', warnings: [] }] };
            }
            return { form, data: null, perElement: [], warnings: [] };
        },
    }),
};

describe('Der sichere Zustand ist der, in den man ohne Zutun gerät', () => {
    it('ist beim Anlegen AUS', () => {
        expect(useBearbeitung().modusAn).toBe(false);
    });

    it('überdauert kein Neuladen', () => {
        // Eine Sperre, die ein Neuladen überlebt, ist keine. Der Store wird
        // hier neu angelegt — wie beim Seitenaufbau.
        useBearbeitung().modusSetzen(true);
        setActivePinia(createPinia());
        expect(useBearbeitung().modusAn).toBe(false);
        expect(localStorage.length).toBe(0);
    });
});

describe('Kein Einstieg führt am Modus vorbei', () => {
    it('starte() weist ab und sagt warum', async () => {
        const b = useBearbeitung();
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.starte('kg-setzen')).toBe(false);
        expect(b.scharf).toBeNull();
        expect(b.letzterGrund).toMatch(/Modus ist aus/);
    });

    it('ausfuehren() weist ab, auch wenn vorher scharf geschaltet war', async () => {
        // Der Modus kann ZWISCHEN beiden ausgeschaltet werden — deshalb
        // reicht die Sperre in `starte` nicht.
        const b = useBearbeitung();
        b.modusSetzen(true);
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.starte('bezugshoehe-setzen')).toBe(true);
        b.setzeWert('hoehe', 305);

        b.modusAn = false;                    // von aussen abgeschaltet
        expect(await b.ausfuehren({ wer: 'x' })).toBeNull();
        expect(b.letzterGrund).toMatch(/Modus ist aus/);
        expect(useAenderungen().eintraege).toHaveLength(0);
    });


    it('das Zeichnen im Lageplan ebenfalls', async () => {
        const bearbeitung = useBearbeitung();
        const z = useZeichnen({ bearbeitung, cde: {}, getModellSha: () => null });
        expect(z.starte('linie-zeichnen')).toBe(false);
        expect(z.aktiv.value).toBe(false);
    });
});

describe('Im Modus geht alles wie zuvor', () => {
    it('starte und ausfuehren laufen durch', async () => {
        const b = useBearbeitung();
        b.modusSetzen(true);
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.starte('bezugshoehe-setzen')).toBe(true);
        b.setzeWert('hoehe', 305);
        const eintrag = await b.ausfuehren({ wer: 'Fabio', basis: ROHR.anker, modell: 'geliefert' });
        expect(eintrag?.art).toBe('lage');
    });
});

describe('Ausschalten entwaffnet, was scharf ist', () => {
    it('ein offenes Formular verschwindet mit dem Modus', async () => {
        // Sonst stünde ein Formular offen, dessen „Übernehmen" nichts mehr
        // tut — ein toter Knopf, und davon hatte dieses Feature genug.
        const b = useBearbeitung();
        b.modusSetzen(true);
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        b.starte('bezugshoehe-setzen');
        expect(b.scharf).not.toBeNull();

        b.modusSetzen(false);
        expect(b.scharf).toBeNull();
        expect(b.werte).toEqual({});
    });

    it('zweimal dasselbe zu setzen ändert nichts und wirft nicht', () => {
        const b = useBearbeitung();
        expect(b.modusSetzen(false)).toBe(false);
        expect(b.modusUm()).toBe(true);
        expect(b.modusSetzen(true)).toBe(true);
        expect(b.modusUm()).toBe(false);
    });
});

describe('Die Einordnung bleibt auch ausserhalb des Modus', () => {
    it('Bauform, Güte und Möglichkeiten werden weiter hergeleitet', async () => {
        // Das ist Absicht: „was WÄRE hier möglich" ist auch beim reinen
        // Ansehen die interessanteste Auskunft der Toolbox. Gesperrt ist das
        // TUN, nicht das Wissen.
        const b = useBearbeitung();
        await b.einordne({ ...ROHR }, resolverEchteAchse);
        expect(b.einordnung?.bauform).toBe('achse+profil');
        expect(b.moeglich.length).toBeGreaterThan(0);
    });
});
