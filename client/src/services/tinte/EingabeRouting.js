/**
 * EingabeRouting — die Stift/Finger/Maus-Konfliktregeln als pure
 * Zustandsmaschine, bewusst OHNE DOM (unit-testbar; usePointerTools
 * verdrahtet sie mit den echten Pointer-Events).
 *
 * Regeln (OneNote-Modell, siehe Plan):
 *  1. STIFT SCHLÄGT FINGER: Solange der Stift zeichnet ODER kürzlich in der
 *     Nähe war (Kontakt/Hover < stiftSperreMs), werden neue Touch-Zeiger
 *     komplett ignoriert — der Handballen kann weder zeichnen noch verpannen.
 *  2. KARENZFENSTER: Im Modus „Stift + Finger" startet ein einzelner Finger
 *     einen PROVISORISCHEN Strich. Landet ein zweiter Finger, bevor der erste
 *     karenzMs alt ist oder karenzPx bewegt wurde, wird der Ansatz verworfen
 *     und beide Finger werden zur Pinch-Geste — kein Tintenfleck beim Zoomen.
 *  3. LAUFENDE STRICHE BRECHEN NIE AB: Ist ein Strich gehärtet (Stift immer,
 *     Finger nach dem Karenzfenster), werden nachkommende Touch-Zeiger
 *     verworfen, nicht gepuffert.
 *  4. Stift-Radiererende (buttons & 32) und Barrel-Taste (buttons & 2)
 *     überschreiben das Werkzeug temporär.
 *
 * Modus 'nurStift': Finger ist reine Navigation (1 Finger Pan, 2 Pinch).
 *
 * GETEILT (Sprint I, Stufe 7): siehe InkGeometry.js. Die Regeln, wann ein
 * Stift zeichnet und ein Finger schwenkt, sind dieselben — egal ob unter dem
 * Zeiger eine PDF-Seite oder ein Lageplan liegt.
 */

const ZEICHNENDE_WERKZEUGE = new Set(['stift', 'textmarker', 'radierer', 'lasso']);

/** Zeichnende Werkzeuge → Routing-Ziel des Zeigers. */
function _zielFuer(werkzeug) {
    if (werkzeug === 'radierer') return 'radierer';
    if (werkzeug === 'lasso') return 'lasso';
    return 'tinte';
}

