/**
 * IfcSelectionHandler — EIN Zeiger-Stapel für den Raum (Teil XVI, S1).
 *
 * Bündelt Tipp, Schweben und Rahmen über POINTER-Ereignissen (Maus, Stift,
 * Finger) und verteilt sie in einer festen Rangfolge:
 *
 *   1. `onTipp`-VERBRAUCHER (Messen, Notiz, Eingabe-Motor) — der erste, der
 *      `true` zurückgibt, hat den Tipp verbraucht.
 *   2. Der MODUS entscheidet, was mit dem Rest passiert:
 *        'single'    Klick wählt, Shift+Zug zieht den Rahmen
 *        'gesperrt'  eine Bearbeitung ist scharf: ein Klick wechselt das
 *                    Subjekt NICHT (die 3D-Fassung von `griffBereit()` im
 *                    Lageplan) — `onGesperrt` sagt dem Nutzer, warum
 *        'werkzeug'  ein Tipp-Werkzeug (Messen, Notiz) läuft: kein Pick,
 *                    aber Tipp und Schweben kommen bei den Verbrauchern an
 *        'disabled'  nichts (Laden, Zerstören)
 *
 * WAS VORHER FEHLTE: der Klick aufs schon gewählte Bauteil lief den vollen
 * Weg — die Engine meldet jetzt `{gleich: true}`, und hier passiert dann
 * nichts (kein `onPick`, kein Kamerasprung, keine Neueinordnung). Und
 * Messen/Notiz hatten einen ZWEITEN Maus-Stapel in `IfcViewer.vue`, mit
 * eigener Klickschwelle und eigenem Hover-Timer; der ist in die
 * Verbraucherkette aufgegangen.
 *
 * Konsument (IfcViewer.vue):
 *   selection = new IfcSelectionHandler({ engine, canvas }); selection.attach();
 *   selection.onTipp(async (tipp) => messen.klick(tipp.x, tipp.y));
 *   selection.onPick(result => …);  onClickEmpty(() => …);
 *   selection.onHover((pos, treffer, px) => …);
 *   selection.setMode('gesperrt', { fang: true });
 *
 * TOUCH: ein Finger ist die Kamera (camera-controls hört auf demselben
 * Element). Ein Tipp entsteht deshalb erst beim LOSLASSEN, wenn der Finger
 * unter der Klickschwelle blieb; ein zweiter Finger (Pinch) verwirft den
 * angesetzten Tipp. Schweben gibt es auf dem Finger nicht.
 *
 * GREIFEN (S4): ein `onGreifen`-Verbraucher darf einen Zeiger beim Aufsetzen
 * für sich beanspruchen (`true`) — dann sperrt der Stapel die Kamera, fängt
 * den Zeiger und liefert `onZugStart/onZugBewegt/onZugEnde` statt Tipp und
 * Schweben. Der Finger armiert per Long-Press (`'warten'`: 380 ms ohne mehr
 * als 14 px Bewegung), sonst wäre jeder Griff ein verschlucktes Schwenken.
 */

const HALTE_MS = 380;                  // Long-Press, bis ein Griff auf dem Finger scharf ist
const HALTE_ABBRUCH_PX = 14;           // mehr Bewegung in der Haltezeit = Schwenk-Versuch

const CLICK_TOLERANCE_PX = 8;          // > 8 px Bewegung zwischen down/up → Zug, kein Tipp
const HOVER_THROTTLE_MS  = 30;         // Drossel fürs Schweben (ein Worker-Roundtrip je Aufruf)
const MARQUEE_MIN_PX     = 6;          // Mindestgrösse, damit der Rahmen nicht aus Versehen losgeht

export const MODI = Object.freeze(['single', 'gesperrt', 'werkzeug', 'disabled']);

