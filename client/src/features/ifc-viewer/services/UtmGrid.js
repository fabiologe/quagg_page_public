/**
 * UtmGrid — Koordinatenkreuze für georeferenzierte Lagepläne (Sprint T1, E4).
 *
 * Die Engine hält je Modell den Koordinations-Offset (Three-Welt → IFC-Roh:
 * roh = welt + offset). Für Lagepläne im amtlichen System (UTM/GK) werden
 * Gitterkreuze auf runden Vielfachen der Roh-Koordinaten gesetzt.
 *
 * Achs-Konvention (dokumentierte Annahme, am Realmodell verifizieren):
 *   E (Rechtswert/Easting) = roh.x
 *   N (Hochwert/Northing)  = −roh.z   (flipNorth: +roh.z)
 *
 * Reines Modul — Eingabe sind die Welt-Bounds des Plots (makePaperTransform)
 * und der Offset des (ersten) Modells.
 */

const SPACING_CANDIDATES = [10, 25, 50, 100, 250, 500, 1000, 2500];

/**
 * @param {{wXmin, wXmax, wZmin, wZmax}} bounds  Welt-Bounds des Plot-Ausschnitts
 * @param {{x: number, z: number}} offset        Koordinations-Offset (Welt→Roh)
 * @param {object} [opts]
 * @param {boolean} [opts.flipNorth=false]  N = +roh.z statt −roh.z
 * @param {number}  [opts.spacing]          festes Gitter statt Automatik
 * @returns {{ spacing: number,
 *             crosses: Array<{worldX, worldZ, east, north, labelled: boolean}> }}
 */
export function computeUtmCrosses(bounds, offset, opts = {}) {
    const { flipNorth = false } = opts;
    const off = { x: offset?.x ?? 0, z: offset?.z ?? 0 };

    const eMin = bounds.wXmin + off.x;
    const eMax = bounds.wXmax + off.x;
    const nOfZ = (zRaw) => (flipNorth ? zRaw : -zRaw);
    const n1 = nOfZ(bounds.wZmin + off.z);
    const n2 = nOfZ(bounds.wZmax + off.z);
    const nMin = Math.min(n1, n2), nMax = Math.max(n1, n2);

    const spanE = eMax - eMin;
    const spanN = nMax - nMin;
    if (!(spanE > 0) || !(spanN > 0)) return { spacing: 0, crosses: [] };

    // Automatik: kleinster Kandidat, der ≤ 5 Kreuze je Richtung ergibt
    let spacing = opts.spacing ?? null;
    if (!spacing) {
        spacing = SPACING_CANDIDATES[SPACING_CANDIDATES.length - 1];
        for (const s of SPACING_CANDIDATES) {
            if (Math.floor(spanE / s) <= 5 && Math.floor(spanN / s) <= 5) { spacing = s; break; }
        }
    }

    const eStart = Math.ceil(eMin / spacing) * spacing;
    const nStart = Math.ceil(nMin / spacing) * spacing;
    const crosses = [];
    for (let e = eStart; e <= eMax; e += spacing) {
        for (let n = nStart; n <= nMax; n += spacing) {
            crosses.push({
                worldX: e - off.x,
                worldZ: (flipNorth ? n : -n) - off.z,
                east: e,
                north: n,
                // Anschrift nur am linken/unteren Gitterrand (L-förmig)
                labelled: e === eStart || n === nStart,
            });
        }
    }
    return { spacing, crosses };
}

/** Formatierung „E 555.250" / „N 5.745.100" für die Kreuz-Anschrift. */
export function formatUtmLabel(prefix, value) {
    return `${prefix} ${Math.round(value).toLocaleString('de-DE')}`;
}
