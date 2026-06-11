import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';

const CLICK_TOLERANCE_PX = 8;          // > 8 px Bewegung zwischen down/up → Drag, kein Click
const HOVER_THROTTLE_MS  = 30;         // Debounce für hoverElement
const MARQUEE_MIN_PX     = 6;          // Minimum-Größe damit Marquee nicht aus Versehen losgeht

const MARQUEE_SELECTION_STYLE = {
    color:         new THREE.Color(0.0, 1.0, 0.08),
    renderedFaces: FRAGS.RenderedFaces.TWO,
    opacity:       1.0,
    transparent:   false,
};

/**
 * IfcSelectionHandler — bündelt alle Maus-Interaktionen für Selection + Hover
 * + Marquee/Window-Select. Hängt sich selbst an ein Canvas-Element und dispatcht
 * Events per Callback-Subscription.
 *
 * Konsumer (IfcViewer.vue):
 *   selection = new IfcSelectionHandler({ engine, canvas });
 *   selection.attach();
 *   selection.onPick(result => { ifc.setElement(result); ... });
 *   selection.onClickEmpty(() => ifc.clearElement());
 *   selection.onHover(point => { coordBar.value = point; });
 *   selection.onMarqueeSelect(items => { ... });
 *
 * Modi werden über setMode() umgeschaltet:
 *   'single'   — Standard: Click selektiert, Shift+Drag = Marquee
 *   'disabled' — Handler ignoriert Events (z. B. wenn Measure-Tool aktiv ist)
 *
 * Modifier-Tasten beim Click:
 *   keine  → Single-Select (vorherige Auswahl wird verworfen)
 *   Ctrl   → Toggle in Multi-Select-Set
 *   Shift  → Add zum Multi-Select-Set
 *   Alt    → Subtract aus Multi-Select-Set
 */
export class IfcSelectionHandler {
    constructor({ engine, canvas }) {
        this._engine  = engine;
        this._canvas  = canvas;
        this._mode    = 'single';

        // Click-Tracking
        this._mouseDownAt = null;
        this._hoverTimer  = null;
        this._lastMouse   = null;

        // Marquee
        this._marqueeStart = null;     // {x, y} oder null
        this._marqueeEl    = null;     // DIV-Overlay
        this._marqueeActive = false;

        // Callback-Listen
        this._onPickCbs        = [];
        this._onClickEmptyCbs  = [];
        this._onHoverCbs       = [];
        this._onMarqueeCbs     = [];

        // Bound listeners damit attach/detach symmetrisch ist
        this._boundDown   = (e) => this._onMouseDown(e);
        this._boundMove   = (e) => this._onMouseMove(e);
        this._boundUp     = (e) => this._onMouseUp(e);
        this._boundLeave  = ()  => this._onMouseLeave();
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    attach() {
        if (!this._canvas) return;
        this._canvas.addEventListener('mousedown', this._boundDown);
        this._canvas.addEventListener('mousemove', this._boundMove);
        this._canvas.addEventListener('mouseup',   this._boundUp);
        this._canvas.addEventListener('mouseleave', this._boundLeave);
    }

    detach() {
        if (!this._canvas) return;
        this._canvas.removeEventListener('mousedown', this._boundDown);
        this._canvas.removeEventListener('mousemove', this._boundMove);
        this._canvas.removeEventListener('mouseup',   this._boundUp);
        this._canvas.removeEventListener('mouseleave', this._boundLeave);
        this._removeMarqueeEl();
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
    }

    // ── Mode / Enabled ───────────────────────────────────────────────────────

    setMode(mode) {
        this._mode = mode;
        if (mode === 'disabled') {
            // Laufende Marquee-Geste abbrechen
            this._removeMarqueeEl();
            this._marqueeActive = false;
            this._marqueeStart  = null;
            this._mouseDownAt   = null;
        }
    }

    getMode() { return this._mode; }

    // ── Subscriptions ────────────────────────────────────────────────────────

    onPick(cb)         { this._onPickCbs.push(cb); }
    onClickEmpty(cb)   { this._onClickEmptyCbs.push(cb); }
    onHover(cb)        { this._onHoverCbs.push(cb); }
    onMarqueeSelect(cb){ this._onMarqueeCbs.push(cb); }

    _emit(list, ...args) {
        for (const cb of list) {
            try { cb(...args); } catch (e) { console.warn('[Selection] callback error:', e); }
        }
    }

    // ── Mouse Events ─────────────────────────────────────────────────────────

    _onMouseDown(e) {
        if (this._mode === 'disabled') return;
        if (e.button !== 0) return;     // nur Links-Klick — Mitte/Rechts ist Orbit/Pan

        this._mouseDownAt = { x: e.clientX, y: e.clientY };
        if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }

        // Shift + Drag = Marquee. Start jetzt notieren, eigentliche Marquee-DIV
        // entsteht erst wenn die Bewegungs-Schwelle überschritten ist.
        if (e.shiftKey) {
            this._marqueeStart  = { x: e.clientX, y: e.clientY };
            this._marqueeActive = false;
        }
    }

