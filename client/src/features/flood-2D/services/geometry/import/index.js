// Ein Einstieg für den Button "Entwässerungsnetz importieren".
// Import dieses Moduls registriert alle Format-Adapter (Seiteneffekt) und re-exportiert
// die Import-API. Neue Formate (z. B. weitere) einfach hier als Adapter-Import ergänzen.

import './isybauImporter.js';   // ISYBAU-XML
import './ifcImporter.js';      // IFC (G4, Platzhalter)

export { importDrainageNetwork, hasNetworkImporter, registerNetworkImporter } from './importDrainageNetwork.js';
export { detectFormat } from './detectFormat.js';
