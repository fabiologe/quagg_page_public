/**
 * usePointerTools — verdrahtet die EingabeRouting-Zustandsmaschine mit den
 * echten Pointer-Events: Stift/Finger/Maus → Tinte, Radierer oder Navigation.
 *
 * Tinte läuft über den WetInkLayer (coalesced + predicted Events); erst bei
 * pointerup wird der Strich in den Store committet. Radieren ist live, aber
 * EINE Undo-Einheit je Zug. Alles außerhalb der Seitenflächen fällt auf
 * Navigation zurück, damit der Stift auf der grauen Arbeitsfläche pannt.
 */

import { erzeugeEingabeRouting } from '../services/EingabeRouting';
import { trifftStrich, strichInPolygon, punktInPolygon, zerteileStrich } from '../services/InkGeometry';
import { trifftRects } from '../services/TextRects';
import { textboxMasse, messeTextBreitePt } from '../services/TextboxMasse';
import { stempelMasse } from '../services/AnnotationPainter';
import { kantenLinie, abstandZurKante, projiziereAufKante } from '../services/LinealMath';

const LINEAL_SNAP_PT = 14;

const NOTIZ_FARBE = '#d97706';
const SIGNATUR_BREITE_PT = 140;

export function usePointerTools({
    scrollerRef,        // Ref<HTMLElement>
    gesten,             // useViewportGestures-Instanz
    wetInkRef,          // Ref auf WetInkLayer-Komponente
    toolStore,
    annotStore,
    viewStore,
    findeSeite,         // (clientX, clientY) → Treffer | null
}) {
    const routing = erzeugeEingabeRouting({
        holeModus: () => toolStore.eingabemodus,
        holeWerkzeug: () => toolStore.aktivesWerkzeug,
    });

    // Zeiger, die als Tinte/Radierer starteten, aber neben den Seiten liegen —
    // sie navigieren stattdessen.
    const fallbackNav = new Set();

    // Laufender Strich (genau einer zur Zeit — die Routingregeln garantieren das)
    let strich = null;    // { pointerId, treffer, werkzeug, optionen, letztesClient:{x,y} }
    let radierZug = null; // { pointerId }
    let lasso = null;     // { pointerId, treffer, punkte:[[xPt,yPt]] }
    let navTap = null;    // { pointerId, x0, y0, bewegt } — Tipp-Erkennung für Kommentar/Signatur

    function _zuRouting(ev) {
        return {
            id: ev.pointerId,
            typ: ev.pointerType === 'pen' ? 'pen' : (ev.pointerType === 'touch' ? 'touch' : 'mouse'),
            button: ev.button,
            buttons: ev.buttons,
            x: ev.clientX,
            y: ev.clientY,
        };
    }

    function _druck(ev) {
        if (ev.pointerType !== 'pen') return 0.5;
        return ev.pressure > 0 ? ev.pressure : 0.5;
    }

    function _seitenPunkt(treffer, clientX, clientY, linie = null) {
        // Während eines Strichs ist die Abbildung konstant (kein Scroll/Zoom) —
        // ursprung/zoom stammen vom Strichbeginn.
        let xPt = (clientX - treffer.ursprungClientX) / treffer.zoom;
        let yPt = (clientY - treffer.ursprungClientY) / treffer.zoom;
        // Lineal-Snap: Punkte auf die Zeichenkante projizieren → die Linie
        // ist schnurgerade im Lineal-Winkel (erst projizieren, dann klemmen).
        if (linie) [xPt, yPt] = projiziereAufKante(xPt, yPt, linie);
        return {
            x: Math.max(0, Math.min(treffer.breitePt, xPt)),
            y: Math.max(0, Math.min(treffer.hoehePt, yPt)),
        };
    }

    // ── Tinte ───────────────────────────────────────────────────────────────

    function _starteTinte(ev, werkzeug) {
        const treffer = findeSeite(ev.clientX, ev.clientY);
        if (!treffer) {
            fallbackNav.add(ev.pointerId);
            gesten.onNavPointerDown(ev);
            return;
        }
        annotStore.leereAuswahl();
        const optionen = toolStore.inkOptionen(werkzeug);
        const echterDruck = ev.pointerType === 'pen';

        // Setzt der Strich nahe der Linealkante an, wird der GANZE Strich
        // auf die Kante projiziert (OneNote-Verhalten, maßstabsgetreu gerade).
        let linie = null;
        const lineal = toolStore.lineal;
        if (lineal && lineal.page === treffer.index) {
            const kante = kantenLinie(lineal);
            const xPt = (ev.clientX - treffer.ursprungClientX) / treffer.zoom;
            const yPt = (ev.clientY - treffer.ursprungClientY) / treffer.zoom;
            if (abstandZurKante(xPt, yPt, kante) < LINEAL_SNAP_PT) linie = kante;
        }

        strich = {
            pointerId: ev.pointerId, treffer, werkzeug, optionen, echterDruck, linie,
            letztesClientX: ev.clientX, letztesClientY: ev.clientY,
        };
        wetInkRef.value?.starte({
            tool: optionen.tool,
            stiftArt: optionen.stiftArt,
            farbe: optionen.farbe,
            breitePt: optionen.breitePt,
            // Bleistift-Kern ist leicht transparent — der nasse Strich soll
            // beim Commit nicht sichtbar „umspringen".
            deckkraft: optionen.stiftArt === 'bleistift' ? 0.82 : optionen.deckkraft,
            echterDruck,
            ursprung: { x: treffer.ursprungX, y: treffer.ursprungY },
            zoom: treffer.zoom,
        });
        const p = _seitenPunkt(treffer, ev.clientX, ev.clientY, linie);
        wetInkRef.value?.punkt(p.x, p.y, _druck(ev));
    }

    function _bewegeTinte(ev) {
        if (!strich || strich.pointerId !== ev.pointerId) return;
        const wet = wetInkRef.value;
        if (!wet) return;
        const einzeln = ev.getCoalescedEvents?.() ?? [];
        for (const e of einzeln.length ? einzeln : [ev]) {
            const p = _seitenPunkt(strich.treffer, e.clientX, e.clientY, strich.linie);
            wet.punkt(p.x, p.y, _druck(e));
        }
        const vorhergesagt = ev.getPredictedEvents?.() ?? [];
        wet.zeigeVorhersage(vorhergesagt.map((e) => {
            const p = _seitenPunkt(strich.treffer, e.clientX, e.clientY, strich.linie);
            return [p.x, p.y, _druck(e)];
        }));
    }

    function _beendeTinte(commit) {
        if (!strich) return;
        const wet = wetInkRef.value;
        const daten = wet?.beende();
        if (commit && daten?.points?.length) {
            const o = strich.optionen;
            annotStore.fuegeHinzu({
                type: 'ink',
                page: strich.treffer.index,
                tool: o.tool,
                farbe: o.farbe,
                breitePt: o.breitePt,
                deckkraft: o.deckkraft,
                echterDruck: strich.echterDruck,
                points: daten.points,
            });
        }
        strich = null;
    }

    // ── Radierer ────────────────────────────────────────────────────────────

    /**
     * Punkt-Modus: getroffene Tintenstriche werden am Radierkreis ZERTEILT
     * (zerteileStrich), alles andere verschwindet als Ganzes. Strich-Modus:
     * jede Berührung löscht das ganze Objekt (Verhalten der Stufen 2–8).
     */
    function _radiereBei(ev) {
        const treffer = findeSeite(ev.clientX, ev.clientY);
        if (!treffer) return;
        const items = annotStore.proSeite.get(treffer.index);
        if (!items?.length) return;
        const radius = toolStore.radierer.radiusPt;
        const punktModus = toolStore.radierer.modus !== 'strich';
        const xPt = (ev.clientX - treffer.ursprungClientX) / treffer.zoom;
        const yPt = (ev.clientY - treffer.ursprungClientY) / treffer.zoom;

        const ganzeTreffer = [];
        const zuZerteilen = [];
        for (const a of items) {
            if (a.type === 'ink') {
                if (!trifftStrich(a, xPt, yPt, radius)) continue;
                if (punktModus) zuZerteilen.push(a);
                else ganzeTreffer.push(a.id);
            } else if (a.type === 'textHighlight') {
                if (trifftRects(a.rects, xPt, yPt, radius)) ganzeTreffer.push(a.id);
            } else if (a.type === 'measure') {
                if (trifftStrich({ points: a.points, breitePt: 2 }, xPt, yPt, radius)) {
                    ganzeTreffer.push(a.id);
                }
            } else if (a.type === 'textbox') {
                const m = textboxMasse(a);
                if (trifftRects([{ x: a.x, y: a.y, w: m.breite, h: m.hoehe }], xPt, yPt, radius)) {
                    ganzeTreffer.push(a.id);
                }
            } else if (a.type === 'stempel') {
                // bbox um den Mittelpunkt, Drehung vernachlässigt — fürs
                // Radieren genügt die ungedrehte Hülle.
                const m = stempelMasse(a, messeTextBreitePt);
                const rect = { x: a.x - m.breite / 2, y: a.y - m.hoehe / 2, w: m.breite, h: m.hoehe };
                if (trifftRects([rect], xPt, yPt, radius)) ganzeTreffer.push(a.id);
            }
        }

        if (ganzeTreffer.length) annotStore.radiere(ganzeTreffer);

        for (const a of zuZerteilen) {
            // Der sichtbare Strich ist breiter als seine Mittellinie —
            // radiert wird, wo der Kreis die TINTE berührt.
            const teile = zerteileStrich(a.points, xPt, yPt, radius + a.breitePt / 2);
            const unveraendert = teile.length === 1 && teile[0].length === a.points.length;
            if (unveraendert) continue;
            const kopf = {
                type: 'ink', page: a.page, tool: a.tool, stiftArt: a.stiftArt,
                farbe: a.farbe, breitePt: a.breitePt, deckkraft: a.deckkraft,
                echterDruck: a.echterDruck, z: a.z,
            };
            annotStore.ersetzeBeimRadieren(a, teile.map(points => ({ ...kopf, points })));
        }
    }

    // ── Werkzeug-Cursor auf dem Wet-Ink-Canvas (Radierkreis, Marker-Strich) ─

    function _aktualisiereRadiererCursor(ev) {
        const wet = wetInkRef.value;
        if (!wet) return;
        const istRadierer = toolStore.aktivesWerkzeug === 'radierer'
            || (ev.pointerType === 'pen' && (ev.buttons & 32));
        if (istRadierer) {
            const r = scrollerRef.value.getBoundingClientRect();
            wet.zeigeRadierer(
                ev.clientX - r.left,
                ev.clientY - r.top,
                toolStore.radierer.radiusPt * viewStore.zoom,
            );
            return;
        }
        if (toolStore.aktivesWerkzeug === 'textmarker') {
            const r = scrollerRef.value.getBoundingClientRect();
            wet.zeigeMarkerVorschau(
                ev.clientX - r.left,
                ev.clientY - r.top,
                toolStore.textmarker.breitePt * viewStore.zoom,
                toolStore.textmarker.farbe,
            );
            return;
        }
        wet.versteckeRadierer();
    }

    function _starteRadierer(ev) {
        annotStore.leereAuswahl();
        radierZug = { pointerId: ev.pointerId };
        annotStore.starteRadieren();
        _radiereBei(ev);
    }

    function _bewegeRadierer(ev) {
        if (!radierZug || radierZug.pointerId !== ev.pointerId) return;
        for (const e of ev.getCoalescedEvents?.() ?? [ev]) _radiereBei(e);
    }

    function _beendeRadierer() {
        if (!radierZug) return;
        annotStore.beendeRadieren();
        radierZug = null;
    }

    // ── Lasso ───────────────────────────────────────────────────────────────

    function _starteLasso(ev) {
        const treffer = findeSeite(ev.clientX, ev.clientY);
        if (!treffer) {
            fallbackNav.add(ev.pointerId);
            gesten.onNavPointerDown(ev);
            return;
        }
        lasso = { pointerId: ev.pointerId, treffer, punkte: [] };
        // Akzentfarbe direkt — CSS-Variablen kennt das Canvas nicht.
        wetInkRef.value?.starte({
            tool: 'lasso',
            farbe: '#0f766e',
            ursprung: { x: treffer.ursprungX, y: treffer.ursprungY },
            zoom: treffer.zoom,
        });
        const p = _seitenPunkt(treffer, ev.clientX, ev.clientY);
        lasso.punkte.push([p.x, p.y]);
        wetInkRef.value?.punkt(p.x, p.y, 0.5);
    }

    function _bewegeLasso(ev) {
        if (!lasso || lasso.pointerId !== ev.pointerId) return;
        for (const e of ev.getCoalescedEvents?.() ?? [ev]) {
            const p = _seitenPunkt(lasso.treffer, e.clientX, e.clientY);
            lasso.punkte.push([p.x, p.y]);
            wetInkRef.value?.punkt(p.x, p.y, 0.5);
        }
    }

    function _beendeLasso(commit) {
        if (!lasso) return;
        wetInkRef.value?.beende();
        const { treffer, punkte } = lasso;
        lasso = null;
        if (!commit || punkte.length < 3) {
            annotStore.leereAuswahl();
            return;
        }
        const items = annotStore.proSeite.get(treffer.index) ?? [];
        const ids = items.filter((a) => {
            if (a.type === 'ink') return strichInPolygon(a, punkte);
            if (a.type === 'signature') {
                return punktInPolygon(a.x + a.w / 2, a.y + a.h / 2, punkte);
            }
            if (a.type === 'textbox') {
                const m = textboxMasse(a);
                return punktInPolygon(a.x + m.breite / 2, a.y + m.hoehe / 2, punkte);
            }
            if (a.type === 'stempel') return punktInPolygon(a.x, a.y, punkte);
            return false;
        }).map(a => a.id);
        annotStore.setzeAuswahl(treffer.index, ids);
    }

    // ── Tipp-Aktionen (Kommentar setzen, Signatur platzieren) ───────────────

    const MESS_WERKZEUGE = new Set(['messenStrecke', 'messenFlaeche', 'kalibrieren']);
    const FLAECHE_SCHLUSS_RADIUS_PT = 10;

    function _messTipp(werkzeug, treffer, xPt, yPt) {
        const kind = werkzeug === 'messenFlaeche' ? 'area'
            : werkzeug === 'kalibrieren' ? 'kalibrieren' : 'distance';
        let m = toolStore.messungInArbeit;
        if (!m || m.page !== treffer.index || m.kind !== kind) {
            toolStore.messungInArbeit = { page: treffer.index, kind, points: [[xPt, yPt]] };
            return;
        }
        if (kind === 'area') {
            const [sx, sy] = m.points[0];
            if (m.points.length >= 3
                && Math.hypot(xPt - sx, yPt - sy) < FLAECHE_SCHLUSS_RADIUS_PT) {
                annotStore.fuegeHinzu({
                    type: 'measure', kind: 'area', page: m.page, points: m.points,
                });
                toolStore.messungInArbeit = null;
                return;
            }
            m.points.push([xPt, yPt]);
            return;
        }
        // Strecke / Kalibrierung: der zweite Punkt schließt ab.
        m.points.push([xPt, yPt]);
        if (kind === 'distance') {
            annotStore.fuegeHinzu({
                type: 'measure', kind: 'distance', page: m.page, points: m.points,
            });
        } else {
            const [a, b] = m.points;
            toolStore.kalibrierungAnfrage = {
                laengePt: Math.hypot(b[0] - a[0], b[1] - a[1]),
                page: m.page,
            };
        }
        toolStore.messungInArbeit = null;
    }

    function _tippAktion(ev) {
        const werkzeug = toolStore.aktivesWerkzeug;
        if (werkzeug !== 'kommentar' && werkzeug !== 'signatur'
            && werkzeug !== 'textfeld' && werkzeug !== 'stempel'
            && !MESS_WERKZEUGE.has(werkzeug)) return;
        const treffer = findeSeite(ev.clientX, ev.clientY);
        if (!treffer) return;
        const xPt = (ev.clientX - treffer.ursprungClientX) / treffer.zoom;
        const yPt = (ev.clientY - treffer.ursprungClientY) / treffer.zoom;

        if (MESS_WERKZEUGE.has(werkzeug)) {
            _messTipp(werkzeug, treffer, xPt, yPt);
            return;
        }

        if (werkzeug === 'textfeld') {
            // Läuft schon eine Bearbeitung, schließt der Außenklick sie —
            // der Tipp soll dann nicht sofort ein neues Feld anlegen.
            if (annotStore.offenesTextfeldId) return;
            if (performance.now() - (annotStore.textfeldGeschlossenUm ?? 0) < 400) return;
            const feld = annotStore.fuegeHinzu({
                type: 'textbox', page: treffer.index,
                x: Math.max(0, Math.min(treffer.breitePt - 40, xPt)),
                y: Math.max(0, Math.min(treffer.hoehePt - 20, yPt)),
                text: '',
                ...toolStore.textfeld,
            });
            annotStore.offenesTextfeldId = feld.id;
            return;
        }

        if (werkzeug === 'stempel') {
            const o = toolStore.stempel;
            const heute = new Date();
            const dd = String(heute.getDate()).padStart(2, '0');
            const mm = String(heute.getMonth() + 1).padStart(2, '0');
            const annot = annotStore.fuegeHinzu({
                type: 'stempel', page: treffer.index,
                x: Math.max(0, Math.min(treffer.breitePt, xPt)),
                y: Math.max(0, Math.min(treffer.hoehePt, yPt)),
                text: o.text || 'VORABZUG',
                farbe: o.farbe,
                groessePt: o.groessePt,
                winkelGrad: 12,
                mitDatum: o.mitDatum,
                // Das Datum wird beim Platzieren EINGEFROREN — ein Stempel
                // trägt den Tag des Stempelns, nicht den des Betrachtens.
                datum: `${dd}.${mm}.${heute.getFullYear()}`,
            });
            // Direkt verschiebbar, wie die Signatur:
            toolStore.waehleWerkzeug('lasso');
            annotStore.setzeAuswahl(treffer.index, [annot.id]);
            return;
        }

        if (werkzeug === 'kommentar') {
            const notiz = annotStore.fuegeHinzu({
                type: 'note', page: treffer.index,
                x: Math.max(0, Math.min(treffer.breitePt, xPt)),
                y: Math.max(0, Math.min(treffer.hoehePt, yPt)),
                farbe: NOTIZ_FARBE, text: '', erledigt: false,
            });
            annotStore.offeneNotizId = notiz.id;
            return;
        }

        // Signatur platzieren (falls eine gewählt wurde)
        const vorlage = toolStore.signaturZumPlatzieren;
        if (!vorlage) return;
        const w = Math.min(SIGNATUR_BREITE_PT, treffer.breitePt * 0.8);
        const h = w * vorlage.seitenverhaeltnis;
        const annot = annotStore.fuegeHinzu({
            type: 'signature', page: treffer.index,
            x: Math.max(0, Math.min(treffer.breitePt - w, xPt - w / 2)),
            y: Math.max(0, Math.min(treffer.hoehePt - h, yPt - h / 2)),
            w, h,
            strokes: vorlage.strokes,
            strichBreitePt: vorlage.strichBreitePt,
            farbe: vorlage.farbe,
            echterDruck: vorlage.echterDruck,
        });
        toolStore.signaturZumPlatzieren = null;
        // Direkt auswählbar zum Verschieben/Skalieren:
        toolStore.waehleWerkzeug('lasso');
        annotStore.setzeAuswahl(treffer.index, [annot.id]);
    }

    // ── DOM-Handler (vom Scroller aufgerufen) ───────────────────────────────

    function onPointerDown(ev) {
        if (ev.pointerType === 'mouse' && ev.button === 2) return;   // Kontextmenü ist eh unterdrückt
        const entscheidung = routing.pointerDown(_zuRouting(ev));
        if (entscheidung.aktion === 'ignorieren') return;

        scrollerRef.value.setPointerCapture(ev.pointerId);

        if (entscheidung.navAbbrechen) {
            // Der Stift gewinnt: laufenden Finger-Pan/Pinch verwerfen.
            gesten.brichAlle();
            fallbackNav.clear();
        }

        switch (entscheidung.aktion) {
            case 'nav':
                navTap = { pointerId: ev.pointerId, x0: ev.clientX, y0: ev.clientY, bewegt: false };
                gesten.onNavPointerDown(ev);
                break;
            case 'tinte':
            case 'tinte-provisorisch':
                _starteTinte(ev, entscheidung.werkzeug);
                break;
            case 'radierer':
            case 'radierer-provisorisch':
                _starteRadierer(ev);
                break;
            case 'lasso':
            case 'lasso-provisorisch':
                _starteLasso(ev);
                break;
            case 'pinch-umwandlung': {
                // Provisorischen Fingerstrich/-lasso verwerfen, beide Finger → Pinch.
                const laufend = strich ?? lasso;
                const erster = laufend && laufend.pointerId === entscheidung.ersterZeiger
                    ? { pointerId: laufend.pointerId, x: laufend.letztesClientX ?? ev.clientX, y: laufend.letztesClientY ?? ev.clientY }
                    : null;
                if (strich) { wetInkRef.value?.brich(); strich = null; }
                if (lasso) { wetInkRef.value?.brich(); lasso = null; }
                if (radierZug) _beendeRadierer();
                const paare = [{ pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY }];
                if (erster) paare.unshift(erster);
                gesten.uebernimmZeiger(paare);
                break;
            }
        }
    }

    function onPointerMove(ev) {
        _aktualisiereRadiererCursor(ev);
        // Stift-Hover hält die Handballen-Sperre frisch — auch ohne Kontakt.
        if (ev.pointerType === 'pen' && ev.buttons === 0) {
            routing.stiftNaehe();
            return;
        }
        if (fallbackNav.has(ev.pointerId)) { gesten.onNavPointerMove(ev); return; }

        const r = routing.pointerMove(_zuRouting(ev));
        if (!r.ziel) return;
        const laufend = strich ?? lasso;
        if (laufend && laufend.pointerId === ev.pointerId) {
            laufend.letztesClientX = ev.clientX;
            laufend.letztesClientY = ev.clientY;
        }
        if (r.ziel === 'nav') {
            if (navTap && navTap.pointerId === ev.pointerId
                && Math.hypot(ev.clientX - navTap.x0, ev.clientY - navTap.y0) > 6) {
                navTap.bewegt = true;
            }
            gesten.onNavPointerMove(ev);
        }
        else if (r.ziel === 'tinte') _bewegeTinte(ev);
        else if (r.ziel === 'radierer') _bewegeRadierer(ev);
        else if (r.ziel === 'lasso') _bewegeLasso(ev);
    }

    function onPointerUp(ev) {
        if (fallbackNav.delete(ev.pointerId)) { gesten.onNavPointerUp(ev); return; }
        const r = routing.pointerUp(_zuRouting(ev));
        if (r.ziel === 'nav') {
            gesten.onNavPointerUp(ev);
            if (navTap && navTap.pointerId === ev.pointerId) {
                if (!navTap.bewegt) _tippAktion(ev);
                navTap = null;
            }
        }
        else if (r.ziel === 'tinte') { _bewegeTinte(ev); _beendeTinte(true); }
        else if (r.ziel === 'radierer') _beendeRadierer();
        else if (r.ziel === 'lasso') { _bewegeLasso(ev); _beendeLasso(true); }
    }

    function onPointerCancel(ev) {
        if (fallbackNav.delete(ev.pointerId)) { gesten.onNavPointerCancel(ev); return; }
        const r = routing.pointerCancel(_zuRouting(ev));
        if (r.ziel === 'nav') gesten.onNavPointerCancel(ev);
        else if (r.ziel === 'tinte') {
            // Edge-Gestenübernahme: kurzer Ansatz verfällt, ein echter Strich
            // bleibt erhalten (Commit statt Datenverlust).
            const commit = (wetInkRef.value?.anzahlPunkte() ?? 0) > 2;
            _beendeTinte(commit);
        }
        else if (r.ziel === 'radierer') _beendeRadierer();
        else if (r.ziel === 'lasso') _beendeLasso(false);
    }

    function versteckeRadiererCursor() {
        wetInkRef.value?.versteckeRadierer();
    }

    return {
        onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
        versteckeRadiererCursor, routing,
    };
}
