// @vitest-environment jsdom
/**
 * Geführtes Ziehen (Stufe 9.3).
 *
 * Drei Zusagen, und alle drei sind so, dass ihr Bruch NICHT auffällt:
 *
 * 1. EIN Journaleintrag je Zug, beim Loslassen. Einer je Mausbewegung füllte
 *    das Journal mit hunderten Schritten, und „zurück" bräuchte hunderte Klicks
 *    für einen sichtbaren Effekt.
 *
 * 2. `basis` ist der Anker im GELIEFERTEN Modell, nicht die Lage beim
 *    Anfassen. Nähme man die aktuelle, wäre `basis` nach dem ersten Zug gleich
 *    `nachher` — der Drei-Wege-Vergleich vergliche gegen sich selbst, und jeder
 *    Konflikt fiele still durch.
 *
 * 3. Scheitert das Verschieben am Modell, BLEIBT der Journaleintrag stehen. Er
 *    ist die Absicht; das Nachspielen versucht es beim nächsten Laden erneut.
 *    Ihn zu löschen hiesse, die Festlegung stillschweigend zu verlieren.
 *
 * Der Gizmo selbst wird nicht geprüft — `TransformControls` braucht einen
 * Renderer. Geprüft wird, was daraus FOLGT.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import * as THREE from 'three';
import { useZiehen } from '../composables/useZiehen.js';
import { useAenderungen } from '../stores/useAenderungen.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const GELIEFERT = { x: 10, y: 2, z: 5 };
const BAUTEIL = { modelId: 'm1', localId: 42, globalId: 'H12' };
const LINEAR = { bauform: 'achse+profil', guete: 'gemessen' };

/** Eine Welt, die three.js zufriedenstellt, ohne WebGL. */
function fakeWelt() {
    const szene = new THREE.Group();
    return {
        scene: { three: szene },
        camera: { three: new THREE.PerspectiveCamera(), controls: { enabled: true } },
        renderer: { three: { domElement: document.createElement('canvas') } },
    };
}

// Vorgabe-Achse nach OSTEN: dann ist lokal X gleich Welt X, und die Tests, die
// vom Achssystem gar nicht handeln, rechnen weiter in Weltkoordinaten. Wer die
// Drehung prüfen will, setzt eine andere Achse — dann ist auch klar, dass er
// genau sie meint.
function fakeEngine({ anker = GELIEFERT, setzeOk = true, achse = [[0, 0, 0], [10, 0, 0]] } = {}) {
    const welt = fakeWelt();
    return {
        welt,
        engine: ref({
            _getWorld: () => welt,
            ankerVon: vi.fn(async (_m, ids) => new Map(ids.map(i => [i, { ...anker }]))),
            setzeAnker: vi.fn(async () => (setzeOk
                ? { ok: true, versatz: { dx: 1, dy: 0, dz: 0 } }
                : { ok: false, grund: 'kein_editor' })),
            // Die Achse kommt aus dem GeometryResolver — nicht aus der
            // Platzierung: welche lokale Achse „entlang des Rohrs" zeigt,
            // hängt am Autorensystem.
            makeGeometryResolver: () => ({
                forElements: () => ({
                    getForm: async (form) => (form === 'axis'
                        ? { perElement: [{ polyline: achse }] }
                        : { data: null }),
                }),
            }),
        }),
    };
}

/** Nachspielen-Attrappe mit eingefrorenem Lieferstand. */
function fakeNachspielen(karte = new Map([['H12', GELIEFERT]])) {
    return {
        lieferstandVon: (gid) => karte.get(gid),
        merkeLieferstand: vi.fn((gid, a) => { if (!karte.has(gid)) karte.set(gid, a); }),
        _karte: karte,
    };
}

function bau(opts = {}) {
    const f = fakeEngine(opts.engine ?? {});
    const aenderungen = useAenderungen();
    const nachspielen = opts.nachspielen ?? fakeNachspielen();
    const ziehen = useZiehen({
        engine: f.engine,
        getAuswahl: () => BAUTEIL,
        getModellSha: () => 'sha1',
        aenderungen, bearbeitung: { einordnung: LINEAR },
        nachspielen, cde: { bearbeiter: 'Fabio' },
    });
    return { ...f, ziehen, aenderungen, nachspielen };
}

