#!/usr/bin/env node
/**
 * Die GEGENPROBE zum Verbundexport — gelesen von einem ZWEITEN Motor.
 *
 * WARUM DAS DER WICHTIGSTE TEST IST: der Verbund wird von ifcopenshell
 * geschrieben und von ifcopenshell geprueft. Beide sind dieselbe Bibliothek.
 * Eine Annahme, die sie teilt — ein Attribut, das sie grosszuegig auslegt, eine
 * Kette, die sie beim Schreiben genauso versteht wie beim Lesen — faellt dabei
 * NIE auf. Die Datei waere in sich stimmig und fuer jedes andere Werkzeug
 * kaputt, und genau das merkt niemand, bis sie beim Partner landet.
 *
 * web-ifc ist der zweite Motor: eine andere Sprache, ein anderer Parser, eine
 * andere Mannschaft. Und es ist derselbe, mit dem die CDE im Browser liest —
 * ein Verbund, den web-ifc nicht oeffnet, ist fuer die eigene Ansicht wertlos.
 *
 * Geprueft wird, was der Bericht BEHAUPTET, nicht was schoen aussieht:
 * Schema, Entitaetenzahl, Produktzahl. Weichen sie ab, ist eine der beiden
 * Seiten falsch — welche, sagt der Unterschied.
 *
 * Aufruf:
 *   node scripts/verbund_webifc.mjs <verbund.ifc> [bericht.json]
 * Exit 0 = einig, 1 = uneinig oder nicht lesbar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as WebIFC from 'web-ifc';

const HIER = path.dirname(fileURLToPath(import.meta.url));
// `SetWasmPath` sucht sonst relativ zum PAKET und findet die .wasm nicht —
// deshalb absoluter Pfad und das zweite Argument. Dieselbe Falle wie in
// IfcQuelle.oeffne({ wasmPfad, absolut: true }).
const WASM = path.join(HIER, '..', 'node_modules', 'web-ifc') + path.sep;

const [datei, berichtPfad] = process.argv.slice(2);
if (!datei) {
    console.error('Aufruf: node scripts/verbund_webifc.mjs <verbund.ifc> [bericht.json]');
    process.exit(2);
}

const api = new WebIFC.IfcAPI();
api.SetWasmPath(WASM, true);
await api.Init();

const bytes = new Uint8Array(fs.readFileSync(datei));
let modelID;
try {
    modelID = api.OpenModel(bytes);
} catch (fehler) {
    console.error(`web-ifc kann die Datei nicht oeffnen: ${fehler?.message ?? fehler}`);
    process.exit(1);
}

const schema = api.GetModelSchema(modelID);
const alle = api.GetAllLines(modelID);
const entitaeten = alle.size();

/** Produkte samt Untertypen — dieselbe Menge, die ifcopenshell `IfcProduct` nennt. */
const produkte = api.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCT, true).size();
const projekte = api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT, true).size();
const sites = api.GetLineIDsWithType(modelID, WebIFC.IFCSITE, true).size();
const gruppen = api.GetLineIDsWithType(modelID, WebIFC.IFCGROUP, true).size();
const kontexte = api.GetLineIDsWithType(modelID, WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT, true).size();

console.log(`web-ifc liest ${path.basename(datei)}`);
console.log(`  Schema        ${schema}`);
console.log(`  Entitaeten    ${entitaeten}`);
console.log(`  IfcProduct    ${produkte}`);
console.log(`  IfcProject    ${projekte}`);
console.log(`  IfcSite       ${sites}`);
console.log(`  IfcGroup      ${gruppen}`);
console.log(`  Kontexte      ${kontexte}`);

const befunde = [];
// Ein zweites Projekt ist schemawidrig, und web-ifc merkt es unabhaengig.
if (projekte !== 1) befunde.push(`IfcProject muss genau 1 sein, ist ${projekte}`);

if (berichtPfad && fs.existsSync(berichtPfad)) {
    const bericht = JSON.parse(fs.readFileSync(berichtPfad, 'utf8'));
    const vergleiche = (name, meins, seins) => {
        if (seins === undefined || seins === null) return;
        if (meins !== seins) befunde.push(`${name}: web-ifc ${meins}, ifcopenshell ${seins}`);
    };
    vergleiche('Schema', schema, bericht.schema);
    vergleiche('Entitaeten', entitaeten, bericht.entitaeten);
    vergleiche('IfcProduct', produkte, bericht.produkte);
    vergleiche('IfcSite', sites, bericht.raumwurzeln);
    vergleiche('Kontexte', kontexte, bericht.kontexte);
}

api.CloseModel(modelID);

if (befunde.length) {
    console.error('\nUNEINIG:');
    for (const b of befunde) console.error(`  - ${b}`);
    process.exit(1);
}
console.log('\nEINIG — beide Motoren sehen dieselbe Datei.');
