/**
 * usePlanGesten — Finger-Navigation für den Lageplan (Stufe T2).
 *
 * Pan mit einem Finger (mit Trägheit), Pinch mit zweien, Übernahme aus der
 * Pinch-Umwandlung des EingabeRoutings. MUSTER aus dem PDF-Editor
 * (`pdfeditor/composables/useViewportGestures.js`) übernommen, nicht
 * importiert — Hausregel. Der entscheidende Unterschied: der Plan hat keinen
 * Scrollcontainer, sein Zustand ist Weltmitte + Bildschirmlupe, und ein
 * Neuzeichnen je Frame ist billig (der Rad-Zoom tut es heute schon). Deshalb
 * entfällt der CSS-Transform-Trick des PDF-Editors; jede Geste schreibt
 * direkt in die Ansicht.
 *
 * KEINE eigene Koordinatenmathematik: die Maschine rechnet ausschliesslich
 * über das injizierte `zuWelt(x, y)` — dieselbe Abbildung, die auch Klicks
 * deutet (Gesetz „ein Weg je Frage"). Pan heisst: die Welt unter dem Finger
 * bleibt unter dem Finger. Pinch heisst zusätzlich: die Welt unter der
 * Fingermitte bleibt dort, während die Lupe dem Fingerabstand folgt.
 *
 * Tipp-Erkennung wohnt MIT HIER (nicht in der Komponente): `zeigerAuf`
 * meldet `warTipp`, wenn ein Berührzeiger unter der Wischschwelle blieb und
 * nie Teil einer Pinch war — die 6 px sind der Wert des PDF-Editors.
 *
 * Rein und ohne DOM: Uhr und Frameplaner sind injizierbar, die Tests treiben
 * die Maschine von Hand.
 */

export const WISCH_SCHWELLE_PX = 6;

export function erzeugePlanGesten({
    zuWelt,                        // (clientX, clientY) => { x, z } | null
    holeMitte,                     // () => { x, z }
    setzeMitte,                    // ({ x, z }) => void   (Begrenzen + Zeichnen macht der Aufrufer)
    holeZoom,                      // () => pxProMm
    setzeZoom,                     // (v) => void          (Klemmen macht der Aufrufer/Store)
    holeBuehnenPunkt,              // () => { x, y }       fester Bildschirmpunkt für die Trägheit
    plane = (cb) => requestAnimationFrame(cb),
    jetzt = () => performance.now(),
} = {}) {
    const zeiger = new Map();      // id → { x, y, typ, weg, unrein }
    let pinchStart = null;         // { dist, zoom }
    let schwung = { vx: 0, vy: 0, t: 0 };
    let gleitet = false;

    function _dist() {
        const [a, b] = [...zeiger.values()];
        return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }

    /** Die Welt unter (vonX,vonY) nach (nachX,nachY) mitnehmen. */
    function _schleppe(vonX, vonY, nachX, nachY) {
        const wAlt = zuWelt(vonX, vonY);
        const wNeu = zuWelt(nachX, nachY);
        if (!wAlt || !wNeu) return;
        const m = holeMitte();
        setzeMitte({ x: m.x + (wAlt.x - wNeu.x), z: m.z + (wAlt.z - wNeu.z) });
    }

    function zeigerAb(id, x, y, typ = 'touch') {
        gleitet = false;                          // ein neuer Finger stoppt das Gleiten
        zeiger.set(id, { x, y, typ, weg: 0, unrein: zeiger.size > 0 });
        if (zeiger.size === 2) {
            for (const e of zeiger.values()) e.unrein = true;
            pinchStart = { dist: _dist(), zoom: holeZoom() };
        }
        schwung = { vx: 0, vy: 0, t: jetzt() };
    }

    function zeigerBewegt(id, x, y) {
        const e = zeiger.get(id);
        if (!e) return;                           // unbekannte Zeiger gehen die Geste nichts an
        const dx = x - e.x, dy = y - e.y;
        e.weg += Math.hypot(dx, dy);

        if (zeiger.size >= 2 && pinchStart) {
            // Nur die ersten beiden Zeiger sind massgeblich (PDF-Editor-Regel).
            const [a, b] = [...zeiger.values()];
            if (e !== a && e !== b) { e.x = x; e.y = y; return; }
            const altMitteX = (a.x + b.x) / 2, altMitteY = (a.y + b.y) / 2;
            e.x = x; e.y = y;
            const neuMitteX = (a.x + b.x) / 2, neuMitteY = (a.y + b.y) / 2;
            // Erst die Lupe, dann die Welt unter der Fingermitte nachführen —
            // in DIESER Reihenfolge, weil zuWelt nach dem Zoomen anders misst.
            const anker = zuWelt(altMitteX, altMitteY);
            setzeZoom(pinchStart.zoom * (_dist() / pinchStart.dist));
            const jetztDort = zuWelt(neuMitteX, neuMitteY);
            if (anker && jetztDort) {
                const m = holeMitte();
                setzeMitte({ x: m.x + (anker.x - jetztDort.x), z: m.z + (anker.z - jetztDort.z) });
            }
            return;
        }

        // Ein Zeiger: schleppen. Geschwindigkeit geglättet fürs Gleiten.
        const t = jetzt();
        const dt = Math.max(1, t - schwung.t);
        schwung = {
            vx: 0.8 * (dx / dt) + 0.2 * schwung.vx,
            vy: 0.8 * (dy / dt) + 0.2 * schwung.vy,
            t,
        };
        _schleppe(e.x, e.y, x, y);
        e.x = x; e.y = y;
    }

    function zeigerAuf(id) {
        const e = zeiger.get(id);
        zeiger.delete(id);
        if (zeiger.size < 2) pinchStart = null;
        if (!e) return { warTipp: false };

        const warTipp = e.typ === 'touch' && !e.unrein && e.weg < WISCH_SCHWELLE_PX;
        // Trägheit nur für den letzten Berührzeiger eines echten Wischens —
        // die Maus gleitet nicht, ein Tipp auch nicht.
        if (zeiger.size === 0 && e.typ === 'touch' && !warTipp) _gleiteLos();
        return { warTipp };
    }

    function _gleiteLos() {
        const tempo = Math.hypot(schwung.vx, schwung.vy);
        if (tempo < 0.05) return;                 // px/ms — darunter ist es kein Wurf
        gleitet = true;
        let vx = schwung.vx, vy = schwung.vy;
        let letzter = jetzt();
        const schritt = () => {
            if (!gleitet) return;
            const t = jetzt();
            const dt = Math.min(64, t - letzter);
            letzter = t;
            const p = holeBuehnenPunkt();
            _schleppe(p.x, p.y, p.x + vx * dt, p.y + vy * dt);
            const abklang = Math.pow(0.94, dt / 16);
            vx *= abklang; vy *= abklang;
            if (Math.hypot(vx, vy) < 0.02) { gleitet = false; return; }
            plane(schritt);
        };
        plane(schritt);
    }

    /** Pinch-Umwandlung aus dem EingabeRouting: beide Zeiger auf einmal. */
    function uebernimm(paare) {
        brichAlle();
        for (const p of paare) zeiger.set(p.id, { x: p.x, y: p.y, typ: 'touch', weg: 0, unrein: true });
        if (zeiger.size === 2) pinchStart = { dist: _dist(), zoom: holeZoom() };
    }

    function brichAlle() {
        zeiger.clear();
        pinchStart = null;
        gleitet = false;
    }

    function anzahl() { return zeiger.size; }

    return { zeigerAb, zeigerBewegt, zeigerAuf, uebernimm, brichAlle, anzahl };
}
