/**
 * Was eine Achse beim Ansehen sagt — Sohlen, Gefälle, Länge, DN, Herkunft
 * (Stufe 14.2; seit Teil XXIV rein, damit es ohne Oberfläche prüfbar ist).
 *
 * „Sohle" heisst hier die SOHLE, mit dem Bezug der Achse (K4) — bis dahin die
 * rohe Achshöhe, bei eigenen Haltungen die Rohrmitte. Das Gefälle kommt aus der
 * EINEN Rechnung (K5); vorher las die Tafel ein Feld, das nur gelieferte Achsen
 * tragen, und eine eigene Haltung hiess „waagerecht".
 *
 * Rein: kein Vue, keine Engine.
 */
import { sohleAnAchse } from './Achsbezug.js';
import { formatGefaelle } from './AxisAnnotations.js';
import { gefaelle, punkteDerAchse } from './geometrie/Stationierung.js';
import { nnAusWelt } from './Hoehenbezug.js';

const HERKUNFT = Object.freeze({ extrusion: 'aus der Extrusion', bauplan: 'aus dem Bauplan', mesh: 'aus dem Netz' });

/**
 * @param {object} achse  wie am Subjekt (`anfang`, `ende`, `polyline`|`punkte`, `laenge`, `dn`, `quelle`, `achsbezug`)
 * @param {{umgekehrt?: boolean, hoehenversatz?: number}} [opts]  eine festgelegte Fliessrichtung gilt auch für die Anzeige
 * @returns {{umgekehrt, anfangNn, endeNn, gefaelle, laenge, dn, herkunft}|null}
 */
export function achsAnzeige(achse, { umgekehrt = false, hoehenversatz = 0 } = {}) {
    if (!achse?.anfang || !achse?.ende) return null;
    const a = umgekehrt ? { ...achse, anfang: achse.ende, ende: achse.anfang } : achse;
    const punkte = umgekehrt ? [...punkteDerAchse(achse)].reverse() : punkteDerAchse(achse);
    const nn = (y) => nnAusWelt(sohleAnAchse(y, achse), hoehenversatz).toFixed(2);
    const g = gefaelle(punkte);
    const waagerecht = g.promille == null || Math.abs(g.fall) < 1e-9;
    return {
        umgekehrt,
        anfangNn: nn(a.anfang.y),
        endeNn: nn(a.ende.y),
        gefaelle: waagerecht ? 'waagerecht' : formatGefaelle(g.promille),
        laenge: a.laenge?.toFixed(2) ?? '—',
        dn: a.dn ?? null,
        herkunft: HERKUNFT[a.quelle] ?? 'aus der Achs-Repräsentation',
    };
}
