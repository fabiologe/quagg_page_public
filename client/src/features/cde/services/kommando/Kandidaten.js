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
import { istAnzeigeform, istBehaelter, rezeptNach } from '../Bauteilrezepte.js';
import { verdeckteAus } from '../CdeAchsen.js';

export const KANDIDATENARTEN = Object.freeze({
    'eigene:flaeche': 'eine andere eigene Fläche',
    'vorlage:gleichesRezept': 'eine Vorlage aus der Bibliothek',
    'vorgang:teile': 'die Bauteile desselben Erdbau-Vorgangs',
    'eigene:bauwerk': 'ein eigenes Bauwerk, zu dem das Subjekt gehören kann',
    'bauwerk:teile': 'die Teile eines Bauwerks — auch die seiner Anlagenteile und Baugruppen',
    'eigene:wirt': 'ein eigenes Bauteil mit Rechteckprofil, das eine Öffnung tragen kann (Wand, Fundament, Schwelle)',
    'eigene:traeger': 'ein eigenes Bauteil mit Körper, auf dem das Subjekt stehen kann',
    'gelaende': 'ein Gelände, auf dem etwas liegen kann — ein Ur-Gelände aus dem Journal oder ein geliefertes',
});

/**
 * Der Auflöser, den `werteAus` und `felderFuer` bekommen.
 *
 * @param {object} quellen
 * @param {function(string): Map} [quellen.wirksamerStand]  Journal (Art → GlobalId → Wert)
 * @param {Array} [quellen.vorlagen]  die geladene Bibliothek
 * @returns {function(string, object): Array<{id: string, titel: string}>}
 */
export function kandidatenAus({ wirksamerStand = null, vorlagen = [], gelaende = [] } = {}) {
    return (art, el) => {
        if (art === 'gelaende') return _gelaende(wirksamerStand, gelaende);
        if (art === 'eigene:flaeche') return _eigeneFlaechen(wirksamerStand, el);
        if (art === 'vorlage:gleichesRezept') return _vorlagen(vorlagen, el);
        if (art === 'vorgang:teile') return _vorgangsteile(wirksamerStand, el);
        if (art === 'eigene:bauwerk') return _eigeneBauwerke(wirksamerStand, el);
        if (art === 'bauwerk:teile') return _bauwerksteile(wirksamerStand, el);
        if (art === 'eigene:wirt') return _eigeneWirte(wirksamerStand, el);
        if (art === 'eigene:traeger') return _eigeneTraeger(wirksamerStand, el);
        return [];
    };
}

/**
 * DIE GELÄNDE (Teil XXIX, G-T1): worauf eine Schicht liegen kann. Zuerst jedes Ur-Gelände, das im Journal
 * eine Anzeige trägt (es wurde schon geformt — Zellweite und Prüfmass sind die des Erdbaus, damit die
 * Schicht auf DERSELBEN Fläche liegt, die man sieht); dann die gelieferten, die der Aufrufer kennt
 * (`gelaende`: die Kandidaten der Engine). Eine Anzeige der CDE steht für ihr Ur und wird nicht doppelt genannt.
 */
