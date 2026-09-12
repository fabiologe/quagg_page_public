/**
 * Fachliche Kategorien — an der richtigen HÖHE im IFC-Baum, nicht als Aufzählung.
 *
 * WARUM (2026-09-11): „was ist linear" stand zweimal wortgleich im Code
 * (KgClassifier, GeometryResolver), jedes Mal als Liste mit exaktem
 * Namensvergleich — samt `IFCDUCT`, einer Klasse, die kein Schema kennt, und
 * ohne `IFCCONVEYORSEGMENT` oder die StandardCase-Fassungen. Eine Liste deckt,
 * was jemand beim Schreiben im Kopf hatte; eine Wurzel im Baum deckt jeden
 * Untertyp, auch künftige.
 *
 * Die Frage „liegt X unter Y" beantwortet EINE Stelle: `vererbungskette`
 * (Typprofile.js, aus dem erzeugten Wörterbuch). Hier stehen nur die Wurzeln —
 * fachliche Entscheidungen, keine Schemafakten.
 *
 * Darstellungstabellen (Linienstile, Farben, Ebenen-Icons) bleiben Tabellen
 * mit exakten Schlüsseln: dort IST die einzelne Klasse gemeint.
 * `test/kategorienWaechter.test.js` hält fest, dass keine der alten Listen
 * zurückkommt und dass jeder IFC-Name im Code eine Klasse ist.
 */
import { vererbungskette } from './bauform/Typprofile.js';

/** Achsförmige Bauteile: eine Länge je Stück ist sinnvoll, die Achse lässt sich ableiten. */
export const LINEARE_WURZELN = Object.freeze(['IFCFLOWSEGMENT', 'IFCBEAM', 'IFCMEMBER', 'IFCKERB']);

/** Schächte, wie der Längsschnitt sie als Balken zeichnet. */
export const SCHACHT_WURZELN = Object.freeze(['IFCDISTRIBUTIONCHAMBERELEMENT']);

/**
 * Aushub im Sinne des Erdbau-Dokuments: sein Wirt ist das Ur-Gelände.
 * Spiegel: backend/app/ifc/kategorien.py (`AUSHUB_WURZELN`) — test_kategorien.py
 * hält beide gleich.
 */
export const AUSHUB_WURZELN = Object.freeze(['IFCEARTHWORKSCUT']);

const _ketten = new Map();

/** Liegt die Kategorie (oder ihr Altname) unter einer dieser Wurzeln? Unbekannt heisst nein. */
export function istUnter(kategorie, wurzeln) {
    const k = String(kategorie ?? '').toUpperCase().trim();
    if (!k) return false;
    let kette = _ketten.get(k);
    if (!kette) {
        kette = vererbungskette(k);
        _ketten.set(k, kette);
    }
    return wurzeln.some(w => kette.includes(w));
}

export const istLinear = kategorie => istUnter(kategorie, LINEARE_WURZELN);
export const istSchacht = kategorie => istUnter(kategorie, SCHACHT_WURZELN);
export const istAushub = kategorie => istUnter(kategorie, AUSHUB_WURZELN);
