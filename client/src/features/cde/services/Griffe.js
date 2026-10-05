/**
 * Griffe — werkzeug-gebundenes Ziehen, als Daten (Teil XVI, S4).
 *
 * Teil XI hat das freie Ziehen (Gizmo) bewusst entfernt: ein Griff, der
 * „irgendwohin" schiebt, schreibt Werte, die niemand bestellt hat. Ein
 * Griff ist ab jetzt die GESTE `griff` an einem FELD eines Katalogeintrags:
 *
 *   Schacht (geliefert)          XZ  → schacht-verschieben   ost/nord
 *   Achse geliefert, Rollen      Y   → sohlhoehen-setzen     anfang/ende (Forderung)
 *   Körper geliefert, Rolle      Y   → deckelhoehe-setzen    deckel      (Forderung)
 *   sonst mit Rolle sohlhoehe    Y   → bezugshoehe-setzen    hoehe
 *   eigenes Bauteil (Bauplan)    XZ (Shift: Y) → stuetzpunkt-verschieben  index + Punkt
 *   eigene Kantenmitte           XZ (Shift: Y) → kante-verschieben        index + Mitte
 *   eigenes Bauteil, Ring/Zug    W  (Kreis)    → drehen                   winkel
 *   hoehenfeld, netz             keine — Gelände wird durch Zug/Umriss geformt
 *
 * ZWEI WIRKUNGEN (S10). Die meisten Griffe werden GEZOGEN; zwei werden
 * ANGETIPPT, weil ihr Werkzeug nichts zu ziehen hat: „Stützpunkt entfernen"
 * und „Stützpunkt einfügen". Ein Tipp-Griff trägt seine Werte fertig
 * (`werte`) — der Weg zum Journal bleibt derselbe, nur die Geste ist kürzer.
 * Sie hängen als NEBENGRIFFE (`zeigtBei`) an ihrem Zug-Griff und erscheinen
 * erst, wenn der Zeiger dort steht: sonst stünden an einer Fläche mit zehn
 * Ecken vierzig Kugeln zugleich.
 *
 * TABLET-REGEL (2026-09-09): auf dem Finger gibt es kein SCHWEBEN — der
 * Auswahl-Handler schaltet es ausdrücklich ab. Alles, was nur beim Schweben
 * erscheint, wäre dort unerreichbar. Deshalb öffnet ein TIPP auf den
 * Zug-Griff dieselbe Gruppe, und was eine Modifikatortaste tut, tut hier ein
 * eigener Nebengriff: der Höhengriff ersetzt die Shift-Taste, mit der ein
 * Stützpunkt sonst in der Höhe wandert. Keine Bearbeitung darf an einer
 * Taste hängen, die das Gerät nicht hat.
 *
 * DIE FACHLOGIK LIEGT EINMAL: `griffeFuer` bedient den Lageplan (der nur die
 * XZ-Schachtgriffe zeichnet) UND den Raum. Die Zeichnung ist zwangsläufig
 * zweimal (Canvas 2D / three), die Frage „welcher Griff, welches Werkzeug,
 * welche Ebene, welcher Wert" nur hier.
 *
 * Rein: kein three, kein Vue. Vektoren sind {x, y, z}.
 */

import { nnAusWelt, weltAusNn } from './Hoehenbezug.js';
import { achsenErlaubt } from './Achszug.js';
import { rezeptNach } from './Bauteilrezepte.js';
import { regelwert } from './regeln/Regelwerk.js';
import { innenEcken, innenringName } from './gelaende/Innenecken.js';
import { massWert, querlage } from './gelaende/Eckmasse.js';

/** Wohin eine Mass-Ecke beim Zug darf (Teil XXII, Rest) — für die Oberfläche, die nicht in `gelaende/` greift. */
export { aufMasslinie } from './gelaende/Eckmasse.js';

/** Wie weit ein Griff mindestens bewegt sein muss, damit ein Ablegen zählt (m). */
export const MINDEST_ZUG_M = 0.01;

/**
 * WELCHE GRIFFE ZUSAMMENGEHÖREN (K5, Fabio 2026-09-20: „warum sieht man die
 * Griffpunkte schon, wenn man den Bearbeitungsmodus startet? Das sollte erst
 * gehen, wenn man ein spezifisches Werkzeug gewählt hat").
 *
 * Griffe stehen ab jetzt NUR mit scharfem Werkzeug. Eine strenge Gleichheit
 * „Griff-Werkzeug === scharfes Werkzeug" ginge aber zu weit: die Nebengriffe
 * „Stützpunkt entfernen/einfügen" tragen ein anderes Werkzeug als ihr
 * Elterngriff und wären dann unerreichbar. Deshalb Familien — wer eine davon
 * scharf hat, sieht die ganze Gruppe.
 */
export const GRIFF_FAMILIEN = Object.freeze({
    verschieben:   ['verschieben'],
    schacht:       ['schacht-verschieben'],
    punkte:        ['stuetzpunkt-verschieben', 'stuetzpunkt-entfernen', 'stuetzpunkt-einfuegen', 'kante-verschieben'],
    drehen:        ['drehen'],
    sohlen:        ['sohlhoehen-setzen'],
    deckel:        ['deckelhoehe-setzen'],
    bezug:         ['bezugshoehe-setzen'],
    ecken:         ['erdbau-stuetzpunkt-verschieben', 'erdbau-mass-setzen'],
    laengsschnitt: ['sohle-ziehen'],
    // Teil XXVII (B2/B6): das Bauwerk als Ganzes — Versatz und Drehung am gemeinsamen Schwerpunkt.
    bauwerk:       ['bauwerk-verschieben', 'bauwerk-drehen'],
});

/** Jedes Werkzeug, das im Bild einen Griff hat — die Tafel markiert sie (K5). */
export const GRIFF_WERKZEUGE = Object.freeze([...new Set(Object.values(GRIFF_FAMILIEN).flat())]);

/** Die Familie eines Werkzeugs, oder null. */
export function griffFamilie(werkzeug) {
    if (!werkzeug) return null;
    for (const [name, liste] of Object.entries(GRIFF_FAMILIEN)) if (liste.includes(werkzeug)) return name;
    // EIN FELDSETZER IST SEINE EIGENE FAMILIE (Teil XXVII, B6): „Wandhöhe ändern"
    // scharf → der Höhengriff der Wand. Ohne Liste: das Feld erklärt seinen Griff.
    if (typeof werkzeug === 'string' && werkzeug.endsWith('-setzen')) return `feld:${werkzeug}`;
    return null;
}

