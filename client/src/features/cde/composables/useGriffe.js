/**
 * useGriffe — Griffe im Raum (Teil XVI, S4).
 *
 * Kopiert das flood-2D-Muster (`useControlPointEditor`): Kugeln mit
 * unsichtbarer 1,1×-Trefferkugel, Long-Press auf dem Finger, Ziehebene je
 * Achse, Lot + Landescheibe während des Zugs, Kamera gesperrt. Was HIER
 * anders ist als dort: der Griff ist WERKZEUG-GEBUNDEN. Er weiss, welchen
 * Katalogeintrag er bedient und welche Felder er füllt (`Griffe.js`), und
 * das Ablegen ist wörtlich der Weg des Lageplan-Griffs:
 *
 *     starte(werkzeug, {subjekt}) → setzeWert(feld, …) → ausfuehren → wendeEintragAn
 *
 * Kein Griff schreibt an diesem Weg vorbei; kein Griff bewegt, was kein
 * Werkzeug bewegen könnte. Und die XZ-Griffe am Schacht FANGEN wie im Plan:
 * dieselben `fanglinienFuer/fange` in Ost/Nord — nicht eine zweite Rechnung.
 *
 * TABLET (2026-09-09): auf dem Finger gibt es kein Schweben, und genau daran
 * hingen die Nebengriffe. Deshalb ÖFFNET EIN TIPP ihre Gruppe — kurz auf den
 * Zug-Griff, ohne zu ziehen, und die Marken daneben stehen da, bis anderswo
 * getippt wird. Mit Maus tut das Schweben dasselbe; der Tipp ist der zweite
 * Weg zu derselben Sache, nicht eine zweite Sache.
 *
 * S10 ergänzt zwei Wirkungen, ohne den Weg zu ändern: ein TIPP-Griff
 * (`wirkung: 'tipp'`) bringt seine Werte fertig mit und führt beim Loslassen
 * ohne Zug aus — „Stützpunkt entfernen", „Stützpunkt einfügen". Und der
 * DREHGRIFF läuft auf einem Kreis um den Schwerpunkt: gezogen wird die Lage,
 * gefüllt wird der Winkel. Auf dem Finger brauchen auch Tipp-Griffe den
 * Long-Press — sonst löste jeder Wisch über die Fläche einen aus.
 */

import { computed, ref, watch } from 'vue';
import { begrenze, griffZuWerten, griffeFuer, schnittStrahlEbene, winkelGrad, ziehebene, MINDEST_ZUG_M } from '../services/Griffe.js';
import { eckFanglinien, fanglinienFuer, fange, kantenAnEcke } from '../services/Fanglinien.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { ACHSEN, RASTER_M, achsPassung, achsenAufSchirm, deltaFuer, deltaXZAusSchirm, ebeneBrauchbar, rasterFang, waehleAchse, zugText } from '../services/Achszug.js';
import { tokenFarben } from './useZeiger.js';

/** Hat dieses Rezept einen Griff am Klickpunkt? Das Rezept sagt es (`bauteilGriff`, A3). */
const ohneBauteilGriff = (id) => !!(id && rezeptNach(id)?.bauteilGriff === false);

/** Länge der Führungslinien beim Achszug (m je Seite). */
const ACHSLINIE_M = 120;

/** Fangradius im Raum (m) — grob zwei Fingerbreiten in üblicher Nähe. */
const FANG_RADIUS_M = 0.6;

/** Winkelraster beim Drehen (Grad) — Alt lässt frei, wie beim Längenraster. */
const WINKEL_RASTER_GRAD = 5;

/**
 * @param {object} opt
 * @param {import('vue').Ref} opt.engine
 * @param {object}   opt.bearbeitung        Store
 * @param {object}   opt.aenderungen        Store (wirksamerStand('lage'))
 * @param {() => object} opt.getSubjekt     das eingeordnete Bauteil (bearbeitung.bauteil)
 * @param {() => object} opt.getTypprofil
 * @param {() => string|null} [opt.getBauform]  Bauform des Subjekts (für den Bauteil-Griff)
 * @param {(modelId) => {x,y,z}|null} opt.getVersatz   Ladeversatz je Modell
 * @param {() => number} opt.getHoehenversatz
 * @param {(x, z) => number|null|undefined} [opt.getHoeheAn]
 * @param {(globalId) => Promise<object|null>} opt.holeKnotenSubjekt
 * @param {(globalId) => Array} [opt.holeKnotenAnschluesse]
 * @param {(globalId) => object|undefined} [opt.lieferstandVon]
 * @param {(eintraege) => Promise} opt.nachBauen
 * @param {() => string} [opt.getModellSha]
 * @param {() => string} [opt.getWer]
 * @param {(text) => void} [opt.melde]
 * @param {() => ({accent, warn, ok})} [opt.farben]
 */
