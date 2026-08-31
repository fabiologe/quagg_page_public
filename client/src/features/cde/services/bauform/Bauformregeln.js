/**
 * Bauformregeln — wenn der Typ nichts hergibt, sagt es eine Regel (Stufe 9.3a).
 *
 * DER ANLASS: Fabios Kanalmodelle kommen aus ProVI und enthalten
 * ausschliesslich `IFCBUILDINGELEMENTPROXY`. Seine Einschätzung war: *„Proxys
 * sind kacke, weil alles was die haben nur Geometrie ist — da was zu erkennen
 * ist schwer und extrem aufwendig."*
 *
 * Fast richtig, aber nicht ganz. Im Entwässerungs-Export im Testordner steht:
 *
 *     19 ×  IFCBUILDINGELEMENTPROXY  Name = 'Schacht'
 *     18 ×  IFCBUILDINGELEMENTPROXY  Name = 'Haltung'
 *     Merkmalssatz 'ProVI'
 *
 * Der Exporteur schreibt also sehr wohl das Fachwort — nur nicht in den Typ,
 * sondern in den Namen. Das ist keine Grundlage zum RATEN (ein anderes Büro
 * nennt es anders), aber eine sehr gute zum ERKLÄREN: einmal sagen, was
 * „Haltung" in diesem Export bedeutet, und es gilt für jede Datei aus derselben
 * Software.
 *
 * Genau das ist „Regler statt Raterei": die Maschine zeigt die Namen, die sie
 * findet; ein Mensch ordnet sie zu; die Zuordnung ist ein DATENSATZ auf der
 * Büro-Ebene (Stufe 6) und gilt projektübergreifend.
 *
 * KEINE NEUE MASCHINERIE: `VectorRuleEngine` ist bereits ein generischer
 * Bedingungs-Matcher mit mehreren Ausgabe-Slots (treibt heute Linienstile und
 * KG-Klassifikation), und sein Kopfkommentar nennt weitere Slots ausdrücklich
 * als vorgesehene Erweiterung. Hier kommt der Slot `bauform` dazu.
 */

import { findMatchingRule } from '../VectorRuleEngine.js';
import { istBauform } from './Bauformen.js';

export const REPO_KEY = 'bauformregeln';

/**
 * Mitgelieferte Regeln.
 *
 * BEWUSST KLEIN und bewusst benannt: das hier ist die Konvention EINES
 * Exporteurs, nicht eine Wahrheit über IFC. Sie steht drin, weil sie Fabios
 * Modelle sofort brauchbar macht — und sie ist über die Büro-Ebene
 * überschreibbar, wenn ein anderes Büro andere Wörter benutzt.
 *
 * Wer hier ergänzt, ergänzt eine BEOBACHTUNG, keine Vermutung: erst im Modell
 * nachsehen, welche Namen wirklich vorkommen.
 */
export const MITGELIEFERTE_REGELN = Object.freeze([
    {
        id: 'provi-haltung', enabled: true, priority: 50,
        name: 'ProVI: Proxy „Haltung" ist eine Leitung',
        condition: { category: 'IFCBUILDINGELEMENTPROXY', propertyName: 'Name',
                     operator: 'equals', value: 'Haltung' },
        bauform: 'achse+profil',
    },
    {
        id: 'provi-schacht', enabled: true, priority: 50,
        name: 'ProVI: Proxy „Schacht" ist ein Bauwerk',
        condition: { category: 'IFCBUILDINGELEMENTPROXY', propertyName: 'Name',
                     operator: 'equals', value: 'Schacht' },
        bauform: 'koerper',
    },
]);

/**
 * Die wirksamen Regeln laden: Projekt schlägt Büro schlägt mitgeliefert.
 *
 * Dieselbe Vorrangregel wie bei Plankopf, Linienstilen und Typprofilen — wer
 * sie an einer Stelle kennt, kennt sie überall.
 */
export async function ladeRegeln(repo) {
    if (!repo?.mitVorrang) return [...MITGELIEFERTE_REGELN];
    try {
        const eigene = await repo.mitVorrang(REPO_KEY, null);
        if (Array.isArray(eigene)) return eigene;
    } catch (fehler) {
        console.warn('cde: bauformregeln laden', fehler?.message ?? fehler);
    }
    return [...MITGELIEFERTE_REGELN];
}

/**
 * Welche Bauform sagt eine Regel für dieses Bauteil?
 *
 * @param {{category, attributes, psets}} ctx  Elementzusammenhang wie im RuleEngine
 * @returns {{bauform: string, regel: object} | null}
 */
export function bauformAusRegel(regeln, ctx) {
    if (!regeln?.length || !ctx) return null;
    // Nur Regeln, die überhaupt eine Bauform aussprechen — sonst gewänne eine
    // Linienstil-Regel mit höherer Priorität und läge dann still ohne Aussage.
    const mitBauform = regeln.filter(r => r?.bauform);
    const treffer = findMatchingRule(mitBauform, ctx);
    if (!treffer?.bauform) return null;
    if (!istBauform(treffer.bauform)) {
        console.warn('cde: Regel nennt unbekannte Bauform', treffer.bauform);
        return null;
    }
    return { bauform: treffer.bauform, regel: treffer };
}

/**
 * Welche Namen kommen in einer Kategorie vor — der Vorschlag fürs Zuordnen.
 *
 * Damit zeigt die Oberfläche „in diesem Modell heissen 18 Proxies ‚Haltung'",
 * statt den Nutzer raten zu lassen, wonach er suchen soll. Rein, damit sie ohne
 * Modell prüfbar ist.
 *
 * @param {Array<{category, attributes}>} elemente
 * @returns {Array<{category, name, anzahl}>} absteigend nach Häufigkeit
 */
export function namensvorschlaege(elemente) {
    const zaehler = new Map();
    for (const el of elemente ?? []) {
        const name = el?.attributes?.Name;
        if (!name || typeof name !== 'string') continue;
        const schluessel = `${el.category ?? ''}|${name}`;
        zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1);
    }
    return [...zaehler.entries()]
        .map(([schluessel, anzahl]) => {
            const [category, name] = schluessel.split('|');
            return { category, name, anzahl };
        })
        .sort((a, b) => b.anzahl - a.anzahl);
}

/** Aus einer Zuordnung eine Regel machen — das, was das Werkzeug schreibt. */
export function regelAus({ category, name, bauform }) {
    return {
        id: `bf-${category}-${name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        enabled: true, priority: 60,          // über den mitgelieferten
        name: `„${name}" (${category}) ist ${bauform}`,
        condition: { category, propertyName: 'Name', operator: 'equals', value: name },
        bauform,
    };
}
