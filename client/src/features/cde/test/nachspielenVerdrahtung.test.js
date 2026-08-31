// @vitest-environment jsdom
/**
 * Verdrahtung des Nachspielens in den Ladepfad (Stufe 9.2, Rest).
 *
 * Der Kern ist eine REIHENFOLGE, und deshalb wird sie hier geprüft und nicht
 * nur behauptet: Der Lieferstand muss gelesen werden, BEVOR irgendeine
 * Festlegung angewandt wird. Läse man ihn danach, verschöbe sich der
 * Bezugspunkt mit jeder Änderung — der zweite Lauf ergäbe etwas anderes als der
 * erste, und aus dem Rebase würde ein Zufall.
 *
 * Zweite Zusage: nichts scheitert still. Was nicht angewandt werden konnte,
 * steht hinterher in `meldung` und `konflikte` — auch dann, wenn der Grund
 * beim Anwenden selbst lag und nicht im Vergleich.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { betroffeneGlobalIds, useNachspielen } from '../composables/useNachspielen.js';
import { useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const GELIEFERT = { x: 10, y: 2, z: 5 };
const ZIEL = { x: 11.5, y: 2, z: 5 };

vi.mock('../services/GlobalIdKarte.js', () => ({
    karteMitEngine: vi.fn(async (_engine, gesucht) => {
        const karte = new Map();
        const fehlend = [];
        for (const gid of gesucht) {
            if (gid === 'WEG') { fehlend.push(gid); continue; }
            karte.set(gid, { modelId: 'm1', localId: Number(gid.replace(/\D/g, '')) || 1 });
        }
        return { karte, fehlend };
    }),
}));

/** Engine-Attrappe, die das Protokoll ihrer Aufrufe mitschreibt. */
function fakeEngine({ anker = new Map([[1, GELIEFERT]]), misserfolge = [] } = {}) {
    const protokoll = [];
    return {
        protokoll,
        engine: ref({
            ankerVon: vi.fn(async (_mid, ids) => {
                protokoll.push('ankerVon');
                return new Map(ids.filter(i => anker.has(i)).map(i => [i, anker.get(i)]));
            }),
            wendeFestlegungenAn: vi.fn(async () => {
                protokoll.push('wendeAn');
                return { misserfolge };
            }),
        }),
    };
}

describe('betroffeneGlobalIds', () => {
    it('nimmt nur modellberührende Arten', () => {
        const ids = betroffeneGlobalIds([
            { art: 'lage', globalId: 'A' },
            { art: 'kg', globalId: 'B' },
            { art: 'parametrik', globalId: 'C' },
        ]);
        expect([...ids].sort()).toEqual(['A', 'C']);
    });

    it('lässt CDE-eigene Bauteile aus — die stehen nicht im gelieferten Modell', () => {
        const ids = betroffeneGlobalIds([{ art: 'lage', globalId: 'neu', modell: 'cde' }]);
        expect(ids.size).toBe(0);
    });

    it('erträgt eine leere Liste', () => {
        expect(betroffeneGlobalIds(null).size).toBe(0);
    });
});

describe('Die Reihenfolge — Lieferstand VOR Anwendung', () => {
    it('liest die Anker, bevor irgendetwas angewandt wird', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        const f = fakeEngine();
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        await n.nachModellladung('m1');

        expect(f.protokoll).toEqual(['ankerVon', 'wendeAn']);
    });

    it('läuft gar nicht erst an, wenn es nichts Modellberührendes gibt', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'kg', globalId: 'H1', nachher: '322' });

        const f = fakeEngine();
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        expect(await n.nachModellladung('m1')).toEqual({ angewandt: 0, konflikte: 0 });
        expect(f.protokoll).toEqual([]);
    });
});

describe('Das Ergebnis wird gemeldet, nicht verschluckt', () => {
    it('wendet eine saubere Festlegung an und sagt es', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        const n = useNachspielen({ engine: fakeEngine().engine, aenderungen: j });
        const r = await n.nachModellladung('m1');
        expect(r).toEqual({ angewandt: 1, konflikte: 0 });
        expect(n.meldung.value).toBe('1 Festlegung angewandt');
    });

    it('meldet einen Konflikt, wenn der Planer dasselbe Bauteil bewegt hat', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        // Im geladenen Modell liegt es woanders als in der Basis.
        const f = fakeEngine({ anker: new Map([[1, { x: 10.5, y: 2, z: 5 }]]) });
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        const r = await n.nachModellladung('m1');

        expect(r.konflikte).toBe(1);
        expect(n.meldung.value).toMatch(/auch vom Planer geändert/);
        expect(n.zustandVon({ art: 'lage', globalId: 'H1' }).zustand).toBe('konflikt');
    });

    it('meldet ein verschwundenes Bauteil als Konflikt, nicht als Erfolg', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'WEG', nachher: ZIEL, basis: GELIEFERT });

        const f = fakeEngine({ anker: new Map() });
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        const r = await n.nachModellladung('m1');

        expect(r.angewandt).toBe(0);
        expect(n.meldung.value).toMatch(/nicht mehr im Modell/);
    });

    it('zählt einen beim ANWENDEN gescheiterten Schritt nicht als Erfolg', async () => {
        // Der heimtückische Fall: der Vergleich war sauber, das Verschieben
        // ging trotzdem schief. Ohne diese Behandlung meldete die
        // Zusammenfassung „1 Festlegung angewandt", und nichts wäre passiert.
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        const f = fakeEngine({ misserfolge: [{ art: 'lage', globalId: 'H1', grund: 'kein_editor' }] });
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        const r = await n.nachModellladung('m1');

        expect(r.angewandt).toBe(0);
        expect(r.konflikte).toBe(1);
        expect(n.zustandVon({ art: 'lage', globalId: 'H1' }).zustand).toBe('fehlgeschlagen');
    });
});

describe('Ein Fehler bricht das Laden nicht ab', () => {
    it('meldet ihn, statt die Ausnahme durchzureichen', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        const engine = ref({
            ankerVon: vi.fn(async () => { throw new Error('WebGL weg'); }),
            wendeFestlegungenAn: vi.fn(),
        });
        const n = useNachspielen({ engine, aenderungen: j });
        const r = await n.nachModellladung('m1');

        expect(r).toEqual({ angewandt: 0, konflikte: 0 });
        expect(n.meldung.value).toMatch(/WebGL weg/);
        expect(n.laeuft.value).toBe(false);
    });
});

describe('Ein zweiter Lauf ändert nichts', () => {
    it('meldet beim zweiten Mal dasselbe wie beim ersten', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        const f = fakeEngine();
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        const erst = await n.nachModellladung('m1');
        const erstMeldung = n.meldung.value;
        const zweit = await n.nachModellladung('m1');

        expect(zweit).toEqual(erst);
        expect(n.meldung.value).toBe(erstMeldung);
    });
});