/**
 * Steht dieser Griff gerade im Bild? DIE EINE REGEL für Raum, Lageplan und
 * Längsschnitt — vorher hatte jede Fläche ihre eigene (3D verengte, der Plan
 * sperrte bei scharfem Werkzeug, der Längsschnitt fragte nur den Modus).
 *
 * Drei Zustände: „Ecken ziehen" (nur Ecken) · ein scharfes Werkzeug (seine
 * Familie) · kein Werkzeug (alle Griffe des gewählten Bauteils, T3).
 *
 * @param {{modusAn: boolean, scharfId: string|null, eckenFuer: string|null}} zustand
 * @param {object} griff
 * @param {{subjektGid?: string|null}} [bezug]
 */
export function griffeFrei(zustand, griff, { subjektGid = null } = {}) {
    if (!zustand?.modusAn || !griff) return false;
    // „Ecken ziehen" ist der eigene Schalter dafür (Fabio 2026-09-18) und
    // zeigt AUSSCHLIESSLICH die Ecken dieses einen Bauteils.
    if (zustand.eckenFuer) return !!griff.ecken && griff.globalId === zustand.eckenFuer;
    // GRIFFE BEIM ANTIPPEN (Teil XXXI, T3 — Fabio 2026-10-05, E-T1: „Griffe
    // sofort beim Antippen … beim Bearbeiten"): im Bearbeiten-Modus ohne
    // scharfes Werkzeug stehen ALLE Familien des gewählten Bauteils — Punkte,
    // Kanten, Verschieben, Drehen, Feldmasse, Ecken. Der Knopf von damals ist
    // der Bearbeiten-Modus selbst; ohne gewähltes Bauteil steht nichts (ein
    // Tipp wählt nur aus). Ein Zug schaltet das Werkzeug seines Griffs scharf
    // (`useGriffe`) und kehrt danach hierher zurück. Längsschnitt (ohne
    // Subjekt) und Lageplan fragen dieselbe Regel.
    if (!zustand.scharfId) return !!subjektGid && griff.globalId === subjektGid;
    if (griff.ecken) return false;
    const familie = griffFamilie(zustand.scharfId);
    if (!familie || familie !== griffFamilie(griff.werkzeug)) return false;
    // Knotengriffe sind SUBJEKTLOS (alle Schächte des Modells, nicht nur das
    // gewählte Bauteil) — genau die Regression vom 2026-09-08, als ein aus dem
    // Menü scharf geschaltetes „Schacht verschieben" keinen Griff mehr zeigte.
    if (griff.art === 'knoten') return !subjektGid || griff.globalId === subjektGid;
    return !subjektGid || !griff.globalId || griff.globalId === subjektGid;
}

/**
 * DER VERSCHIEBE-GIZMO (K6, Fabio 2026-09-20: „keine Verschiebung mit den
 * Griffpunkten hat funktioniert").
 *
 * Bis hierher gab es EINEN Griff, und die Achse folgte der Zugrichtung mit
 * 14° Fangwinkel. Im Browser gemessen: ein waagerechter Zug über 96 px, der
 * zwischen den projizierten Achsen lag, fing gar keine — die Pille blieb auf
 * 0,00 und beim Loslassen wurde nichts geschrieben. Man musste die Achse
 * treffen, ohne sie zu sehen (die Führungslinien standen auf Deckkraft 0,35).
 *
 * Jetzt sind die Achsen GEGENSTÄNDE: drei Pfeile (Ost rot, Nord grün, Höhe
 * blau) und ein Quadrat für die Ebene. Man greift, was man sieht. Teil XI
 * bleibt gewahrt — jeder Teil ist werkzeug-gebunden und füllt dieselben
 * Felder (`ost`, `nord`, `hoehe`) wie das Formular.
 *
 * `richtung` ist ein beliebiger Einheitsvektor, nicht nur eine Weltachse:
 * darauf setzt die Etappe „Körper bearbeiten" auf (eine Fläche bekommt einen
 * Pfeil entlang ihrer Normalen).
 */
export function gizmoTeile({ traeger, globalId, name = '', herkunft = 'geliefert', pos, anker,
                             erlaubt = ACHS_NAMEN_GIZMO, werkzeug, felder = [], modelId = null, localId = null } = {}) {
    if (!traeger || !_endlich(pos)) return [];
    const gemeinsam = { globalId, name, herkunft, art: 'bauteil', gizmo: traeger, werkzeug, felder,
                        pos: { x: pos.x, y: pos.y, z: pos.z }, modelId, localId,
                        ...(anker ? { anker: { x: anker.x, y: anker.y, z: anker.z } } : {}) };
    const aus = [];
    for (const name2 of erlaubt) {
        const a = GIZMO_ACHSEN[name2];
        if (!a) continue;
        aus.push({ ...gemeinsam, key: `${traeger}:${name2}`, achsen: a.achsen, form: 'pfeil',
                   achsName: name2, richtung: { ...a.richtung }, farbrolle: a.farbe });
    }
    // Das Quadrat zieht frei in der WAAGERECHTEN — der häufigste Fall, und der
    // einzige, für den man sonst zwei Pfeile nacheinander bräuchte.
    if (erlaubt.includes('ost') && erlaubt.includes('nord')) {
        aus.push({ ...gemeinsam, key: `${traeger}:ebene`, achsen: 'XZ', form: 'quadrat',
                   achsName: 'ebene', richtung: null, farbrolle: 'accent' });
    }
    return aus;
}

/** Die drei Achsen des Gizmos — Richtung und Farbrolle. */
const GIZMO_ACHSEN = Object.freeze({
    ost:   { richtung: { x: 1, y: 0, z: 0 },  achsen: 'X', farbe: 'danger' },
    nord:  { richtung: { x: 0, y: 0, z: -1 }, achsen: 'Z', farbe: 'ok' },
    hoehe: { richtung: { x: 0, y: 1, z: 0 },  achsen: 'Y', farbe: 'accent' },
});
const ACHS_NAMEN_GIZMO = Object.freeze(Object.keys(GIZMO_ACHSEN));

/**
 * WO der Gizmo sitzt.
 *
 * Am Klickpunkt, wenn er zu DIESEM Bauteil gehört — dort liegen Hand und
 * Finger. Sonst (Baumklick, Palette, Prüfliste) an der Ankerstelle: bei einer
 * 300-m-Haltung liegt ein fremder Klickpunkt oft ausserhalb des Bildes.
 */
export function gizmoSitz(subjekt) {
    const p = _endlich(subjekt?.auswahlpunkt) ? subjekt.auswahlpunkt : subjekt?.anker;
    return { x: p.x, y: p.y, z: p.z };
}

/** Ein Bauteil mit weniger Punkten als hier lässt sich nicht mehr sinnvoll drehen. */
const DREH_MINDEST_PUNKTE = 2;

