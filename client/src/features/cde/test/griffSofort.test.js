// @vitest-environment jsdom
/**
 * Teil XXXI, T4 — auf einem Griff zieht der Finger sofort (E-T2).
 *
 * Tabletlauf T0: jeder Griff brauchte 380 ms Long-Press, sonst schwenkte der Finger die Kamera. Jetzt: setzt der Finger
 * auf einem Griff auf, gehört er dem Griff — Kamera gesperrt, Zug beginnt sofort. Daneben bleibt er Kamera. Und ein Tipp
 * schreibt trotzdem nicht (Tablet-Rezept, Regel 4): erst ab ZUG_SCHWELLE_PX ist es ein Zug; ein Tipp-Griff gilt nur,
 * wenn man über ihm loslässt.
 *
 * Echter Weg: Zeiger-Ereignisse in den Zeiger-Stapel (`IfcSelectionHandler`), verdrahtet wie im Viewer mit `useGriffe`;
 * RÜB über Kommandos; geschrieben wird über das Journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { CDE_MODELL_ID } from '../services/IfcAutor.js';
import { registriereRezepte } from '../services/katalog/Katalog.js';
import { IfcSelectionHandler } from '../services/IfcSelectionHandler.js';
import { useGriffe, ZUG_SCHWELLE_PX } from '../composables/useGriffe.js';
import { TREFFER_PX } from '../services/IfcOverlay.js';
import { RUEB } from './hilfen/ruebKommandos.js';

class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}

const PX_JE_M = 40;                                       // Bildschirm = Draufsicht, 40 px je Meter
let b, ae;
beforeEach(async () => {
    repo.setBackend(new Speicher()); setActivePinia(createPinia());
    b = useBearbeitung(); ae = useAenderungen();
    for (const k of RUEB()) {
        const erg = await b.fuehreAus(k);
        if (!erg.ausgefuehrt) throw new Error(`${k.werkzeug}: ${erg.grund}`);
    }
    useIfcStore().modelList.push({ modelId: CDE_MODELL_ID, name: 'Eigenbau' });
});
afterEach(() => { repo.setBackend(null); registriereRezepte([]); vi.useRealTimers(); });

async function aufbau() {
    let unterFinger = null;
    const e = {
        knotenGriffe: () => [], schachtAnschluesse: () => [],
        zeigeGriffe: vi.fn(), griffUnter: vi.fn(() => unterFinger), griffHervorheben: vi.fn(), griffVersetzen: vi.fn(),
        zeigeZugbild: vi.fn(), overlayZeige: vi.fn(), overlayLeere: vi.fn(), geistLeeren: vi.fn(),
        blickrichtung: () => ({ x: 0, y: -1, z: 0 }),
        strahl: (x, y) => ({ origin: { x: x / PX_JE_M, y: 500, z: y / PX_JE_M }, direction: { x: 0, y: -1, z: 0 } }),
        projectToScreen: ([x, , z]) => ({ x: x * PX_JE_M, y: z * PX_JE_M }),
    };
    const nachBauen = vi.fn(async () => ({ angewandt: true }));
    const g = useGriffe({
        engine: ref(e), bearbeitung: b, aenderungen: ae,
        getSubjekt: () => b.bauteil, getTypprofil: () => b.typprofil, getBauform: () => b.einordnung?.bauform ?? null,
        getVersatz: () => ({ x: 0, y: 0, z: 0 }), getHoehenversatz: () => 0,
        holeKnotenSubjekt: async () => null, nachBauen, getWer: () => 'Fabio', melde: vi.fn(),
        farben: () => ({ accent: '#0af', warn: '#fa0', ok: '#0f0', danger: '#f00' }),
    });
    // Der Zeiger-Stapel, verdrahtet wie in `IfcViewer.vue`.
    const canvas = document.createElement('div');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 2000, height: 2000 });
    canvas.setPointerCapture = vi.fn(); canvas.releasePointerCapture = vi.fn();
    const kamera = { kameraSperren: vi.fn(), pickElement: vi.fn(async () => null), clearSelection: vi.fn(async () => {}),
                     hoverElement: vi.fn(async () => null), clearHover: vi.fn() };
    const h = new IfcSelectionHandler({ engine: kamera, canvas });
    h.onGreifen((tipp) => g.greifen(tipp));
    h.onZugStart((tipp) => g.zugStart(tipp));
    h.onZugBewegt((tipp) => g.zugBewegt(tipp));
    const enden = [];
    h.onZugEnde((ende) => { enden.push(g.zugEnde(ende)); });

    b.modusSetzen(true);
    const s = subjektAusStand('cde-LN', { wirksamerStand: ae.wirksamerStand });
    await b.einordne({ ...s, modelId: CDE_MODELL_ID, localId: 7, category: 'IFCWALL', type: 'IFCWALL' }, null);
    g.neuBauen();
    const aufSchirm = (p) => ({ x: p.x * PX_JE_M, y: p.z * PX_JE_M });
    const finger = (x, y) => ({ clientX: x, clientY: y, button: 0, pointerType: 'touch', isPrimary: true, pointerId: 7 });
    return { e, g, h, kamera, nachBauen, enden, aufSchirm, finger, zeigeAuf: (key) => { unterFinger = key; } };
}

const punkte = () => ae.wirksamerStand('erzeugt').get('cde-LN').parameter.punkte.map(p => [...p]);

describe('der Finger auf einem Griff: sofort ziehen', () => {
    it('Ecke 3 m nach Osten — der Zug beginnt beim Aufsetzen, ohne Haltezeit; die Kamera ist gesperrt', async () => {
        vi.useFakeTimers();
        const t = await aufbau();
        const ecke = t.g.griffe.value.find(x => x.werkzeug === 'stuetzpunkt-verschieben');
        const p = t.aufSchirm(ecke.pos);
        t.zeigeAuf(ecke.key);
        t.h._onPointerDown(t.finger(p.x, p.y));
        expect(t.g.zug.value?.griff.key).toBe(ecke.key);                         // vorher: erst nach 380 ms
        expect(t.kamera.kameraSperren).toHaveBeenCalledWith(true, 'griff');
        vi.useRealTimers();
        const vorher = punkte();
        t.h._onPointerMove(t.finger(p.x + 3 * PX_JE_M, p.y));
        await t.h._onPointerUp(t.finger(p.x + 3 * PX_JE_M, p.y));
        await Promise.all(t.enden);
        const verschoben = punkte().filter((q, i) => Math.abs(q[0] - vorher[i][0] - 3) < 1e-6);
        expect(verschoben).toHaveLength(1);
        expect(t.kamera.kameraSperren).toHaveBeenLastCalledWith(false, 'griff');
    });

    it('daneben bleibt der Finger Kamera — kein Zug, keine Sperre', async () => {
        const t = await aufbau();
        t.zeigeAuf(null);
        t.h._onPointerDown(t.finger(5, 5));
        expect(t.g.zug.value).toBe(null);
        expect(t.kamera.kameraSperren).not.toHaveBeenCalled();
    });
});

describe('ein Tipp schreibt nicht (Regel 4)', () => {
    it('aufsetzen, unter ZUG_SCHWELLE_PX zittern, loslassen: kein Eintrag', async () => {
        const t = await aufbau();
        const ecke = t.g.griffe.value.find(x => x.werkzeug === 'stuetzpunkt-verschieben');
        const p = t.aufSchirm(ecke.pos);
        const n = ae.eintraege.length;
        t.zeigeAuf(ecke.key);
        t.h._onPointerDown(t.finger(p.x, p.y));
        t.h._onPointerMove(t.finger(p.x + ZUG_SCHWELLE_PX.touch - 3, p.y + 2));      // 0,18 m — mehr als 1 cm
        await t.h._onPointerUp(t.finger(p.x + ZUG_SCHWELLE_PX.touch - 3, p.y + 2));
        await Promise.all(t.enden);
        expect(ae.eintraege.length).toBe(n);
        expect(t.nachBauen).not.toHaveBeenCalled();
    });

    it('ein Tipp-Griff gilt nur, wenn man über ihm loslässt — weggezogen gilt er nicht', async () => {
        const t = await aufbau();
        // Das „+" der Kante: seit Teil XXXII (K2) gleitet es AUF der Kante — weggezogen heisst hier QUER zur Kante (die
        // Wand liegt in Ost-West, quer ist die Bildschirm-y), weiter als drei Trefferflächen: gemeint war die Kamera.
        const tippGriff = t.g.griffe.value.find(x => x.wirkung === 'tipp');
        expect(tippGriff).toBeTruthy();
        const p = t.aufSchirm(tippGriff.pos);
        const n = ae.eintraege.length;
        t.zeigeAuf(tippGriff.key);
        t.h._onPointerDown(t.finger(p.x, p.y));
        t.h._onPointerMove(t.finger(p.x, p.y + 3 * TREFFER_PX + 20));
        await t.h._onPointerUp(t.finger(p.x, p.y + 3 * TREFFER_PX + 20));
        await Promise.all(t.enden);
        expect(ae.eintraege.length).toBe(n);                                       // weggezogen: nichts
        t.h._onPointerDown(t.finger(p.x, p.y));
        t.h._onPointerMove(t.finger(p.x + 6, p.y));
        await t.h._onPointerUp(t.finger(p.x + 6, p.y));
        await Promise.all(t.enden);
        expect(ae.eintraege.length).toBeGreaterThan(n);                            // darüber losgelassen: gilt
    });
});
