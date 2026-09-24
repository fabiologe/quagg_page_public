// @vitest-environment jsdom
/**
 * Der EINE Zeiger-Stapel (Teil XVI, S1).
 *
 * Fabios Befund: „dass man nicht immer wieder das Objekt auswählt, obwohl man
 * es bearbeitet." Vorher lief jeder Klick den vollen Weg — Highlight ab/an,
 * Kamerasprung, Neueinordnung — und ein Klick während einer scharfen
 * Bearbeitung verwarf sie still (`einordne` → `abbrechen`).
 *
 * Die Handler-Methoden werden DIREKT mit Zeiger-Attrappen gerufen; die
 * Engine ist eine Attrappe in der Form der Wirklichkeit (`pickElement`
 * meldet `{gleich:true}` für denselben Schlüssel).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IfcSelectionHandler, MODI } from '../services/IfcSelectionHandler.js';

function baue({ pick = null } = {}) {
    const canvas = document.createElement('div');
    canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 });
    document.body.appendChild(canvas);
    const engine = {
        pickElement: vi.fn(async () => pick),
        clearSelection: vi.fn(async () => {}),
        hoverElement: vi.fn(async (x, y, opt) => ({ key: 'm:1', point: { x, y: 0, z: y }, normal: null, modelId: 'm', localId: 1, fang: opt?.fang ? { art: 'ecke' } : null })),
        getHitPoint: vi.fn(() => ({ x: 1, y: 2, z: 3, ox: 1, oy: 2, oz: 3, modelId: 'm' })),
        clearHover: vi.fn(),
        rechteckAuswahl: vi.fn(async () => ({ items: { m: [1, 2] }, count: 2 })),
        // Die Kamera wird mit MARKE angehalten (K2) — Griff, Rahmen und
        // Schnitt halten unabhängig voneinander.
        kameraSperren: vi.fn(),
    };
    const h = new IfcSelectionHandler({ engine, canvas });
    const ereignisse = { pick: [], leer: [], hover: [], rahmen: [], tipp: [], gesperrt: [] };
    h.onPick(r => ereignisse.pick.push(r));
    h.onClickEmpty(() => ereignisse.leer.push(1));
    h.onHover((pos, t, px) => ereignisse.hover.push({ pos, t, px }));
    h.onMarqueeSelect(r => ereignisse.rahmen.push(r));
    h.onGesperrt(t => ereignisse.gesperrt.push(t));
    return { h, engine, canvas, ereignisse };
}

const ev = (x, y, extra = {}) => ({ clientX: x, clientY: y, button: 0, pointerType: 'mouse', isPrimary: true, pointerId: 1, ...extra });
async function tipp(h, x = 300, y = 200, extra = {}) {
    h._onPointerDown(ev(x, y, extra));
    await h._onPointerUp(ev(x, y, extra));
}

beforeEach(() => { vi.useRealTimers(); });

describe('Tipp und Auswahl', () => {
    it('ein Tipp auf ein NEUES Bauteil wählt es', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 7, globalId: 'g7' } });
        await tipp(t.h);
        expect(t.engine.pickElement).toHaveBeenCalledWith(300, 200);
        expect(t.ereignisse.pick).toHaveLength(1);
        expect(t.ereignisse.pick[0].globalId).toBe('g7');
    });

    it('ein Tipp aufs SCHON GEWÄHLTE Bauteil tut nichts — kein onPick, kein Leeren', async () => {
        const t = baue({ pick: { gleich: true, key: 'm:7', modelId: 'm', localId: 7 } });
        await tipp(t.h);
        expect(t.ereignisse.pick).toHaveLength(0);
        expect(t.ereignisse.leer).toHaveLength(0);
        expect(t.engine.clearSelection).not.toHaveBeenCalled();
    });

    it('ein Tipp ins Leere leert die Auswahl', async () => {
        const t = baue({ pick: null });
        await tipp(t.h);
        expect(t.engine.clearSelection).toHaveBeenCalledTimes(1);
        expect(t.ereignisse.leer).toHaveLength(1);
    });

    it('mehr als 8 px zwischen Ab und Auf ist ein Zug (Kamera), kein Tipp', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 1 } });
        t.h._onPointerDown(ev(300, 200));
        await t.h._onPointerUp(ev(320, 200));
        expect(t.engine.pickElement).not.toHaveBeenCalled();
    });

    it('die rechte und die mittlere Maustaste gehören der Kamera', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 1 } });
        await tipp(t.h, 300, 200, { button: 2 });
        await tipp(t.h, 300, 200, { button: 1 });
        expect(t.engine.pickElement).not.toHaveBeenCalled();
    });
});

describe('Der Modus', () => {
    it('kennt genau vier Modi und weist andere laut ab', () => {
        expect(MODI).toEqual(['single', 'gesperrt', 'werkzeug', 'disabled']);
        expect(() => baue().h.setMode('kaputt')).toThrow(/unbekannter Modus/);
    });

    it('GESPERRT: ein Tipp wechselt das Subjekt nicht und meldet sich', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 9 } });
        t.h.setMode('gesperrt', { fang: true });
        await tipp(t.h);
        expect(t.engine.pickElement).not.toHaveBeenCalled();
        expect(t.ereignisse.pick).toHaveLength(0);
        expect(t.ereignisse.gesperrt).toHaveLength(1);
        expect(t.ereignisse.gesperrt[0].px).toEqual({ x: 200, y: 150 });   // Canvas-Pixel
    });

    it('WERKZEUG: kein Pick, aber der Tipp erreicht die Verbraucher', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 9 } });
        const verbraucher = vi.fn(async () => false);
        t.h.onTipp(verbraucher);
        t.h.setMode('werkzeug');
        await tipp(t.h);
        expect(verbraucher).toHaveBeenCalledTimes(1);
        expect(t.engine.pickElement).not.toHaveBeenCalled();
        expect(t.ereignisse.gesperrt).toHaveLength(0);
    });

    it('DISABLED: nichts kommt durch', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 9 } });
        const verbraucher = vi.fn(async () => true);
        t.h.onTipp(verbraucher);
        t.h.setMode('disabled');
        await tipp(t.h);
        expect(verbraucher).not.toHaveBeenCalled();
        expect(t.engine.pickElement).not.toHaveBeenCalled();
    });
});

describe('Die Verbraucherkette', () => {
    it('der erste, der zugreift, gewinnt — die Auswahl sieht den Tipp dann nicht', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 9 } });
        const reihenfolge = [];
        t.h.onTipp(async () => { reihenfolge.push('messen'); return false; });
        t.h.onTipp(async () => { reihenfolge.push('notiz'); return true; });
        t.h.onTipp(async () => { reihenfolge.push('dritter'); return true; });
        await tipp(t.h);
        expect(reihenfolge).toEqual(['messen', 'notiz']);
        expect(t.engine.pickElement).not.toHaveBeenCalled();
    });

    it('greift keiner zu, wählt der Tipp wie gewohnt', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 9 } });
        t.h.onTipp(async () => false);
        await tipp(t.h);
        expect(t.ereignisse.pick).toHaveLength(1);
    });

    it('ein werfender Verbraucher bricht die Kette nicht', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 9 } });
        t.h.onTipp(async () => { throw new Error('kaputt'); });
        await tipp(t.h);
        expect(t.ereignisse.pick).toHaveLength(1);
    });
});

describe('Schweben', () => {
    it('liefert EINEN Treffer an alle Verbraucher — mit Fang nur im gesperrten Modus', async () => {
        vi.useFakeTimers();
        const t = baue();
        t.h._onPointerMove(ev(300, 200));
        await vi.advanceTimersByTimeAsync(40);
        expect(t.engine.hoverElement).toHaveBeenCalledWith(300, 200, { fang: false });
        expect(t.ereignisse.hover).toHaveLength(1);
        expect(t.ereignisse.hover[0].px).toEqual({ x: 200, y: 150 });
        expect(t.ereignisse.hover[0].t.key).toBe('m:1');

        t.h.setMode('gesperrt', { fang: true });
        t.h._onPointerMove(ev(310, 200));
        await vi.advanceTimersByTimeAsync(40);
        expect(t.engine.hoverElement).toHaveBeenLastCalledWith(310, 200, { fang: true });
        expect(t.ereignisse.hover[1].t.fang.art).toBe('ecke');
    });

    it('ist gedrosselt: zehn Bewegungen, ein Raycast', async () => {
        vi.useFakeTimers();
        const t = baue();
        for (let i = 0; i < 10; i++) t.h._onPointerMove(ev(300 + i, 200));
        await vi.advanceTimersByTimeAsync(40);
        expect(t.engine.hoverElement).toHaveBeenCalledTimes(1);
        expect(t.engine.hoverElement).toHaveBeenCalledWith(309, 200, { fang: false });
    });

    it('auf dem Finger gibt es kein Schweben', async () => {
        vi.useFakeTimers();
        const t = baue();
        t.h._onPointerMove(ev(300, 200, { pointerType: 'touch' }));
        await vi.advanceTimersByTimeAsync(40);
        expect(t.engine.hoverElement).not.toHaveBeenCalled();
    });

    it('„überholt" (undefined) verwirft nichts beim Verbraucher', async () => {
        vi.useFakeTimers();
        const t = baue();
        t.engine.hoverElement.mockResolvedValueOnce(undefined);
        t.h._onPointerMove(ev(300, 200));
        await vi.advanceTimersByTimeAsync(40);
        expect(t.ereignisse.hover).toHaveLength(0);
    });

    it('Verlassen räumt den Treffer und sagt es allen', () => {
        const t = baue();
        t.h._onPointerLeave();
        expect(t.engine.clearHover).toHaveBeenCalled();
        expect(t.ereignisse.hover[0]).toEqual({ pos: null, t: null, px: null });
    });
});

describe('Finger', () => {
    it('ein Tipp entsteht beim Loslassen — und ein zweiter Finger verwirft ihn', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 3 } });
        t.h._onPointerDown(ev(300, 200, { pointerType: 'touch' }));
        t.h._onPointerDown(ev(400, 200, { pointerType: 'touch', isPrimary: false, pointerId: 2 }));   // Pinch
        await t.h._onPointerUp(ev(300, 200, { pointerType: 'touch' }));
        expect(t.engine.pickElement).not.toHaveBeenCalled();

        t.h._onPointerDown(ev(300, 200, { pointerType: 'touch' }));
        await t.h._onPointerUp(ev(303, 202, { pointerType: 'touch' }));
        expect(t.engine.pickElement).toHaveBeenCalledTimes(1);
    });

    it('pointercancel (Systemgeste) ist kein Tipp', async () => {
        const t = baue({ pick: { modelId: 'm', localId: 3 } });
        t.h._onPointerDown(ev(300, 200, { pointerType: 'touch' }));
        t.h._onPointerCancel();
        await t.h._onPointerUp(ev(300, 200, { pointerType: 'touch' }));
        expect(t.engine.pickElement).not.toHaveBeenCalled();
    });
});

describe('Der Rahmen', () => {
    it('Shift+Zug zieht den Rahmen im Canvas und lässt die Bibliothek rechnen', async () => {
        const t = baue();
        t.h._onPointerDown(ev(300, 200, { shiftKey: true }));
        t.h._onPointerMove(ev(320, 220, { shiftKey: true }));
        const el = t.canvas.querySelector('.cde-marquee');
        expect(el).toBeTruthy();
        expect(el.style.left).toBe('200px');       // Canvas-Pixel, nicht Client
        t.h._onPointerMove(ev(500, 400, { shiftKey: true }));
        await t.h._onPointerUp(ev(500, 400, { shiftKey: true }));
        expect(t.engine.rechteckAuswahl).toHaveBeenCalledWith(
            { x0: 300, y0: 200, x1: 500, y1: 400 }, { fullyIncluded: true });
        expect(t.ereignisse.rahmen[0]).toEqual({ items: { m: [1, 2] }, count: 2, fullyIncluded: true });
        expect(t.canvas.querySelector('.cde-marquee')).toBeNull();
    });

    it('von rechts nach links ist „Crossing" — berührt genügt', async () => {
        const t = baue();
        t.h._onPointerDown(ev(500, 400, { shiftKey: true }));
        t.h._onPointerMove(ev(300, 200, { shiftKey: true }));
        await t.h._onPointerUp(ev(300, 200, { shiftKey: true }));
        expect(t.engine.rechteckAuswahl.mock.calls[0][1]).toEqual({ fullyIncluded: false });
    });

    it('im gesperrten Modus gibt es keinen Rahmen', async () => {
        const t = baue();
        t.h.setMode('gesperrt');
        t.h._onPointerDown(ev(300, 200, { shiftKey: true }));
        t.h._onPointerMove(ev(500, 400, { shiftKey: true }));
        expect(t.canvas.querySelector('.cde-marquee')).toBeNull();
    });
});

describe('Greifen und Zug (S4)', () => {
    function mitGriff(antwort) {
        const t = baue({ pick: { modelId: 'm', localId: 1 } });
        t.engine.kameraSperren = vi.fn();
        t.canvas.setPointerCapture = vi.fn();
        t.canvas.releasePointerCapture = vi.fn();
        const zug = { start: [], bewegt: [], ende: [] };
        t.h.onGreifen(() => antwort);
        t.h.onZugStart(x => zug.start.push(x));
        t.h.onZugBewegt(x => zug.bewegt.push(x));
        t.h.onZugEnde(x => zug.ende.push(x));
        return { ...t, zug };
    }

    it('Maus: beansprucht → Kamera gesperrt, Bewegungen als Zug, Loslassen legt ab — kein Tipp, kein Pick', async () => {
        const t = mitGriff(true);
        t.h._onPointerDown(ev(300, 200));
        expect(t.engine.kameraSperren).toHaveBeenCalledWith(true, 'griff');
        expect(t.zug.start).toHaveLength(1);
        t.h._onPointerMove(ev(320, 210));
        expect(t.zug.bewegt).toHaveLength(1);
        expect(t.engine.hoverElement).not.toHaveBeenCalled();
        await t.h._onPointerUp(ev(320, 210));
        expect(t.zug.ende[0]).toMatchObject({ abbruch: false, x: 320, y: 210 });
        expect(t.engine.kameraSperren).toHaveBeenLastCalledWith(false, 'griff');
        expect(t.engine.pickElement).not.toHaveBeenCalled();
        expect(t.h.ziehtGerade()).toBe(false);
    });

    it('zugAbbrechen (Esc): Kamera frei, Capture los, onZugEnde mit abbruch=true — ein Loslassen danach tut nichts', async () => {
        const t = mitGriff(true);
        t.h._onPointerDown(ev(300, 200));
        t.h._onPointerMove(ev(320, 210));
        t.h.zugAbbrechen();
        expect(t.zug.ende[0]).toMatchObject({ abbruch: true });
        expect(t.engine.kameraSperren).toHaveBeenLastCalledWith(false, 'griff');
        expect(t.h.ziehtGerade()).toBe(false);
        await t.h._onPointerUp(ev(320, 210));
        expect(t.zug.ende).toHaveLength(1);                 // kein zweites Ende
        expect(t.engine.pickElement).not.toHaveBeenCalled();
    });

    it('Finger: „warten" armiert nach 380 ms — ein Wisch von 14 px davor bricht ab', async () => {
        vi.useFakeTimers();
        const t = mitGriff('warten');
        t.h._onPointerDown(ev(300, 200, { pointerType: 'touch' }));
        expect(t.zug.start).toHaveLength(0);
        t.h._onPointerMove(ev(320, 200, { pointerType: 'touch' }));       // Schwenk-Versuch
        await vi.advanceTimersByTimeAsync(400);
        expect(t.zug.start).toHaveLength(0);
        expect(t.engine.kameraSperren).not.toHaveBeenCalled();

        t.h._onPointerDown(ev(300, 200, { pointerType: 'touch' }));
        t.h._onPointerMove(ev(305, 203, { pointerType: 'touch' }));       // unter der Schwelle
        await vi.advanceTimersByTimeAsync(400);
        expect(t.zug.start).toHaveLength(1);
        expect(t.engine.kameraSperren).toHaveBeenCalledWith(true, 'griff');
        vi.useRealTimers();
    });

    it('pointercancel verwirft den Zug', () => {
        const t = mitGriff(true);
        t.h._onPointerDown(ev(300, 200));
        t.h._onPointerCancel(ev(300, 200));
        expect(t.zug.ende[0].abbruch).toBe(true);
        expect(t.engine.kameraSperren).toHaveBeenLastCalledWith(false, 'griff');
    });

    // ── K2: der Rahmen hält die Kamera an ────────────────────────────────
    //
    // camera-controls kennt kein Shift — links ist und bleibt ROTATE, und das
    // Zeigerereignis erreicht beide Stapel. Bis 2026-09-20 zeichnete ein
    // Shift-Zug also einen Rahmen UND drehte die Szene mit.

    it('Shift-Zug sperrt die Kamera und gibt sie beim Loslassen frei', async () => {
        const t = baue();
        t.h.setMode('single');
        t.h._onPointerDown(ev(300, 200, { shiftKey: true }));
        expect(t.engine.kameraSperren).toHaveBeenCalledWith(true, 'rahmen');
        t.h._onPointerMove(ev(360, 260, { shiftKey: true }));
        await t.h._onPointerUp(ev(360, 260, { shiftKey: true }));
        expect(t.engine.kameraSperren).toHaveBeenLastCalledWith(false, 'rahmen');
    });

    it('Shift-Klick OHNE Zug gibt die Kamera auch wieder frei', async () => {
        const t = baue();
        t.h.setMode('single');
        t.h._onPointerDown(ev(300, 200, { shiftKey: true }));
        await t.h._onPointerUp(ev(300, 200, { shiftKey: true }));
        expect(t.engine.kameraSperren).toHaveBeenLastCalledWith(false, 'rahmen');
    });

    it('ein Moduswechsel und das Abbauen lösen jede Marke — die Kamera bleibt nie hängen', () => {
        const t = baue();
        t.h.setMode('single');
        t.h._onPointerDown(ev(300, 200, { shiftKey: true }));
        t.h.setMode('werkzeug');
        expect(t.engine.kameraSperren).toHaveBeenCalledWith(false, 'rahmen');

        t.engine.kameraSperren.mockClear();
        t.h.detach();
        expect(t.engine.kameraSperren).toHaveBeenCalledWith(false, 'griff');
        expect(t.engine.kameraSperren).toHaveBeenCalledWith(false, 'rahmen');
    });

    it('kein Anspruch → der Tipp läuft wie gewohnt', async () => {
        const t = mitGriff(false);
        await tipp(t.h);
        expect(t.zug.start).toHaveLength(0);
        expect(t.ereignisse.pick).toHaveLength(1);
    });
});