/**
 * Hat dieser Bauplan Ecken, die „Ecken ziehen" zeigen kann (Teil XXII)? Ein
 * Erdbau-Vorgang mit mindestens einer Punktliste — oder ein Rezept, das
 * Ecken nennt, die kein Punkt im Journal sind (Teil XXII, Rest: Gerinne,
 * Böschungsfuss, Kanalgraben, Baugrube ums Bauwerk).
 */
export function hatErdbauEcken(bauplan) {
    if (!bauplan) return false;
    return _punktlisten(bauplan).some(l => l.punkte.length >= 2) || typeof rezeptNach(bauplan.rezept)?.ecken === 'function';
}

/**
 * Die Ecken eines Vorgangs, die in seinen OPERATIONEN stehen (Teil XXI, P5):
 * das Rezept sagt es (`punktlisten`, Teil XXIII A2). Kanalgraben und
 * Bauwerksgrube haben keine — sie folgen ihrer Haltung bzw. ihrem Bauwerk.
 */
function _punktlisten(bauplan) {
    if (!bauplan) return [];
    return rezeptNach(bauplan.rezept)?.punktlisten?.(bauplan.parameter) ?? [];
}

/**
 * @param {object} q
 * @param {Array}  [q.schaechte]     `engine.knotenGriffe()` — {globalId, name, modelId, localId, punkt, herkunft}
 * @param {Map}    [q.lageStand]     `aenderungen.wirksamerStand('lage')` — Anker je GlobalId
 * @param {object} [q.subjekt]       das eingeordnete Bauteil (anker, achse, oberkante, bezugshoehe, stand, …)
 * @param {object} [q.typprofil]     das Typprofil des Subjekts — sagt, welche ROLLEN es kennt
 * @param {'geliefert'|'cde'} [q.subjektHerkunft]
 * @returns {Array<object>} Griffe, jeder mit key/globalId/name/herkunft/art/pos/achsen/werkzeug/felder
 */