    _onMouseMove(e) {
        if (this._mode === 'disabled') return;

        this._lastMouse = { x: e.clientX, y: e.clientY };

        // ── Marquee-Update ──
        if (this._marqueeStart) {
            const dx = e.clientX - this._marqueeStart.x;
            const dy = e.clientY - this._marqueeStart.y;
            if (!this._marqueeActive && Math.hypot(dx, dy) > MARQUEE_MIN_PX) {
                this._marqueeActive = true;
                this._createMarqueeEl();
            }
            if (this._marqueeActive) {
                this._updateMarqueeEl(this._marqueeStart, { x: e.clientX, y: e.clientY });
                return; // während Marquee kein Hover-Highlight
            }
        }

        // ── Hover (gedrosselt) ──
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        this._hoverTimer = setTimeout(() => {
            const m = this._lastMouse;
            if (!m) return;
            this._engine?.hoverElement(m.x, m.y);
            const pos = this._engine?.getHitPoint();
            this._emit(this._onHoverCbs, pos);
        }, HOVER_THROTTLE_MS);
    }

    async _onMouseUp(e) {
        if (this._mode === 'disabled') return;
        if (e.button !== 0) return;

        // Marquee fertigstellen
        if (this._marqueeActive) {
            const end   = { x: e.clientX, y: e.clientY };
            const start = this._marqueeStart;
            this._marqueeActive = false;
            this._marqueeStart  = null;
            this._removeMarqueeEl();
            this._mouseDownAt = null;
            await this._finishMarquee(start, end);
            return;
        }
        // Shift-Click ohne Drag → kein Marquee, fällt durch zum normalen Click
        this._marqueeStart = null;

        if (!this._mouseDownAt) return;
        const dx = e.clientX - this._mouseDownAt.x;
        const dy = e.clientY - this._mouseDownAt.y;
        const downX = this._mouseDownAt.x;
        const downY = this._mouseDownAt.y;
        this._mouseDownAt = null;

        if (Math.hypot(dx, dy) > CLICK_TOLERANCE_PX) return; // Drag, kein Click

        // Modifier → später für Multi-Select erweitern; aktuell nur Single-Select
        // const modifier = e.ctrlKey ? 'toggle' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'single';

        const result = await this._engine?.pickElement(downX, downY);
        if (result) {
            this._emit(this._onPickCbs, result);
        } else {
            await this._engine?.clearSelection();
            this._emit(this._onClickEmptyCbs);
        }
    }

