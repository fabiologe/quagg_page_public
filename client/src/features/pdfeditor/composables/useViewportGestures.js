/**
 * useViewportGestures — Navigations-Maschine des Viewports:
 * Ein-Finger-Pan (mit Trägheit), Zwei-Finger-Pinch, Strg+Rad-Zoom.
 *
 * Bewusst OHNE eigene Pointer-Listener: Wer ein Pointer-Ereignis für
 * Navigation hält, RUFT diese Handler (Stufe 1: der Scroller direkt;
 * Stufe 2: usePointerTools, das Stift/Finger nach den Konfliktregeln
 * routet). So bleibt die Gestenmathematik frei von Werkzeuglogik.
 *
 * Pinch-Mechanik: Während der Geste wird NUR ein CSS-Transform auf den
 * Seiten-Host gelegt (billig, 60 fps); der Fokuspunkt bleibt unter den
 * Fingern. Erst am Gestenende wird der Zoom committet, das Layout neu
 * gerechnet und die Scrollposition um den Fokus erhalten — dann rendern
 * die Seiten scharf nach (Standard-pdf.js-Viewer-Ansatz).
 */

import { ref, nextTick } from 'vue';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SCHRITT } from '../stores/useViewStore';

/**
 * @param {() => Array<{top:number, left:number, hoehe:number, breite:number}>} [layout]
 *   Aktuelles Seitenlayout (CSS-px). Damit rechnet der Zoom EXAKT über
 *   Seitenanker statt über die lineare Näherung — Ränder und Seitenlücken
 *   skalieren nicht mit dem Zoom, die Näherung driftet sonst vom Fokus weg.
 */