export function griffeFuer({ schaechte = [], lageStand = null, subjekt = null, typprofil = null, subjektHerkunft = 'geliefert', bauform = null, vorgang = null,
                             eigene = null, geloest = null } = {}) {
    const aus = [];

    // 1. Schachtgriffe — nur GELIEFERTE: der Ort eines eigenen Schachts lebt im
    //    Bauplan, und eine `lage` darauf läse das Fachmodell nie (G1).
    for (const s of schaechte) {
        if (s.herkunft !== 'geliefert' || !s.globalId || !_endlich(s.punkt)) continue;
        // Der Griff sitzt an der WIRKSAMEN Lage: ein schon verschobener Schacht
        // steht im Journal, die Achslese kennt nur den Lieferort.
        const l = lageStand?.get?.(s.globalId);
        const p = (Number.isFinite(l?.x) && Number.isFinite(l?.z)) ? { x: l.x, y: Number.isFinite(l.y) ? l.y : s.punkt.y, z: l.z } : s.punkt;
        aus.push({
            key: `knoten:${s.globalId}`, globalId: s.globalId, name: s.name ?? '', herkunft: 'geliefert',
            art: 'knoten', pos: { x: p.x, y: p.y, z: p.z }, achsen: 'XZ',
            werkzeug: 'schacht-verschieben', felder: ['ost', 'nord'],
            modelId: s.modelId ?? null, localId: s.localId ?? null,
        });
    }

    // 1b. DER BAUTEIL-GRIFF (S5): sitzt am AUSWAHLPUNKT (wo der Klick das Bauteil
    //    traf) und schiebt das GANZE Bauteil — entlang Ost, Nord oder Höhe, die
    //    Achse wählt die Zugrichtung (`Achszug.js`). Er bedient `verschieben`:
    //    geliefert → `lage` am Anker, eigen → der Bauplan wandert. Gelände hat
    //    keinen (wird geformt, nicht geschoben); ohne umkehrbare Lage auch nicht.
    if (subjekt?.globalId && _endlich(subjekt.anker) && subjekt.lageUmkehrbar !== false) {
        const erlaubt = achsenErlaubt(bauform);
        if (erlaubt.length) {
            aus.push(...gizmoTeile({
                traeger: `bauteil:${subjekt.globalId}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
                herkunft: subjektHerkunft, erlaubt,
                pos: gizmoSitz(subjekt), anker: { x: subjekt.anker.x, y: subjekt.anker.y, z: subjekt.anker.z },
                werkzeug: 'verschieben', felder: ['ost', 'nord', 'hoehe'],
                modelId: subjekt.modelId ?? null, localId: subjekt.localId ?? null,
            }));
        }
    }

    // 2. Griffe am SUBJEKT
    if (!subjekt?.globalId) return aus;
    const rolle = (r) => !!typprofil?.felder?.[r];
    const bauplan = subjekt.stand?.bauplan ?? null;

    // Ein BAUPLAN heisst „hier entstanden" — verlässlicher als jede
    // Herkunftsangabe des Aufrufers (der Modellname trügt, siehe Delta-Modell).
    const eigen = subjektHerkunft === 'cde' || !!bauplan;
    // Die Ecken stehen in `parameter.punkte` — das sagt das Rezept (`punkteIn`,
    // Teil XXIII A3); ob die letzte Kante mitzählt, sagt `geschlossen`.
    const rezept = bauplan ? rezeptNach(bauplan.rezept) : null;
    if (eigen && bauplan && rezept?.punkteIn === 'parameter') {
        const punkte = (Array.isArray(bauplan.parameter?.punkte) ? bauplan.parameter.punkte : [])
            .map(p => (Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite) ? p : null));
        const ring = !!rezept.geschlossen;
        const gid = subjekt.globalId;
        const mindest = ring ? 3 : 2;
        const gueltige = punkte.filter(Boolean).length;

        punkte.forEach((p, i) => {
            if (!p) return;
            const key = `stuetz:${gid}:${i}`;
            // KNOTEN (Teil XXXI, T7 — E-T3): liegt hier auch ein Punkt eines anderen eigenen Bauteils, ziehen beide
            // gemeinsam — Wand an Wand, Rohr am Schacht. „Lösen" (Nebengriff) nimmt sie für diesen Griff heraus.
            // Ein GELIEFERTER Schacht unter dem Punkt gehört dazu (Fabio 2026-10-05: „wie Schacht verschieben").
            const partner = [...knotenPartner(p, gid, eigene), ...gelieferteKnoten(p, schaechte, lageStand)];
            const geloestHier = !!geloest?.has?.(key);
            const mit = partner.length && !geloestHier ? partner : null;
            const knoten = mit ? { werte: { mit }, farbrolle: 'ok', knoten: mit.length } : {};
            aus.push({
                key, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'stuetzpunkt', index: i,
                pos: { x: p[0], y: p[1], z: p[2] },
                // Grundriss mit der Maus; Shift hält die Höhe fest bzw. zieht sie.
                achsen: 'XZ', alternativ: 'Y',
                werkzeug: 'stuetzpunkt-verschieben', felder: ['index', 'ost', 'nord', 'hoehe', 'mit'], ...knoten,
            });
            if (partner.length) {
                aus.push({
                    key: `loesen:${gid}:${i}`, globalId: gid, name: subjekt.name ?? '',
                    herkunft: 'cde', art: 'knoten-loesen', index: i,
                    pos: { x: p[0], y: p[1], z: p[2] }, achsen: 'XZ',
                    wirkung: 'loesen', farbrolle: geloestHier ? 'ok' : 'warn', zeigtBei: key, nebenVersatz: { x: 0, y: -2.2 },
                    titel: geloestHier ? 'Knoten verbinden' : `Knoten lösen (${partner.length})`,
                    werkzeug: 'stuetzpunkt-verschieben', felder: [],
                });
            }
            // Der HÖHENGRIFF — derselbe Stützpunkt, aber in der Höhe. Er ist
            // der Ersatz für die Shift-Taste, die es auf dem Tablet nicht
            // gibt; mit Maus bleibt Shift die Abkürzung.
            aus.push({
                key: `stuetz-hoch:${gid}:${i}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'stuetzpunkt', index: i,
                pos: { x: p[0], y: p[1], z: p[2] }, achsen: 'Y',
                rolle: 'hoehe', zeigtBei: key, nebenVersatz: { x: 1.7, y: 2.2 },
                werkzeug: 'stuetzpunkt-verschieben', felder: ['index', 'ost', 'nord', 'hoehe', 'mit'],
                ...(mit ? { werte: { mit } } : {}),
            });
            // Der Entfernen-Griff (S10) — nur, wenn genug übrig bleibt; sonst
            // wäre es ein toter Knopf (Gesetz 10), denn `anwenden` gäbe null.
            if (gueltige > mindest) {
                aus.push({
                    key: `stuetz-weg:${gid}:${i}`, globalId: gid, name: subjekt.name ?? '',
                    herkunft: 'cde', art: 'stuetzpunkt-weg', index: i,
                    pos: { x: p[0], y: p[1], z: p[2] }, achsen: 'XZ',
                    wirkung: 'tipp', rolle: 'entfernen', zeigtBei: key, nebenVersatz: { x: -1.7, y: 2.2 },
                    werkzeug: 'stuetzpunkt-entfernen', felder: ['index'], werte: { index: i },
                });
            }
        });

        // KANTEN: Mitte ziehen verschiebt BEIDE Endpunkte parallel; der „+"
        // daneben fügt an genau dieser Station einen Stützpunkt ein.
        const kanten = kantenVon(punkte, ring);
        for (const k of kanten) {
            const key = `kante:${gid}:${k.i}`;
            // Die Knoten an BEIDEN Enden (T7) — ohne die gelösten Ecken.
            const kmit = [...new Set([k.i, k.j].flatMap(idx => (geloest?.has?.(`stuetz:${gid}:${idx}`) || !punkte[idx])
                ? [] : knotenPartner(punkte[idx], gid, eigene)))].sort();
            aus.push({
                key, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'kante', index: k.i, index2: k.j,
                pos: k.mitte, achsen: 'XZ', alternativ: 'Y',
                werkzeug: 'kante-verschieben', felder: ['index', 'ost', 'nord', 'hoehe', 'mit'],
                ...(kmit.length ? { werte: { mit: kmit }, farbrolle: 'ok', knoten: kmit.length } : {}),
            });
            aus.push({
                key: `kante-plus:${gid}:${k.i}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'kante-plus', index: k.i,
                pos: k.mitte, achsen: 'XZ',
                wirkung: 'tipp', rolle: 'einfuegen', zeigtBei: key, nebenVersatz: { x: 0, y: 2.2 },
                werkzeug: 'stuetzpunkt-einfuegen', felder: ['station'], werte: { station: _runde(k.station) },
            });
        }

        // DER DREHGRIFF: auf einem Kreis um den Schwerpunkt, in dessen Höhe.
        // Das Werkzeug `drehen` hat sein Winkelfeld schon — der Griff ist nur
        // der andere Weg hinein (S8 hatte nur das Feld).
        const dreh = drehgriffFuer(punkte.filter(Boolean));
        if (dreh) {
            aus.push({
                key: `drehung:${gid}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'drehung', pos: dreh.pos, zentrum: dreh.zentrum, achsen: 'W',
                werkzeug: 'drehen', felder: ['winkel'],
            });
        }
        aus.push(...feldgriffeFuer(subjekt, bauplan, rezept, punkte.filter(Boolean)));
        return aus;
    }

    // ── DAS BAUWERK ALS GANZES (Teil XXVII, B2/B6) ──
    // Ein Behälter hat keine eigenen Punkte; das Subjekt bringt die seiner Teile
    // mit (`teilpunkte`). Versatz- und Drehgriff sitzen am gemeinsamen Schwerpunkt
    // — demselben, um den „Bauwerk drehen" dreht.
    if (eigen && bauplan && rezept?.behaelter && Array.isArray(subjekt.teilpunkte) && subjekt.teilpunkte.length) {
        const tp = subjekt.teilpunkte.filter(p => Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite));
        const dreh = drehgriffFuer(tp);
        if (dreh) {
            const gid = subjekt.globalId;
            const tief = Math.min(...tp.map(p => p[1]));
            aus.push({
                key: `bauwerk:${gid}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'bauwerk-versatz', pos: { x: dreh.zentrum.x, y: tief, z: dreh.zentrum.z },
                achsen: 'XZ', alternativ: 'Y', werkzeug: 'bauwerk-verschieben', felder: ['ost', 'nord', 'hoehe'],
            });
            aus.push({
                key: `bauwerk-drehung:${gid}`, globalId: gid, name: subjekt.name ?? '',
                herkunft: 'cde', art: 'drehung', pos: { ...dreh.pos, y: tief }, zentrum: dreh.zentrum, achsen: 'W',
                werkzeug: 'bauwerk-drehen', felder: ['winkel'],
            });
        }
        return aus;
    }

    // ── KNICKPUNKTE EINES ERDBAU-VORGANGS (Teil XX Stufe C / Teil XXI, P5) ──
    //
    // Fabio (2026-09-10): „Knickpunkte XYZ-ziehbar". Ein Erdbau-Vorgang hat
    // keine `punkte` im Bauplan — seine Ecken stecken in den OPERATIONEN
    // (`umriss`, `linie`, `stationen`), und ihre Höhen stehen dort in m NN.
    // Deshalb ein eigener Zweig: derselbe Griff, dieselben Achsen, dasselbe
    // Muster mit Höhengriff daneben — nur eine andere Fundstelle.
    //
    // ALLE ECKEN (Teil XXII, Fabio 2026-09-18: „dann an allen Ecken eines
    // Körpers"): auch die inneren — die Sohlkante einer Grube, die Krone einer
    // Schüttung. Sie stehen nicht im Journal, sie FOLGEN aus Umriss, Neigung
    // und Sohle (`Innenecken.js`); ein Zug an ihnen verschiebt die äussere
    // Ecke so, dass die innere am Ziel liegt, und ihr Höhengriff setzt die
    // Sohle (Krone) für den ganzen Körper.
    //
    // Jeder dieser Griffe trägt `ecken: true` — gezeigt werden sie nur, wenn
    // „Ecken ziehen" für dieses Bauteil läuft (`bearbeitung.eckenFuer`), und
    // `ring` (seine Nachbarn in Zeichenreihenfolge) für die Führungslinien.
    const rz = bauplan ? rezeptNach(bauplan.rezept) : null;
    if (eigen && bauplan && (typeof rz?.punktlisten === 'function' || typeof rz?.ecken === 'function')) {
        const listen = _punktlisten(bauplan);
        const gid = subjekt.globalId;
        const versatz = subjekt.hoehenversatz ?? 0;
        const FELDER = ['op', 'feld', 'index', 'ost', 'nord', 'hoehe'];
        const eckpaar = ({ key, pos, werte, index, op, feld, ring, geschlossen, titel }) => {
            const basis = { globalId: gid, name: subjekt.name ?? '', herkunft: 'cde', art: 'stuetzpunkt', index, op, feld,
                            werkzeug: 'erdbau-stuetzpunkt-verschieben', felder: FELDER, werte, ecken: true, ring, geschlossen, titel };
            aus.push({ ...basis, key, pos, achsen: 'XZ', alternativ: 'Y' });
            // Der Höhengriff — der Ersatz für die Shift-Taste, die es
            // auf dem Tablet nicht gibt (Tablet-Regel, siehe Kopf).
            aus.push({ ...basis, key: key.replace(/^erdbau-(stuetz|innen):/, 'erdbau-$1-hoch:'), pos, achsen: 'Y', rolle: 'hoehe',
                       zeigtBei: key, nebenVersatz: { x: 1.7, y: 2.2 } });
        };
        bauplan.parameter.operationen.forEach((op, j) => {
            for (const { feld, punkte: liste } of listen.filter(l => l.op === j)) {
                if (liste.length < 2) continue;
                const geschlossen = feld === 'umriss';
                const ring = liste.map(p => ({ x: Number(p?.x), z: Number(p?.z) }));
                liste.forEach((p, k) => {
                    const x = Number(p?.x), z = Number(p?.z), nn = Number(p?.y);
                    if (![x, z, nn].every(Number.isFinite)) return;
                    eckpaar({ key: `erdbau-stuetz:${gid}:${j}:${feld}:${k}`, pos: { x, y: weltAusNn(nn, versatz), z },
                              werte: { op: j, feld, index: k }, index: k, op: j, feld, ring, geschlossen,
                              titel: `Ecke ${k + 1}` });
                });
            }
            // Die inneren Ecken: Sohle (Grube) bzw. Krone (Schüttung bis Höhe).
            const innen = innenEcken(op);
            if (innen && innen.every(Boolean)) {
                const ring = innen.map(e => ({ x: e.x, z: e.z }));
                const name = innenringName(op);
                innen.forEach((e, k) => {
                    eckpaar({ key: `erdbau-innen:${gid}:${j}:umriss:${k}`, pos: { x: e.x, y: weltAusNn(e.y, versatz), z: e.z },
                              werte: { op: j, feld: 'umriss', index: k, bezug: 'innen' }, index: k, op: j, feld: 'umriss',
                              ring, geschlossen: true, titel: `${name} ${k + 1}` });
                });
            }
        });
        // DIE ÜBRIGEN ECKEN (Teil XXII, Rest): die das Rezept nennt, weil sie
        // kein Punkt im Journal sind — die Achse eines Gerinnes (Lage), und
        // Ecken, die ein MASS sind (Sohlbreite, Neigung, Arbeitsraum, Sohle).
        // Wo die Böschung das Gelände trifft und wo Graben und Baugrube ihre
        // Sohle haben, rechnet der Lauf (`vorgang`: {ops, kanten}).
        for (const e of rz?.ecken?.(bauplan.parameter, { welt: (nn) => weltAusNn(nn, versatz), lauf: vorgang }) ?? []) {
            if (![e?.pos?.x, e?.pos?.y, e?.pos?.z].every(Number.isFinite)) continue;
            const key = `erdbau-ecke:${gid}:${e.op}:${e.schluessel}`;
            const basis = { globalId: gid, name: subjekt.name ?? '', herkunft: 'cde', ecken: true, titel: e.titel, op: e.op };
            if (e.mass) {
                // Höhe und Dicke (Teil XXXI, T6) gehen senkrecht, die übrigen Masse quer.
                const senkrecht = e.mass.art === 'hoehe' || e.mass.art === 'ueber';
                aus.push({ ...basis, key, art: 'mass', pos: e.pos, achsen: senkrecht ? 'Y' : 'XZ', mass: e.mass,
                           werkzeug: 'erdbau-mass-setzen', felder: ['op', 'feld', 'wert'], werte: { op: e.op, feld: e.mass.feld } });
            } else {
                // Eine Ecke mit LAGE ohne eigene Höhe (Achse des Gerinnes):
                // gezogen wie ein Knickpunkt, geschrieben wird nur Ost/Nord.
                aus.push({ ...basis, key, art: 'stuetzpunkt', pos: e.pos, achsen: 'XZ', index: e.index, feld: e.feld,
                           werkzeug: 'erdbau-stuetzpunkt-verschieben', felder: FELDER,
                           werte: { op: e.op, feld: e.feld, index: e.index }, ring: e.ring, geschlossen: !!e.geschlossen });
            }
            if (e.hoehe) {
                // Der Höhengriff daneben — die Höhe ist hier ein Mass des Ganzen (Sohle).
                aus.push({ ...basis, key: `${key}:hoch`, art: 'mass', pos: e.pos, achsen: 'Y', rolle: 'hoehe',
                           zeigtBei: key, nebenVersatz: { x: 1.7, y: 2.2 }, titel: e.hoehe.titel,
                           mass: { art: 'hoehe', feld: e.hoehe.feld, titel: e.hoehe.titel, einheit: 'm NN' },
                           werkzeug: 'erdbau-mass-setzen', felder: ['op', 'feld', 'wert'], werte: { op: e.op, feld: e.hoehe.feld } });
            }
        }
        return aus;
    }

    if (eigen) return aus;
    const a = subjekt.achse ?? null;
    if (a?.anfang && a?.ende && rolle('sohlhoeheAnfang') && rolle('sohlhoeheEnde')) {
        for (const [ende, p] of [['anfang', a.anfang], ['ende', a.ende]]) {
            if (!_endlich(p)) continue;
            aus.push({
                key: `sohle:${subjekt.globalId}:${ende}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
                herkunft: 'geliefert', art: 'sohle', ende, pos: { x: p.x, y: p.y, z: p.z }, achsen: 'Y',
                werkzeug: 'sohlhoehen-setzen', felder: [ende], forderung: true,
            });
        }
        return aus;
    }
    if (_endlich(subjekt.anker) && rolle('deckelhoehe')) {
        const y = Number.isFinite(subjekt.oberkante) ? subjekt.oberkante : subjekt.anker.y;
        aus.push({
            key: `deckel:${subjekt.globalId}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
            herkunft: 'geliefert', art: 'deckel', pos: { x: subjekt.anker.x, y, z: subjekt.anker.z }, achsen: 'Y',
            werkzeug: 'deckelhoehe-setzen', felder: ['deckel'], forderung: true,
        });
    }
    if (_endlich(subjekt.anker) && rolle('sohlhoehe') && !aus.some(g => g.art === 'deckel')) {
        const y = Number.isFinite(subjekt.bezugshoehe) ? subjekt.bezugshoehe : subjekt.anker.y;
        aus.push({
            key: `bezug:${subjekt.globalId}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
            herkunft: 'geliefert', art: 'bezugshoehe', pos: { x: subjekt.anker.x, y, z: subjekt.anker.z }, achsen: 'Y',
            werkzeug: 'bezugshoehe-setzen', felder: ['hoehe'],
        });
    }

    return aus;
}

