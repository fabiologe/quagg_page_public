/**
 * Löst die tatsächliche Flächengröße (ha) eines SWMM-Subcatchment-ERGEBNISSES
 * aus der zugehörigen Eingabe-Fläche auf. Nötig, weil die Ergebnis-Objekte
 * selbst (SWMM .rpt "Subcatchment Runoff Summary", siehe RptParser.js) KEIN
 * size-Feld führen — nur core/domain/Area.js hat das. Ergebnis-IDs sind
 * zusätzlich oft Splits (Suffix "_2") oder tragen ein ISYBAU-".1"-Suffix, das
 * die reine Eingabe-Area (Objektbezeichnung) nicht hat.
 *
 * Referenz-Implementierung: ResultsAreasTab.vue sortedSubcatchments() (dort
 * inline, da sie zusätzlich Slope/Imperv/Width für die UI-Tabelle braucht) —
 * hier bewusst als eigenständige, wiederverwendbare Funktion extrahiert, da
 * SimulationReportExport.vue (PDF-Bericht) NUR die Größe braucht.
 *
 * @param {string} id - Subcatchment-ID aus dem Ergebnis-Datensatz
 * @param {Map|Array} areas - store.areaArray / props.areas (core/domain/Area.js-Instanzen)
 * @returns {number} Fläche in ha, 0 wenn keine passende Eingabe-Fläche gefunden wurde
 */
export function resolveSubcatchmentSize(id, areas) {
    const findParent = (baseId) => {
        if (areas instanceof Map) return areas.get(baseId);
        if (Array.isArray(areas)) return areas.find(a => a.id === baseId);
        return null;
    };

    let baseId = id;
    const isPart2 = id.endsWith('_2');
    if (isPart2) baseId = baseId.replace(/_2$/, '');

    let parentArea = findParent(baseId);
    if (!parentArea && baseId.endsWith('.1')) {
        parentArea = findParent(baseId.substring(0, baseId.length - 2));
    }
    if (!parentArea) return 0;

    const totalSize = parentArea.size || 0;
    let ratio = 1.0;
    if (parentArea.nodeId2) {
        const userRatio = (parentArea.splitRatio !== undefined) ? parseFloat(parentArea.splitRatio) : 50;
        ratio = userRatio / 100.0;
    }
    return isPart2 ? totalSize * (1 - ratio) : totalSize * ratio;
}
