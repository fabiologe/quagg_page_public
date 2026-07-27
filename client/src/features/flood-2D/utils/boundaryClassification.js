/**
 * boundaryClassification.js — Zulauf/Ablauf-Rolle eines Boundary-Objekts für die reine
 * UI-Anzeige (ScenarioManager.vue-BOUNDARIES-Tab, ObjectTable.vue-Icon/Farbe).
 *
 * Bevorzugt die echte, im Panel konfigurierte Rolle (hydStore.assignments[id].type) — die
 * ist maßgeblich für den Export. Fällt für noch unkonfigurierte Objekte auf die beim
 * Zeichnen gesetzte Absicht zurück (properties.boundary_type aus useBoundaryTool.js), da
 * ein frisch gezeichnetes, noch nicht zugewiesenes Objekt sonst unklassifiziert wäre.
 *
 * Keine Vue-Abhängigkeit — reine Funktion, node-testbar.
 */
export function classifyBoundaryDirection(properties, assignment) {
    switch (assignment?.type) {
        case 'INFLOW_CONSTANT':
        case 'INFLOW_DYNAMIC':
            return 'INFLOW';
        case 'OUTFLOW_FREE':
        case 'WATERLEVEL_FIX':
            return 'OUTFLOW';
        default:
            break;
    }
    if (properties?.boundary_type === 'INFLOW' || properties?.boundary_type === 'OUTFLOW') {
        return properties.boundary_type;
    }
    return null;
}