export function useViewportGestures({ scrollerRef, viewStore, layout = null }) {
    const zeiger = new Map();          // pointerId → { x, y } (Viewport-Koordinaten)
    const ignoriert = new Set();       // Restfinger nach Pinch-Commit bis zum Lift

    // CSS-Transform des Hosts während des Pinchs ('' = keine Geste)
    const gestenTransform = ref('');

    let pan = null;                    // { scroll0:{l,t}, p0:{x,y}, vx, vy, tLetzt, pLetzt }
    let pinch = null;                  // { dist0, zoom0, scroll0:{l,t}, cp:{x,y} }
    let traegheitLaeuft = false;

    function _viewportKoord(ev) {
        const r = scrollerRef.value.getBoundingClientRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }

    function _klemmZoom(z) {
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    }

    // ── Exakte Zoom-Anker über das Seitenlayout ─────────────────────────────

    /** Host-Punkt → { seite, xPt, yPt } (Seitenpunkte, unbeschnitten). */
    function _inhaltAnker(hostX, hostY) {
        const l = layout?.();
        if (!l?.length) return null;
        let i = 0;
        for (let k = 0; k < l.length; k++) {
            if (l[k].top <= hostY) i = k;
            else break;
        }
        const zoom = viewStore.zoom;
        return {
            seite: i,
            xPt: (hostX - l[i].left) / zoom,
            yPt: (hostY - l[i].top) / zoom,
        };
    }

    /** Anker → Host-Punkt im (nach dem Zoom-Commit neuen) Layout. */
    function _ankerZuHost(anker) {
        const l = layout?.();
        const s = l?.[anker.seite];
        if (!s) return null;
        const zoom = viewStore.zoom;
        return { x: s.left + anker.xPt * zoom, y: s.top + anker.yPt * zoom };
    }

    // ── Pan ─────────────────────────────────────────────────────────────────

    function _startePan(p) {
        const el = scrollerRef.value;
        pan = {
            scroll0: { l: el.scrollLeft, t: el.scrollTop },
            p0: p, pLetzt: p, tLetzt: performance.now(), vx: 0, vy: 0,
        };
    }

    function _bewegePan(p) {
        if (!pan) return;
        const el = scrollerRef.value;
        el.scrollLeft = pan.scroll0.l - (p.x - pan.p0.x);
        el.scrollTop  = pan.scroll0.t - (p.y - pan.p0.y);
        const t = performance.now();
        const dt = Math.max(1, t - pan.tLetzt);
        // Geschwindigkeit leicht geglättet — ein einzelner Ausreißer-Frame
        // soll die Trägheit nicht in eine falsche Richtung schießen.
        pan.vx = 0.8 * ((p.x - pan.pLetzt.x) / dt) + 0.2 * pan.vx;
        pan.vy = 0.8 * ((p.y - pan.pLetzt.y) / dt) + 0.2 * pan.vy;
        pan.pLetzt = p; pan.tLetzt = t;
    }

    function _beendePanMitTraegheit() {
        if (!pan) return;
        let { vx, vy } = pan;
        pan = null;
        if (Math.hypot(vx, vy) < 0.08) return;   // px/ms — zu langsam für Schwung
        traegheitLaeuft = true;
        let tLetzt = performance.now();
        const schritt = () => {
            if (!traegheitLaeuft) return;
            const el = scrollerRef.value;
            if (!el) { traegheitLaeuft = false; return; }
            const t = performance.now();
            const dt = t - tLetzt; tLetzt = t;
            el.scrollLeft -= vx * dt;
            el.scrollTop  -= vy * dt;
            const abkling = Math.pow(0.94, dt / 16);
            vx *= abkling; vy *= abkling;
            if (Math.hypot(vx, vy) < 0.02) { traegheitLaeuft = false; return; }
            requestAnimationFrame(schritt);
        };
        requestAnimationFrame(schritt);
    }

    function stoppeTraegheit() { traegheitLaeuft = false; }

    // ── Pinch ───────────────────────────────────────────────────────────────

    function _startePinch() {
        const [a, b] = [...zeiger.values()];
        const el = scrollerRef.value;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const cp = { x: el.scrollLeft + mid.x, y: el.scrollTop + mid.y };
        pinch = {
            dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            zoom0: viewStore.zoom,
            scroll0: { l: el.scrollLeft, t: el.scrollTop },
            // Fokuspunkt in Host-Koordinaten (aktuelles Layout) — bleibt unter den Fingern
            cp,
            // Seiten-Anker für den EXAKTEN Commit (Ränder skalieren nicht mit)
            anker: _inhaltAnker(cp.x, cp.y),
        };
        pan = null;
        viewStore.gesteAktiv = true;
    }

    function _bewegePinch() {
        if (!pinch) return;
        const [a, b] = [...zeiger.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        // k so klemmen, dass der committete Zoom in den Grenzen bleibt —
        // sonst springt das Bild am Gestenende zurück.
        const k = _klemmZoom(pinch.zoom0 * (dist / pinch.dist0)) / pinch.zoom0;
        const tx = mid.x + pinch.scroll0.l - pinch.cp.x * k;
        const ty = mid.y + pinch.scroll0.t - pinch.cp.y * k;
        pinch.k = k;
        pinch.midEnde = mid;
        gestenTransform.value = `translate(${tx}px, ${ty}px) scale(${k})`;
    }

    async function _beendePinch() {
        if (!pinch) return;
        const { zoom0, cp, k = 1, midEnde, anker } = pinch;
        pinch = null;
        gestenTransform.value = '';
        const neuerZoom = _klemmZoom(zoom0 * k);
        const f = neuerZoom / zoom0;
        viewStore.setzeZoom(neuerZoom);
        await nextTick();               // Layout mit neuem Zoom steht jetzt
        const el = scrollerRef.value;
        if (el && midEnde) {
            const ziel = (anker && _ankerZuHost(anker)) ?? { x: cp.x * f, y: cp.y * f };
            el.scrollLeft = ziel.x - midEnde.x;
            el.scrollTop  = ziel.y - midEnde.y;
        }
        viewStore.gesteAktiv = false;
    }

    // ── Rad-Zoom (Strg+Rad; Trackpad-Pinch kommt als Strg+Rad an) ───────────

    let zoomKette = Promise.resolve();

    /**
     * SERIALISIERT: Rad-Bursts (Trackpad-Pinch feuert dutzende Events pro
     * Sekunde) dürfen sich nicht überlappen — zwei parallele Commits lesen
     * sonst veraltete Scrollwerte, die Fehler multiplizieren sich und der
     * Fokuspunkt springt sichtbar weg.
     */
    function zoomeUm(faktor, fokus) {
        zoomKette = zoomKette.then(() => _zoomCommit(faktor, fokus)).catch(() => {});
        return zoomKette;
    }

    async function _zoomCommit(faktor, fokus) {
        const el = scrollerRef.value;
        if (!el) return;
        const z0 = viewStore.zoom;
        const z1 = _klemmZoom(z0 * faktor);
        if (z1 === z0) return;
        const hostX = el.scrollLeft + fokus.x;
        const hostY = el.scrollTop + fokus.y;
        const anker = _inhaltAnker(hostX, hostY);
        const f = z1 / z0;
        viewStore.setzeZoom(z1);
        await nextTick();
        const ziel = (anker && _ankerZuHost(anker)) ?? { x: hostX * f, y: hostY * f };
        el.scrollLeft = ziel.x - fokus.x;
        el.scrollTop  = ziel.y - fokus.y;
    }

    // ── Öffentliche Handler (werden vom Pointer-Router gerufen) ─────────────

    function onNavPointerDown(ev) {
        stoppeTraegheit();
        const p = _viewportKoord(ev);
        zeiger.set(ev.pointerId, p);
        if (zeiger.size === 1) {
            _startePan(p);
        } else if (zeiger.size === 2) {
            _startePinch();
        }
        // 3+ Finger: die ersten beiden bleiben maßgeblich, Rest läuft leer mit.
    }

    function onNavPointerMove(ev) {
        if (ignoriert.has(ev.pointerId) || !zeiger.has(ev.pointerId)) return;
        zeiger.set(ev.pointerId, _viewportKoord(ev));
        if (pinch) _bewegePinch();
        else if (pan) _bewegePan(_viewportKoord(ev));
    }

    function onNavPointerUp(ev) {
        ignoriert.delete(ev.pointerId);
        if (!zeiger.delete(ev.pointerId)) return;
        if (pinch && zeiger.size < 2) {
            _beendePinch();
            // Der Restfinger darf nicht nahtlos zum Pan werden — das ruckt.
            for (const id of zeiger.keys()) ignoriert.add(id);
        } else if (pan && zeiger.size === 0) {
            _beendePanMitTraegheit();
        }
    }

    function onNavPointerCancel(ev) {
        ignoriert.delete(ev.pointerId);
        zeiger.delete(ev.pointerId);
        if (pinch && zeiger.size < 2) _beendePinch();
        if (zeiger.size === 0) pan = null;
    }

    function onWheel(ev) {
        if (!ev.ctrlKey) return;        // normales Rad = natives Scrollen
        ev.preventDefault();
        const faktor = ev.deltaY < 0 ? ZOOM_SCHRITT : 1 / ZOOM_SCHRITT;
        zoomeUm(faktor, _viewportKoord(ev));
    }

    /**
     * Harte Übernahme durch den Stift: laufender Finger-Pan/Pinch wird
     * verworfen (ohne Zoom-Commit — der Stift setzt gleich zum Strich an).
     */
    function brichAlle() {
        stoppeTraegheit();
        zeiger.clear();
        ignoriert.clear();
        pan = null;
        if (pinch) {
            pinch = null;
            gestenTransform.value = '';
            viewStore.gesteAktiv = false;
        }
    }

    /**
     * Pinch-Umwandlung (Karenzfenster): zwei bereits GEDRÜCKTE Zeiger werden
     * nachträglich zur Geste — mit ihren aktuellen Positionen.
     */
    function uebernimmZeiger(paare) {
        for (const { pointerId, x, y } of paare) {
            const r = scrollerRef.value.getBoundingClientRect();
            zeiger.set(pointerId, { x: x - r.left, y: y - r.top });
        }
        if (zeiger.size >= 2) _startePinch();
        else if (zeiger.size === 1) _startePan([...zeiger.values()][0]);
    }

    return {
        gestenTransform,
        onNavPointerDown, onNavPointerMove, onNavPointerUp, onNavPointerCancel,
        onWheel, zoomeUm, stoppeTraegheit, brichAlle, uebernimmZeiger,
    };
}
