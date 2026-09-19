import { sohleAnAchse } from './Achsbezug.js';
import { hoehenUeberLaenge, punktXYZ } from './rezept/Geometriebau.js';
import { gefaelle, punkteDerAchse } from './geometrie/Stationierung.js';

/**
 * LaengsschnittSicht — der Strang als Stationierung, fertig für die Ansicht
 * (Stufe 17.1).
 *
 * Der Längsschnitt-MODUS existiert seit Sprint P im Katalog und ist seit
 * Stufe 14.1 freigeschaltet — aber er hatte NIE einen Host: Taste 3 zeigte
 * eine leere Fläche. Dieses Modul ist die reine Hälfte seiner Ansicht: aus
 * dem Strang der Einordnung (14.5/14.6 — bereits in Fliessrichtung) wird
 * die Stationierung, aus dem Journal die GEFORDERTE Sohle daneben.
 *
 * ZWEI LINIEN, EIN BILD: `geliefert` ist die Geometrie (Welt-Y + Versatz =
 * NN), `gefordert` der parametrik-Stand aus dem Journal (schon NN — die
 * Sohlhöhen-Werkzeuge schreiben NN). Wo beide gleich sind, gibt es keine
 * zweite Linie; wo sie abweichen, ist genau das die Aussage des Bildes:
 * „geliefert = Forderung" sichtbar gemacht.
 *
 * ANGEZEIGT WIRD DIE SOHLE (Teil XXIV, K4 — Messbefund E7): jedes Glied des
 * Strangs sagt, was seine Höhen sind (`achsbezug`, aus dem Bauplan oder der
 * Herkunft der gelieferten Achse), und hier wird EINMAL auf die Sohle
 * gerechnet. Bis K4 stand die rohe Achshöhe als „Sohle" da — bei eigenen
 * Haltungen und bei Achsen aus der Extrusion lag die wirkliche Sohle DN/2
 * darunter. Ein Glied ohne Angabe bleibt, wie es war: die Höhe ist die Sohle.
 *
 * STATIONEN LAUFEN WAAGERECHT (laenge2d): dieselbe Regel wie beim
 * Gefälle-Befund — die 3D-Länge enthält die Höhe schon, und ein Gefälle
 * gegen sie wäre doppelt gezählt.
 *
 * Rein: kein Vue, kein Canvas, keine Engine.
 */


/**
 * @param {object} opts
 * @param {Array}  opts.strang   [{globalId, name, dn, anfang:{x,y,z}, ende:{x,y,z}}] in Fliessrichtung
 * @param {number} [opts.hoehenversatz=0]  Welt-Y → NN
 * @param {Map}    [opts.parametrikStand]  globalId → Rollen-Karte (sohlhoeheAnfang/Ende, NN)
 * @returns {{segmente: Array, gesamt: number, hMin: number, hMax: number, knoten: Array}|null}
 */