export class IfcSelectionHandler {
    constructor({ engine, canvas }) {
        this._engine  = engine;
        this._canvas  = canvas;
        this._mode    = 'single';
        this._fang    = false;

        // Tipp-Verfolgung: { x, y, id, typ }
        this._down        = null;
        this._hoverTimer  = null;
        this._lastMove    = null;

        // Rahmen
        this._marqueeStart  = null;    // {x, y} oder null
        this._marqueeEl     = null;    // DIV-Overlay im Canvas-Wrapper
        this._marqueeActive = false;

        // Verbraucher
        this._onPickCbs        = [];
        this._onClickEmptyCbs  = [];
        this._onHoverCbs       = [];
        this._onMarqueeCbs     = [];
        this._onTippCbs        = [];
        this._onGesperrtCbs    = [];
        this._onGreifenCbs     = [];
        this._onZugStartCbs    = [];
        this._onZugBewegtCbs   = [];
        this._onZugEndeCbs     = [];
        // Laufender Zug / Armierung (S4)
        this._zug = null;              // { id, typ, start:{x,y} }
        this._halte = null;            // { id, x, y, typ, timer, tipp }

        this._boundDown   = (e) => this._onPointerDown(e);
        this._boundMove   = (e) => this._onPointerMove(e);
        this._boundUp     = (e) => { this._onPointerUp(e); };
        this._boundCancel = (e) => this._onPointerCancel(e);
        this._boundLeave  = ()  => this._onPointerLeave();
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    attach() {
        if (!this._canvas) return;
        this._canvas.addEventListener('pointerdown',   this._boundDown);
        this._canvas.addEventListener('pointermove',   this._boundMove);
        this._canvas.addEventListener('pointerup',     this._boundUp);
        this._canvas.addEventListener('pointercancel', this._boundCancel);
        this._canvas.addEventListener('pointerleave',  this._boundLeave);
    }

    detach() {
        if (!this._canvas) return;
        this._canvas.removeEventListener('pointerdown',   this._boundDown);
        this._canvas.removeEventListener('pointermove',   this._boundMove);
        this._canvas.removeEventListener('pointerup',     this._boundUp);
        this._canvas.removeEventListener('pointercancel', this._boundCancel);
        this._canvas.removeEventListener('pointerleave',  this._boundLeave);
        this._removeMarqueeEl();
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        this._hoverTimer = null;
        this._halteAbbrechen();
        if (this._zug) this._zugBeenden(null, true);
        // Keine Marke überlebt das Abbauen — sonst bliebe die Kamera gesperrt.
        this._kameraFreigeben();
    }

    // ── Modus ────────────────────────────────────────────────────────────────

    /**
     * @param {'single'|'gesperrt'|'werkzeug'|'disabled'} mode
     * @param {{fang?: boolean}} [opt]  Ecken-/Kantenfang beim Schweben
     */
    setMode(mode, { fang = false } = {}) {
        if (!MODI.includes(mode)) throw new Error(`IfcSelectionHandler: unbekannter Modus „${mode}"`);
        this._mode = mode;
        this._fang = !!fang;
        if (mode !== 'single') {
            // Ein laufender Rahmen gehört zur Auswahl — in jedem anderen Modus fällt er.
            this._removeMarqueeEl();
            if (this._marqueeActive || this._marqueeStart) this._kamera(false, 'rahmen');
            this._marqueeActive = false;
            this._marqueeStart  = null;
        }
        if (mode === 'disabled') { this._down = null; this._kameraFreigeben(); }
    }

    getMode() { return this._mode; }

    // ── Verbraucher ──────────────────────────────────────────────────────────

    onPick(cb)          { this._onPickCbs.push(cb); }
    onClickEmpty(cb)    { this._onClickEmptyCbs.push(cb); }
    /** (pos: getHitPoint()|null, treffer: probeTreffer()|null, px: {x,y}|null) */
    onHover(cb)         { this._onHoverCbs.push(cb); }
    onMarqueeSelect(cb) { this._onMarqueeCbs.push(cb); }
    /** async (tipp) => boolean — true heisst: verbraucht, die Auswahl sieht ihn nicht. */
    onTipp(cb)          { this._onTippCbs.push(cb); }
    /** (tipp) — ein Tipp im gesperrten Modus, der das Subjekt gewechselt hätte. */
    onGesperrt(cb)      { this._onGesperrtCbs.push(cb); }
    /** (tipp) => true | 'warten' | false — beim Aufsetzen: den Zeiger beanspruchen? */
    onGreifen(cb)       { this._onGreifenCbs.push(cb); }
    onZugStart(cb)      { this._onZugStartCbs.push(cb); }
    onZugBewegt(cb)     { this._onZugBewegtCbs.push(cb); }
    /** ({x, y, px, abbruch}) */
    onZugEnde(cb)       { this._onZugEndeCbs.push(cb); }

    _emit(list, ...args) {
        for (const cb of list) {
            try { cb(...args); } catch (e) { console.warn('[Selection] callback error:', e); }
        }
    }

    // ── Zeiger-Ereignisse ────────────────────────────────────────────────────

    _onPointerDown(e) {
        if (this._mode === 'disabled') return;
        // Ein zweiter Finger (Pinch) verwirft den angesetzten Tipp.
        if (e.isPrimary === false) { this._down = null; return; }
        if (e.pointerType !== 'touch' && e.button !== 0) return;   // nur Links — Mitte/Rechts ist Kamera

        this._down = { x: e.clientX, y: e.clientY, id: e.pointerId, typ: e.pointerType ?? 'mouse' };
        if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }

        // GREIFEN (S4) — vor Rahmen und Tipp: ein Griff ist kleiner und
        // fachlich schwerer als das Bauteil darunter.
        if (this._onGreifenCbs.length && this._mode !== 'disabled') {
            const tipp = this._tipp(this._down, e);
            for (const cb of this._onGreifenCbs) {
                let antwort = false;
                try { antwort = cb(tipp); } catch (err) { console.warn('[Selection] greifen callback error:', err); }
                if (antwort === true) { this._zugBeginnen(tipp, e); return; }
                if (antwort === 'warten') {
                    this._halteAbbrechen();
                    this._halte = { id: e.pointerId, x: e.clientX, y: e.clientY, tipp,
                        timer: setTimeout(() => {
                            const h = this._halte; this._halte = null;
                            if (h) this._zugBeginnen(h.tipp, e);
                        }, HALTE_MS) };
                    // KEIN return: bis der Timer feuert, gehört der Finger der Kamera.
                    break;
                }
            }
        }

        // Shift + Zug mit der Maus = Rahmen (nur im Auswahlmodus).
        //
        // DIE KAMERA STEHT DABEI (K2, 2026-09-20). camera-controls kennt kein
        // Shift: links ist und bleibt ROTATE, und das Ereignis erreicht beide
        // Stapel. Bis hierher zeichnete man also einen Rahmen UND drehte die
        // Szene. Gesperrt wird schon beim Aufsetzen — ein Shift-Klick ohne Zug
        // gibt in `_onPointerUp` sofort wieder frei.
        if (this._mode === 'single' && e.shiftKey && this._down.typ !== 'touch') {
            this._marqueeStart  = { x: e.clientX, y: e.clientY };
            this._marqueeActive = false;
            this._kamera(true, 'rahmen');
        }
    }

