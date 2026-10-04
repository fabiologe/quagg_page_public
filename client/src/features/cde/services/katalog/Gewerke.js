/**
 * DIE GEWERKE (Teil XXIX, G1 — Konzept docs/cde/konzept-teil-xxix-struktur-gewerke-2026-10-04.md § 3).
 *
 * Ein Gewerk ist das FACHSYSTEM, zu dem ein Bauteil gehört — eine Facette neben Form, Bauteilart (Klasse),
 * Bauwerk und Etiketten, kein Ast eines Baums: die Brücke hat Teile in fünf Gewerken, der Teich in sieben.
 * Zehn Gewerke nach einer Abdeckungsprüfung gegen acht Bezugslisten (STLK, STLB, HOAI, BIM-Klassen
 * Verkehrswege, IfcBuiltSystem, IfcDistributionSystem, Uniclass EF, Objekte der Szenarien): 209 Einträge,
 * ohne Platz nur die Bahn (`docs/cde/daten/gewerke_abdeckung_2026-10-04.py`). Wörter aus STLK/STLB.
 *
 * Woher ein Bauteil sein Gewerk hat, sagt `gewerkVon` (Bauteilrezepte.js) — eine Regelkette:
 * ausdrücklich am Bauplan → Rezept, wenn die Klasse die des Rezepts ist → Klassenregel (unten) →
 * Rezept → keines. Hier stehen nur DATEN: der Katalog und die Regeln nach Klasse.
 *
 * Rein: kein Store, keine Engine.
 */
import { istUnter } from '../Kategorien.js';

/**
 * `system` (Teil XXIX, G6 — E42): das IFC-System, zu dem die Bauteile dieses Gewerks je Bauwerk zusammengefasst werden
 * — Klasse, Ausführung (gegen die Aufzählung des gepinnten Schemas, IFC4X3_ADD2) und Objekttyp bei USERDEFINED. Wo
 * keine Ausführung das Gewerk trifft, USERDEFINED mit Objekttyp statt einer, die mehr behauptet (TRANSPORT ist kein
 * Strassenbau, LOADBEARING schreibt schon das Tragwerk aus dem Merkmal). Erdbau bleibt Fachmodell-Gruppe (Vorgänge),
 * Vermessung hat kein System.
 */
const sys = (klasse, typ, objektTyp = null) => Object.freeze({ klasse, typ, ...(objektTyp ? { objektTyp } : {}) });
const g = (titel, beschreibung, stlk, ifc, system = null) => Object.freeze({ titel, beschreibung, stlk: Object.freeze(stlk), ifc, system });

/** Die zehn Gewerke — Reihenfolge = Reihenfolge der Reiter. */
export const GEWERKE = Object.freeze({
    erdbau: g('Gelände & Erdbau', 'Aushub, Auftrag, Planum, Böschung, Gräben, Baugruben', ['STLK 106', 'STLK 108', 'STLB 002'],
              'Fachmodell Erdbau (Gruppe)'),
    entwaesserung: g('Entwässerung', 'Kanal, Schächte, Becken, Versickerung, Drossel, Rechen, Straßenentwässerung',
                     ['STLK 110', 'STLK 111', 'STLB 009', 'STLB 010', 'STLB 011'], 'IfcDistributionSystem SEWAGE / STORMWATER / DRAINAGE',
                     sys('IfcDistributionSystem', 'DRAINAGE')),
    wasserbau: g('Wasserbau', 'Gewässer, Ufer- und Sohlsicherung, Ein- und Auslauf, Notüberlauf, Durchlass, Deich, Abdichtung',
                 ['HOAI § 41 Gr. 3'], 'IfcBuiltSystem EROSIONPREVENTION', sys('IfcBuiltSystem', 'EROSIONPREVENTION')),
    konstruktiv: g('Konstruktiver Ingenieurbau', 'Wände, Platten, Fundamente, Gründung, Tragwerk, Tunnel, Brückenteile',
                   ['STLK 117–125', 'STLB 006', 'STLB 013'], 'IfcBuiltSystem LOADBEARING / FOUNDATION',
                   sys('IfcBuiltSystem', 'USERDEFINED', 'Konstruktiver Ingenieurbau')),
    verkehr: g('Verkehrsfläche', 'Fahrbahn, Wege, Plätze, Einfassung, Markierung', ['STLK 112–115', 'STLK 131', 'STLB 080'],
               'IfcRoadPart + IfcCourse / IfcPavement / IfcKerb', sys('IfcBuiltSystem', 'USERDEFINED', 'Verkehrsfläche')),
    ausstattung: g('Ausstattung & Verkehrstechnik', 'Schutzeinrichtung, Geländer, Zaun, Tor, Schild, Lärmschutz, Lichtsignal',
                   ['STLK 127–130', 'STLK 132'], 'Elemente im Bauwerksteil', sys('IfcBuiltSystem', 'USERDEFINED', 'Ausstattung')),
    leitungen: g('Leitungen', 'Trinkwasser, Gas, Fernwärme, Strom, Telekom — Leitungen Dritter', ['STLK 134', 'STLB 043'],
                 'IfcDistributionSystem WATERSUPPLY / GAS / ELECTRICAL / COMMUNICATION',
                 sys('IfcDistributionSystem', 'USERDEFINED', 'Leitungen Dritter')),
    ta: g('Technische Ausrüstung', 'Pumpen, Armaturen, Mess- und Steuertechnik, Beleuchtung', ['HOAI § 53'],
          'IfcDistributionSystem CONTROL / LIGHTING / MONITORINGSYSTEM', sys('IfcDistributionSystem', 'USERDEFINED', 'Technische Ausrüstung')),
    landschaft: g('Landschaft', 'Bepflanzung, Rasen, Oberboden', ['STLK 104', 'STLK 107'], 'IfcGeographicElement VEGETATION',
                  sys('IfcBuiltSystem', 'USERDEFINED', 'Landschaft')),
    vermessung: g('Vermessung & Baugrund', 'Linien, Flächen, Bruchkanten, Gelände, Bohrungen, Bodenschichten', ['STLK 103'],
                  'IfcGeographicElement TERRAIN, IfcGeotechnicalElement'),
});