export function baueSicht({ strang, hoehenversatz = 0, parametrikStand = new Map() } = {}) {
    const kette = (strang ?? []).filter(k => k?.anfang && k?.ende);
    if (!kette.length) return null;

    const segmente = [];
    const knoten = [];
    let s = 0;
    let hMin = Infinity;
    let hMax = -Infinity;

    for (const k of kette) {
        // Die Weglänge in der Draufsicht (K5) — bei einer Haltung mit Knick
        // mehr als die Sehne; dieselbe Länge wie das Gefälle.
        const g0 = gefaelle(punkteDerAchse(k));
        const laenge2d = g0.laenge2d;
        const hA = (sohleAnAchse(Number(k.anfang.y) || 0, k) || 0) + hoehenversatz;
        const hE = (sohleAnAchse(Number(k.ende.y) || 0, k) || 0) + hoehenversatz;

        const stand = parametrikStand.get?.(k.globalId);
        const fA = Number(stand?.sohlhoeheAnfang);
        const fE = Number(stand?.sohlhoeheEnde);
        const gefordert = (Number.isFinite(fA) || Number.isFinite(fE))
            ? { hA: Number.isFinite(fA) ? fA : hA, hE: Number.isFinite(fE) ? fE : hE }
            : null;

        const seg = {
            globalId: k.globalId,
            name: k.name ?? '',
            dn: k.dn ?? null,
            s0: s, s1: s + laenge2d, laenge2d,
            geliefert: { hA, hE },
            gefordert,
            // Die EINE Rechnung (K5) — mit den Sohlen, gegen die Weglänge.
            gefaellePromille: gefaelle(punkteDerAchse(k), { anfang: hA, ende: hE }).promille,
        };
        segmente.push(seg);
        knoten.push({ s, ende: false });
        s += laenge2d;

        for (const h of [hA, hE, gefordert?.hA, gefordert?.hE]) {
            if (Number.isFinite(h)) { hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
        }
    }
    knoten.push({ s, ende: true });

    return { segmente, gesamt: s, hMin, hMax, knoten };
}

/** Sohlhöhe (NN) an einer Station — geliefert, linear im Segment. */
export function hoeheBei(sicht, station) {
    for (const seg of sicht?.segmente ?? []) {
        if (station < seg.s0 || station > seg.s1) continue;
        const t = seg.laenge2d > 0 ? (station - seg.s0) / seg.laenge2d : 0;
        return seg.geliefert.hA + (seg.geliefert.hE - seg.geliefert.hA) * t;
    }
    return null;
}

// ── Der Editor-Teil (Stufe 17.2): Griffe und ihre Einträge ──────────────────

/** Koinzidenz wie im Netz: Lage exakt, Höhen bis 1 cm gelten als EIN Griff. */
const GRIFF_STATION_M = 0.001;
const GRIFF_HOEHE_M = 0.01;

/**
 * Die Griffe des Längsschnitts: einer je Segment-ENDE, koinzidente Enden
 * (gleiche Station, Höhe bis 1 cm) zu EINEM zusammengelegt — das ist der
 * Normalfall „Sohle am Schacht": ein Griff zieht Zulauf-Ende und
 * Ablauf-Anfang gemeinsam. Ein ABSTURZ (echter Höhensprung) behält zwei
 * Griffe — ihn stillschweigend zu einem zu verschmelzen, ebnete ihn beim
 * ersten Zug ein.
 *
 * Gegriffen wird die WIRKSAME Sohle (gefordert ?? geliefert): wer zieht,
 * zieht ab der letzten Forderung weiter, nicht ab der Lieferung.
 *
 * @returns {Array<{station, hoehe, enden: Array<{globalId, ende: 'A'|'E'}>}>}
 */
export function griffe(sicht) {
    const roh = [];
    for (const seg of sicht?.segmente ?? []) {
        const eff = seg.gefordert ?? seg.geliefert;
        roh.push({ station: seg.s0, hoehe: eff.hA, eintrag: { globalId: seg.globalId, ende: 'A' } });
        roh.push({ station: seg.s1, hoehe: eff.hE, eintrag: { globalId: seg.globalId, ende: 'E' } });
    }
    const out = [];
    for (const g of roh) {
        const treffer = out.find(o =>
            Math.abs(o.station - g.station) <= GRIFF_STATION_M
            && Math.abs(o.hoehe - g.hoehe) <= GRIFF_HOEHE_M);
        if (treffer) treffer.enden.push(g.eintrag);
        else out.push({ station: g.station, hoehe: g.hoehe, enden: [g.eintrag] });
    }
    return out;
}

// DIE EINTRÄGE EINES GRIFF-ZUGS schreibt seit Teil XXIV (O6) das Werkzeug
// „Sohle am Punkt setzen" (`Bearbeitungen.js`, `sohle-ziehen`) — als Kommando,
// mit Beleg. Hier standen bis dahin `sohlZugEintraege` (Geliefertes: volle
// Rollenkarte) und `cdeZugEintraege` (Eigenes: Bauplan fortgeschrieben); beide
// Wege leben jetzt dort, wo auch „Sohlhöhen festlegen" sie geht.

/**
 * Neue Stützpunkte eines CDE-Rohrs nach einem Griff-Zug (17.3b) —
 * „Eigenes = echt": das gezogene Ende bekommt die neue WELT-Höhe, und die
 * Zwischenhöhen werden linear über die waagerechte Länge neu verteilt —
 * dieselbe Regel wie beim Zeichnen der Trasse (14.12): die Zwischenpunkte
 * einer Haltung tragen keine eigene Höhenaussage, sie folgen der Strecke.
 *
 * @param {Array} punkte  [[x,y,z], …] oder [{x,y,z}, …] (Welt)
 * @param {'A'|'E'} ende  welches Ende gezogen wurde
 * @param {number} yNeu   neue Welt-Höhe des gezogenen Endes
 * @returns {Array<[x,y,z]>|null}
 */
export function neuePunkteFuerZug(punkte, ende, yNeu) {
    if (!Array.isArray(punkte) || punkte.length < 2 || !Number.isFinite(yNeu)) return null;
    const p = punkte.map(punktXYZ);
    const yAnfang = ende === 'A' ? yNeu : p[0].y;
    const yEnde = ende === 'E' ? yNeu : p[p.length - 1].y;
    // Die Regel „Zwischenpunkte linear über die waagerechte Länge" steht seit
    // K4 an EINER Stelle (`Geometriebau.hoehenUeberLaenge`).
    const h = hoehenUeberLaenge(p, yAnfang, yEnde);
    return p.map((q, i) => [q.x, h[i], q.z]);
}
