/**
 * Nachspielen — das Rebase der Festlegungen auf ein frisch geladenes Modell
 * (Stufe 9.2).
 *
 * Ohne diese Datei ist jede Bearbeitung beim Neuladen weg: das Journal liegt
 * in der RepoFacade, das Modell kommt roh vom Planer. Hier treffen sie sich.
 *
 * Fabios Bild ist Git, und es hält bis in die Einzelheiten:
 *
 *     Lieferstand        Basis-Stand
 *     Journal            die eigenen Commits
 *     neue Revision      der Upstream hat sich bewegt
 *     Nachspielen        Rebase
 *     Konflikt           beide haben dieselbe Stelle angefasst
 *
 * ZWEI ENTSCHEIDUNGEN, die diese Datei umsetzt:
 *
 * (4) Nachgespielt wird der STAND, nicht die Historie. Git checkt einen
 *     Zustand aus; es spult nicht die Tipparbeit nach. `standMitEintrag`
 *     liefert je Bauteil den Schritt, der zuletzt gewonnen hat — der wird
 *     angewandt, nicht die fünf davor.
 *
 * (5) Ein Konflikt ist laut, aber blockiert nicht. Er wird gemeldet, der Rest
 *     läuft. Nichts verschwindet still — das ist ISO 19650 und Git zugleich.
 *
 * IDEMPOTENZ ist die Eigenschaft, auf der alles ruht: zweimal nachspielen darf
 * nichts ändern. Sie kommt daher, dass die Werte ABSOLUT sind (Anker, nicht
 * Versatz) — ein absoluter Zielwert zweimal gesetzt ergibt denselben Zustand,
 * ein Zuwachs verdoppelt sich. Deshalb ist `leseLieferstand` auch bewusst der
 * Stand VOR jeder Anwendung: der Bezugspunkt darf sich beim Anwenden nicht
 * mitbewegen, sonst wäre der zweite Lauf ein anderer als der erste.
 *
 * Reine Funktionen, ohne Vue, ohne WebGL — die Attrappe reicht ein Map hinein.
 */

import { AENDERUNGS_ARTEN, standMitEintragEbenen, vergleicheMitModell } from '../stores/useAenderungen.js';

/**
 * Welche Festlegungen lassen sich auf dieses Modell anwenden, und wo hakt es?
 *
 * @param {Array} eintraege        das AUFTRAGSJOURNAL (gilt in jedem Modellsatz)
 * @param {(globalId: string, art: string) => *} leseLieferstand
 *        Wert im GELIEFERTEN Modell; `undefined` heißt „Bauteil nicht da".
 *        Muss der Stand VOR jeder Anwendung sein — siehe Idempotenz oben.
 * @param {object} [opts]
 * @param {string[]} [opts.arten]  nur diese Arten (Vorgabe: alle modellberührenden)
 * @param {Array} [opts.standEintraege]  das Journal des aktiven Modellsatzes.
 *        Wird GETRENNT gefaltet und danach überlagert — verkettet man beide,
 *        löscht ein `null` im Satz die Auftragskorrektur mit aus dem Plan, und
 *        sie käme beim Laden nicht mehr aufs Modell (Stufe 11.1).
 * @returns {{anzuwenden: Array, konflikte: Array, zusammenfassung: object}}
 *   anzuwenden: [{ globalId, art, wert, eintrag, modell }]
 *   konflikte:  [{ globalId, art, eintrag, zustand, grund, istWert }]
 */
export function planeNachspielen(eintraege, leseLieferstand, { arten = null, standEintraege = null } = {}) {
    const anzuwenden = [];
    const konflikte = [];

    const zuPruefen = arten ?? Object.entries(AENDERUNGS_ARTEN)
        .filter(([, a]) => a.beruehrtModell)
        .map(([name]) => name);

    for (const art of zuPruefen) {
        for (const [globalId, { wert, eintrag }] of standMitEintragEbenen(eintraege ?? [], standEintraege, art)) {
            // Erzeugte Bauteile stehen nicht im gelieferten Modell — sie im
            // Lieferstand zu suchen und dann „fehlt" zu melden, wäre ein
            // Fehlalarm mit Ansage.
            if (eintrag.modell === 'cde') {
                anzuwenden.push({ globalId, art, wert, eintrag, modell: 'cde' });
                continue;
            }

            const istWert = leseLieferstand?.(globalId, art);
            const { zustand, grund } = vergleicheMitModell(eintrag, istWert);

            if (zustand === 'sauber') {
                anzuwenden.push({ globalId, art, wert, eintrag, modell: 'geliefert', grund });
            } else {
                konflikte.push({ globalId, art, eintrag, zustand, grund, istWert });
            }
        }
    }

    return {
        anzuwenden,
        konflikte,
        zusammenfassung: {
            angewandt: anzuwenden.length,
            konflikte: konflikte.length,
            fehlend: konflikte.filter(k => k.zustand === 'fehlt').length,
            ueberschnitten: konflikte.filter(k => k.zustand === 'konflikt').length,
        },
    };
}

/**
 * Die Meldung nach dem Laden — kurz, und sie verschweigt nichts.
 *
 * „18 Festlegungen angewandt" allein wäre eine halbe Wahrheit; die zwei, die
 * nicht durchgingen, sind die interessanten.
 */
export function fasseZusammen({ angewandt = 0, konflikte = 0, fehlend = 0, ueberschnitten = 0 } = {}) {
    if (!angewandt && !konflikte) return '';
    const teile = [`${angewandt} ${angewandt === 1 ? 'Festlegung' : 'Festlegungen'} angewandt`];
    if (ueberschnitten) teile.push(`${ueberschnitten} × auch vom Planer geändert`);
    if (fehlend) teile.push(`${fehlend} × Bauteil nicht mehr im Modell`);
    return teile.join(' · ');
}

/**
 * Konflikte je Bauteil nachschlagen — für die Anzeige im Änderungen-Reiter.
 *
 * Der Zustand wird NICHT gespeichert (siehe `vergleicheMitModell`): er gilt
 * für das gerade geladene Modell und heilt von selbst, wenn ein Bauteil in
 * einer späteren Revision zurückkommt.
 *
 * @returns {Map<string, {zustand, grund}>}  Schlüssel `${art}|${globalId}`
 */
export function konfliktKarte(konflikte) {
    const karte = new Map();
    for (const k of konflikte ?? []) {
        karte.set(`${k.art}|${k.globalId}`, { zustand: k.zustand, grund: k.grund });
    }
    return karte;
}
