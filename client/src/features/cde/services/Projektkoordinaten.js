/**
 * Projektkoordinaten — von der Three-Welt auf wirkliche Lagen (Stufe 13.2).
 *
 * Fabio: „Wir haben ein Wirrwarr an Bezugssystemen … müssen alle möglichen
 * Variationen aus der IFC-Dokumentation erkennen und sauber auflösen, dass man
 * eine saubere Koordinatenansicht hat, real, so wie es auch in einem CAD wäre."
 *
 * Diese Datei ist die eine Stelle, die das entscheidet. Sie bekommt, was die
 * Datei SAGT (`Georeferenz`), den Ladeversatz und eine Probe aus dem Modell —
 * und liefert eine Abbildung Welt → Ost/Nord/Höhe samt Begründung.
 *
 * ── Die Kette ───────────────────────────────────────────────────────────────
 *
 *   Three-Welt          modellzentriert, Y ist Höhe (COORDINATE_TO_ORIGIN)
 *     + Ladeversatz  →  IFC-Roh, wie es in der Datei steht
 *     Achstausch        E = roh.x · N = −roh.z · H = roh.y
 *     + MapConversion→  Karte — ABER NUR, wenn die Geometrie lokal ist
 *
 * ── Warum die MapConversion nicht immer gilt ────────────────────────────────
 *
 * Die Norm sagt: „In case of inconsistency, the value provided with
 * IfcMapConversion shall take precedence." Das regelt den Widerspruch zwischen
 * MapConversion und WorldCoordinateSystem — nicht den Fall, dass ein Exporteur
 * BEIDES tut: absolute Koordinaten schreiben UND eine MapConversion angeben.
 *
 * Genau das tun beide Dateien aus Fabios Haus: die Platzierungen tragen die
 * vollen Landeskoordinaten, und die MapConversion nennt deren
 * Bounding-Box-Ecke (`isyifc/store/index.js:11` nennt den Wert selbst
 * „Global Offset (MinX, MinY)"). Wer die Norm hier wörtlich befolgt, zählt
 * doppelt — bei ENQUIER käme 5.154.156 statt 2.577.078 heraus.
 *
 * Deshalb wird GEPRÜFT statt geglaubt: liegen die Rohkoordinaten schon im
 * Gültigkeitsbereich eines bekannten Systems, ist die Geometrie bereits
 * georeferenziert und die MapConversion redundant. Die Entscheidung steht
 * sichtbar dabei und ist überschreibbar — Regler statt Raterei.
 *
 * WICHTIG: der Test setzt an der ROHGEOMETRIE an, nicht am Ergebnis. Bei A64
 * ergäbe die doppelte Anwendung 651.442 — immer noch ein gültiger UTM-Wert.
 * Am Ergebnis wäre der Fehler also nicht zu sehen.
 */

import { erkenneSystem, pruefeEtikett } from './Koordinatensysteme.js';

/**
 * Welt → IFC-Roh. Die Umkehr dessen, was der Loader beim Zentrieren tut.
 *
 * Die Achszuordnung (`E = roh.x`, `N = −roh.z`, `H = roh.y`) ist die des
 * Hauses und steht so in `UtmGrid.js:9-11` — dort ausdrücklich als noch zu
 * verifizierende Annahme markiert. Sie steht hier ein zweites Mal, weil sie
 * ab jetzt an EINER Stelle entschieden wird; `UtmGrid` soll später hierher
 * zeigen statt selbst zu rechnen.
 */
function _rohAus(welt, versatz) {
    return {
        x: (welt?.x ?? 0) + (versatz?.x ?? 0),
        y: (welt?.y ?? 0) + (versatz?.y ?? 0),
        z: (welt?.z ?? 0) + (versatz?.z ?? 0),
    };
}

/** IFC-Roh → Ost/Nord/Höhe, ohne Kartenbezug. */
function _alsProjekt(roh) {
    return { ost: roh.x, nord: -roh.z, hoehe: roh.y };
}

/**
 * Den Bezug für ein Modell bestimmen.
 *
 * @param {object} opts
 * @param {object} opts.georeferenz  aus `leseGeoreferenz`
 * @param {{x,y,z}} opts.versatz     Ladeversatz (`getCoordOffsetForModel`)
 * @param {{x,y,z}} [opts.weltProbe] ein Punkt IM Modell; Vorgabe ist der
 *        Ursprung, weil das Modell dorthin zentriert wird
 * @returns {object} `nachProjekt(weltPunkt)`, `crs`, `befunde`
 */
export function bestimmeBezug({ georeferenz, versatz, weltProbe = { x: 0, y: 0, z: 0 } } = {}) {
    const befunde = [];
    const kb = georeferenz?.kartenbezug ?? null;
    const deklariert = georeferenz?.crs?.name ?? null;

    // 1. Wo liegt die Rohgeometrie? Das ist die Frage, an der alles hängt.
    const rohProbe = _rohAus(weltProbe, versatz);
    const rohProjekt = _alsProjekt(rohProbe);
    const geometrieIstVerortet = erkenneSystem(rohProjekt.ost) !== null;

    // 2. Gilt die MapConversion?
    const mapAngewandt = !!kb && !geometrieIstVerortet;
    if (kb && !mapAngewandt) {
        befunde.push({
            schwere: 'hinweis',
            text: 'Die Geometrie trägt bereits Landeskoordinaten — die MapConversion '
                + 'wäre eine zweite Verschiebung und wird NICHT angewandt.',
        });
    }
    if (!kb && !geometrieIstVerortet) {
        befunde.push({
            schwere: 'warnung',
            text: 'Weder eine MapConversion noch erkennbare Landeskoordinaten — '
                + 'die Werte sind modellbezogen, nicht amtlich.',
        });
    }

    // 3. Welches System ist es wirklich? Geprüft am Ostwert, der WIRKLICH gilt.
    const ostWirksam = mapAngewandt ? rohProjekt.ost + (kb?.ost ?? 0) : rohProjekt.ost;
    const etikett = pruefeEtikett(deklariert, ostWirksam);
    if (deklariert && !etikett.stimmt && etikett.erkannt) {
        befunde.push({ schwere: 'warnung', text: etikett.grund });
    }

    // 4. Die Drehung aus der MapConversion — nur wenn sie überhaupt gilt.
    const drehung = mapAngewandt ? (kb?.drehung ?? 0) : 0;
    const cos = Math.cos(drehung), sin = Math.sin(drehung);
    const massstab = mapAngewandt ? (kb?.massstab ?? 1) : 1;

    function nachProjekt(weltPunkt) {
        const p = _alsProjekt(_rohAus(weltPunkt, versatz));
        if (!mapAngewandt) return p;
        // Norm: skalieren → um z drehen → verschieben.
        const e = p.ost * massstab, n = p.nord * massstab;
        return {
            ost:   e * cos - n * sin + (kb.ost ?? 0),
            nord:  e * sin + n * cos + (kb.nord ?? 0),
            hoehe: p.hoehe * massstab + (kb.hoehe ?? 0),
        };
    }

    return {
        nachProjekt,
        mapAngewandt,
        geometrieIstVerortet,
        crs: {
            deklariert,
            erkannt: etikett.erkannt,
            stimmt: etikett.stimmt,
            // Womit GERECHNET wird: das erkannte, wenn es dem deklarierten
            // widerspricht (Fabios Entscheidung). Sonst das deklarierte.
            wirksam: etikett.erkannt ?? deklariert ?? null,
        },
        befunde,
    };
}