/**
 * DIE KNOTENPARTNER eines Punkts (Teil XXXI, T7): andere EIGENE Bauteile, die einen Punkt ihres Bauplans an derselben
 * Stelle haben — auf die Netztoleranz des Regelwerks genau, in allen drei Richtungen (eine Wand auf einer Platte
 * steht nicht im Knoten mit deren Ecke, wenn sie höher beginnt). Nur Rezepte mit Punkten im Bauplan; Vorgänge
 * (Operationen) und Verdecktes (`null`-Stand) bleiben draussen.
 * @param {number[]} p             [x, y, z] in Welt
 * @param {string}   selbst        GlobalId des Subjekts
 * @param {Map<string, object>|null} eigene  wirksamer Stand `erzeugt` (GlobalId → Bauplan)
 * @returns {string[]}  GlobalIds, sortiert
 */
export function knotenPartner(p, selbst, eigene) {
    if (!eigene?.entries || !Array.isArray(p)) return [];
    const tol = Math.max(1e-6, Number(regelwert('netzToleranzM')) || 0.001);
    const aus = [];
    for (const [gid, plan] of eigene.entries()) {
        if (gid === selbst || !plan?.parameter || plan.ableitung) continue;
        if (rezeptNach(plan.rezept)?.punkteIn !== 'parameter') continue;
        const pkt = plan.parameter.punkte;
        if (!Array.isArray(pkt)) continue;
        if (pkt.some(q => Array.isArray(q) && Math.abs(q[0] - p[0]) <= tol && Math.abs(q[1] - p[1]) <= tol && Math.abs(q[2] - p[2]) <= tol)) aus.push(gid);
    }
    return aus.sort();
}