function _gelaende(wirksamerStand, gelaende) {
    const aus = new Map();
    if (typeof wirksamerStand === 'function') {
        for (const [, plan] of wirksamerStand('erzeugt')) {
            if (!istAnzeigeform(plan)) continue;
            const ur = plan.parameter?.quellen?.gelaende;
            if (!ur || aus.has(ur)) continue;
            aus.set(ur, { id: ur, titel: rezeptNach(plan.rezept)?.quellnameAus?.(plan) || ur, herkunft: 'journal',
                          cell: plan.parameter?.raster?.cell ?? null, pruefmass: plan.parameter?.quellBasis?.gelaende ?? null });
        }
    }
    for (const g of gelaende ?? []) {
        if (!g?.globalId || g.herkunft === 'cde' || aus.has(g.globalId)) continue;
        aus.set(g.globalId, { id: g.globalId, titel: g.name || g.globalId, herkunft: 'geliefert',
                              cell: g.cell ?? null, pruefmass: g.pruefmass ?? null });
    }
    return [...aus.values()];
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

/**
 * Die eigenen Bauwerke, zu denen das Subjekt gehören kann (Teil XXVI, Z5e).
 *
 * „Bauwerk" ist keine Namensfrage: der Katalog sagt, ob ein Bauplan ein
 * Behälter ist. Ausgenommen: das Subjekt selbst, Ausgeblendetes — und jedes
 * Bauwerk, das schon IN dem Subjekt steckt. Sonst ergäbe „Kammer in RÜB, RÜB in
 * Kammer" einen Kreis, den erst der Schreiber bemerkte.
 */
function _eigeneBauwerke(wirksamerStand, el) {
    if (typeof wirksamerStand !== 'function') return [];
    const erzeugt = wirksamerStand('erzeugt');
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    const steckt = (gid) => {
        const gesehen = new Set();
        for (let e = gid; e && !gesehen.has(e); e = erzeugt.get(e)?.parameter?.teilVon) {
            if (e === el?.globalId) return true;
            gesehen.add(e);
        }
        return false;
    };
    const aus = [];
    for (const [globalId, plan] of erzeugt) {
        if (!istBehaelter(plan) || verdeckt.has(globalId) || steckt(globalId)) continue;
        aus.push({ id: globalId, titel: plan.name || globalId, art: plan.parameter?.art ?? null });
    }
    return aus;
}

/**
 * Die Teile eines Bauwerks (Teil XXVII, B2) — alles, dessen `teilVon`-Kette zum
 * Subjekt führt: Bauteile, Räume, untergeordnete Bauwerke und deren Teile.
 * In Stand-Reihenfolge; Ausgeblendetes fehlt. Daran fächern die Lage-Werkzeuge
 * des Bauwerks auf: ein Kommando, alle Teile.
 */
function _bauwerksteile(wirksamerStand, el) {
    const wurzel = el?.globalId ?? null;
    if (!wurzel || typeof wirksamerStand !== 'function') return [];
    const erzeugt = wirksamerStand('erzeugt');
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    const gehoert = (gid) => {
        const gesehen = new Set();
        for (let e = erzeugt.get(gid)?.parameter?.teilVon; e && !gesehen.has(e); e = erzeugt.get(e)?.parameter?.teilVon) {
            if (e === wurzel) return true;
            gesehen.add(e);
        }
        return false;
    };
    const aus = [];
    for (const [globalId, plan] of erzeugt) {
        if (globalId === wurzel || verdeckt.has(globalId) || !gehoert(globalId)) continue;
        aus.push({ id: globalId, titel: plan.name || globalId, bauplan: plan, behaelter: istBehaelter(plan) });
    }
    return aus;
}

/**
 * Eigene Bauteile, die eine Öffnung tragen können (Teil XXVII, B4): ein Sweep mit
 * RECHTECKprofil — seine Breite ist die Tiefe der Öffnung. Keine Namensfrage:
 * das sagt die Deklaration des Rezepts.
 */
function _eigeneWirte(wirksamerStand, el) {
    if (typeof wirksamerStand !== 'function') return [];
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    const aus = [];
    for (const [globalId, plan] of wirksamerStand('erzeugt')) {
        if (globalId === el?.globalId || verdeckt.has(globalId)) continue;
        const g = rezeptNach(plan?.rezept)?.geometrie;
        if (g?.art !== 'sweep' || g.profil?.art !== 'rechteck') continue;
        aus.push({ id: globalId, titel: plan.name || globalId, rezept: plan.rezept });
    }
    return aus;
}

/**
 * Eigene Bauteile, auf denen das Subjekt stehen kann (Teil XXVII, B5): alles mit
 * einem Körper (Form `umriss` liefert Ober- und Unterkante). Ausgenommen: was
 * — über `hoeheVon` — schon auf dem Subjekt steht; sonst stünde die Wand auf der
 * Decke, die auf der Wand steht.
 */
function _eigeneTraeger(wirksamerStand, el) {
    if (typeof wirksamerStand !== 'function') return [];
    const erzeugt = wirksamerStand('erzeugt');
    const verdeckt = verdeckteAus(wirksamerStand('geloescht'));
    const stehtAufSubjekt = (gid) => {
        const gesehen = new Set();
        for (let e = gid; e && !gesehen.has(e); e = erzeugt.get(e)?.parameter?.hoeheVon?.bauteil) {
            if (e === el?.globalId) return true;
            gesehen.add(e);
        }
        return false;
    };
    const aus = [];
    for (const [globalId, plan] of erzeugt) {
        if (globalId === el?.globalId || verdeckt.has(globalId) || stehtAufSubjekt(globalId)) continue;
        const r = rezeptNach(plan?.rezept);
        if (!r?.geometrie || typeof r.formAus !== 'function') continue;
        aus.push({ id: globalId, titel: plan.name || globalId, rezept: plan.rezept, bauplan: plan });
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
