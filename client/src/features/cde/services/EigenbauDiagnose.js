/**
 * Was der Eigenbau NICHT sauber bauen wird — VOR dem Verbund gesagt (Fahrplan
 * Erdbau-Container, Stufe 1). Rein.
 *
 * Anlass (Projekt 1337, 2026-09-11): zwei Aushübe nannten als Gelände eine
 * Anzeige, die einen Commit vorher zurückgenommen worden war. Der Verbund lief
 * zwei Minuten, liess die beiden still weg und kam als „geprüft" ins Register.
 * Seitdem sperrt der Server das (Befund V10) — und diese Diagnose sagt es,
 * bevor jemand startet:
 *
 *   toteQuellen          Baupläne, deren Gelände-Quelle nicht mehr im Stand
 *                        steht. `loesbar`, wenn die Kette über die Historie
 *                        (Zurückgenommenes) ein Ur-Gelände erreicht — dann baut
 *                        der Ableitungslauf sie trotzdem richtig.
 *   unloesbar            die, bei denen auch die Historie nicht weiterhilft:
 *                        sie würden fehlen, der Server lehnt ab.
 *   verdraengteAnzeigen  eine zweite Anzeige desselben Ur-Geländes — sie wird
 *                        nicht gebaut (eine Fläche je Gelände).
 */
import { urGelaendeVon, verdraengteAnzeigen } from './ableitung/Bezuege.js';

/**
 * @param {object} o
 * @param {Map<string, object>} o.stand      wirksamer erzeugt-Stand
 * @param {Map<string, object>} [o.historie] letzter bekannter Bauplan je Kennung
 * @param {Function} [o.rezeptNach]
 * @param {Set<string>} [o.verdeckt]         Ausgeblendetes — wird nicht gebaut, zählt nicht
 */
export function eigenbauDiagnose({ stand = new Map(), historie = null, rezeptNach = null, verdeckt = new Set() } = {}) {
    const toteQuellen = [];
    for (const [gid, plan] of stand) {
        if (verdeckt.has(gid)) continue;
        const q = plan?.parameter?.quellen?.gelaende ?? plan?.parameter?.quelle ?? null;
        if (!q || !String(q).startsWith('cde-') || stand.has(q)) continue;
        const ur = urGelaendeVon(stand, q, { rezeptNach, historie });
        const loesbar = !!ur && ur !== q && (!String(ur).startsWith('cde-') || stand.has(ur));
        toteQuellen.push({ globalId: gid, name: plan?.name ?? '', quelle: q, ur: loesbar ? ur : null, loesbar });
    }
    const verdraengt = [...verdraengteAnzeigen(stand, { rezeptNach, historie })]
        .filter(([gid]) => !verdeckt.has(gid))
        .map(([gid, statt]) => ({ globalId: gid, name: stand.get(gid)?.name ?? '', statt }));
    return { toteQuellen, unloesbar: toteQuellen.filter(t => !t.loesbar), verdraengteAnzeigen: verdraengt };
}
