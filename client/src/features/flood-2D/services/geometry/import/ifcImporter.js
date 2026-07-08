// IFC-Adapter (G4) — Platzhalter. Registriert das Format bereits, damit derselbe Button
// "Entwässerungsnetz importieren" IFC annimmt, sobald der Reader steht. Ziel-Mapping:
// IFC4 IfcPipeSegment/IfcPipeFitting → Link, IfcDistributionChamberElement → Node.
// Round-Trip-Export später über isyifc/core/export/IfcWriter*.js.

import { registerNetworkImporter } from './importDrainageNetwork.js';

registerNetworkImporter('ifc', (/* content */) => {
    throw new Error('IFC-Import folgt (G4) — Reader noch nicht implementiert.');
});