export function erzeugeEingabeRouting({
    holeModus,                    // () => 'stiftUndFinger' | 'nurStift'
    holeWerkzeug,                 // () => aktives Werkzeug
    jetzt = () => performance.now(),
    karenzMs = 150,
    karenzPx = 8,
    stiftSperreMs = 500,
} = {}) {
    const zuordnung = new Map();  // pointerId → { ziel, provisorisch, gehaertet, start, werkzeug }
    let letzterStift = -Infinity; // letzter Stift-Kontakt ODER -Hover
    let stiftAktiv = false;       // Stift zeichnet/radiert gerade

    function _setze(id, eintrag) { zuordnung.set(id, eintrag); return eintrag; }

    function _stiftWerkzeug(buttons) {
        if (buttons & 32) return 'radierer';   // Radierer-Ende des Surface Pen
        if (buttons & 2) return 'lasso';       // Barrel-Taste: temporär Lasso (OneNote-Muster)
        return holeWerkzeug();
    }

    /** Stift in der Nähe (Hover) — hält die Touch-Sperre frisch. */
    function stiftNaehe() { letzterStift = jetzt(); }

    function _touchGesperrt() {
        return stiftAktiv || (jetzt() - letzterStift < stiftSperreMs);
    }

    /**
     * @param {{id, typ:'pen'|'touch'|'mouse', button?:number, buttons?:number, x:number, y:number}} z
     * @returns {{aktion:string, werkzeug?:string, navAbbrechen?:boolean, ersterZeiger?:*}}
     *  aktion: 'tinte' | 'tinte-provisorisch' | 'radierer' | 'radierer-provisorisch'
     *        | 'nav' | 'pinch-umwandlung' | 'ignorieren'
     */
    function pointerDown(z) {
        if (z.typ === 'pen') {
            letzterStift = jetzt();
            const w = _stiftWerkzeug(z.buttons ?? 0);
            if (w === 'pan' || !ZEICHNENDE_WERKZEUGE.has(w)) {
                _setze(z.id, { ziel: 'nav' });
                return { aktion: 'nav' };
            }
            stiftAktiv = true;
            const ziel = _zielFuer(w);
            _setze(z.id, { ziel, gehaertet: true, werkzeug: w });
            // Ein evtl. laufender Finger-Pan wird abgebrochen — der Stift gewinnt.
            return { aktion: ziel, werkzeug: w, navAbbrechen: true };
        }

        if (z.typ === 'touch') {
            if (_touchGesperrt()) {
                _setze(z.id, { ziel: 'ignoriert' });
                return { aktion: 'ignorieren' };
            }
            const w = holeWerkzeug();
            const fingerZeichnet = holeModus() === 'stiftUndFinger' && ZEICHNENDE_WERKZEUGE.has(w);

            if (!fingerZeichnet) {
                _setze(z.id, { ziel: 'nav' });
                return { aktion: 'nav' };
            }

            // Läuft schon ein gehärteter (Finger-)Strich? → Regel 3.
            let provisorischerEintrag = null, provisorischeId = null, gehaerteterLaeuft = false;
            for (const [id, e] of zuordnung) {
                if (e.ziel !== 'tinte' && e.ziel !== 'radierer' && e.ziel !== 'lasso') continue;
                if (e.provisorisch && !e.gehaertet) { provisorischerEintrag = e; provisorischeId = id; }
                else if (e.gehaertet) gehaerteterLaeuft = true;
            }
            if (gehaerteterLaeuft) {
                _setze(z.id, { ziel: 'ignoriert' });
                return { aktion: 'ignorieren' };
            }
            if (provisorischerEintrag) {
                // Zweiter Finger im Karenzfenster → beide werden Pinch (Regel 2).
                _setze(provisorischeId, { ziel: 'nav' });
                _setze(z.id, { ziel: 'nav' });
                return { aktion: 'pinch-umwandlung', ersterZeiger: provisorischeId };
            }
            const navLaeuft = [...zuordnung.values()].some(e => e.ziel === 'nav');
            if (navLaeuft) {
                // Erster Finger pannt bereits (z. B. Karenz überzogen als Pan?
                // Nein: er zeichnet dann. Nav läuft nur nach Umwandlung) —
                // weitere Finger gesellen sich zur Geste.
                _setze(z.id, { ziel: 'nav' });
                return { aktion: 'nav' };
            }
            const ziel = _zielFuer(w);
            _setze(z.id, {
                ziel, provisorisch: true, gehaertet: false,
                start: { x: z.x, y: z.y, t: jetzt() }, werkzeug: w,
            });
            return { aktion: `${ziel}-provisorisch`, werkzeug: w };
        }

        // Maus
        if (z.button === 1) {                    // mittlere Taste: immer Pan
            _setze(z.id, { ziel: 'nav' });
            return { aktion: 'nav' };
        }
        const w = holeWerkzeug();
        if (!ZEICHNENDE_WERKZEUGE.has(w)) {
            _setze(z.id, { ziel: 'nav' });
            return { aktion: 'nav' };
        }
        const ziel = _zielFuer(w);
        _setze(z.id, { ziel, gehaertet: true, werkzeug: w });
        return { aktion: ziel, werkzeug: w };
    }

    /**
     * @returns {{ziel:string|null, gehaertetJetzt?:boolean}}
     */
    function pointerMove(z) {
        if (z.typ === 'pen') letzterStift = jetzt();
        const e = zuordnung.get(z.id);
        if (!e) return { ziel: null };
        if (e.provisorisch && !e.gehaertet) {
            const alter = jetzt() - e.start.t;
            const weg = Math.hypot(z.x - e.start.x, z.y - e.start.y);
            if (alter > karenzMs || weg > karenzPx) {
                e.gehaertet = true;
                return { ziel: e.ziel, gehaertetJetzt: true };
            }
        }
        return { ziel: e.ziel };
    }

    /**
     * @returns {{ziel:string|null, warProvisorisch:boolean}}
     *  warProvisorisch: Strich endete noch im Karenzfenster (kurzer Tipp) —
     *  er zählt trotzdem als Tinte (Punkt), nur eben ungehärtet.
     */
    function pointerUp(z) {
        if (z.typ === 'pen') { letzterStift = jetzt(); stiftAktiv = false; }
        const e = zuordnung.get(z.id);
        zuordnung.delete(z.id);
        return { ziel: e?.ziel ?? null, warProvisorisch: !!(e?.provisorisch && !e.gehaertet) };
    }

    function pointerCancel(z) {
        if (z.typ === 'pen') stiftAktiv = false;
        const e = zuordnung.get(z.id);
        zuordnung.delete(z.id);
        return { ziel: e?.ziel ?? null };
    }

    function zielVon(id) { return zuordnung.get(id)?.ziel ?? null; }

    function reset() {
        zuordnung.clear();
        stiftAktiv = false;
        letzterStift = -Infinity;
    }

    return { pointerDown, pointerMove, pointerUp, pointerCancel, stiftNaehe, zielVon, reset };
}
