/**
 * Der Retentionsteich (Teil XXIX, Konzept § 11.1) als Kommandos von HEUTE — je Element das passendste
 * allgemeine Rezept mit überschriebener Klasse. Gebraucht von `strukturG0.test.js` und `gewerke.test.js`.
 * Je Eintrag: [Nummer im Katalog, Name, [Klasse, Ausführung|null, Objekttyp?], Kommando, Gewerk laut Katalog].
 */
import { e, k } from './kammerKommandos.js';

/** Eine geneigte Fläche 1 : 3 (Böschung) — vier Ecken, Höhe in m NN. */
const BOESCHUNG = [e(0, 0, 100), e(6, 0, 100), e(6, -3, 99), e(0, -3, 99)];
const EBEN = (h) => [e(0, 0, h), e(4, 0, h), e(4, -2, h), e(0, -2, h)];
const LINIE = (h) => [e(0, 0, h), e(5, 0, h)];
const PUNKT = (h) => [e(1, -1, h)];
const platte = (kategorie, predefinedType, objektTyp = '', umriss = BOESCHUNG, dicke = 0.3) =>
    k('platte-zeichnen', { neu: ['cde-X'], eingaben: { umriss }, werte: { name: 'X', kategorie, hoehe: '', dicke, predefinedType, objektTyp } });