    _onPointerMove(e) {
        if (this._mode === 'disabled') return;
        if (e.isPrimary === false) return;

        // Laufender Zug (S4): frisst seinen Zeiger — kein Schweben, kein Rahmen.
        if (this._zug && e.pointerId === this._zug.id) {
            this._emit(this._onZugBewegtCbs, this._tipp({ x: e.clientX, y: e.clientY, typ: this._zug.typ }, e));
            return;
        }
        // Armierung: ein Wisch vor dem Long-Press ist Schwenken, kein Griff.
        if (this._halte && e.pointerId === this._halte.id
            && Math.hypot(e.clientX - this._halte.x, e.clientY - this._halte.y) > HALTE_ABBRUCH_PX) {
            this._halteAbbrechen();
        }

        // Rahmen nachziehen
        if (this._marqueeStart) {
            const dx = e.clientX - this._marqueeStart.x;
            const dy = e.clientY - this._marqueeStart.y;
            if (!this._marqueeActive && Math.hypot(dx, dy) > MARQUEE_MIN_PX) {
                this._marqueeActive = true;
                this._createMarqueeEl();
            }
            if (this._marqueeActive) {
                this._updateMarqueeEl(this._marqueeStart, { x: e.clientX, y: e.clientY });
                return;
            }
        }

        // Schweben gibt es auf dem Finger nicht.
        if (e.pointerType === 'touch') return;
        this._lastMove = { x: e.clientX, y: e.clientY };
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        this._hoverTimer = setTimeout(() => { this._hoverTimer = null; this._schwebe(); }, HOVER_THROTTLE_MS);
    }

    async _schwebe() {
        const m = this._lastMove;
        if (!m || !this._engine) return;
        const treffer = await this._engine.hoverElement?.(m.x, m.y, { fang: this._fang });
        if (treffer === undefined) return;   // überholt — der letzte Stand bleibt
        const pos = this._engine.getHitPoint?.() ?? null;
        this._emit(this._onHoverCbs, pos, treffer, this._px(m));
    }

