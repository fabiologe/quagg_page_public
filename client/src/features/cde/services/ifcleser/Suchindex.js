/**
 * Suchindex — aus der IfcEngine ausgelagert (Teil XXIII, A8; Befund B13).
 *
 * Der Suchindex über alle geladenen Modelle.
 *
 * Jede Funktion bekommt die Engine als ersten Parameter (`engine`) und liest
 * nur, was sie braucht; die Engine behält eine einzeilige Weiterleitung, damit
 * ihre Aufrufer (Viewer, Tests) unverändert bleiben.
 */


/**
 * Der Elementindex — Grundlage für die Elementsuche (Strg+K/Strg+F) und
 * für das Panel „Bauformen zuordnen".
 *
 * ÜBER `IfcQuelle`, nicht über `ifcLoader.webIfc`. Der alte Weg lieferte in
 * Produktion immer `[]` (siehe den Grabstein in IfcItemData.js) — das
 * Zuordnungs-Panel, also der Normalweg zum Erklären eines unbekannten
 * Exporteurs, war dadurch schlicht funktionslos.
 *
 * Und statt einer Liste von 30 verdrahteten Kategorien: alle Nachfahren
 * von `IfcProduct` über das 4.3-Wörterbuch. Genau darauf kam es an —
 * `IFCCIVILELEMENT` und die Erdbau-Typen standen in der alten Liste nicht,
 * also waren ausgerechnet die Bauteile unsichtbar, für die man die
 * Zuordnung braucht.
 *
 * Mitgelesen werden die Felder, auf die eine Bauformregel matchen kann:
 * ein `IfcEarthworksFill` ohne Namen ist über `PredefinedType` oder
 * `ObjectType` sehr wohl ansprechbar.
 */
export async function buildSearchIndex(engine) {
    const out = [];
    for (const [modelId, quelle] of engine._quellen ?? new Map()) {
        if (!quelle?.lebt()) continue;
        // Auch das PROJEKT (Abnahme 2026-09-12, A7): es ist kein IfcProduct,
        // und die Wurzel jeder Bauwerksstruktur hiess deshalb „Element".
        for (const localId of [...quelle.ids('IFCPRODUCT', { untertypen: true }), ...quelle.ids('IFCPROJECT')]) {
            const z = quelle.zeile(localId);
            if (!z) continue;
            out.push({
                name: z.Name?.value ?? '',
                globalId: z.GlobalId?.value ?? '',
                category: quelle.kategorieVon(z),
                predefinedType: z.PredefinedType?.value ?? '',
                objectType: z.ObjectType?.value ?? '',
                description: z.Description?.value ?? '',
                localId,
                modelId,
            });
        }
    }
    return out;
}