export const wand = (kategorie, predefinedType, objektTyp = '') =>
    k('wand-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(100) }, werte: { name: 'X', kategorie, hoehe: '', dicke: 0.05, wandhoehe: 1.2, predefinedType, objektTyp } });
const stab = (kategorie) =>
    k('pfosten-zeichnen', { neu: ['cde-X'], eingaben: { zug: PUNKT(100) }, werte: { name: 'X', kategorie, hoehe: '', laenge: 1.5, breite: 0.2, tiefe: 0.2 } });
const traeger = (kategorie, predefinedType) =>
    k('streifenfundament-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(100.3) }, werte: { name: 'X', kategorie, hoehe: '', breite: 0.2, dicke: 0.3, predefinedType } });

/** Der Teich, § 11.1 — ohne die Erdbau-Elemente. `soll`: Klasse, Ausführung (null = egal), Objekttyp. */
export const TEICH = [
    [5, 'Tondichtung', ['IFCCOURSE', 'CORE'], platte('IFCCOURSE', 'CORE'), 'wasserbau'],
    [6, 'Schutzvlies', ['IFCCOURSE', 'FILTER'], platte('IFCCOURSE', 'FILTER', '', BOESCHUNG, 0.005), 'wasserbau'],
    [7, 'Dichtungsschutzschicht', ['IFCCOURSE', 'PROTECTION'], platte('IFCCOURSE', 'PROTECTION'), 'wasserbau'],
    [8, 'Oberboden auf der Böschung', ['IFCEARTHWORKSFILL', 'USERDEFINED', 'Oberbodenandeckung'], platte('IFCEARTHWORKSFILL', 'USERDEFINED', 'Oberbodenandeckung'), 'landschaft'],
    [9, 'Steinschüttung', ['IFCCOURSE', 'ARMOUR'], platte('IFCCOURSE', 'ARMOUR'), 'wasserbau'],
    [10, 'Schilf', ['IFCGEOGRAPHICELEMENT', 'VEGETATION'], platte('IFCGEOGRAPHICELEMENT', 'VEGETATION', '', EBEN(99.2), 0.4), 'landschaft'],
    [11, 'Rasenansaat', ['IFCGEOGRAPHICELEMENT', 'VEGETATION'], platte('IFCGEOGRAPHICELEMENT', 'VEGETATION', '', BOESCHUNG, 0.05), 'landschaft'],
    [12, 'Dauerstau', ['IFCSPACE', 'EXTERNAL'], k('raum-zeichnen', { neu: ['cde-X'], eingaben: { umriss: EBEN(98) }, werte: { name: 'Dauerstau', hoehe: '', raumhoehe: 1, predefinedType: 'EXTERNAL' } }), 'entwaesserung'],
    [13, 'Rückhalteraum', ['IFCSPACE', 'EXTERNAL'], k('raum-zeichnen', { neu: ['cde-X'], eingaben: { umriss: EBEN(99) }, werte: { name: 'Rückhalteraum', hoehe: '', raumhoehe: 1, predefinedType: 'EXTERNAL' } }), 'entwaesserung'],
    [14, 'Zulaufhaltung DN 600', ['IFCPIPESEGMENT', null], k('rohr-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(98.5) }, werte: { name: 'Zulauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 600 } }), 'entwaesserung'],
    [15, 'Einlaufbauwerk (Stirnwand)', ['IFCWALL', null], wand('IFCWALL', 'RETAININGWALL'), 'wasserbau'],
    [16, 'Kolkschutz', ['IFCCOURSE', 'ARMOUR'], platte('IFCCOURSE', 'ARMOUR', '', EBEN(98), 0.4), 'wasserbau'],
    [17, 'Grobrechen', ['IFCFILTER', 'STRAINER'], k('rechen-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(98) }, werte: { name: 'Rechen', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.2 } }), 'entwaesserung'],
    [18, 'Drosselschacht', ['IFCDISTRIBUTIONCHAMBERELEMENT', 'MANHOLE'], k('schacht-zeichnen', { neu: ['cde-X'], eingaben: { zug: [e(1, -1, 97.5), e(1, -1, 100)] }, werte: { name: 'Drosselschacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1500 } }), 'entwaesserung'],
    [19, 'Drossel', ['IFCVALVE', 'REGULATING'], k('drossel-zeichnen', { neu: ['cde-X'], eingaben: { zug: [e(0, 0, 97.5), e(1, 0, 97.5)] }, werte: { name: 'Drossel', kategorie: 'IFCVALVE', hoehe: '', dn: 200 } }), 'entwaesserung'],
    [20, 'Wehrschwelle', ['IFCWALL', 'USERDEFINED', 'Überlaufschwelle'], k('ueberlaufschwelle-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(99.5) }, werte: { name: 'Wehrschwelle', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5 } }), 'entwaesserung'],
    [21, 'Tauchwand', ['IFCWALL', 'USERDEFINED', 'Tauchwand'], k('tauchwand-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(98.8) }, werte: { name: 'Tauchwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1 } }), 'entwaesserung'],
    [22, 'Ablaufhaltung', ['IFCPIPESEGMENT', null], k('rohr-zeichnen', { neu: ['cde-X'], eingaben: { zug: LINIE(97.5) }, werte: { name: 'Ablauf', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 } }), 'entwaesserung'],
    [24, 'Befestigung der Dammscharte', ['IFCCOURSE', 'ARMOUR'], platte('IFCCOURSE', 'ARMOUR'), 'wasserbau'],
    [25, 'Pfahl', ['IFCPILE', 'DRIVEN'], stab('IFCPILE'), 'konstruktiv'],
    [26, 'Jochträger', ['IFCBEAM', 'JOIST'], traeger('IFCBEAM', 'JOIST'), 'konstruktiv'],
    [27, 'Stegbelag', ['IFCSLAB', 'FLOOR'], platte('IFCSLAB', 'FLOOR', '', EBEN(100.5), 0.05), 'konstruktiv'],
    [28, 'Geländer', ['IFCRAILING', 'HANDRAIL'], wand('IFCRAILING', 'HANDRAIL'), 'ausstattung'],
    [29, 'Weg zum Steg', ['IFCCOURSE', 'PAVEMENT'], platte('IFCCOURSE', 'PAVEMENT', '', EBEN(100), 0.15), 'verkehr'],
    [30, 'Wegeinfassung', ['IFCKERB', null], traeger('IFCKERB', 'NOTDEFINED'), 'verkehr'],
    [31, 'Zufahrt', ['IFCCOURSE', 'PAVEMENT'], platte('IFCCOURSE', 'PAVEMENT', '', EBEN(100), 0.3), 'verkehr'],
    [32, 'Zaun', ['IFCRAILING', 'FENCE'], wand('IFCRAILING', 'FENCE'), 'ausstattung'],
    [33, 'Tor', ['IFCDOOR', 'GATE'], wand('IFCDOOR', 'GATE'), 'ausstattung'],
    [34, 'Pegellatte', ['IFCSENSOR', 'LEVELSENSOR'], stab('IFCSENSOR'), 'ta'],
    [35, 'Warnschild', ['IFCSIGN', 'PICTORAL'], stab('IFCSIGN'), 'ausstattung'],
];

