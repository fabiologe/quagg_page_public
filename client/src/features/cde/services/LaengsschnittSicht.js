import { erzeugtEintrag } from './Bauteilrezepte.js';

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
 * STATIONEN LAUFEN WAAGERECHT (laenge2d): dieselbe Regel wie beim
 * Gefälle-Befund — die 3D-Länge enthält die Höhe schon, und ein Gefälle
 * gegen sie wäre doppelt gezählt.
 *
 * Rein: kein Vue, kein Canvas, keine Engine.
 */

/** Waagerechte Länge eines Segments. */
function _laenge2d(a, e) {
    return Math.hypot((e?.x ?? 0) - (a?.x ?? 0), (e?.z ?? 0) - (a?.z ?? 0));
}

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
        const laenge2d = _laenge2d(k.anfang, k.ende);
        const hA = (Number(k.anfang.y) || 0) + hoehenversatz;
        const hE = (Number(k.ende.y) || 0) + hoehenversatz;

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
            // Gegen die WAAGERECHTE Länge — wie der Befund (14.4).
            gefaellePromille: laenge2d > 0 ? ((hA - hE) / laenge2d) * 1000 : null,
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

/**
 * Aus einem Griff-Zug die Journaleinträge — je betroffenem Segment EINE
 * volle Rollen-Karte (absolute NN-Zielhöhen, Gesetz 4): das gezogene Ende
 * bekommt die neue Höhe, das andere behält seine WIRKSAME. Die Faltung je
 * Rolle (14.2) macht daraus den richtigen Stand, egal was vorher galt.
 *
 * @param {object} sicht      aus `baueSicht`
 * @param {Array}  enden      [{globalId, ende: 'A'|'E'}] — der gezogene Griff
 * @param {number} hNeu       neue Höhe (NN)
 * @returns {Array} parametrik-Einträge (ohne wer/modellSha — die reicht der Aufrufer an)
 */
export function sohlZugEintraege(sicht, enden, hNeu) {
    if (!Number.isFinite(hNeu)) return [];
    const eintraege = [];
    for (const { globalId, ende } of enden ?? []) {
        const seg = sicht?.segmente?.find(s => s.globalId === globalId);
        if (!seg) continue;
        const eff = seg.gefordert ?? seg.geliefert;
        const anfang = ende === 'A' ? hNeu : eff.hA;
        const schluss = ende === 'E' ? hNeu : eff.hE;
        eintraege.push({
            art: 'parametrik', globalId,
            nachher: {
                sohlhoeheAnfang: Math.round(anfang * 1000) / 1000,
                sohlhoeheEnde: Math.round(schluss * 1000) / 1000,
            },
        });
    }
    return eintraege;
}

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
    const p = punkte.map(q => (Array.isArray(q)
        ? { x: q[0] ?? 0, y: q[1] ?? 0, z: q[2] ?? 0 }
        : { x: q?.x ?? 0, y: q?.y ?? 0, z: q?.z ?? 0 }));

    const yAnfang = ende === 'A' ? yNeu : p[0].y;
    const yEnde = ende === 'E' ? yNeu : p[p.length - 1].y;

    const abschnitt = [];
    let gesamt = 0;
    for (let i = 0; i + 1 < p.length; i++) {
        const d = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
        abschnitt.push(d);
        gesamt += d;
    }
    let gelaufen = 0;
    return p.map((q, i) => {
        if (i > 0) gelaufen += abschnitt[i - 1];
        const t2 = gesamt > 0 ? gelaufen / gesamt : (i / (p.length - 1));
        return [q.x, yAnfang + (yEnde - yAnfang) * t2, q.z];
    });
}

/**
 * Die erzeugt-Einträge eines Griff-Zugs an CDE-ROHREN (17.3b) —
 * „Eigenes = echt": statt einer Forderung wird der BAUPLAN fortgeschrieben.
 * Ein neuer erzeugt-Eintrag mit denselben Parametern und neuen Stützpunkten
 * (voller absoluter Zustand — die Faltung „letzter gewinnt" bleibt, „zurück"
 * stellt exakt den vorigen Bauplan wieder her; dasselbe Muster wie beim
 * Gelände-Anhängen in Stufe 15).
 *
 * Die Sohlhöhen im Bauplan sind WELT-Y, der Griff zieht in NN — der
 * Versatz rechnet an genau dieser einen Stelle zurück.
 *
 * @param {Array}  enden      [{globalId, ende: 'A'|'E'}] — nur CDE-Teile
 * @param {number} hNeuNN     neue Höhe des Griffs (NN)
 * @param {object} opts       { bauplanVon: (globalId) => Bauplan|undefined, hoehenversatz }
 * @returns {Array} erzeugt-Einträge (ohne wer/modellSha — reicht der Aufrufer an)
 */
export function cdeZugEintraege(enden, hNeuNN, { bauplanVon, hoehenversatz = 0 } = {}) {
    if (!Number.isFinite(hNeuNN)) return [];
    const out = [];
    for (const { globalId, ende } of enden ?? []) {
        const plan = bauplanVon?.(globalId);
        if (plan?.rezept !== 'rohr') continue;
        const punkte = neuePunkteFuerZug(plan.parameter?.punkte, ende, hNeuNN - hoehenversatz);
        if (!punkte) continue;
        out.push(erzeugtEintrag({
            rezept: 'rohr',
            kategorie: plan.kategorie,
            name: plan.name ?? '',
            globalId,
            parameter: { ...plan.parameter, punkte },
        }));
    }
    return out;
}
