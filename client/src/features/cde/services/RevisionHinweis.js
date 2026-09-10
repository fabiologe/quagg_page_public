/**
 * Revisionshinweis — ist eine NEUE Revision geladen, während das Journal an
 * der alten hängt? (Stufe 5 des Aushub-Fachmodells.) Rein.
 *
 * Erkannt über das Register, nicht über den Namen: eine geladene Datei, deren
 * Linie (IFCPROJECT-GlobalId, sonst Stamm|Art — `Herkunft.linieVon`) eine
 * ÄLTERE Revision im Register hat. Ohne fehlende Kennungen gibt es nichts
 * umzuhängen, dann schweigt der Hinweis.
 */
import { linieVon } from './Herkunft.js';

/**
 * @returns {{wechsel: {von, nach}|null, fehlend: number, zuordenbar: number}|null}
 *          `von`/`nach` = {sha, name, revision} — so steht es im Commit (`rebase`)
 */
export function revisionsHinweis({ fehlend = [], vorschlaege = [], geladen = [], register = [] } = {}) {
    if (!fehlend?.length) return null;
    const alsRev = (d) => ({ sha: d.sha256, name: d.name ?? d.datei, revision: Number(d.revision ?? 0) });
    let wechsel = null;
    for (const g of geladen ?? []) {
        const d = (register ?? []).find(x => x.sha256 === g.sha256);
        if (!d) continue;
        const aelter = register
            .filter(x => x.sha256 !== d.sha256 && !x.herkunft?.art && linieVon(x) === linieVon(d)
                         && Number(x.revision ?? 0) < Number(d.revision ?? 0))
            .sort((a, b) => Number(b.revision ?? 0) - Number(a.revision ?? 0))[0];
        if (aelter) { wechsel = { von: alsRev(aelter), nach: alsRev(d) }; break; }
    }
    return { wechsel, fehlend: fehlend.length, zuordenbar: (vorschlaege ?? []).filter(v => v.neu).length };
}