/**
 * GELIEFERTE SCHÄCHTE IM KNOTEN (Teil XXXI, T7 — Fabio 2026-10-05: „wie Schacht verschieben"): ein gelieferter Knoten,
 * der im GRUNDRISS auf dem Punkt steht (Netztoleranz) — die Höhe zählt hier nicht: ein Schacht ist senkrecht, seine
 * Lage ist die Platzierung, das Rohrende liegt auf der Sohle. An der WIRKSAMEN Lage (ein schon verschobener Schacht
 * steht im Journal).
 * @returns {string[]}  GlobalIds, sortiert
 */
export function gelieferteKnoten(p, schaechte, lageStand = null) {
    if (!Array.isArray(p) || !schaechte?.length) return [];
    const tol = Math.max(1e-6, Number(regelwert('netzToleranzM')) || 0.001);
    const aus = [];
    for (const s of schaechte) {
        if (s?.herkunft !== 'geliefert' || !s.globalId || !_endlich(s.punkt)) continue;
        const l = lageStand?.get?.(s.globalId);
        const x = Number.isFinite(l?.x) ? l.x : s.punkt.x, z = Number.isFinite(l?.z) ? l.z : s.punkt.z;
        if (Math.abs(x - p[0]) <= tol && Math.abs(z - p[2]) <= tol) aus.push(s.globalId);
    }
    return aus.sort();
}

/**
 * GRIFFE AUS FELDERN (Teil XXVII, B6 — Fabios E29): ein setzbares Mass, dessen
 * Feld seinen Griff erklärt (`griff: { richtung, von }`), bekommt ihn hier — ohne
 * eine Zeile je Rezept. Gezogen wird der vorhandene Setzer des Feldes
 * (`<rezept>-<feld>-setzen`); ein Rezept aus der Bibliothek bekommt seine Griffe
 * mit seinen Daten.
 *   y, von unterkante   Höhe über der Unterkante (Wandhöhe, lichte Höhe, Pfostenlänge)
 *   y, von oberkante    Tiefe unter der Oberkante (Plattendicke)
 *   quer                Breite quer zur ersten Kante (Wanddicke)
 *   radial              Durchmesser eines Profils (DN von Rohr und Schacht, Teil XXXI T6) — der Griff sitzt am
 *                       Profilrand quer zur Achse in Achshöhe; an einer senkrechten Achse (Schacht) nach Osten.
 *                       `einheit: 'mm'` des Feldes rechnet um.
 *
 * Ohne `stand` (Stab, Rohr, Schacht) ist die Unterkante der tiefste Punkt — ein Pfosten steht auf seinem Fusspunkt
 * (Teil XXXI, T6: vorher bekam ein Rezept ohne `stand` gar keinen Feldgriff).
 */
