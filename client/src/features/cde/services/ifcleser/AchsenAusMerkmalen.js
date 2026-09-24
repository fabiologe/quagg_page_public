/**
 * Achsen und Knoten aus MERKMALEN (Tragfähig, T6, 2026-09-24).
 *
 * Der Anlass: der ProVI-Export in 42069 liefert Haltungen und Schächte als
 * `IfcBuildingElementProxy` — nur ein Brep (`Body`), keine `Axis`, keine
 * Extrusion, jede Platzierung auf dem Ursprung. Die Achslese fand darin
 * nichts, der Längsschnitt blieb gesperrt, Griffe und Gefällebefunde fehlten.
 * Ein Skelett aus dem Netz endete ≈ 0,5 m vor der Schachtmitte (Innenwand),
 * mit zufälliger Richtung — geschätzt statt gelesen.
 *
 * Die Wahrheit steht im Merkmalssatz: Schachtmitte (Rechts-/Hochwert), Sohle,
 * und an der Haltung „von Schacht … bis Schacht …" mit beiden Sohlhöhen.
 * WELCHES Merkmal was bedeutet, ist die Konvention EINES Exporteurs — deshalb
 * stehen die Namen als Daten an der Bauformregel (`knotenAus`, `achseAus`),
 * nicht hier. Diese Datei kennt kein einziges Merkmal beim Namen.
 *
 * Rein: keine Engine, kein three. Das Gefälle rechnet die EINE Rechnung
 * (`geometrie/Stationierung.gefaelle`, K5), nicht diese Datei. Einheiten wie die übrige Achslese (die
 * Rohwerte der Datei, `welt = roh − offset`; three: x = Ost, y = Höhe,
 * z = −Nord — `IfcQuelle.platzierungen`, `AxisAnnotations`).
 */

import { gefaelle } from '../geometrie/Stationierung.js';

function _zahl(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    const n = Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function _text(v) {
    if (v == null) return null;
    const t = String(v).trim();
    return t || null;
}

/**
 * Ein Knoten aus den Merkmalen eines Bauteils.
 *
 * @param {object} spec   `regel.knotenAus` — {kennung, rechtswert, hochwert, sohle, deckel?}
 * @param {object} werte  die Merkmale des Bauteils (flach, `IfcQuelle.merkmale`)
 * @param {{off?: {x,y,z}|null}} [opts]
 * @returns {{punkt, kennung, sohle, deckel} | {fehlt: string[]}}
 */
export function knotenAusMerkmalen(spec, werte, { off = null } = {}) {
    const r = _zahl(werte?.[spec?.rechtswert]);
    const h = _zahl(werte?.[spec?.hochwert]);
    const s = _zahl(werte?.[spec?.sohle]);
    const kennung = _text(werte?.[spec?.kennung]);
    const fehlt = [];
    if (r == null) fehlt.push(spec?.rechtswert);
    if (h == null) fehlt.push(spec?.hochwert);
    if (s == null) fehlt.push(spec?.sohle);
    if (!kennung) fehlt.push(spec?.kennung);
    if (fehlt.length) return { fehlt };
    return {
        punkt: { x: r - (off?.x ?? 0), y: s - (off?.y ?? 0), z: -h - (off?.z ?? 0) },
        kennung,
        sohle: s,
        deckel: spec?.deckel ? _zahl(werte?.[spec.deckel]) : null,
    };
}

/**
 * Eine Achse aus den Merkmalen einer Haltung — von Knoten zu Knoten, auf den
 * Sohlhöhen der Haltung (nicht der Schächte: ein Absturz liegt dazwischen).
 *
 * @param {object} spec   `regel.achseAus` — {von, bis, sohleVon, sohleBis, dn?}
 * @param {object} werte  die Merkmale der Haltung
 * @param {Map<string, {punkt}>} knotenJeKennung  aus `knotenAusMerkmalen`
 * @returns {{anfang, ende, polyline, laenge, gefaelle, dn, quelle, von, bis} | {fehlt: string[]}}
 */
export function achseAusMerkmalen(spec, werte, knotenJeKennung) {
    const von = _text(werte?.[spec?.von]);
    const bis = _text(werte?.[spec?.bis]);
    const sv = _zahl(werte?.[spec?.sohleVon]);
    const sb = _zahl(werte?.[spec?.sohleBis]);
    const fehlt = [];
    if (!von) fehlt.push(spec?.von);
    if (!bis) fehlt.push(spec?.bis);
    if (sv == null) fehlt.push(spec?.sohleVon);
    if (sb == null) fehlt.push(spec?.sohleBis);
    if (fehlt.length) return { fehlt };
    const kv = knotenJeKennung?.get(von);
    const kb = knotenJeKennung?.get(bis);
    if (!kv || !kb) return { fehlt: [!kv ? `Schacht „${von}"` : null, !kb ? `Schacht „${bis}"` : null].filter(Boolean) };
    // Die Höhe relativ zum Knoten: dessen `punkt.y` ist seine Sohle im
    // Weltrahmen, `sohle` dieselbe Höhe roh — die Differenz ist der Versatz.
    const anfang = { x: kv.punkt.x, y: kv.punkt.y + (sv - kv.sohle), z: kv.punkt.z };
    const ende = { x: kb.punkt.x, y: kb.punkt.y + (sb - kb.sohle), z: kb.punkt.z };
    const polyline = [anfang, ende];
    const g = gefaelle(polyline);
    const dnM = spec?.dn ? _zahl(werte?.[spec.dn]) : null;
    return {
        anfang, ende, polyline,
        // 3D wie `AxisAnnotations.polylineLength`.
        laenge: Math.hypot(g.laenge2d, g.fall),
        // ‰, positiv = fällt in Fließrichtung (von → bis); waagerecht = null
        // wie `polylineGefaellePromille`.
        gefaelle: g.promille == null || Math.abs(g.fall) < 1e-9 ? null : g.promille,
        // DN in mm wie aus der Extrusion (`AxisAnnotations._dnAusProfil`).
        dn: dnM != null ? Math.round(dnM * 1000) : null,
        quelle: 'merkmale',
        von, bis,
    };
}
