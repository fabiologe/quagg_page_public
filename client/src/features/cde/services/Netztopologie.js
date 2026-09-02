/**
 * Netztopologie — wer hängt an wem (Stufe 14.5).
 *
 * WARUM AUS DER GEOMETRIE UND NICHT AUS BEZIEHUNGEN.
 *
 * Der Plan sah vor, die deklarierten IFC-Beziehungen zu lesen. Die Prüfung an
 * Fabios drei echten Dateien hat das widerlegt: es gibt dort **null**
 * `IfcDistributionPort`, null `IfcRelConnectsPortToElement`, null
 * `IfcRelConnectsElements`, null `IfcRelNests`. Keine einzige erklärte
 * Verbindung — und das ist kein Versehen eines Exports, sondern der Normalfall
 * bei ISYBAU-Konvertern.
 *
 * Dafür steht die Verkettung mit voller Schärfe in der Geometrie: Rohranfang
 * und Rohrende liegen in XY **exakt** auf den Schachtkoordinaten. Nachgemessen
 * an 24/24 und 500/500 Kanten, Abweichung 0,000 m. Ein Toleranzfenster ist
 * also nicht nötig — es steht trotzdem zur Verfügung, weil andere Exporteure
 * runden, und weil eine gefundene Kante mit Toleranz besser ist als keine.
 *
 * NUR IN XY VERGLEICHEN. In der Höhe unterscheiden sich Rohrsohle und
 * Schachtsohle naturgemäss (Anschlusshöhe, Sohlversatz, Bermen). Wer in 3D
 * vergleicht, findet nichts.
 *
 * Reines Modul: kein Vue, kein three, kein WebGL, keine Engine.
 */

/** Voreinstellung: 1 mm. In den Dateien ist die Abweichung exakt 0. */
export const TOLERANZ_M = 0.001;

/** Schlüssel eines Ortes im Raster der Toleranz — so wird das Suchen billig. */
function _zelle(x, z, toleranz) {
    return `${Math.round(x / toleranz)}|${Math.round(z / toleranz)}`;
}

/**
 * Das Netz aus Kanten und Knoten bauen.
 *
 * @param {object} opts
 * @param {Array<{id, anfang:{x,y,z}, ende:{x,y,z}, dn?, laenge?}>} opts.kanten
 *        die Haltungen — `anfang`/`ende` in Weltkoordinaten
 * @param {Array<{id, punkt:{x,y,z}}>} opts.knoten  die Schächte
 * @param {number} [opts.toleranz]
 * @returns {{
 *   knoten: Map<id, {id, punkt, kantenAn: string[], kantenAb: string[]}>,
 *   kanten: Map<id, {id, von: id|null, nach: id|null, dn, laenge, anfang, ende}>,
 *   loseEnden: Array<{kante, ende: 'anfang'|'ende', punkt}>,
 *   ohneAnschluss: id[],
 * }}
 */
export function baueNetz({ kanten = [], knoten = [], toleranz = TOLERANZ_M } = {}) {
    const tol = toleranz > 0 ? toleranz : TOLERANZ_M;

    // Raster über die Schächte. Ein Ort wird in allen neun Nachbarzellen
    // gesucht — sonst fiele ein Treffer knapp jenseits der Zellgrenze durch,
    // obwohl er innerhalb der Toleranz liegt.
    const raster = new Map();
    const knotenKarte = new Map();
    for (const k of knoten) {
        if (!k?.id || !k.punkt) continue;
        knotenKarte.set(k.id, { id: k.id, punkt: k.punkt, kantenAn: [], kantenAb: [] });
        const s = _zelle(k.punkt.x, k.punkt.z, tol);
        if (!raster.has(s)) raster.set(s, []);
        raster.get(s).push(k);
    }

    const suche = (p) => {
        if (!p) return null;
        let bester = null;
        let besteDistanz = Infinity;
        const cx = Math.round(p.x / tol);
        const cz = Math.round(p.z / tol);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                for (const k of raster.get(`${cx + dx}|${cz + dz}`) ?? []) {
                    // NUR XY — die Höhe unterscheidet sich mit Absicht.
                    const d = Math.hypot(k.punkt.x - p.x, k.punkt.z - p.z);
                    if (d <= tol && d < besteDistanz) { besteDistanz = d; bester = k.id; }
                }
            }
        }
        return bester;
    };

    const kantenKarte = new Map();
    const loseEnden = [];
    for (const e of kanten) {
        if (!e?.id || !e.anfang || !e.ende) continue;
        const von = suche(e.anfang);
        const nach = suche(e.ende);
        kantenKarte.set(e.id, {
            id: e.id, von, nach,
            dn: e.dn ?? null, laenge: e.laenge ?? null,
            anfang: e.anfang, ende: e.ende,
        });
        if (von) knotenKarte.get(von).kantenAb.push(e.id);
        else loseEnden.push({ kante: e.id, ende: 'anfang', punkt: e.anfang });
        if (nach) knotenKarte.get(nach).kantenAn.push(e.id);
        else loseEnden.push({ kante: e.id, ende: 'ende', punkt: e.ende });
    }

    const ohneAnschluss = [...knotenKarte.values()]
        .filter(k => !k.kantenAn.length && !k.kantenAb.length)
        .map(k => k.id);

    return { knoten: knotenKarte, kanten: kantenKarte, loseEnden, ohneAnschluss };
}

/**
 * Der Grad eines Knotens — wie viele Haltungen daran hängen.
 *
 * Ein Grad von 1 ist ein Anfang oder ein Ende des Netzes und völlig normal;
 * 0 ist ein Schacht, den niemand anschliesst.
 */
export function grad(netz, knotenId) {
    const k = netz?.knoten?.get(knotenId);
    return k ? k.kantenAn.length + k.kantenAb.length : 0;
}

/**
 * Die Kette stromab ab einer Kante — der STRANG.
 *
 * Folgt am Endknoten der abgehenden Haltung. Gibt es dort mehrere, endet die
 * Kette: welche gemeint ist, kann nur ein Mensch entscheiden, und stillschweigend
 * eine zu wählen wäre schlimmer als aufzuhören.
 *
 * Der Zyklusschutz ist kein Zierrat — ein falsch digitalisiertes Netz kann
 * sehr wohl im Kreis laufen, und dann liefe diese Schleife ewig.
 */
export function strangAb(netz, kantenId, grenze = 500) {
    const kette = [];
    const gesehen = new Set();
    let aktuell = kantenId;
    while (aktuell && !gesehen.has(aktuell) && kette.length < grenze) {
        gesehen.add(aktuell);
        kette.push(aktuell);
        const k = netz.kanten.get(aktuell);
        const knoten = k?.nach ? netz.knoten.get(k.nach) : null;
        const weiter = (knoten?.kantenAb ?? []).filter(id => id !== aktuell);
        aktuell = weiter.length === 1 ? weiter[0] : null;
    }
    return kette;
}
