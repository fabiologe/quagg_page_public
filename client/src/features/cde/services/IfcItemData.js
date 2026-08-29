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

import * as OBC from '@thatopen/components';

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
        globalId:       scalar(item['GlobalId'])       ?? '',
        description:    scalar(item['Description'])    ?? '',
        predefinedType: scalar(item['PredefinedType']) ?? '',
        attrs, typeName, psets, quantities, materials,
    };
}

export async function buildSearchIndex(components) {
    const ifcLoader = components.get(OBC.IfcLoader);
    const fragments = components.get(OBC.FragmentsManager);
    const webIfc    = ifcLoader?.webIfc;
    if (!webIfc) return [];

    const entries = [];
    // IFCPRODUCT-rooted categories that should be queryable
    const QUERY_TYPES = [
        'IFCWALL','IFCWALLSTANDARDCASE','IFCSLAB','IFCCOLUMN','IFCBEAM',
        'IFCDOOR','IFCWINDOW','IFCROOF','IFCFOOTING','IFCSTAIR','IFCSTAIRFLIGHT',
        'IFCPLATE','IFCMEMBER','IFCSPACE','IFCBUILDINGSTOREY','IFCBUILDING','IFCSITE',
        'IFCPIPESEGMENT','IFCPIPEFITTING','IFCDUCT','IFCDUCTFITTING',
        'IFCFLOWSEGMENT','IFCFLOWFITTING','IFCFLOWTERMINAL','IFCAIRTERMINAL',
        'IFCPUMP','IFCVALVE','IFCFURNITURE','IFCBUILDINGELEMENTPROXY',
        'IFCRAILING','IFCCURTAINWALL',
    ];

    for (const model of fragments.list.values()) {
        const modelId = model.modelId;
        const wid = 0; // web-ifc model id
        for (const typeName of QUERY_TYPES) {
            const typeConst = webIfc[typeName];
            if (!typeConst) continue;
            let ids;
            try { ids = webIfc.GetLineIDsWithType(wid, typeConst); } catch { continue; }
            for (const localId of ids) {
                let p;
                try { p = webIfc.GetLine(wid, localId, false); } catch { continue; }
                if (!p) continue;
                entries.push({
                    name:     p.Name?.value ?? '',
                    globalId: p.GlobalId?.value ?? '',
                    category: typeName,
                    localId,
                    modelId,
                });
            }
        }
    }
    return entries;
}