/** Einen Zug nachstellen: anhängen, Pivot bewegen, loslassen. */
async function ziehe(t, weg) {
    await t.ziehen.anhaengen(BAUTEIL, LINEAR);
    const pivot = t.ziehen.gizmo.value.object;
    pivot.position.set(weg.x ?? 0, weg.y ?? 0, weg.z ?? 0);
    t.ziehen.gizmo.value.dispatchEvent({ type: 'dragging-changed', value: true });
    t.ziehen.gizmo.value.dispatchEvent({ type: 'dragging-changed', value: false });
    await new Promise(r => setTimeout(r, 0));
}

describe('Der Griff hängt sich an', () => {
    it('hängt sich an ein lineares Bauteil mit gemessener Achse', async () => {
        const t = bau();
        expect(await t.ziehen.anhaengen(BAUTEIL, LINEAR)).toBe(true);
        expect(t.ziehen.aktiv.value).toBe(true);
        expect(t.ziehen.gizmo.value).toBeTruthy();
    });

    it('verweigert bei geschätzter Achse UND sagt warum', async () => {
        const t = bau();
        const ok = await t.ziehen.anhaengen(BAUTEIL, { bauform: 'achse+profil', guete: 'geschaetzt' });
        expect(ok).toBe(false);
        expect(t.ziehen.aktiv.value).toBe(false);
        expect(t.ziehen.grund.value).toMatch(/geschätzt/);
    });

    it('setzt die Freiheitsgrade der Bauform an den Gizmo', async () => {
        const t = bau();
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        const g = t.ziehen.gizmo.value;
        expect([g.showX, g.showY, g.showZ]).toEqual([true, true, false]);
        expect(g.space).toBe('local');
        expect(g.translationSnap).toBeGreaterThan(0);
    });

    it('meldet ein Bauteil ohne Hülle, statt einen Griff ins Leere zu setzen', async () => {
        const t = bau();
        t.engine.value.ankerVon = vi.fn(async () => new Map());
        expect(await t.ziehen.anhaengen(BAUTEIL, LINEAR)).toBe(false);
        expect(t.ziehen.grund.value).toMatch(/ohne Hülle/);
    });
});

describe('Ein Zug — ein Eintrag', () => {
    it('schreibt beim Loslassen genau EINEN Eintrag', async () => {
        const t = bau();
        await ziehe(t, { x: 1.5 });
        expect(t.aenderungen.eintraege).toHaveLength(1);
        expect(t.aenderungen.eintraege[0].art).toBe('lage');
    });

    it('trägt den ZIELANKER ein, nicht den Weg', async () => {
        const t = bau();
        await ziehe(t, { x: 1.5 });
        expect(t.aenderungen.eintraege[0].nachher).toEqual({ x: 11.5, y: 2, z: 5 });
    });

    it('nimmt als basis den LIEFERSTAND, nicht die Lage beim Anfassen', async () => {
        // Der Kern. Das Bauteil liegt schon verschoben im Modell (11.0), der
        // Lieferstand sagt aber 10.0 — und der ist der Bezugspunkt.
        const t = bau({ engine: { anker: { x: 11, y: 2, z: 5 } } });
        await ziehe(t, { x: 0.5 });
        expect(t.aenderungen.eintraege[0].basis).toEqual(GELIEFERT);
        expect(t.aenderungen.eintraege[0].nachher).toEqual({ x: 11.5, y: 2, z: 5 });
    });

    it('merkt den Lieferstand nach, wenn das Journal das Bauteil nicht nannte', async () => {
        const leer = fakeNachspielen(new Map());
        const t = bau({ nachspielen: leer });
        await ziehe(t, { x: 1 });
        expect(leer.merkeLieferstand).toHaveBeenCalledWith('H12', GELIEFERT);
        expect(t.aenderungen.eintraege[0].basis).toEqual(GELIEFERT);
    });

    it('schreibt NICHTS, solange gezogen wird', async () => {
        const t = bau();
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        t.ziehen.gizmo.value.object.position.set(1, 0, 0);
        t.ziehen.gizmo.value.dispatchEvent({ type: 'dragging-changed', value: true });
        await new Promise(r => setTimeout(r, 0));
        expect(t.aenderungen.eintraege).toHaveLength(0);
        expect(t.ziehen.zieht.value).toBe(true);
    });

    it('schreibt keinen Eintrag, wenn nichts bewegt wurde', async () => {
        const t = bau();
        await ziehe(t, { x: 0 });
        expect(t.aenderungen.eintraege).toHaveLength(0);
    });
});