export function feldgriffeFuer(subjekt, bauplan, rezept, punkte) {
    const aus = [];
    const stand = rezept?.stand ?? null;
    if (!punkte?.length) return aus;
    const parameter = bauplan.parameter ?? {};
    const ys = punkte.map(p => p[1]).filter(Number.isFinite);
    const uk = stand ? stand.lies(parameter) : (ys.length ? Math.min(...ys) : NaN);
    const ok = stand?.oberkante?.(parameter);
    if (!Number.isFinite(uk)) return aus;
    let cx = 0, cz = 0;
    for (const p of punkte) { cx += p[0]; cz += p[2]; }
    cx /= punkte.length; cz /= punkte.length;
    for (const f of rezept.felder ?? []) {
        if (!f?.griff || !f.setzbar || f.typ !== 'zahl') continue;
        const wert = Number(parameter[f.name] ?? f.vorgabe);
        if (!(wert > 0)) continue;
        const kopf = { key: `feld:${subjekt.globalId}:${f.name}`, globalId: subjekt.globalId, name: subjekt.name ?? '',
                       herkunft: 'cde', art: 'feldmass', werkzeug: `${rezept.id}-${f.name}-setzen`, felder: [f.name],
                       // Für die Zahl am Griff (T8): wie das Feld heisst und worin es gemessen wird.
                       titel: f.titel ?? f.name, einheit: f.einheit ?? 'm' };
        if (f.griff.richtung === 'y') {
            const vonOben = f.griff.von === 'oberkante';
            const basisY = vonOben ? ok : uk;
            if (!Number.isFinite(basisY)) continue;
            aus.push({ ...kopf, pos: { x: cx, y: vonOben ? basisY - wert : basisY + wert, z: cz }, achsen: 'Y',
                       feld: { name: f.name, richtung: 'y', von: vonOben ? 'oberkante' : 'unterkante', basisY } });
        } else if (f.griff.richtung === 'quer' && punkte.length >= 2) {
            const [a, b] = punkte;
            const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
            if (!(l > 1e-9)) continue;
            const n = { x: -(b[2] - a[2]) / l, z: (b[0] - a[0]) / l };
            const m = { x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2 };
            const y = Number.isFinite(ok) ? (uk + ok) / 2 : uk;
            aus.push({ ...kopf, pos: { x: m.x + n.x * wert / 2, y, z: m.z + n.z * wert / 2 }, achsen: 'XZ',
                       feld: { name: f.name, richtung: 'quer', mitte: m, normal: n } });
        } else if (f.griff.richtung === 'radial') {
            const faktor = f.einheit === 'mm' ? 1000 : 1;
            const r = wert / faktor / 2;
            const [a, b] = punkte;
            const l = b ? Math.hypot(b[0] - a[0], b[2] - a[2]) : 0;
            let m, n, y;
            if (l > 1e-9) {
                // Liegende Achse (Rohr): an der Mitte der ersten Strecke, quer; die Achse liegt in der Rohrmitte —
                // mit Sohlbezug (K4) einen Radius über den Punkten.
                n = { x: -(b[2] - a[2]) / l, z: (b[0] - a[0]) / l };
                m = { x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2 };
                y = (a[1] + b[1]) / 2 + (parameter.achsbezug === 'sohle' ? r : 0);
            } else {
                // Stehende Achse (Schacht: Sohle und Deckel übereinander): halbe Höhe, nach Osten.
                n = { x: 1, z: 0 };
                m = { x: a[0], z: a[2] };
                y = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : a[1];
            }
            aus.push({ ...kopf, pos: { x: m.x + n.x * r, y, z: m.z + n.z * r }, achsen: 'XZ',
                       feld: { name: f.name, richtung: 'quer', mitte: m, normal: n, faktor } });
        }
    }
    return aus;
}

/**
 * Aus der neuen Griff-Lage die FORMULARWERTE des Werkzeugs — derselbe Weg,
 * den auch das getippte Formular geht.
 *
 * @param {object} griff
 * @param {{x,y,z}} pos   neue Lage (Welt)
 * @param {{versatz?:{x,y,z}, hoehenversatz?:number}} ctx
 * @returns {Object<string, number>}
 */
