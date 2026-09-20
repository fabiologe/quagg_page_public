/**
 * WAS EIN WERKZEUG AUSSER SEINEM ZIEL BRAUCHT (Teil XXV, V3).
 *
 * Zwei Werkzeuge wirken nicht nur auf ihr Subjekt, sondern auf ein ZWEITES
 * Objekt: „Flächen vereinigen" braucht die andere Fläche, „Tauschen" die
 * Vorlage aus der Bibliothek. Bis hierher erwarteten beide eine fertige
 * LISTE am Subjekt (`el.eigeneFlaechen`, `el.vorlagen`), und die trug nur
 * der Viewer ein. Gemessen am 2026-09-19: dieselben Kommandos laufen mit
 * hereingereichter Liste durch und scheitern ohne sie — nicht am Schema,
 * sondern an der Auflösung (`reichweite.test.js`).
 *
 * Jetzt fragen Formular UND Auswertung dieselbe Stelle: `kandidatenVon(art,
 * el)`. Die Arten sind bewusst knapp gehalten wie die Eigenschaftsarten —
 * jede nennt, WAS sie liefert und WOFÜR sie gilt, nicht welches Werkzeug
 * sie benutzt:
 *
 *   eigene:flaeche          eigene Bauteile mit geschlossenem Umriss, ohne
 *                           das Subjekt selbst — mit ihren Punkten
 *   vorlage:gleichesRezept  Vorlagen der Bibliothek zum Rezept des Subjekts
 *   vorgang:teile           die Bauteile DESSELBEN Erdbau-Vorgangs: seine Teile
 *                           und die Anzeige, die ihn in ihrer Vorgangsliste
 *                           führt — samt Bauplan (Teil XXV, V5)
 *
 * `vorgang:teile` ist bewusst eng: die Klammer kommt aus dem Bauplan des
 * SUBJEKTS, nicht aus einer Suche über alles. Ein Werkzeug sieht damit die
 * Teile seines eigenen Vorgangs — nicht das Modell.
 *
 * Ein Kandidat ist immer `{id, titel, …}`: `id` ist, was im Kommando steht
 * (eine GlobalId oder eine Vorlagen-Id), `titel` ist, was im Formular steht.
 *
 * Rein: kein Vue, kein Store, keine Engine. Was aus dem Journal kommt,
 * kommt über `wirksamerStand`; was aus der Bibliothek kommt, reicht der
 * Aufrufer herein.
 */
import { istAnzeigeform, rezeptNach } from '../Bauteilrezepte.js';
import { verdeckteAus } from '../CdeAchsen.js';

export const KANDIDATENARTEN = Object.freeze({
    'eigene:flaeche': 'eine andere eigene Fläche',
    'vorlage:gleichesRezept': 'eine Vorlage aus der Bibliothek',
    'vorgang:teile': 'die Bauteile desselben Erdbau-Vorgangs',
});

/**
 * Der Auflöser, den `werteAus` und `felderFuer` bekommen.
 *
 * @param {object} quellen
 * @param {function(string): Map} [quellen.wirksamerStand]  Journal (Art → GlobalId → Wert)
 * @param {Array} [quellen.vorlagen]  die geladene Bibliothek
 * @returns {function(string, object): Array<{id: string, titel: string}>}
 */
export function kandidatenAus({ wirksamerStand = null, vorlagen = [] } = {}) {
    return (art, el) => {
        if (art === 'eigene:flaeche') return _eigeneFlaechen(wirksamerStand, el);
        if (art === 'vorlage:gleichesRezept') return _vorlagen(vorlagen, el);
        if (art === 'vorgang:teile') return _vorgangsteile(wirksamerStand, el);
        return [];
    };
}

/** Die eigenen Flächen aus dem Journal — ohne das Subjekt und ohne Ausgeblendetes. */
function _eigeneFlaechen(wirksamerStand, el) {
    if (typeof wirksamerStand !== 'function') return [];
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    const aus = [];
    for (const [globalId, plan] of wirksamerStand('erzeugt')) {
        if (globalId === el?.globalId || verdeckt.has(globalId)) continue;
        // „Fläche" ist keine Namensfrage: geschlossen ist, was das REZEPT sagt.
        if (!plan?.rezept || !rezeptNach(plan.rezept)?.geschlossen) continue;
        const punkte = plan.parameter?.punkte;
        if (!Array.isArray(punkte) || punkte.length < 3) continue;
        aus.push({ id: globalId, titel: plan.parameter?.name || plan.name || globalId,
                   rezept: plan.rezept, punkte });
    }
    return aus;
}

/** Die Vorlagen zum Rezept des Subjekts — eine Vorlage passt nur auf ihr Rezept. */
function _vorlagen(vorlagen, el) {
    const rezept = el?.stand?.bauplan?.rezept ?? null;
    if (!rezept) return [];
    return (vorlagen ?? [])
        .filter(v => v?.rezept === rezept)
        .map(v => ({ id: v.id, titel: v.name || v.id, rezept: v.rezept, vorgaben: v.vorgaben ?? {} }));
}

/**
 * Die Bauteile desselben Erdbau-Vorgangs wie das Subjekt (Teil XXV, V5).
 *
 * Zwei Sorten, und beide braucht „Vorgang entfernen":
 *   teil     ein Bauteil der Klammer (Aushub, Auftrag, neues DGM)
 *   anzeige  das Anzeige-Bauteil, das den Vorgang in `parameter.vorgaenge`
 *            führt — es überlebt, wenn noch andere Vorgänge darin stehen
 *
 * `verdecktesUr` nennt das ausgeblendete Ur-Gelände der Anzeige: wird sie
 * zurückgenommen, kommt es wieder zum Vorschein.
 */
function _vorgangsteile(wirksamerStand, el) {
    const ableitung = el?.stand?.bauplan?.ableitung ?? null;
    if (!ableitung || typeof wirksamerStand !== 'function') return [];
    const erzeugt = wirksamerStand('erzeugt');
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    const aus = [];
    for (const [globalId, plan] of erzeugt) {
        // „Anzeige" ist keine Namensfrage: der Katalog sagt, ob ein Bauplan
        // eine Anzeigeform ist (W3 — Rezeptnamen bleiben im Katalog).
        const anzeige = istAnzeigeform(plan);
        if (plan?.ableitung === ableitung && !anzeige) {
            aus.push({ id: globalId, titel: plan.name || globalId, rolle: 'teil', bauplan: plan });
            continue;
        }
        if (!anzeige) continue;
        if (!(plan.parameter?.vorgaenge ?? []).some(v => v?.ableitung === ableitung)) continue;
        const ur = plan.parameter?.quellen?.gelaende ?? null;
        aus.push({ id: globalId, titel: plan.name || globalId, rolle: 'anzeige', bauplan: plan,
                   ...(ur && verdeckt.has(ur) ? { verdecktesUr: ur } : {}) });
    }
    return aus;
}
