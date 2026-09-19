/**
 * Merkmalsdaten und Suchindex — der zustandslose Teil der Engine.
 *
 * Erster Schnitt der Entflechtung (Sprint I, Stufe 5) und bewusst der
 * risikoloseste: `parseItemData` fasste als Methode kein einziges `this._…`
 * an — sie nimmt ein einfaches Objekt und gibt eines zurück. `buildSearchIndex`
 * braucht nur die Komponenten-Registry.
 *
 * Der Gewinn ist nicht die kleinere Engine, sondern die Prüfbarkeit: beides
 * lässt sich jetzt ohne WebGL testen. Vorher konnte es das nicht — kein
 * einziger Test importiert `IfcEngine`.
 *
 * `IfcEngine` behält 1:1-Delegationen, damit Aufrufer unberührt bleiben
 * (Hausvertrag, siehe IfcCamera.js).
 */
import { globalIdAusDaten } from './IfcDataConfig.js';

/** Welche Beziehungen `fragments.getData` mitliefern soll. */
export const DATA_CONFIG = {
    attributesDefault: true,
    relationsDefault: { attributes: false, relations: false },
    relations: {
        IsDefinedBy:     { attributes: true, relations: true  },
        IsTypedBy:       { attributes: true, relations: false },
        HasAssociations: { attributes: true, relations: false },
    },
};

export function parseItemData(rawData) {
    const modelEntries = Object.values(rawData);
    if (!modelEntries.length || !modelEntries[0].length) return null;
    const item = modelEntries[0][0];

    const scalar = (v) => {
        if (v == null) return null;
        if (typeof v === 'object' && 'value' in v) return v.value;
        if (typeof v === 'object') return null;
        return v;
    };

    const RESERVED = new Set([
        '_category', 'GlobalId', 'Name', 'Description',
        'IsDefinedBy', 'IsTypedBy', 'HasAssociations', 'OwnerHistory',
    ]);

    const attrs = [];
    for (const [key, val] of Object.entries(item)) {
        if (RESERVED.has(key)) continue;
        const s = scalar(val);
        if (s != null && s !== '') attrs.push({ name: key, value: String(s) });
    }

    const psets = [], quantities = [];
    for (const rel of (item['IsDefinedBy'] ?? [])) {
        const relName = rel['Name']?.value ?? rel['Name'] ?? '';
        if (Array.isArray(rel['HasProperties'])) {
            const props = rel['HasProperties'].map(p => ({
                name:  p['Name']?.value ?? p['Name'] ?? '',
                value: p['NominalValue']?.value ?? p['Value']?.value ?? '',
            })).filter(p => p.name);
            if (props.length || relName) psets.push({ name: String(relName), props });
        } else if (Array.isArray(rel['HasQuantities'])) {
            const props = rel['HasQuantities'].map(q => ({
                name:  q['Name']?.value ?? q['Name'] ?? '',
                value: q['LengthValue']?.value ?? q['AreaValue']?.value
                    ?? q['VolumeValue']?.value ?? q['CountValue']?.value
                    ?? q['WeightValue']?.value ?? q['Value']?.value ?? '',
            })).filter(p => p.name);
            quantities.push({ name: String(relName), props });
        }
    }

    let typeName = null;
    const typeRels = item['IsTypedBy'];
    if (Array.isArray(typeRels) && typeRels.length) {
        typeName = typeRels[0]['Name']?.value ?? typeRels[0]['Name'] ?? null;
    }

    const materials = [];
    for (const assoc of (item['HasAssociations'] ?? [])) {
        const mat = assoc['RelatingMaterial'];
        if (mat) {
            const n = mat['Name']?.value ?? mat['Name'] ?? null;
            if (n) materials.push(String(n));
        }
    }

    return {
        type:           (scalar(item['_category']) ?? '').toUpperCase(),
        name:           scalar(item['Name'])           ?? '',
        globalId:       globalIdAusDaten(item),
        description:    scalar(item['Description'])    ?? '',
        predefinedType: scalar(item['PredefinedType']) ?? '',
        attrs, typeName, psets, quantities, materials,
    };
}

/**
 * HIER STAND `buildSearchIndex` (entfernt 2026-09-03).
 *
 * Es lieferte in Produktion IMMER eine leere Liste — aus zwei voneinander
 * unabhängigen Gründen, von denen jeder allein gereicht hätte:
 *
 *  1. `webIfc[typeName]`: die Typkonstanten sind MODUL-Exporte von `web-ifc`,
 *     keine Eigenschaften der `IfcAPI`-Instanz. `webIfc['IFCWALL']` ist immer
 *     `undefined`, die Schleife übersprang jede Kategorie. Derselbe Fehler,
 *     den `WebIfcTypen.js` beschreibt — hier war er der vierte seiner Art.
 *  2. `ifcLoader.webIfc` hat nie ein Modell offen (Kapitel 13.1): nur
 *     `readIfcFile()` öffnet eines, und die CDE ruft das nirgends.
 *
 * Folgen, still und in Produktion: das Panel „Bauformen zuordnen" meldete
 * „kein Modell geladen", und die Elementsuche in der Befehlspalette fand
 * nichts. Dazu die dritte Schwäche, die auch ein reparierter Aufruf behalten
 * hätte: eine fest verdrahtete Liste von 30 Kategorien, in der weder
 * `IFCCIVILELEMENT` noch die Erdbau-Typen standen.
 *
 * Ersatz ist `IfcEngine.buildSearchIndex()` über `IfcQuelle` — ein eigener,
 * lebendiger Handle auf denselben Dateibytes, und statt einer Typliste alle
 * `IfcProduct`-Nachfahren über das 4.3-Wörterbuch.
 */