export function griffZuWerten(griff, pos, { versatz = null, hoehenversatz = 0 } = {}) {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const v = versatz ?? { x: 0, y: 0, z: 0 };
    switch (griff?.art) {
        case 'knoten':
            // ost = welt.x + versatz.x, nord = −(welt.z + versatz.z) — wie im Plan.
            return { ost: r3(pos.x + v.x), nord: r3(-(pos.z + v.z)) };
        case 'sohle':
            return { [griff.ende]: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'deckel':
            return { deckel: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'bezugshoehe':
            return { hoehe: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'stuetzpunkt':
            // `werte` trägt, was der Griff über seine FUNDSTELLE weiss und was
            // kein Zug ändert — beim Erdbau Operation und Feld. Ohne das
            // schriebe ein Zug am zweiten Vorgang in die erste Operation.
            return { ...(griff.werte ?? {}), index: griff.index,
                     ost: r3(pos.x + v.x), nord: r3(-(pos.z + v.z)), hoehe: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'kante':
            // Der Griff SITZT auf der Kantenmitte — die neue Lage IST der
            // Zielwert. `anwenden` rechnet daraus das Delta beider Endpunkte,
            // also bleibt der Wert absolut und die Anwendung idempotent.
            return { ...(griff.werte ?? {}), index: griff.index, ost: r3(pos.x + v.x), nord: r3(-(pos.z + v.z)), hoehe: r3(nnAusWelt(pos.y, hoehenversatz)) };
        case 'mass': {
            // EINE ECKE, DIE EIN MASS IST (Teil XXII, Rest): gemessen wird quer —
            // auf der Linie, auf der die Ecke mit ihrem Mass wandert —, die Höhe
            // senkrecht. Daraus der neue Wert; absolut, wie jedes Formularfeld.
            const m = griff.mass ?? {};
            const wert = m.art === 'hoehe' ? nnAusWelt(pos.y, hoehenversatz)
                : m.art === 'ueber' ? pos.y - m.basisY                           // Dicke: über ihrer Unterseite (T6)
                : massWert(m, querlage(m, pos));
            if (!Number.isFinite(wert)) return {};
            return { ...(griff.werte ?? {}), wert: m.art === 'winkel' ? Math.round(wert * 10) / 10 : r3(wert) };
        }
        case 'drehung': {
            // Der Winkel zwischen Start- und Ziellage um das Zentrum, in Grad —
            // dieselbe Drehrichtung wie `drehePunktliste` (x' = x·cos − z·sin).
            const c = _endlich(griff.zentrum) ? griff.zentrum : null;
            if (!c) return {};
            const w = winkelGrad(c, griff.pos, pos);
            return Number.isFinite(w) ? { winkel: Math.round(w * 10) / 10 } : {};
        }
        case 'feldmass': {
            // DAS MASS EINES FELDES (Teil XXVII, B6): Abstand zur Bezugskante (y) oder
            // doppelter Abstand zur Achse (quer) — absolut, wie das Formular.
            const f = griff.feld ?? {};
            let wert = NaN;
            if (f.richtung === 'y') wert = f.von === 'oberkante' ? f.basisY - pos.y : pos.y - f.basisY;
            else if (f.richtung === 'quer') wert = 2 * Math.abs((pos.x - f.mitte.x) * f.normal.x + (pos.z - f.mitte.z) * f.normal.z) * (f.faktor ?? 1);
            // In mm (DN) ganze Zahlen — ein Rohr DN 412,734 gibt es nicht.
            const rund = (f.faktor ?? 1) >= 1000 ? Math.round(wert) : r3(wert);
            return Number.isFinite(wert) && rund > 0 ? { [f.name]: rund } : {};
        }
        case 'bauwerk-versatz':
            // Ein VERSATZ (Teil XXVII, B2): um so viel, wie der Griff gewandert ist.
            return { ost: r3(pos.x - griff.pos.x), nord: r3(-(pos.z - griff.pos.z)), hoehe: r3(pos.y - griff.pos.y) };
        case 'bauteil': {
            // Der Griff sitzt am Auswahlpunkt, das Werkzeug will den ANKER:
            // beide wandern um dasselbe Delta.
            const a = _endlich(griff.anker) ? griff.anker : griff.pos;
            const d = { x: pos.x - griff.pos.x, y: pos.y - griff.pos.y, z: pos.z - griff.pos.z };
            return { ost: r3(a.x + d.x + v.x), nord: r3(-(a.z + d.z + v.z)), hoehe: r3(nnAusWelt(a.y + d.y, hoehenversatz)) };
        }
        default:
            return {};
    }
}

/**
 * Die Ebene, in der ein Griff gezogen wird.
 *   XZ → waagerecht durch den Griff
 *   Y  → senkrecht, zur Kamera gerichtet (der Zeiger läuft dann exakt mit)
 * @param {{x,y,z}} pos
 * @param {'XZ'|'Y'} achsen
 * @param {{x,y,z}|null} kameraRichtung  Blickrichtung der Kamera (Welt)
 * @returns {{punkt:{x,y,z}, normal:{x,y,z}}}
 */
export function ziehebene(pos, achsen, kameraRichtung = null) {
    // 'W' (Drehung) läuft in der Waagerechten wie 'XZ' — gedreht wird der Grundriss.
    if (achsen === 'Y') {
        let n = { x: kameraRichtung?.x ?? 0, y: 0, z: kameraRichtung?.z ?? 0 };
        const l = Math.hypot(n.x, n.z);
        n = l > 1e-6 ? { x: n.x / l, y: 0, z: n.z / l } : { x: 0, y: 0, z: 1 };
        return { punkt: { ...pos }, normal: n };
    }
    return { punkt: { ...pos }, normal: { x: 0, y: 1, z: 0 } };
}

/** Schnitt eines Strahls mit einer Ebene, oder null (parallel / hinter dem Auge). */
export function schnittStrahlEbene(strahl, ebene) {
    const o = strahl?.origin, d = strahl?.direction, n = ebene?.normal, p = ebene?.punkt;
    if (!_endlich(o) || !_endlich(d) || !_endlich(n) || !_endlich(p)) return null;
    const nenner = n.x * d.x + n.y * d.y + n.z * d.z;
    if (Math.abs(nenner) < 1e-9) return null;
    const t = (n.x * (p.x - o.x) + n.y * (p.y - o.y) + n.z * (p.z - o.z)) / nenner;
    if (t < 0) return null;
    return { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
}

/** Den Zug auf die erlaubten Achsen beschränken. */
export function begrenze(delta, achsen) {
    if (!delta) return { x: 0, y: 0, z: 0 };
    return achsen === 'Y' ? { x: 0, y: delta.y, z: 0 } : { x: delta.x, y: 0, z: delta.z };
}

/**
 * Die Kanten einer Punktliste mit Mitte und Station der Mitte (S10).
 * Die Station zählt in DERSELBEN Kette wie `_stationEinfuegen` im Katalog
 * (beim Ring auch der Schlussabschnitt) — sonst landete der eingefügte Punkt
 * woanders als der „+", den man angetippt hat. Und wie die Geste „Ort auf der
 * Achse zeigen": im GRUNDRISS (2026-09-19; bis dahin räumlich — bei steilen
 * Abschnitten lag der Punkt neben der getippten Stelle). `laenge` bleibt die
 * räumliche Kantenlänge (sie wird angezeigt).
 */
export function kantenVon(punkte, ring = false) {
    const aus = [];
    const n = punkte.length;
    if (n < 2) return aus;
    const bis = ring ? n : n - 1;
    let gelaufen = 0;
    for (let i = 0; i < bis; i++) {
        const a = punkte[i], b = punkte[(i + 1) % n];
        if (!a || !b) { if (a && b) gelaufen += 0; continue; }
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const d2 = Math.hypot(b[0] - a[0], b[2] - a[2]);
        if (d2 > 1e-6) {
            aus.push({
                i, j: (i + 1) % n, laenge: d, station: gelaufen + d2 / 2,
                mitte: { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 },
            });
        }
        gelaufen += d2;
    }
    return aus;
}

/** Zentrum (Schwerpunkt XZ, mittlere Höhe) und Griffort des Drehgriffs — oder null. */
export function drehgriffFuer(punkte) {
    if (!Array.isArray(punkte) || punkte.length < DREH_MINDEST_PUNKTE) return null;
    let x = 0, y = 0, z = 0;
    for (const p of punkte) { x += p[0]; y += p[1]; z += p[2]; }
    const c = { x: x / punkte.length, y: y / punkte.length, z: z / punkte.length };
    let r = 0;
    for (const p of punkte) r = Math.max(r, Math.hypot(p[0] - c.x, p[2] - c.z));
    if (!(r > 1e-6)) return null;
    // Etwas ausserhalb des Bauteils, damit der Griff nicht in den Stützpunkten steckt.
    return { zentrum: c, pos: { x: c.x + r * 1.25 + 0.5, y: c.y, z: c.z } };
}

/** Winkel (Grad) von `von` nach `nach` um `zentrum`, im Grundriss. */
export function winkelGrad(zentrum, von, nach) {
    const a = Math.atan2(von.z - zentrum.z, von.x - zentrum.x);
    const b = Math.atan2(nach.z - zentrum.z, nach.x - zentrum.x);
    if (Math.hypot(nach.z - zentrum.z, nach.x - zentrum.x) < 1e-6) return NaN;
    let d = ((b - a) * 180) / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
}

const _runde = (v) => Math.round(v * 1000) / 1000;

function _endlich(p) {
    return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
