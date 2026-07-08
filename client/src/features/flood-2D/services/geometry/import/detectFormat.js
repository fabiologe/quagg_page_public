// Erkennt das Format einer Entwässerungsnetz-Datei, damit EIN Import-Button
// ("Entwässerungsnetz importieren") ISYBAU-XML UND (später) IFC entgegennimmt.

/**
 * @param {string} name     Dateiname (für die Endung)
 * @param {string} content  Datei-Inhalt (Anfang reicht)
 * @returns {'isybau-xml'|'ifc'|'unknown'}
 */
export function detectFormat(name = '', content = '') {
    const n = String(name).toLowerCase();
    if (n.endsWith('.ifc') || n.endsWith('.ifcxml')) return 'ifc';
    if (n.endsWith('.xml')) {
        // .xml kann ISYBAU oder ifcXML sein → in den Inhalt schauen.
        if (/\bIFC[0-9A-Z]*\b|ifcXML|<ifc:/i.test(String(content).slice(0, 4000))) return 'ifc';
        return 'isybau-xml';
    }
    const head = String(content).slice(0, 4000);
    if (/ISO-10303-21|FILE_SCHEMA|IFCPROJECT|\bIFC4\b|\bIFC2X3\b/i.test(head)) return 'ifc';
    if (/AbwassertechnischeAnlage|Stammdatenkollektiv|Identifikation|isybau/i.test(head)) return 'isybau-xml';
    return 'unknown';
}