describe('Die Kamera hält still, solange gezogen wird', () => {
    it('sperrt beim Anfassen und gibt beim Loslassen frei', async () => {
        const t = bau();
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        t.ziehen.gizmo.value.dispatchEvent({ type: 'dragging-changed', value: true });
        expect(t.welt.camera.controls.enabled).toBe(false);
        t.ziehen.gizmo.value.dispatchEvent({ type: 'dragging-changed', value: false });
        await new Promise(r => setTimeout(r, 0));
        expect(t.welt.camera.controls.enabled).toBe(true);
    });
});

describe('Wenn das Verschieben scheitert', () => {
    it('LÄSST DEN EINTRAG STEHEN und meldet den Grund', async () => {
        // Er ist die Absicht. Das Nachspielen versucht es beim nächsten Laden
        // erneut; ihn zu löschen hiesse, die Festlegung still zu verlieren.
        const t = bau({ engine: { setzeOk: false } });
        await ziehe(t, { x: 1.5 });
        expect(t.aenderungen.eintraege).toHaveLength(1);
        expect(t.ziehen.grund.value).toMatch(/kein_editor/);
    });
});

describe('loesen', () => {
    it('nimmt den Griff weg und räumt die Szene auf', async () => {
        const t = bau();
        const vorher = t.welt.scene.three.children.length;
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        expect(t.welt.scene.three.children.length).toBeGreaterThan(vorher);
        t.ziehen.loesen();
        expect(t.ziehen.aktiv.value).toBe(false);
        expect(t.ziehen.gizmo.value).toBe(null);
    });
});


describe('Die Abhängigkeiten sind Getter, keine Refs', () => {
    it('findet die Auswahl über umschalten() — der Fehler, der es unbenutzbar machte', async () => {
        // Die erste Fassung nahm `ifc` entgegen und las `ifc.value.selectedElement`.
        // `ifc` ist im Viewer aber der Pinia-STORE, kein Ref — `.value` war
        // damit immer undefined, und das Werkzeug meldete ewig „Erst ein
        // Bauteil wählen". Ein Getter kann man nicht falsch herum anfassen.
        const t = bau();
        expect(await t.ziehen.umschalten()).toBe(true);
        expect(t.ziehen.aktiv.value).toBe(true);
    });

    it('sagt es, wenn wirklich nichts gewählt ist', async () => {
        const f = fakeEngine();
        const ziehen = useZiehen({
            engine: f.engine, getAuswahl: () => null, getModellSha: () => null,
            aenderungen: useAenderungen(), bearbeitung: { einordnung: LINEAR },
            nachspielen: fakeNachspielen(), cde: {},
        });
        expect(await ziehen.umschalten()).toBe(false);
        expect(ziehen.grund.value).toMatch(/Bauteil wählen/);
    });

    it('schreibt die Modell-Kennung aus dem Getter ins Journal', async () => {
        const t = bau();
        await ziehe(t, { x: 1.5 });
        expect(t.aenderungen.eintraege[0].modellSha).toBe('sha1');
    });
});