export function useGriffe({ engine, bearbeitung, aenderungen, getSubjekt, getTypprofil, getBauform = null, getVersatz, getHoehenversatz,
                            getHoeheAn = null, holeKnotenSubjekt, holeKnotenAnschluesse = null, lieferstandVon = null,
                            nachBauen, getModellSha = null, getWer = null, melde = null, farben = null } = {}) {
    /** Die Griffe, wie zuletzt gebaut. */
    const griffe = ref([]);
    /** Der laufende Zug: { griff, achsen, ebene, start, pos, bewegt, linien, aktiv, fang } — oder null. */
    const zug = ref(null);
    /** Die Pille am gezogenen Griff — {x, y, text} in Canvas-Pixeln, oder null. */
    const pille = ref(null);
    /** Welche Nebengriff-Gruppe per TIPP offen steht (der Finger kann nicht schweben). */
    const offeneGruppe = ref(null);
    let _getroffen = null;

    /** Hat dieser Zug-Griff Nebengriffe, die ein Tipp zeigen könnte? */
    const hatNebengriffe = (key) => griffe.value.some(g => g.zeigtBei === key);

    // Griffe gibt es im Modus ohne Werkzeug — UND mit scharfem Werkzeug die,
    // die genau dieses Werkzeug bedienen: wer „Schacht verschieben" aus dem
    // Menü scharf schaltet, soll den Schacht ZIEHEN können (Fabio, PROD-Test
    // 2026-09-08: die Griffe verschwanden, das Formular blieb allein). Ein
    // Werkzeug ohne Griffe (kg, Anschliessen mit Tipp-Schlitz) zeigt keine —
    // der zweite Schlitz tippt auch auf Schächte.
    const bereit = computed(() => !!bearbeitung?.modusAn);

    // ── Aufbau ─────────────────────────────────────────────────────────────

    function neuBauen() {
        const e = engine?.value;
        if (!e) return;
        if (zug.value) return;                  // mitten im Zug nicht umbauen
        if (!bereit.value) { griffe.value = []; e.zeigeGriffe?.([]); return; }
        const subjekt = getSubjekt?.() ?? null;
        const schaechte = e.knotenGriffe?.() ?? [];
        const lageStand = aenderungen?.wirksamerStand?.('lage') ?? null;
        // EIGEN heisst „das Journal führt einen Bauplan dazu" — nicht „der
        // Modellname lautet so". Der Modellname trügt (Delta-Modell des
        // Editors), und der Store leitet es längst so ab (`eigenes`).
        const herkunft = subjekt?.stand?.bauplan ? 'cde' : 'geliefert';
        const alle = griffeFuer({ schaechte, lageStand, subjekt, typprofil: getTypprofil?.() ?? null, subjektHerkunft: herkunft,
                                  bauform: getBauform?.() ?? null });
        const scharf = bearbeitung?.scharfId ?? null;
        // Mit scharfem Werkzeug: nur die Griffe, die es bedienen — und nur am
        // gewählten Bauteil (ein Bild, eine Kugel; 27 Schachtkugeln wären wieder
        // das Durcheinander).
        const gid = bearbeitung?.bauteil?.globalId ?? null;
        // ECKEN NUR AUF KNOPFDRUCK (Teil XXII, Fabio 2026-09-18): die Eckgriffe
        // eines Erdkörpers stehen nur, solange „Ecken ziehen" für GENAU dieses
        // Bauteil läuft — dann aber alle, und nichts anderes daneben. Und ein
        // Erdkörper hat keinen Bauteil-Griff am Klickpunkt: ein Zucken beim
        // Wählen verschob sonst den ganzen Vorgang (Verschieben bleibt als
        // Werkzeug in der Tafel).
        const ecken = bearbeitung?.eckenFuer ?? null;
        const ohneGriff = ohneBauteilGriff(subjekt?.stand?.bauplan?.rezept);
        const sichtbar = ecken
            ? alle.filter(g => g.ecken && g.globalId === ecken)
            : alle.filter(g => !g.ecken && !(ohneGriff && g.art === 'bauteil' && g.globalId === subjekt?.globalId));
        griffe.value = scharf
            ? sichtbar.filter(g => g.werkzeug === scharf && (!gid || g.globalId === gid))
            : sichtbar;
        const f = (farben ?? tokenFarben)();
        e.zeigeGriffe?.(griffe.value, { radius: 'auto', farbe: f.accent, farbeForderung: f.warn,
                                        farbeEntfernen: f.danger, farbeEinfuegen: f.ok });
        // Eine per Tipp geöffnete Gruppe überlebt den Neuaufbau — sonst
        // schlösse sich das Menü auf dem Finger bei jedem Journalschritt.
        if (offeneGruppe.value && griffe.value.some(g => g.key === offeneGruppe.value)) {
            e.griffHervorheben?.(offeneGruppe.value);
        } else {
            offeneGruppe.value = null;
        }
    }

    // Auch die BAUFORM: `einordne` setzt erst das Bauteil und erst nach dem
    // Resolver die Einordnung — der Bauteil-Griff braucht die Bauform, sonst
    // stand er im Headless-Lauf nie da (Griffe gebaut, Bauform noch null).
    // Auch der BAUPLAN (S10): nach dem Ablegen wird dasselbe Bauteil neu
    // eingeordnet — gleiche GlobalId, gleiche Bauform, aber ein Punkt mehr
    // oder weniger. Ohne diese Quelle blieben Stützpunkt-, Kanten- und
    // Tipp-Griffe am Stand von vorher stehen (der Journal-Zähler feuert zu
    // früh: da ist das frische Subjekt noch nicht da).
    watch(() => [bearbeitung?.modusAn, bearbeitung?.scharfId, getSubjekt?.()?.globalId, getBauform?.(), aenderungen?.anzahl,
                 getSubjekt?.()?.stand?.bauplan, bearbeitung?.eckenFuer], () => neuBauen());

    // ── Greifen ────────────────────────────────────────────────────────────

    /** Verbraucher für `onGreifen`: true (Maus/Stift), 'warten' (Finger), false. */
    function greifen(tipp) {
        if (!bereit.value || zug.value) return false;
        const key = engine?.value?.griffUnter?.(tipp.x, tipp.y);
        // Nur ein Griff, den es in DIESER Liste gibt — eine veraltete Kugel im
        // Overlay (Werkzeug gerade gewechselt) darf keinen Zug beginnen.
        if (!key || !griffe.value.some(g => g.key === key)) { schliesseGruppe(); return false; }
        _getroffen = key;
        return tipp.typ === 'touch' ? 'warten' : true;
    }

    /**
     * Das Werkzeug des Griffs scharf schalten — oder das schon scharfe
     * behalten (samt der Werte, die der Nutzer im Formular gesetzt hat, etwa
     * „wirklich mitführen"). Der Zug IST die Eingabe des Werkzeugs: die Felder
     * folgen live, die Vorschau zeichnet daraus, Loslassen = Übernehmen.
     *
     * SYNCHRON, wo es geht — der Zeiger-Stapel meldet den Zugbeginn und gleich
     * darauf Bewegungen. Nur ein FREMDER Schacht braucht sein Subjekt aus der
     * Engine (`holeKnotenSubjekt`, asynchron): dann läuft der Zug schon, und
     * die Felder folgen, sobald das Werkzeug scharf ist (`laed`).
     * @returns {{subjekt: object|null, warScharf: boolean, werteVorher: object, laed?: Promise<object|null>}|null}
     */
    function _werkzeugFuer(g) {
        const warScharf = bearbeitung?.scharfId === g.werkzeug && (g.art !== 'knoten' || bearbeitung?.bauteil?.globalId === g.globalId);
        const werteVorher = { ...(bearbeitung?.werte ?? {}) };
        if (warScharf) return { subjekt: bearbeitung.bauteil, warScharf, werteVorher };
        const scharfSchalten = (subjekt) => {
            if (!subjekt) { melde?.('Das Bauteil liess sich nicht einordnen.'); return null; }
            if (!bearbeitung.starte(g.werkzeug, { subjekt })) {
                melde?.(bearbeitung.letzterGrund || `${g.werkzeug} ist hier nicht möglich.`);
                return null;
            }
            return subjekt;
        };
        if (g.art !== 'knoten') {
            const subjekt = scharfSchalten(getSubjekt?.() ?? null);
            return subjekt ? { subjekt, warScharf: false, werteVorher } : null;
        }
        const laed = Promise.resolve(holeKnotenSubjekt?.(g.globalId)).then(scharfSchalten).catch(() => null);
        return { subjekt: null, warScharf: false, werteVorher, laed };
    }

    /** Das nachgeladene Schacht-Subjekt anbinden — oder den Zug beenden, wenn es keins gibt. */
    function _subjektAnbinden(z) {
        if (!z.laed) return;
        z.laed.then((subjekt) => {
            if (zug.value !== z) return;                 // der Zug ist schon vorbei
            if (!subjekt) { zugEnde({ abbruch: true }); return; }
            z.subjekt = subjekt;
            _werteLive(z, z.pos);
        });
    }

    function _werteLive(z, pos) {
        if (bearbeitung?.scharfId !== z.griff.werkzeug) return;   // Werkzeug noch nicht (oder nicht mehr) scharf
        const subjekt = z.subjekt ?? getSubjekt?.() ?? null;
        const werte = griffZuWerten(z.griff, pos, {
            versatz: subjekt?.versatz ?? getVersatz?.(z.griff.modelId ?? subjekt?.modelId) ?? null,
            hoehenversatz: subjekt?.hoehenversatz ?? getHoehenversatz?.() ?? 0,
        });
        for (const [feld, wert] of Object.entries(werte)) bearbeitung.setzeWert(feld, wert);
    }

    function zugStart(tipp) {
        const g = griffe.value.find(x => x.key === _getroffen);
        if (!g) return;
        const e = engine.value;
        // TIPP-GRIFF: nichts zu ziehen, nichts scharf zu schalten. Der Zug
        // läuft leer mit (der Zeiger-Stapel meldet ihn ohnehin), und
        // `zugEnde` legt mit den mitgebrachten Werten ab.
        if (g.wirkung === 'tipp') {
            zug.value = { griff: g, wirkung: 'tipp', pos: { ...g.pos }, bewegt: false, aktiv: [], linien: [], versatz: null, fang: null };
            e.griffHervorheben?.(g.key);
            pille.value = tipp?.px ? { x: tipp.px.x, y: tipp.px.y, text: g.rolle === 'entfernen' ? 'Stützpunkt entfernen' : 'Stützpunkt einfügen' } : null;
            return;
        }
        if (g.art === 'bauteil') { _bauteilZugStart(g, tipp); return; }
        const w = _werkzeugFuer(g);
        if (!w) { _getroffen = null; return; }
        const achsen = (tipp.shiftKey && g.alternativ) ? g.alternativ : g.achsen;
        const ebene = ziehebene(g.pos, achsen, e.blickrichtung?.() ?? null);
        const strahl0 = e.strahl?.(tipp.x, tipp.y);
        const start = (ebeneBrauchbar(strahl0, ebene.normal) ? schnittStrahlEbene(strahl0, ebene) : null) ?? { ...g.pos };
        // Für den Fall, dass die Ebene auf der Kante liegt (Kamera waagerecht
        // auf Bauteilhöhe — genau die Lage nach „auf Auswahl zoomen"): die
        // Bildschirmpassung wie beim Achszug.
        const projiziere = (p) => e.projectToScreen?.([p.x, p.y, p.z]) ?? null;
        const schirm = achsenAufSchirm({ punkt: g.pos, projiziere });
        const startPx = tipp?.px ? { x: tipp.px.x, y: tipp.px.y } : null;
        const meterJePixel = e.pixelmass?.(g.pos) ?? null;
        // Fanglinien EINMAL beim Aufnehmen — in Ost/Nord, wie im Plan.
        let linien = [];
        let versatz = null;
        if (g.art === 'knoten') {
            versatz = getVersatz?.(g.modelId) ?? { x: 0, y: 0, z: 0 };
            const zuProjekt = (p) => ({ ost: p.x + versatz.x, nord: -(p.z + versatz.z) });
            const anschluesse = (holeKnotenAnschluesse?.(g.globalId) ?? []).map(a => ({ globalId: a.globalId, name: a.name, fern: zuProjekt(a.fern) }));
            const nachbarn = griffe.value.filter(x => x.art === 'knoten' && x.globalId !== g.globalId)
                .map(x => ({ globalId: x.globalId, name: x.name, ...zuProjekt(x.pos) }));
            linien = fanglinienFuer({ ausgang: zuProjekt(g.pos), anschluesse, nachbarn });
        } else if (g.ecken && g.achsen === 'XZ' && Array.isArray(g.ring)) {
            // FÜHRUNGSLINIEN EINER ECKE (Teil XXII): in Welt (Ost = x,
            // Nord = −z, ohne Ladeversatz) — gefangen wird wie am Schacht.
            versatz = { x: 0, y: 0, z: 0 };
            linien = eckFanglinien(g.ring, g.index, { geschlossen: g.geschlossen });
        }
        zug.value = { griff: g, achsen, ebene, start, pos: { ...g.pos }, bewegt: false, linien, aktiv: [], versatz, fang: null,
                      schirm, startPx, meterJePixel,
                      radius: g.art === 'drehung' && g.zentrum ? Math.hypot(g.pos.x - g.zentrum.x, g.pos.z - g.zentrum.z) : null,
                      subjekt: w.subjekt, warScharf: w.warScharf, werteVorher: w.werteVorher, laed: w.laed ?? null };
        _subjektAnbinden(zug.value);
        _geistAufstellen(zug.value);
        e.griffHervorheben?.(g.key);
        _zeige(tipp);
    }

    // ── Geistnetz (S7): das Bauteil folgt dem Zug, das Modell bleibt bis zum Loslassen ──
    //
    // Nur für Griffe, die das Bauteil als GANZES verschieben (lage): Bauteil-,
    // Knoten- und Bezugshöhen-Griff. Sohlgriffe sind Forderungen (nichts
    // bewegt sich), Stützpunkte bauen die Vorschau aus dem Bauplan neu.
    const GEIST_ARTEN = new Set(['bauteil', 'knoten', 'bezugshoehe']);

    function _geistAufstellen(z) {
        const e = engine.value;
        const g = z.griff;
        if (!GEIST_ARTEN.has(g.art) || g.modelId == null || g.localId == null || !e?.geistLaden) return;
        const f = (farben ?? tokenFarben)();
        z.geist = Promise.resolve(e.geistLaden(g.modelId, g.localId)).then((netz) => {
            if (!netz || zug.value !== z) return false;
            const ok = e.zeigeGeist?.(netz, { farbe: f.accent });
            if (ok) e.geistVersetzen?.(_delta(z));
            return !!ok;
        }).catch(() => false);
    }

    const _delta = (z) => ({ x: z.pos.x - z.griff.pos.x, y: z.pos.y - z.griff.pos.y, z: z.pos.z - z.griff.pos.z });

    /** Rasterfang im Raum — Alt lässt frei (flood-3D-Muster). */
    const _raster = (tipp) => (tipp?.altKey ? 0 : RASTER_M);

    function zugBewegt(tipp) {
        const z = zug.value;
        if (!z) return;
        const e = engine.value;
        if (z.wirkung === 'tipp') return;                  // ein Tipp bewegt nichts
        if (z.griff.art === 'bauteil') { _bauteilZugBewegt(z, tipp); return; }
        if (z.griff.art === 'drehung') { _drehZugBewegt(z, tipp); return; }
        const strahl = e.strahl?.(tipp.x, tipp.y);
        let d;
        if (ebeneBrauchbar(strahl, z.ebene.normal)) {
            const hit = schnittStrahlEbene(strahl, z.ebene);
            if (!hit) return;
            d = begrenze({ x: hit.x - z.start.x, y: hit.y - z.start.y, z: hit.z - z.start.z }, z.achsen);
        } else if (tipp?.px && z.startPx) {
            // Ebene auf der Kante: aus dem Bildschirm-Delta rechnen.
            const sdx = tipp.px.x - z.startPx.x, sdy = tipp.px.y - z.startPx.y;
            if (z.achsen === 'Y') {
                const pass = achsPassung(sdx, sdy, z.schirm?.hoehe);
                d = deltaFuer({ achse: 'hoehe', t: pass.t, steil: pass.dev === 999, sdy, meterJePixel: z.meterJePixel });
            } else {
                const xz = deltaXZAusSchirm(sdx, sdy, z.schirm);
                d = { x: xz.x, y: 0, z: xz.z };
            }
        } else return;
        d = rasterFang(d, _raster(tipp));
        let pos = { x: z.griff.pos.x + d.x, y: z.griff.pos.y + d.y, z: z.griff.pos.z + d.z };
        z.aktiv = [];
        z.fang = null;
        if (z.linien.length && (z.griff.art === 'knoten' || z.griff.ecken)) {
            // Fanglinien schlagen das Raster (wie im Plan) — das Raster ist die schwächste Stufe.
            const v = z.versatz;
            const r = fange({ punkt: { ost: pos.x + v.x, nord: -(pos.z + v.z) }, linien: z.linien, radius: FANG_RADIUS_M, raster: 0,
                              meide: { ost: z.griff.pos.x + v.x, nord: -(z.griff.pos.z + v.z) } });
            pos = { x: r.punkt.ost - v.x, y: pos.y, z: -r.punkt.nord - v.z };
            z.aktiv = r.aktiv;
            z.fang = r.aktiv[0]?.name ?? null;
        }
        z.pos = pos;
        if (!z.bewegt && Math.hypot(pos.x - z.griff.pos.x, pos.y - z.griff.pos.y, pos.z - z.griff.pos.z) > MINDEST_ZUG_M) z.bewegt = true;
        e.griffVersetzen?.(z.griff.key, pos);
        e.geistVersetzen?.(_delta(z));
        _werteLive(z, pos);                       // die Vorschau liest die Felder
        _zeige(tipp);
    }

    function _zeige(tipp) {
        const z = zug.value;
        const e = engine.value;
        if (!z || !e) return;
        const f = (farben ?? tokenFarben)();
        const boden = getHoeheAn?.(z.pos.x, z.pos.z);
        e.zeigeZugbild?.({ pos: z.pos, boden: Number.isFinite(boden) ? boden : null, farbe: f.accent });
        // Die aktiven Fanglinien als lange gestrichelte Züge auf Griffhöhe.
        const linien = [];
        if (z.versatz && z.griff.ecken) {
            // Die anliegenden Kanten in ihrer Richtung — blass, immer: wohin
            // die Ecke gleitet, ohne dass eine Kante sich dreht (Teil XXII).
            for (const l of z.linien) {
                if (l.art !== 'kante' || z.aktiv.includes(l)) continue;
                const W = 60;
                linien.push({ art: 'linie', gestrichelt: true, farbe: f.accent,
                              punkte: [{ x: l.punkt.ost - l.richtung.ost * W, y: z.pos.y, z: -(l.punkt.nord - l.richtung.nord * W) },
                                       { x: l.punkt.ost + l.richtung.ost * W, y: z.pos.y, z: -(l.punkt.nord + l.richtung.nord * W) }] });
            }
        }
        if (z.versatz) {
            const v = z.versatz;
            for (const l of z.aktiv) {
                if (!l?.punkt || !l?.richtung) continue;
                const W = 200;
                const a = { ost: l.punkt.ost - l.richtung.ost * W, nord: l.punkt.nord - l.richtung.nord * W };
                const b = { ost: l.punkt.ost + l.richtung.ost * W, nord: l.punkt.nord + l.richtung.nord * W };
                linien.push({ art: 'linie', gestrichelt: true, farbe: f.warn,
                              punkte: [{ x: a.ost - v.x, y: z.pos.y, z: -a.nord - v.z }, { x: b.ost - v.x, y: z.pos.y, z: -b.nord - v.z }] });
            }
        }
        // Beim Achszug gehört die Ebene `fang` den Führungslinien (`_zeigeAchsen`).
        if (z.griff.art !== 'bauteil') e.overlayZeige?.('fang', linien);
        const d = { x: z.pos.x - z.griff.pos.x, y: z.pos.y - z.griff.pos.y, z: z.pos.z - z.griff.pos.z };
        const teile = [];
        const dxz = Math.hypot(d.x, d.z);
        if (z.griff.art === 'drehung') teile.push(`${Number(z.winkel ?? 0).toFixed(1).replace('.', ',')}°`);
        else if (z.griff.art === 'bauteil') teile.push(zugText(d, z.achse));
        else if (z.achsen === 'Y') teile.push(zugText(d, 'hoehe', { felder: ['hoehe'] }));
        else teile.push(zugText(d, null, { felder: ['ost', 'nord'] }));
        if (z.fang) teile.push(`→ ${z.fang}`);
        // Die beiden Kanten an der gezogenen Ecke — die Masse, nach denen man zieht.
        if (z.griff.ecken && z.achsen === 'XZ') {
            const k = kantenAnEcke(z.griff.ring, z.griff.index, z.pos, { geschlossen: z.griff.geschlossen });
            if (k.length) teile.push(k.map(m => `${m.toFixed(2).replace('.', ',')} m`).join(' | '));
        }
        if (z.griff.forderung) teile.push('Forderung');
        pille.value = tipp?.px ? { x: tipp.px.x, y: tipp.px.y, text: teile.join(' · ') } : null;
    }

    async function zugEnde({ abbruch = false } = {}) {
        const z = zug.value;
        zug.value = null;
        pille.value = null;
        _getroffen = null;
        const e = engine.value;
        e?.zeigeZugbild?.(null);
        e?.overlayLeere?.('fang');
        e?.griffHervorheben?.(null);
        e?.geistLeeren?.();
        if (!z) return null;
        // TIPP-GRIFF: der Griff selbst IST die Eingabe — die Werte bringt er mit.
        if (z.wirkung === 'tipp') {
            if (abbruch) { neuBauen(); return null; }
            return ablegen(z.griff, z.griff.pos, { werte: z.griff.werte });
        }
        // Ein fremder Schacht: erst das Subjekt abwarten — ohne eins gibt es nichts abzulegen.
        if (z.laed) { z.subjekt = (await z.laed) ?? null; if (!z.subjekt) { neuBauen(); return null; } }
        if (abbruch || !z.bewegt) {
            // War das Werkzeug schon vor dem Griff scharf (aus dem Menü), bleibt
            // es das — nur die Felder gehen auf ihren Stand zurück. Sonst räumt
            // der Griff sein Werkzeug wieder ab.
            if (z.warScharf) { for (const [k, v] of Object.entries(z.werteVorher ?? {})) bearbeitung.setzeWert(k, v); }
            else bearbeitung.abbrechen();
            // AUFGESETZT UND WIEDER LOS, OHNE ZU ZIEHEN — das ist ein Tipp, und
            // auf dem Finger die einzige Art, ein Menü zu öffnen. Hat der Griff
            // Nebengriffe, stehen sie ab jetzt da (bis anderswo getippt wird).
            if (!abbruch && hatNebengriffe(z.griff.key)) offeneGruppe.value = z.griff.key;
            neuBauen();
            return null;
        }
        return ablegen(z.griff, z.pos, { subjekt: z.subjekt, scharf: true });
    }

    // ── Der Drehzug (S10) ──────────────────────────────────────────────────
    //
    // Der Griff läuft auf seinem Kreis um den Schwerpunkt; gezogen wird die
    // Lage, gefüllt wird der WINKEL. Das Winkelraster (5°, Alt frei) ist das
    // Gegenstück zum Längenraster — ohne es trifft niemand 90° freihändig.

    function _drehZugBewegt(z, tipp) {
        const e = engine.value;
        const c = z.griff.zentrum;
        const strahl = e.strahl?.(tipp.x, tipp.y);
        const hit = (strahl && ebeneBrauchbar(strahl, z.ebene.normal)) ? schnittStrahlEbene(strahl, z.ebene) : null;
        if (!hit || !c || !(z.radius > 1e-6)) return;
        let grad = winkelGrad(c, z.griff.pos, hit);
        if (!Number.isFinite(grad)) return;
        const raster = tipp?.altKey ? 0 : WINKEL_RASTER_GRAD;
        if (raster > 0) grad = Math.round(grad / raster) * raster;
        const a0 = Math.atan2(z.griff.pos.z - c.z, z.griff.pos.x - c.x);
        const a = a0 + (grad * Math.PI) / 180;
        z.pos = { x: c.x + Math.cos(a) * z.radius, y: z.griff.pos.y, z: c.z + Math.sin(a) * z.radius };
        z.winkel = grad;
        if (!z.bewegt && Math.abs(grad) >= (raster || 0.5)) z.bewegt = true;
        e.griffVersetzen?.(z.griff.key, z.pos);
        _werteLive(z, z.pos);
        _zeige(tipp);
    }

    // ── Der Achszug am Bauteil-Griff (S5) ──────────────────────────────────
    //
    // Flood-3D-Muster (kopiert): Führungslinien durch den Griff, die Achse
    // folgt der Zugrichtung mit Hysterese, Ost/Nord aus der waagerechten
    // Ebene in Griffhöhe, Höhe aus der Bildschirmpassung. Was HIER anders ist:
    // das Werkzeug `verschieben` ist ab dem Aufnehmen scharf, jede Bewegung
    // schreibt die Felder — und DIE VORSCHAU (Box, Versatzpfeil, Lot, Chip)
    // ist dieselbe wie beim Tippen ins Formular. Esc bricht ab (Zeiger-Stapel),
    // der Finger armiert per Long-Press, Strg erzwingt die Höhe.

    function _bauteilZugStart(g, tipp) {
        const e = engine.value;
        const w = _werkzeugFuer(g);
        if (!w) { _getroffen = null; return; }
        const projiziere = (p) => e.projectToScreen?.([p.x, p.y, p.z]) ?? null;
        const ebene = ziehebene(g.pos, 'XZ');
        const strahl0 = e.strahl?.(tipp.x, tipp.y);
        const start = (ebeneBrauchbar(strahl0) ? schnittStrahlEbene(strahl0, ebene) : null) ?? { ...g.pos };
        zug.value = {
            griff: g, achsen: 'XYZ', ebene, start, pos: { ...g.pos }, bewegt: false, linien: [], aktiv: [], versatz: null, fang: null,
            startPx: tipp?.px ? { x: tipp.px.x, y: tipp.px.y } : null,
            schirm: achsenAufSchirm({ punkt: g.pos, projiziere }),
            achsZustand: { achse: null }, achse: null,
            erlaubt: g.achsenErlaubt ?? [],
            meterJePixel: e.pixelmass?.(g.pos) ?? null,
            subjekt: w.subjekt, warScharf: w.warScharf, werteVorher: w.werteVorher,
        };
        _geistAufstellen(zug.value);
        e.griffHervorheben?.(g.key);
        _zeigeAchsen();
        _zeige(tipp);
    }

    function _bauteilZugBewegt(z, tipp) {
        const e = engine.value;
        if (!tipp?.px || !z.startPx) return;
        const sdx = tipp.px.x - z.startPx.x, sdy = tipp.px.y - z.startPx.y;
        const wahl = waehleAchse(z.achsZustand, {
            sdx, sdy, schirm: z.schirm, erlaubt: z.erlaubt, erzwinge: tipp.ctrlKey ? 'hoehe' : null,
        });
        z.achsZustand = wahl.zustand;
        z.achse = wahl.achse;
        if (!wahl.halten && wahl.achse) {
            // Die Ebene nur, wenn der Strahl sie steil genug trifft — sonst die Passung.
            const strahl = wahl.achse === 'hoehe' ? null : e.strahl?.(tipp.x, tipp.y);
            const hit = (strahl && ebeneBrauchbar(strahl)) ? schnittStrahlEbene(strahl, z.ebene) : null;
            const d = rasterFang(deltaFuer({ achse: wahl.achse, t: wahl.t, steil: wahl.steil, hit, start: z.start, sdy, meterJePixel: z.meterJePixel }), _raster(tipp));
            const pos = { x: z.griff.pos.x + d.x, y: z.griff.pos.y + d.y, z: z.griff.pos.z + d.z };
            z.pos = pos;
            if (!z.bewegt && Math.hypot(d.x, d.y, d.z) > MINDEST_ZUG_M) z.bewegt = true;
            e.griffVersetzen?.(z.griff.key, pos);
            e.geistVersetzen?.(d);
            // LIVE in die Felder — die Vorschau (useVorschau) zeichnet daraus
            // Box, Versatzpfeil, Lot und Chip, wie beim Tippen.
            _werteLive(z, pos);
        }
        _zeigeAchsen();
        _zeige(tipp);
    }

    /** Die drei Führungslinien durch den Griff — die gewählte deckend, die anderen blass. */
    function _zeigeAchsen() {
        const z = zug.value;
        const e = engine.value;
        if (!z || !e) return;
        const f = (farben ?? tokenFarben)();
        const p = z.griff.pos;
        const linien = z.erlaubt.map((name) => {
            const r = ACHSEN[name].richtung;
            return {
                art: 'linie', farbe: f[ACHSEN[name].farbe] ?? f.accent, opacity: z.achse === name ? 0.95 : 0.35,
                punkte: [
                    { x: p.x - r.x * ACHSLINIE_M, y: p.y - r.y * ACHSLINIE_M, z: p.z - r.z * ACHSLINIE_M },
                    { x: p.x + r.x * ACHSLINIE_M, y: p.y + r.y * ACHSLINIE_M, z: p.z + r.z * ACHSLINIE_M },
                ],
            };
        });
        e.overlayZeige?.('fang', linien);
    }

    // ── Ablegen: der EINE Katalogweg ───────────────────────────────────────

    async function ablegen(griff, pos, { subjekt: gegeben = null, scharf = false, werte: fest = null } = {}) {
        try {
            const subjekt = gegeben ?? (griff.art === 'knoten'
                ? await holeKnotenSubjekt?.(griff.globalId)
                : getSubjekt?.());
            if (!subjekt) { melde?.('Das Bauteil liess sich nicht einordnen.'); return null; }
            // Der Zug hat das Werkzeug schon scharf (mit den Werten des Nutzers);
            // nur ein Drop OHNE Zug (Test, Skript) startet es hier.
            if (!(scharf && bearbeitung.scharfId === griff.werkzeug) && !bearbeitung.starte(griff.werkzeug, { subjekt })) {
                melde?.(bearbeitung.letzterGrund || `${griff.werkzeug} ist hier nicht möglich.`);
                return null;
            }
            // Ein Tipp-Griff bringt seine Werte mit; ein Zug-Griff rechnet sie aus der Lage.
            const werte = fest ?? griffZuWerten(griff, pos, {
                versatz: subjekt.versatz ?? getVersatz?.(griff.modelId ?? subjekt.modelId) ?? null,
                hoehenversatz: subjekt.hoehenversatz ?? getHoehenversatz?.() ?? 0,
            });
            for (const [feld, wert] of Object.entries(werte)) bearbeitung.setzeWert(feld, wert);
            const eintraege = await bearbeitung.ausfuehren({
                wer: getWer?.() ?? '',
                modellSha: getModellSha?.() ?? null,
                subjekt,
                basis: lieferstandVon?.(griff.globalId) ?? undefined,
                modell: griff.herkunft === 'cde' ? 'cde' : 'geliefert',
            });
            if (!eintraege) { melde?.(bearbeitung.letzterGrund || 'Nichts einzutragen.'); return null; }
            await nachBauen?.(eintraege);
            return eintraege;
        } catch (fehler) {
            console.error('cde: griff', fehler);
            melde?.(`Fehler: ${fehler?.message ?? fehler}`);
            return null;
        } finally {
            bearbeitung.abbrechen();
            neuBauen();
        }
    }

    /** Die per Tipp geöffnete Nebengriff-Gruppe schliessen (Tipp daneben, Esc, Werkzeugwechsel). */
    function schliesseGruppe() {
        if (!offeneGruppe.value) return;
        offeneGruppe.value = null;
        engine?.value?.griffHervorheben?.(null);
    }

    return { griffe, zug, pille, bereit, offeneGruppe, neuBauen, greifen, zugStart, zugBewegt, zugEnde, ablegen, schliesseGruppe };
}
