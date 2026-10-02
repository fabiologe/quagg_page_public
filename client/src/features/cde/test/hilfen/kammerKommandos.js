/**
 * DIE KAMMER als Kommandofolge (Teil XXVI, Abschnitt 6) — aufgestellt (Teil XXVII, B5):
 * Wände und Raum auf der Bodenplatte, die Decke auf der Längswand Nord. 21 Kommandos.
 * Gebraucht von `abnahmeBearbeiten.test.js` und `vorlagen.test.js` (Teil XXVIII).
 */
import { KOMMANDO_SCHEMA } from '../../services/kommando/Kommando.js';

let n = 0;
export const k = (werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id: `ab-${++n}`, werkzeug, ziel: [], wer: 'fabio', wann: '2026-10-02T12:00:00Z', ...rest });
export const e = (ost, nord, hoehe) => ({ ost, nord, hoehe });
const RECHTECK = (h) => [e(0, 0, h), e(4.6, 0, h), e(4.6, -3.6, h), e(0, -3.6, h)];
const WAND = { kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 2.5, predefinedType: 'RETAININGWALL' };
export const TEILE = ['cde-BP', 'cde-WN', 'cde-WS', 'cde-WW', 'cde-WO', 'cde-DE', 'cde-RA'];
export const KAMMER = () => [
    k('platte-zeichnen', { neu: ['cde-BP'], werte: { name: 'Bodenplatte', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.4, predefinedType: 'BASESLAB' }, eingaben: { umriss: RECHTECK(210) } }),
    k('wand-zeichnen', { neu: ['cde-WN'], werte: { name: 'Längswand Nord', ...WAND }, eingaben: { zug: [e(0, -0.15, 210), e(4.6, -0.15, 210)] } }),
    k('wand-zeichnen', { neu: ['cde-WS'], werte: { name: 'Längswand Süd', ...WAND }, eingaben: { zug: [e(0, -3.45, 210), e(4.6, -3.45, 210)] } }),
    k('wand-zeichnen', { neu: ['cde-WW'], werte: { name: 'Querwand West', ...WAND }, eingaben: { zug: [e(0.15, -0.3, 210), e(0.15, -3.3, 210)] } }),
    k('wand-zeichnen', { neu: ['cde-WO'], werte: { name: 'Querwand Ost', ...WAND }, eingaben: { zug: [e(4.45, -0.3, 210), e(4.45, -3.3, 210)] } }),
    k('platte-zeichnen', { neu: ['cde-DE'], werte: { name: 'Decke', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.25, predefinedType: 'ROOF' }, eingaben: { umriss: RECHTECK(212.75) } }),
    k('raum-zeichnen', { neu: ['cde-RA'], werte: { name: 'Kammerraum', hoehe: '', raumhoehe: 2.5 }, eingaben: { umriss: [e(0.3, -0.3, 210), e(4.3, -0.3, 210), e(4.3, -3.3, 210), e(0.3, -3.3, 210)] } }),
    k('bauwerk-anlegen', { neu: ['cde-KA'], werte: { name: 'Kammer', art: 'anlage', bauwerkstyp: 'RRB' } }),
    ...TEILE.map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-KA' } } })),
    ...['cde-WN', 'cde-WS', 'cde-WW', 'cde-WO', 'cde-RA'].map(gid => k('auf-bauteil-stellen', { ziel: [gid], werte: { bauteil: 'cde-BP', mass: 'oberkante', versatz: 0 } })),
    k('auf-bauteil-stellen', { ziel: ['cde-DE'], werte: { bauteil: 'cde-WN', mass: 'oberkante', versatz: 0 } }),
];

