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
import { anwendungsweg, planFuerEintrag } from '../services/Nachspielen.js';
import { ANWENDBARE_ARTEN } from '../services/IfcAutor.js';

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
/**
 * `nichtAngewandt` gehört zur echten Antwort von `IfcAutor.wendeAn` und fehlte
 * hier — im ganzen Testordner gab es dafür keinen einzigen Treffer. Der
 * `nurFestlegung`-Zweig (eine Querschnittsgröße ist eine FORDERUNG an den
 * Planer, kein Eingriff ins Modell) war damit vollständig ungeprüft, obwohl
 * `useNachspielen` und `IfcViewer.wendeEintragAn` beide damit rechnen.
 */
function fakeEngine({ anker = new Map([[1, GELIEFERT]]), misserfolge = [],
                      nichtAngewandt = [] } = {}) {
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
                return { misserfolge, nichtAngewandt };
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
        expect(n.meldung.value).toBe('1 Schritt angewandt');
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
        // S2: das Scheitern steht in der Zeile, nicht nur in der kleineren Zahl.
        expect(n.meldung.value).toBe('0 Schritte angewandt · 1 nicht angewandt');
    });

    it('ein Eigenbau-Teil, das sich nicht bauen liess, heisst „nicht gebaut" (S2)', async () => {
        // Die Form, die `IfcAutor.baueErzeugte` liefert: der Schritt samt Grund.
        const j = useAenderungen();
        await j.eintragen({ art: 'erzeugt', globalId: 'cde-graben', modell: 'cde',
                            nachher: { rezept: 'kanalgraben', parameter: {} } });

        const f = fakeEngine({ misserfolge: [{ art: 'erzeugt', globalId: 'cde-graben', modell: 'cde', grund: 'Rohre fehlen' }] });
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        const r = await n.nachModellladung('m1');

        expect(r).toEqual({ angewandt: 0, konflikte: 1 });
        expect(n.meldung.value).toBe('0 Schritte angewandt · 1 nicht gebaut');
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

describe('Ein frisch geschriebener Eintrag wird SOFORT wirksam (12.0b)', () => {
    /**
     * Der Fehler, den diese Prüfung festhält: das Formular schrieb ins Journal,
     * und niemand brachte es ans Modell. Nur DREI Wege taten das überhaupt —
     * das fruehere Ziehen (rief `setzeAnker` selbst), Laden (`useNachspielen`)
     * und Zeichnen (`baueErzeugteNeu`). Wer eine Sohlhöhe im Formular eintrug,
     * sah nichts geschehen; erst nach `F5` sprang das Bauteil.
     *
     * Für den Nutzer ist das ununterscheidbar von einem kaputten Knopf — und
     * genau so wurde es gemeldet („die Bearbeitung funktioniert noch nicht").
     *
     * Dazu kam, dass `CdeHudLayer` ein `bearbeitet`-Ereignis warf, dem NIEMAND
     * zuhörte. Ein Ereignis ohne Empfänger sieht im Code aus wie eine
     * Verdrahtung und ist keine.
     */
    it('macht aus einer Lage-Änderung einen Ein-Schritt-Plan in wendeAn-Form', () => {
        const eintrag = { art: 'lage', globalId: 'H12', nachher: { x: 1, y: 2, z: 3 } };
        const plan = planFuerEintrag(eintrag, 'm1');

        expect(plan.modelId).toBe('m1');
        expect(plan.anzuwenden).toEqual([{
            globalId: 'H12', art: 'lage', wert: { x: 1, y: 2, z: 3 },
            eintrag, modell: 'geliefert',
        }]);
        expect(plan.konflikte).toEqual([]);   // wendeAn liest es nicht, aber die Form stimmt
    });

    it('lässt ERZEUGTES niemals einzeln laufen', () => {
        // `baueErzeugte` verwirft das CDE-Modell und baut nur, was es bekommt.
        // Ein Ein-Schritt-Plan löschte damit alles ANDERE Erzeugte mit — und
        // zwar unsichtbar, weil das gerade angelegte Bauteil ja dasteht.
        const eintrag = { art: 'erzeugt', globalId: 'cde-a', modell: 'cde', nachher: { rezept: 'linie' } };
        expect(anwendungsweg(eintrag)).toBe('neuaufbau');
        expect(planFuerEintrag(eintrag, 'm1')).toBe(null);
    });

    it('erkennt Merkmale als „berührt das Modell nicht"', () => {
        // Kostengruppe und DIN-277-Klasse leben neben dem Modell. Sie brauchen
        // keine Anwendung — aber der Aufrufer muss es WISSEN, sonst meldet er
        // „nicht angewandt" für etwas, das gar nichts anzuwenden hatte.
        expect(anwendungsweg({ art: 'kg', globalId: 'H12', nachher: '300' })).toBe('nur-festlegung');
        expect(anwendungsweg({ art: 'din277', globalId: 'H12', nachher: 'NUF' })).toBe('nur-festlegung');
        expect(planFuerEintrag({ art: 'kg', globalId: 'H12' })).toBe(null);
    });

    it('schickt parametrik durch — die Absage kommt von wendeAn, nicht von hier', () => {
        // Zwei verschiedene Fragen mit zwei verschiedenen Besitzern:
        // „berührt es das Modell?" steht in AENDERUNGS_ARTEN, „kann ich es
        // anwenden?" in IfcAutor.ANWENDBARE_ARTEN. Sie hier zu vermengen wäre
        // eine zweite Liste über dieselbe Sache.
        expect(anwendungsweg({ art: 'parametrik', globalId: 'H12', nachher: {} })).toBe('einzeln');
        expect(ANWENDBARE_ARTEN.has('parametrik')).toBe(false);
    });

    it('verträgt einen Eintrag ohne Art, statt zu werfen', () => {
        expect(anwendungsweg(null)).toBe('nur-festlegung');
        expect(anwendungsweg({})).toBe('nur-festlegung');
    });
});

describe('Nicht angewandt ist nicht dasselbe wie fehlgeschlagen', () => {
    it('was das Modell absichtlich nicht anfasst, zählt nicht als angewandt', async () => {
        // Eine Querschnittsgröße ist eine FORDERUNG an den Planer, kein
        // Eingriff — `IfcAutor.wendeAn` gibt sie als `nichtAngewandt` zurück.
        // Sie als angewandt zu zählen, meldete Erfolg für etwas, das nirgends
        // zu sehen ist. Die Attrappe kannte das Feld bis eben gar nicht, und
        // im ganzen Testordner gab es dafür keinen einzigen Treffer.
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });

        const f = fakeEngine({ nichtAngewandt: [{ art: 'lage', globalId: 'H1' }] });
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        const r = await n.nachModellladung('m1');

        expect(r.konflikte).toBe(0);
        expect(r.angewandt).toBe(0);          // NICHT 1 — es ist nichts passiert
        expect(n.meldung.value).not.toMatch(/fehlgeschlagen/i);
    });
});