describe('Der Griff steht auf der BAUTEILACHSE, nicht auf den Weltachsen', () => {
    /**
     * Der Befund an Fabios erstem echten IFC4-Kanalnetz (31.08.2026).
     *
     * `freiheitsgradeFuer` gibt für `achse+profil` X und Y frei und sperrt Z —
     * gemeint ist „entlang der Achse und in der Höhe, aber nicht seitlich aus
     * dem Graben". Der Träger wurde aber NIE gedreht, und damit war lokal
     * gleich Welt: dieselbe Regel bedeutete plötzlich „Ost-West und Höhe, aber
     * nicht Nord-Süd". Bei einem Netz, das in alle Richtungen läuft, ist das
     * willkürlich — und es sieht wie Absicht aus.
     */
    it('dreht lokal X auf die Achsrichtung', async () => {
        // Eine Haltung, die nach NORDEN läuft (Welt-Z).
        const t = bau({ engine: { achse: [[0, 0, 0], [0, 0, 10]] } });
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        const traeger = t.ziehen.gizmo.value.object.parent;

        const lokalX = new THREE.Vector3(1, 0, 0).applyQuaternion(traeger.quaternion);
        expect(lokalX.x).toBeCloseTo(0, 6);
        expect(lokalX.z).toBeCloseTo(1, 6);      // zeigt nach Norden, wie die Haltung
    });

    it('hält lokal Y auf der WELT-Höhe, nicht auf irgendeiner Senkrechten', async () => {
        // Sonst zeigte der Höhengriff schräg, und „400 mm tiefer" wäre es nicht.
        const t = bau({ engine: { achse: [[0, 0, 0], [7, 0, 7]] } });
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        const traeger = t.ziehen.gizmo.value.object.parent;

        const lokalY = new THREE.Vector3(0, 1, 0).applyQuaternion(traeger.quaternion);
        expect(lokalY.y).toBeCloseTo(1, 6);
    });

    it('rechnet den Weg IN DIE WELT zurück', async () => {
        // Der Kern. Der Pivot bewegt sich im Achssystem: „1,50 m entlang des
        // Rohrs". Der Journalwert ist ein WELTanker. Ohne Rückrechnung landete
        // jede Haltung, die nicht zufällig entlang X liegt, falsch — und zwar
        // nur die schrägen, was wie ein Anzeigefehler aussähe.
        const t = bau({ engine: { achse: [[0, 0, 0], [0, 0, 10]] } });
        await ziehe(t, { x: 1.5 });               // 1,5 entlang der ACHSE

        // Achse zeigt nach Norden ⇒ der Weltversatz muss in Z liegen, nicht X.
        expect(t.aenderungen.eintraege[0].nachher).toEqual({ x: 10, y: 2, z: 6.5 });
    });

    it('fällt auf Weltachsen zurück und SAGT es, wenn keine Achse da ist', async () => {
        // Schweigend auf Weltachsen zu wechseln wäre schlimmer als der Fehler:
        // der Griff sähe gleich aus und zwänge anders.
        const t = bau({ engine: { achse: [] } });
        await t.ziehen.anhaengen(BAUTEIL, LINEAR);
        expect(t.ziehen.gizmo.value.space).toBe('world');
        expect(t.ziehen.warnung.value).toMatch(/Weltachsen/);
    });

    it('lässt einen KÖRPER in Weltachsen — dort gibt es keine Vorzugsrichtung', async () => {
        const t = bau();
        await t.ziehen.anhaengen(BAUTEIL, { bauform: 'koerper', guete: 'gemessen' });
        expect(t.ziehen.gizmo.value.space).toBe('world');
        expect(t.ziehen.warnung.value).toBe('');
    });
});

describe('Die Szene bleibt sauber', () => {
    it('nimmt den TRÄGER wieder heraus, nicht nur den Gizmo-Helfer', async () => {
        // Die erste Fassung schrieb Träger und Helfer beide in `_helper`, die
        // zweite Zuweisung gewann, und der Träger blieb bei JEDEM Zug in der
        // Szene stehen. `scene.remove(_pivot)` half nicht — der Pivot hängt am
        // Träger, nicht an der Szene. Ein wirkungsloser Aufruf, der aussah wie
        // Aufräumen.
        const t = bau();
        const vorher = t.welt.scene.three.children.length;
        for (let i = 0; i < 3; i++) {
            await t.ziehen.anhaengen(BAUTEIL, LINEAR);
            t.ziehen.loesen();
        }
        expect(t.welt.scene.three.children.length).toBe(vorher);
    });
});