export const istGewerk = (id) => Object.prototype.hasOwnProperty.call(GEWERKE, String(id ?? ''));

/**
 * DIE KLASSENREGELN — Wurzel im IFC-Baum (+ Ausführung, wenn sie entscheidet) → Gewerk. Die erste Regel,
 * die passt, gilt: spezifisch vor allgemein (IfcCourse/PAVEMENT vor IfcCourse, IfcCourse vor IfcBuiltElement).
 * Fachliche Entscheidungen, keine Schemafakten — eine Wurzel deckt jeden Untertyp (`Kategorien.istUnter`).
 */
export const KLASSENREGELN = Object.freeze([
    ['IFCEARTHWORKSCUT', null, 'erdbau'],
    ['IFCEARTHWORKSFILL', null, 'erdbau'],
    ['IFCCOURSE', 'PAVEMENT', 'verkehr'],
    ['IFCCOURSE', null, 'wasserbau'],                // ARMOUR, CORE, FILTER, PROTECTION — Schichten am Wasser
    ['IFCPAVEMENT', null, 'verkehr'],
    ['IFCKERB', null, 'verkehr'],
    ['IFCGEOGRAPHICELEMENT', 'VEGETATION', 'landschaft'],
    ['IFCGEOGRAPHICELEMENT', null, 'vermessung'],
    ['IFCGEOTECHNICALELEMENT', null, 'vermessung'],
    ['IFCRAILING', null, 'ausstattung'],
    ['IFCSIGN', null, 'ausstattung'],
    ['IFCDOOR', 'GATE', 'ausstattung'],
    ['IFCSENSOR', null, 'ta'],
    ['IFCFLOWMOVINGDEVICE', null, 'ta'],
    ['IFCDISTRIBUTIONCHAMBERELEMENT', null, 'entwaesserung'],
    ['IFCPIPESEGMENT', null, 'entwaesserung'],
    ['IFCFLOWTREATMENTDEVICE', null, 'entwaesserung'],
    ['IFCVALVE', null, 'entwaesserung'],
    ['IFCSPACE', null, 'entwaesserung'],             // ein Raum der CDE ist ein Speicherraum
    ['IFCBUILTELEMENT', null, 'konstruktiv'],
]);

/** Das Gewerk nach Klasse und Ausführung — oder null, wenn keine Regel passt. */
export function gewerkNachKlasse(kategorie, predefinedType = null) {
    const pt = predefinedType ? String(predefinedType).toUpperCase() : null;
    for (const [wurzel, nurPt, gewerk] of KLASSENREGELN) {
        if (nurPt && nurPt !== pt) continue;
        if (istUnter(kategorie, [wurzel])) return gewerk;
    }
    return null;
}
