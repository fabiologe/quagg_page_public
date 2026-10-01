/**
 * DER RÜB AUS Z9.2 als Kommandofolge — gebraucht von der Abnahme (`abnahmeRueb.test.js`)
 * und vom Verbund mit dem Gelände (`abnahmeVerbund.test.js`). Ein Becken für beide.
 * Maße und Handrechnung: siehe Kopf von `abnahmeRueb.test.js`.
 */
import { KOMMANDO_SCHEMA } from '../../services/kommando/Kommando.js';

let n = 0;
export const kommando = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `rueb-${++n}`, werkzeug, ziel: [], wer: 'fabio',
                                        wann: '2026-10-01T12:00:00Z', ...rest });
const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const RECHTECK = (h) => [e(0, 0, h), e(8.9, 0, h), e(8.9, -3.6, h), e(0, -3.6, h)];
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5, predefinedType: 'RETAININGWALL' };
const wand = (gid, name, a, b, mehr = {}) => kommando('wand-zeichnen', {
    neu: [gid], werte: { name, ...WAND, ...mehr }, eingaben: { zug: [e(a[0], a[1], 210), e(b[0], b[1], 210)] } });
const raum = (gid, name, x0) => kommando('raum-zeichnen', {
    neu: [gid], werte: { name, hoehe: '', raumhoehe: 2.5, betriebswasser: 212.4 },
    eingaben: { umriss: [e(x0, -0.3, 210), e(x0 + 4, -0.3, 210), e(x0 + 4, -3.3, 210), e(x0, -3.3, 210)] } });

export const TEILE = ['cde-BP', 'cde-LN', 'cde-LS', 'cde-SW', 'cde-SO', 'cde-TW', 'cde-UE', 'cde-DE', 'cde-R1', 'cde-R2'];
export const RUEB = () => [
    kommando('platte-zeichnen', { neu: ['cde-BP'], eingaben: { umriss: RECHTECK(210) },
                                  werte: { name: 'Bodenplatte', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4, predefinedType: 'BASESLAB' } }),
    wand('cde-LN', 'Längswand Nord', [0, -0.15], [8.9, -0.15]),
    wand('cde-LS', 'Längswand Süd', [0, -3.45], [8.9, -3.45]),
    wand('cde-SW', 'Stirnwand West', [0.15, -0.3], [0.15, -3.3]),
    wand('cde-SO', 'Stirnwand Ost', [8.75, -0.3], [8.75, -3.3]),
    // Die Trennwand steht innen und trägt die Schwelle: nicht aussen.
    wand('cde-TW', 'Trennwand', [4.45, -0.3], [4.45, -3.3], { wandhoehe: 1.9, aussen: 'nein', predefinedType: 'SOLIDWALL' }),
    kommando('ueberlaufschwelle-zeichnen', { neu: ['cde-UE'], eingaben: { zug: [e(4.45, -0.3, 211.9), e(4.45, -3.3, 211.9)] },
        werte: { name: 'Beckenüberlauf', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5, ueberlaufart: 'Beckenüberlauf',
                 schwellenlaenge: 3, ueberfallbeiwert: 0.6, herleitung: 'Annahme der Abnahme, nicht bemessen' } }),
    kommando('platte-zeichnen', { neu: ['cde-DE'], eingaben: { umriss: RECHTECK(212.75) },
                                  werte: { name: 'Decke', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.25, predefinedType: 'ROOF' } }),
    raum('cde-R1', 'Kammer 1', 0.3),
    raum('cde-R2', 'Kammer 2', 4.6),
    kommando('bauwerk-anlegen', { neu: ['cde-RUEB'], werte: { name: 'RÜB', art: 'anlage', bauwerkstyp: 'RUEB' } }),
    ...TEILE.map(gid => kommando('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-RUEB' } } })),
];