describe('Nach dem Laden — was ein neuerer Eintrag erledigt (Stufe 5, im Browser gefunden)', () => {
    // Der Browserlauf in 42069: nach „Umhängen" stand „A fehlt" weiter im
    // Reiter, weil die Konflikte nur beim Laden gerechnet werden. Gemessen wird
    // hier an der ECHTEN Liste des Nachspielens, nicht an einer Kopie im Reiter.
    const warte = () => new Promise(r => setTimeout(r, 0));

    it('ein neuerer Eintrag auf der fehlenden Kennung erledigt ihren Konflikt — ein fremder nicht', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'geloescht', globalId: 'WEG', nachher: true });
        const n = useNachspielen({ engine: fakeEngine().engine, aenderungen: j });
        await n.nachModellladung('m1');
        expect(n.konflikte.value.map(k => [k.globalId, k.zustand])).toEqual([['WEG', 'fehlt']]);

        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });   // fremd
        await warte();
        expect(n.konflikte.value).toHaveLength(1);

        await j.eintragen({ art: 'geloescht', globalId: 'WEG', nachher: null });                // wie das Umhängen
        await warte();
        expect(n.konflikte.value).toEqual([]);
        expect(n.meldung.value).toBe('');
        expect(n.zustandVon({ art: 'geloescht', globalId: 'WEG' })).toBeNull();
    });

    it('friereLieferstandEin liest die GELIEFERTE Lage einer neuen Kennung einmal — der erste Wert gewinnt', async () => {
        const j = useAenderungen();
        await j.eintragen({ art: 'lage', globalId: 'H1', nachher: ZIEL, basis: GELIEFERT });
        const B = { x: 20, y: 2, z: 5 };
        const anker = new Map([[1, GELIEFERT], [2, B]]);
        const f = fakeEngine({ anker });
        const n = useNachspielen({ engine: f.engine, aenderungen: j });
        await n.nachModellladung('m1');
        expect(n.lieferstandVon('N2')).toBeUndefined();                    // das Journal nannte B beim Laden nicht

        const erst = await n.friereLieferstandEin(['N2', 'H1']);
        expect(erst.get('N2')).toEqual(B);
        expect(erst.get('H1')).toEqual(GELIEFERT);                         // schon eingefroren: nicht neu gelesen
        anker.set(2, { x: 99, y: 2, z: 5 });                               // B „bewegt"
        expect((await n.friereLieferstandEin(['N2'])).get('N2')).toEqual(B);
        expect(f.protokoll.filter(p => p === 'ankerVon')).toHaveLength(2);  // Laden + genau EIN Nachtrag
    });
});