    async _onPointerUp(e) {
        if (this._mode === 'disabled') return;
        if (e.isPrimary === false) return;
        if (e.pointerType !== 'touch' && e.button !== 0) return;

        // Zug (S4): Loslassen legt ab; eine wartende Armierung fällt immer.
        if (this._halte && e.pointerId === this._halte.id) this._halteAbbrechen();
        if (this._zug && e.pointerId === this._zug.id) { this._zugBeenden(e, false); return; }

        if (this._marqueeActive) {
            const start = this._marqueeStart;
            const end   = { x: e.clientX, y: e.clientY };
            this._marqueeActive = false;
            this._marqueeStart  = null;
            this._removeMarqueeEl();
            this._kamera(false, 'rahmen');
            this._down = null;
            await this._finishMarquee(start, end);
            return;
        }
        if (this._marqueeStart) this._kamera(false, 'rahmen');   // Shift-Klick ohne Zug
        this._marqueeStart = null;

        const down = this._down;
        this._down = null;
        if (!down) return;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_TOLERANCE_PX) return;   // Zug, kein Tipp

        const tipp = {
            x: down.x, y: down.y, px: this._px(down), typ: down.typ,
            shiftKey: !!e.shiftKey, ctrlKey: !!e.ctrlKey, altKey: !!e.altKey, event: e,
        };
        // 1. Verbraucher in Rangfolge — der erste, der zugreift, gewinnt.
        for (const cb of this._onTippCbs) {
            try { if (await cb(tipp)) return; }
            catch (err) { console.warn('[Selection] tipp callback error:', err); }
        }
        // 2. Der Modus
        if (this._mode === 'werkzeug') return;
        if (this._mode === 'gesperrt') { this._emit(this._onGesperrtCbs, tipp); return; }

