// Format-agnostischer Entwässerungsnetz-Import (ein Button, mehrere Formate).
//
// Registry-Muster: jeder Format-Adapter (ISYBAU-XML jetzt, IFC später) registriert sich
// über registerNetworkImporter(format, parseFn). Alle liefern DIESELBE Zwischenform
// { nodes, edges, warnings }, die hier zu einem NetworkModel wird. So ist G4 (IFC) nur
// EINE zusätzliche Registrierung — ohne den Import-Pfad/Button anzufassen.

import { detectFormat } from './detectFormat.js';
import { fromSewerNodesEdges } from '../adapters.js';

const parsers = new Map();   // format → (content) => { nodes, edges, warnings }

/** Registriert einen Format-Parser. Adapter-Dateien rufen das beim Import ihres Moduls. */
export function registerNetworkImporter(format, parseFn) {
    parsers.set(format, parseFn);
}

/** true, wenn für das Format ein Parser registriert ist. */
export function hasNetworkImporter(format) { return parsers.has(format); }

/** Maps ODER Arrays → Array (die ISYBAU-Parser liefern teils Maps). */
const toArray = (v) => (v instanceof Map ? [...v.values()] : Array.isArray(v) ? v : []);

/**
 * Importiert ein Entwässerungsnetz aus beliebigem unterstütztem Format.
 * @param {{name?:string, content:string, format?:string}} input
 * @returns {{ model, format, warnings, ok }}
 */
export function importDrainageNetwork({ name = '', content, format } = {}) {
    const fmt = format || detectFormat(name, content);
    const parser = parsers.get(fmt);
    if (!parser) {
        return { model: null, format: fmt, ok: false,
                 warnings: [`Format "${fmt}" wird (noch) nicht unterstützt — kein Importer registriert.`] };
    }
    let parsed;
    try { parsed = parser(content) || {}; }
    catch (e) { return { model: null, format: fmt, ok: false, warnings: [`Import fehlgeschlagen: ${e.message}`] }; }

    const nodes = toArray(parsed.nodes);
    const edges = toArray(parsed.edges);
    const model = fromSewerNodesEdges(nodes, edges);
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
    if (nodes.length === 0) warnings.push('Import: keine Knoten erkannt — Datei leer oder unbekanntes Schema?');
    return { model, format: fmt, ok: true, warnings };
}
