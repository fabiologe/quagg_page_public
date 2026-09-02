/**
 * Satz gegen Satz (Lücke ⑦ / Stufe 9.9, 2026-09-02).
 *
 * „Nord gegen Süd statt meins gegen Planer" — derselbe Vergleich, dieselbe
 * Ableitung: verglichen werden die WIRKSAMEN Stände (Auftragsebene + je eine
 * Satzebene, gefaltet über `ebenenStand`), nicht die rohen Schrittlisten.
 * Eine Auftragskorrektur gilt in beiden Sätzen und erscheint deshalb in
 * KEINEM Unterschied; erst ein Satz, der sie überstimmt, macht eine Zeile.
 *
 * Rein: kein Vue, kein Repo — der fremde Satz kommt als Nutzlast herein,
 * `flacheAusNutzlast` packt sie aus (dasselbe v2-Format, das `_uebernimmV2`
 * liest; v1 wurde beim Umstieg verworfen und liefert leer).
 */
import { AENDERUNGS_ARTEN, ebenenStand, gleichFuer } from '../stores/useAenderungen.js';

/** v2-Nutzlast → flache Schrittliste (Commits in Reihenfolge, Sitzung zuletzt). */
export function flacheAusNutzlast(roh) {
    if (roh?.version !== 2) return [];
    const flach = [];
    for (const c of roh.commits ?? []) {
        if (Array.isArray(c?.schritte)) flach.push(...c.schritte);
    }
    if (Array.isArray(roh.sitzung?.schritte)) flach.push(...roh.sitzung.schritte);
    return flach;
}

/**
 * @returns {Array<{globalId, art, hier, dort, zustand}>}
 *   zustand: 'nur_hier' | 'nur_dort' | 'verschieden' — Gleiches erscheint nicht.
 */
export function vergleicheStaende({ auftrag = [], hier = [], dort = [], arten = AENDERUNGS_ARTEN } = {}) {
    const zeilen = [];
    for (const art of Object.keys(arten)) {
        const standHier = ebenenStand(auftrag, hier, art);
        const standDort = ebenenStand(auftrag, dort, art);
        const gleich = gleichFuer(art, arten);
        const gids = new Set([...standHier.keys(), ...standDort.keys()]);
        for (const gid of gids) {
            const wa = standHier.has(gid) ? standHier.get(gid) : undefined;
            const wb = standDort.has(gid) ? standDort.get(gid) : undefined;
            if (wa === undefined) {
                zeilen.push({ globalId: gid, art, hier: undefined, dort: wb, zustand: 'nur_dort' });
            } else if (wb === undefined) {
                zeilen.push({ globalId: gid, art, hier: wa, dort: undefined, zustand: 'nur_hier' });
            } else if (!gleich(wa, wb)) {
                zeilen.push({ globalId: gid, art, hier: wa, dort: wb, zustand: 'verschieden' });
            }
        }
    }
    return zeilen;
}
