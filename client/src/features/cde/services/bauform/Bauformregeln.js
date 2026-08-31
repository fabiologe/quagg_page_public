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
 * Der STAMM eines Namens — „Haltung 12" → „Haltung".
 *
 * Nur eine angehängte Zählnummer wird abgeschnitten, und nur mit Trenner oder
 * am reinen Wortende. Dieselbe Zurückhaltung wie beim Basisnamen im Manifest,
 * und aus demselben Grund: eine zu gierige Regel machte aus „Schacht2000"
 * (einem Typ!) den Stamm „Schacht" und würfe zwei verschiedene Dinge zusammen.
 *
 * Gibt `null`, wenn nichts abzuschneiden ist — dann gibt es keine Gruppe.
 */
export function namensstamm(name) {
    const stamm = String(name ?? '').replace(/[\s_\-.]*\d+\s*$/, '').trim();
    return stamm && stamm !== String(name).trim() ? stamm : null;
}

/**
 * Welche Namen kommen vor — und welche GRUPPEN lassen sich daraus bilden?
 *
 * Damit zeigt die Oberfläche „in diesem Modell heissen 18 Proxies ‚Haltung'",
 * statt den Nutzer raten zu lassen, wonach er suchen soll.
 *
 * WARUM GRUPPEN: Ein Exporteur, der 18 Haltungen als „Haltung 1" … „Haltung 18"
 * schreibt, wäre mit exakter Zuordnung unbrauchbar — man müsste achtzehnmal
 * dasselbe sagen, und die nächste Lieferung hätte zwanzig. Eine Gruppe erfasst
 * sie als `contains`-Regel auf einmal.
 *
 * Die Gruppe ist ein VORSCHLAG, keine Entscheidung: sie erscheint nur, wenn sie
 * mindestens zwei verschiedene Namen zusammenfasst, und ein Mensch bestätigt
 * sie. Damit bleibt es „Regler statt Raterei" — die Maschine schlägt vor, sie
 * setzt nicht.
 *
 * @param {Array<{category, attributes}>} elemente
 * @returns {Array<{category, name, anzahl, art: 'genau'|'gruppe', namen?: string[]}>}
 */
export function namensvorschlaege(elemente) {
    const zaehler = new Map();
    for (const el of elemente ?? []) {
        const name = el?.attributes?.Name;
        if (!name || typeof name !== 'string') continue;
        const schluessel = `${el.category ?? ''}|${name}`;
        zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1);
    }

    const genau = [...zaehler.entries()].map(([schluessel, anzahl]) => {
        const i = schluessel.indexOf('|');
        return { category: schluessel.slice(0, i), name: schluessel.slice(i + 1), anzahl, art: 'genau' };
    });

    // Gruppen bilden — nur wo ein Stamm mehrere Namen zusammenfasst.
    const gruppen = new Map();
    for (const g of genau) {
        const stamm = namensstamm(g.name);
        if (!stamm) continue;
        const schluessel = `${g.category}|${stamm}`;
        const vorhanden = gruppen.get(schluessel) ?? { category: g.category, name: stamm, anzahl: 0, art: 'gruppe', namen: [] };
        vorhanden.anzahl += g.anzahl;
        vorhanden.namen.push(g.name);
        gruppen.set(schluessel, vorhanden);
    }

    const echteGruppen = [...gruppen.values()].filter(g => g.namen.length >= 2);
    const inGruppe = new Set(echteGruppen.flatMap(g => g.namen.map(n => `${g.category}|${n}`)));

    return [
        ...echteGruppen,
        // Einzelnamen, die schon eine Gruppe haben, verschwinden aus der Liste:
        // beides anzubieten hiesse, dieselbe Zuordnung zweimal treffen zu können.
        ...genau.filter(g => !inGruppe.has(`${g.category}|${g.name}`)),
    ].sort((a, b) => b.anzahl - a.anzahl);
}

/**
 * Wie viel des Modells ist zugeordnet?
 *
 * Ohne diese Zahl weiss niemand, wann er aufhören kann. Und sie sagt zugleich,
 * dass man NICHT alles zuordnen muss: zugeordnet werden will, was man
 * bearbeiten will — der Rest fällt auf die Geometrie zurück und wird trotzdem
 * angezeigt, gemessen und gezeichnet.
 */
export function abdeckung(elemente, regeln) {
    let mit = 0, ohne = 0;
    for (const el of elemente ?? []) {
        const ctx = { category: el.category, attributes: el.attributes ?? {}, psets: el.psets ?? {} };
        if (bauformAusRegel(regeln, ctx)) mit++; else ohne++;
    }
    return { mit, ohne, gesamt: mit + ohne };
}

/**
 * Aus einer Zuordnung eine Regel machen — das, was das Werkzeug schreibt.
 *
 * `art: 'gruppe'` wird zu `contains`: „alles, dessen Name ‚Haltung' enthält".
 * Das ist die Form, die eine Lieferung mit zwanzig statt achtzehn Haltungen
 * ohne Nacharbeit übersteht.
 */
export function regelAus({ category, name, bauform, art = 'genau' }) {
    const gruppe = art === 'gruppe';
    return {
        id: `bf-${category}-${name}-${art}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        enabled: true,
        // Gruppen etwas SCHWÄCHER als exakte Zuordnungen: wer „Haltung" als
        // Gruppe setzt und „Haltung 7" einzeln anders, meint die Ausnahme.
        priority: gruppe ? 55 : 60,
        name: `${gruppe ? '„' + name + '…"' : '„' + name + '"'} (${category}) ist ${bauform}`,
        condition: { category, propertyName: 'Name',
                     operator: gruppe ? 'contains' : 'equals', value: name },
        bauform,
    };
}