    _onMouseLeave() {
        if (this._mode === 'disabled') return;
        if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }
        this._lastMouse = null;
        this._engine?.clearHover();
        this._emit(this._onHoverCbs, null);
    }

    // ── Marquee Overlay ──────────────────────────────────────────────────────

    _createMarqueeEl() {
        if (this._marqueeEl) return;
        const el = document.createElement('div');
        el.style.position       = 'fixed';
        el.style.border         = '1px dashed #00e676';
        el.style.background     = 'rgba(0, 230, 118, 0.10)';
        el.style.pointerEvents  = 'none';
        el.style.zIndex         = '9999';
        document.body.appendChild(el);
        this._marqueeEl = el;
    }

    _updateMarqueeEl(a, b) {
        if (!this._marqueeEl) return;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        this._marqueeEl.style.left   = `${x}px`;
        this._marqueeEl.style.top    = `${y}px`;
        this._marqueeEl.style.width  = `${w}px`;
        this._marqueeEl.style.height = `${h}px`;
    }

    _removeMarqueeEl() {
        if (this._marqueeEl) {
            this._marqueeEl.remove();
            this._marqueeEl = null;
        }
    }

    /**
     * Marquee abschließen: alle Modell-Elemente finden, deren Bbox-Center
     * innerhalb des aufgezogenen Screen-Rechtecks liegt. Projiziert die
     * Box-Center der Elemente nach NDC und filtert per AABB-Test.
     *
     * Richtung der Geste (AutoCAD-Pattern):
     *   links → rechts: "Window" — nur Elemente die VOLLSTÄNDIG drin liegen
     *   rechts → links: "Crossing" — alle die das Rechteck berühren
     * Wir starten simpel: "Center liegt drin". Window/Crossing kann später folgen.
     */
    async _finishMarquee(start, end) {
        if (!start || !end) return;
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        if ((maxX - minX) < MARQUEE_MIN_PX || (maxY - minY) < MARQUEE_MIN_PX) return;

        const components = this._engine?.components;
        if (!components) return;
        const fragments  = components.get(OBC.FragmentsManager);
        const camera     = this._engine?.camera?.getThree?.();
        if (!fragments || !camera) return;

        // Canvas-Geometrie für NDC-Konvertierung
        const rect = this._canvas.getBoundingClientRect();
        const toNdcX = (px) => ((px - rect.left) / rect.width)  *  2 - 1;
        const toNdcY = (px) => ((px - rect.top)  / rect.height) * -2 + 1;
        const ndcMinX = toNdcX(minX);
        const ndcMaxX = toNdcX(maxX);
        const ndcMaxY = toNdcY(minY); // NDC Y ist invertiert
        const ndcMinY = toNdcY(maxY);

        const selection = {}; // { modelId: [localIds] }
        let totalHits = 0;

        for (const model of fragments.list.values()) {
            const ids = [];
            // Get all local IDs in the model — via category groups oder Direktzugriff
            // Wir nutzen den schon vorhandenen Category-Index, der bei Load-Time gebaut wird
            const categoryGroups = this._engine?.getCategoryGroups?.() ?? [];
            const allLocalIds = new Set();
            for (const g of categoryGroups) {
                if (!g.visible) continue;
                try {
                    const map = await g.groupData.get();
                    const arr = map[model.modelId];
                    if (arr?.length) for (const id of arr) allLocalIds.add(id);
                } catch { /* */ }
            }
            if (!allLocalIds.size) continue;

            // Bbox-Center pro Element holen, in NDC projizieren, AABB-Test
            const idArr = [...allLocalIds];
            let boxes;
            try { boxes = await model.getBoxes(idArr); } catch { continue; }
            const center = new THREE.Vector3();
            for (let i = 0; i < boxes.length; i++) {
                const b = boxes[i];
                if (!b || b.isEmpty()) continue;
                b.getCenter(center);
                // Projektion nach NDC
                const v = center.clone().project(camera);
                if (v.x >= ndcMinX && v.x <= ndcMaxX && v.y >= ndcMinY && v.y <= ndcMaxY && v.z >= -1 && v.z <= 1) {
                    ids.push(idArr[i]);
                }
            }
            if (ids.length) {
                selection[model.modelId] = ids;
                totalHits += ids.length;
            }
        }

        if (!totalHits) {
            this._emit(this._onMarqueeCbs, { items: {}, count: 0 });
            return;
        }

        // Highlight aller getroffenen Elemente
        try { await fragments.resetHighlight(); } catch { /* */ }
        try { await fragments.highlight(MARQUEE_SELECTION_STYLE, selection); } catch (e) {
            console.warn('[Selection] marquee highlight failed:', e);
        }

        this._emit(this._onMarqueeCbs, { items: selection, count: totalHits });
    }
}