        const result = await this._engine?.pickElement(down.x, down.y);
        if (result?.gleich) return;                      // dasselbe Bauteil: nichts passiert
        if (result) {
            this._emit(this._onPickCbs, result);
        } else {
            await this._engine?.clearSelection();
            // Mit GRUND: lag nur Gelände unter dem Zeiger, ist das kein Griff
            // ins Leere, und der Nutzer bekommt eine Antwort statt Schweigen.
            this._emit(this._onClickEmptyCbs, { grund: this._engine?.letzterLeergrund?.() ?? null });
        }
    }

    _onPointerCancel(e) {
        // Der Browser hat den Zeiger übernommen (Scroll, Pinch, Systemgeste):
        // nichts davon ist ein Tipp — und ein Zug wird VERWORFEN (billig zu
        // wiederholen, anders als ein Tintenstrich).
        this._halteAbbrechen();
        if (this._zug) { this._zugBeenden(e, true); }
        this._down = null;
        if (this._marqueeStart || this._marqueeActive) this._kamera(false, 'rahmen');
        this._marqueeStart  = null;
        this._marqueeActive = false;
        this._removeMarqueeEl();
    }

    _onPointerLeave() {
        if (this._mode === 'disabled') return;
        if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }
        this._lastMove = null;
        this._engine?.clearHover?.();
        this._emit(this._onHoverCbs, null, null, null);
    }

    // ── Zug (S4) ─────────────────────────────────────────────────────────────

    _tipp(p, e) {
        return { x: p.x, y: p.y, px: this._px(p), typ: p.typ ?? (e?.pointerType ?? 'mouse'),
                 shiftKey: !!e?.shiftKey, ctrlKey: !!e?.ctrlKey, altKey: !!e?.altKey, event: e };
    }

    _zugBeginnen(tipp, e) {
        this._down = null;
        this._marqueeStart = null;
        this._zug = { id: e?.pointerId ?? tipp.event?.pointerId ?? 1, typ: tipp.typ, start: { x: tipp.x, y: tipp.y } };
        // Die Kamera steht, solange gezogen wird — sonst dreht sie mit (Muster IfcSection).
        this._kamera(true, 'griff');
        try { this._canvas?.setPointerCapture?.(this._zug.id); } catch { /* */ }
        this._emit(this._onZugStartCbs, tipp);
    }

    _zugBeenden(e, abbruch) {
        const z = this._zug;
        this._zug = null;
        this._kamera(false, 'griff');
        try { this._canvas?.releasePointerCapture?.(z?.id); } catch { /* */ }
        const p = { x: e?.clientX ?? z?.start.x ?? 0, y: e?.clientY ?? z?.start.y ?? 0, typ: z?.typ };
        this._emit(this._onZugEndeCbs, { ...this._tipp(p, e), abbruch: !!abbruch });
    }

    _halteAbbrechen() {
        if (this._halte) { clearTimeout(this._halte.timer); this._halte = null; }
    }

    /**
     * Die Kamera anhalten oder freigeben — IMMER mit Marke (K2).
     *
     * Griff-Zug, Rahmen und Schnitt-Gizmo halten sie unabhängig voneinander;
     * frei ist sie erst, wenn niemand mehr hält. Ein vergessenes Freigeben
     * sperrt die Kamera dauerhaft — deshalb geben `setMode` und `detach` in
     * jedem Fall frei.
     */
    _kamera(an, wer) {
        try { this._engine?.kameraSperren?.(an, wer); } catch { /* */ }
    }

    /** Alle Marken dieses Stapels lösen — beim Moduswechsel und beim Abbauen. */
    _kameraFreigeben() {
        this._kamera(false, 'griff');
        this._kamera(false, 'rahmen');
    }

    /** Läuft gerade ein Zug? (für Verbraucher, die sich zurückhalten sollen) */
    ziehtGerade() { return !!this._zug; }

    /**
     * Einen laufenden Zug von aussen abbrechen (Esc-Taste, S7).
     * Wie ein `pointercancel`: Kamera frei, Capture los, `onZugEnde` mit
     * `abbruch: true` — der Griff-Verbraucher verwirft und baut neu auf.
     */
    zugAbbrechen() {
        if (this._zug) this._zugBeenden(null, true);
    }

    /** Client- → Canvas-Pixel (für Pillen im HUD). */
    _px(p) {
        const r = this._canvas?.getBoundingClientRect?.();
        if (!r || !p) return null;
        return { x: p.x - r.left, y: p.y - r.top };
    }

    // ── Rahmen-Overlay ───────────────────────────────────────────────────────

    _createMarqueeEl() {
        if (this._marqueeEl) return;
        const el = document.createElement('div');
        el.className = 'cde-marquee';
        // Im Canvas-Wrapper statt am `body`: er ist positioniert, und die
        // Farben kommen aus den Tokens — auch im Vollbild und im Teleport.
        Object.assign(el.style, {
            position: 'absolute', pointerEvents: 'none', zIndex: '5',
            border: '1px dashed var(--cde-accent)',
            background: 'var(--cde-accent-fill)',
        });
        (this._canvas ?? document.body).appendChild(el);
        this._marqueeEl = el;
    }

    _updateMarqueeEl(a, b) {
        if (!this._marqueeEl) return;
        const pa = this._px(a) ?? a;
        const pb = this._px(b) ?? b;
        this._marqueeEl.style.left   = `${Math.min(pa.x, pb.x)}px`;
        this._marqueeEl.style.top    = `${Math.min(pa.y, pb.y)}px`;
        this._marqueeEl.style.width  = `${Math.abs(pb.x - pa.x)}px`;
        this._marqueeEl.style.height = `${Math.abs(pb.y - pa.y)}px`;
    }

    _removeMarqueeEl() {
        if (this._marqueeEl) {
            this._marqueeEl.remove();
            this._marqueeEl = null;
        }
    }

    /**
     * Rahmen abschliessen — die Bibliothek rechnet (`engine.rechteckAuswahl`).
     *
     * Richtung der Geste (AutoCAD-Muster): links → rechts = „Window", nur
     * Bauteile, die GANZ im Rahmen liegen; rechts → links = „Crossing",
     * alles, was ihn berührt.
     */
    async _finishMarquee(start, end) {
        if (!start || !end) return;
        if (Math.abs(end.x - start.x) < MARQUEE_MIN_PX || Math.abs(end.y - start.y) < MARQUEE_MIN_PX) return;
        const fullyIncluded = end.x >= start.x;
        const r = await this._engine?.rechteckAuswahl?.(
            { x0: start.x, y0: start.y, x1: end.x, y1: end.y }, { fullyIncluded });
        this._emit(this._onMarqueeCbs, { items: r?.items ?? {}, count: r?.count ?? 0, fullyIncluded });
    }
}
