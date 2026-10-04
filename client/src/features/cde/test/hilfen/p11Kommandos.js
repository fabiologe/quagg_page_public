/**
 * P11 — DER RETENTIONSTEICH ALS KOMMANDOFOLGE (Teil XXIX, G7 — Konzept § 11).
 *
 * Ein Regenrückhalteteich mit Dauerstau auf einem Gelände, das im Teichbereich eben auf H liegt: Rand 52 × 32 m,
 * Tiefe 2, Böschung 1 : 3 → Sohle 40 × 20 auf H − 2; Dauerstau bis H − 1 (von Hand 992 m³), Rückhalteraum bis H
 * (1 424 m³). Gebraucht vom Abnahmetest (`p11Teich.test.js`, H = 100) und von der Browserprobe im Projekt 10001
 * (H = 200, über Vite geladen). Örtliche Koordinaten: x nach Osten, z nach SÜDEN (Welt), Ursprung = Nordwestecke des
 * Randes; `O` verschiebt alles in Landeskoordinaten.
 *
 * Die Fachobjekte kommen aus der eingebauten Bibliothek (G3) — gezeichnet mit ihren Vorgaben und ihrer Kennung
 * (`vorlage`), wie ein Klick in der Palette. Die Nummern folgen § 11.1.
 */
import { EINGEBAUTE_VORLAGEN } from '../../services/Bibliothek.js';

/** Der Dichtungsaufbau des Teichs: Tondichtung 0,5 + Vlies 0,01 + Schutzschicht 0,3 m (Vorlagen), senkrecht zur Fläche. */
export const P11_AUFBAU = 0.81;

let n = 0;
const k = (werkzeug, rest) => ({ schema: 1, id: `p11-${++n}`, werkzeug, ziel: [], wer: 'p11', wann: '2026-10-04T15:00:00Z', ...rest });
const vorgaben = (id) => ({ ...(EINGEBAUTE_VORLAGEN.find(v => v.id === id)?.vorgaben ?? {}), vorlage: id });

/**
 * @param {{O?: {ost, nord}, H?: number, ur?: string}} o
 * @returns {{kommandos: object[], teich: string[], steg: string[], ohne: string[], RAND: object[]}}
 */
export function p11Kommandos({ O = { ost: 0, nord: 0 }, H = 100, ur = 'UR', X0 = 20, Z0 = 30 } = {}) {
    n = 0;
    const P = (x, z, dh = 0) => ({ ost: O.ost + X0 + x, nord: O.nord - (Z0 + z), hoehe: +(H + dh).toFixed(3) });
    const RECHT = (x0, z0, x1, z1, dh = 0) => [P(x0, z0, dh), P(x1, z0, dh), P(x1, z1, dh), P(x0, z1, dh)];
    const RAND = RECHT(0, 0, 52, 32);
    const e = P11_AUFBAU * Math.sqrt(10);
    const ERDPLANUM_RAND = RECHT(-e, -e, 52 + e, 32 + e);
    const schicht = (gid, name, vorlage, umriss, mehr = {}) => k('gelaendeschicht-zeichnen', { neu: [gid, `op-${gid.slice(4)}`],
        eingaben: { umriss }, werte: { objektTyp: '', abstand: '', richtung: 'lot', gelaende: '', ...vorgaben(vorlage), name, ...mehr } });
    const band = (gid, name, vorlage, achse, mehr = {}) => k('gelaendeschicht-band-zeichnen', { neu: [gid, `op-${gid.slice(4)}`],
        eingaben: { zug: achse }, werte: { objektTyp: '', abstand: '', richtung: 'lot', gelaende: '', breite: 2.5, ...vorgaben(vorlage), name, ...mehr } });
    const raum = (gid, name, oben, unten, auf = '') => k('muldenraum-zeichnen', { neu: [gid, `op-${gid.slice(4)}`], eingaben: { umriss: RAND },
        werte: { name, predefinedType: 'EXTERNAL', objektTyp: '', oben: +(H + oben).toFixed(3), unten: unten === '' ? '' : +(H + unten).toFixed(3), gelaende: '', auf } });
    const aus = (rezept, gid, name, vorlage, zug, mehr = {}) => k(`${rezept}-zeichnen`, { neu: [gid], eingaben: { zug },
        werte: { hoehe: '', ...vorgaben(vorlage), name, ...mehr } });

    const kommandos = [
        // Die Bauwerke — der Teich (RRB) und der Steg (ein eigenes Bauwerk mit Verweis, Konzept § 3).
        k('bauwerk-anlegen', { neu: ['cde-TEICH'], werte: { name: 'Retentionsteich', art: 'anlage', bauwerkstyp: 'RRB' } }),
        k('bauwerk-anlegen', { neu: ['cde-STEG'], werte: { name: 'Steg', art: 'anlage' } }),
        // 2 · die Mulde WIE IN DER REALITÄT (nach G8, Fabio): ausgehoben bis zum Erdplanum, um den Dichtungsaufbau
        //     (t = 0,81 m, senkrecht zur Fläche) tiefer; der Rand um t·√10 weiter aussen, damit die Böschung 1 : 3 bleibt
        //     und die Oberkante des Aufbaus wieder die Mulde von Hand ist (Sohle H − 2, Rand H).
        k('graben-ausheben', { ziel: [ur], eingaben: { umriss: ERDPLANUM_RAND }, werte: { mass: 2 + P11_AUFBAU, neigung: 3, auflockerung: 1.2 } }),
        // 5–7 · der Dichtungsaufbau, Schicht auf Schicht — jede ein Körper mit ihrer Dicke, senkrecht zur Böschung.
        schicht('cde-T5', 'Tondichtung', 'tondichtung', RAND),
        schicht('cde-T6', 'Schutzvlies', 'schutzvlies', RAND, { auf: 'cde-T5' }),
        schicht('cde-T7', 'Dichtungsschutzschicht', 'dichtungsschutz', RAND, { auf: 'cde-T6' }),
        // 8–11 · Oberboden, Steinschüttung in der Wasserwechselzone (Band entlang der Uferlinie), Schilf — auf dem Aufbau;
        //        Rasen ausserhalb auf dem Gelände.
        schicht('cde-T8', 'Oberboden Böschung Nord', 'oberboden', RECHT(8, 0, 44, 1.5), { auf: 'cde-T7' }),
        band('cde-T9', 'Steinschüttung Wasserwechselzone', 'steinschuettung', [P(3, 3), P(49, 3)], { breite: 2.4, auf: 'cde-T7' }),
        schicht('cde-T10', 'Schilf Flachwasser Süd', 'schilf', RECHT(8, 28, 44, 31), { auf: 'cde-T7' }),
        schicht('cde-T11', 'Rasen Uferstreifen Nord', 'rasen', RECHT(-4, -4, 56, 0)),
        // 12–13 · Dauerstau und Rückhalteraum — über dem Aufbau, nicht über dem Erdplanum.
        raum('cde-T12', 'Dauerstau', -1, '', 'cde-T7'),
        raum('cde-T13', 'Rückhalteraum', 0, -1, 'cde-T7'),
        // 14–17 · der Zulauf von Osten: Haltung DN 600, Stirnwand (Wasserbau), Kolkschutz, Grobrechen.
        k('rohr-zeichnen', { neu: ['cde-T14'], eingaben: { zug: [P(70, 16, -0.9), P(49, 16, -1.1)] },
            werte: { name: 'Zulaufhaltung DN 600', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 600 } }),
        k('wand-zeichnen', { neu: ['cde-T15'], eingaben: { zug: [P(49.5, 13, -1.6), P(49.5, 19, -1.6)] },
            werte: { name: 'Einlaufbauwerk Stirnwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 1.6, predefinedType: 'RETAININGWALL', gewerk: 'wasserbau' } }),
        schicht('cde-T16', 'Kolkschutz', 'steinschuettung', RECHT(40, 13, 46, 19)),
        k('rechen-zeichnen', { neu: ['cde-T17'], eingaben: { zug: [P(48.5, 13.5, -1.1), P(48.5, 18.5, -1.1)] },
            werte: { name: 'Grobrechen', kategorie: 'IFCFILTER', hoehe: '', stabtiefe: 0.08, rechenhoehe: 1.2 } }),
        // 18–22 · das Drosselbauwerk im Westen; die Schwelle setzt das Stauziel (Oberkante H).
        k('schacht-zeichnen', { neu: ['cde-T18'], eingaben: { zug: [P(-3, 16, -2.2), P(-3, 16, 0)] },
            werte: { name: 'Drosselschacht', kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT', hoehe: '', dn: 1500, predefinedType: 'MANHOLE' } }),
        k('drossel-zeichnen', { neu: ['cde-T19'], eingaben: { zug: [P(-3, 15.6, -2.2), P(-3, 16.4, -2.2)] },
            werte: { name: 'Drossel', kategorie: 'IFCVALVE', hoehe: '', dn: 200 } }),
        k('ueberlaufschwelle-zeichnen', { neu: ['cde-T20'], eingaben: { zug: [P(-1.5, 15, -0.5), P(-1.5, 17, -0.5)] },
            werte: { name: 'Wehrschwelle', kategorie: 'IFCWALL', hoehe: '', dicke: 0.3, wandhoehe: 0.5 } }),
        k('tauchwand-zeichnen', { neu: ['cde-T21'], eingaben: { zug: [P(-0.8, 15, -1.2), P(-0.8, 17, -1.2)] },
            werte: { name: 'Tauchwand', kategorie: 'IFCWALL', hoehe: '', dicke: 0.2, wandhoehe: 1 } }),
        k('rohr-zeichnen', { neu: ['cde-T22'], eingaben: { zug: [{ knoten: 'cde-T18' }, P(-25, 16, -2.4)] },
            werte: { name: 'Ablaufhaltung', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 } }),
        // 24 · die Befestigung des Notüberlaufs über den Westrand.
        schicht('cde-T24', 'Befestigung Notüberlauf', 'steinschuettung', RECHT(-6, 12, 4, 20)),
        // 25–28 · der Steg: vier Pfähle, zwei Jochträger, der Belag, zwei Geländer.
        ...[[24.3, 4], [27.7, 4], [24.3, 8], [27.7, 8]].map(([x, z], i) =>
            aus('pfosten', `cde-T25${'abcd'[i]}`, `Pfahl ${i + 1}`, 'pfahl', [P(x, z, -2.5)])),
        ...[4, 8].map((z, i) => aus('streifenfundament', `cde-T26${'ab'[i]}`, `Jochträger ${i + 1}`, 'traeger', [P(24, z, 0.3), P(28, z, 0.3)])),
        k('platte-zeichnen', { neu: ['cde-T27'], eingaben: { umriss: RECHT(24, -1, 28, 8.5, 0.55) },
            werte: { name: 'Stegbelag', kategorie: 'IFCSLAB', hoehe: '', dicke: 0.05, predefinedType: 'FLOOR' } }),
        ...[24.05, 27.95].map((x, i) => aus('wand', `cde-T28${'ab'[i]}`, `Geländer ${i ? 'Ost' : 'West'}`, 'gelaender', [P(x, -1, 0.55), P(x, 8.5, 0.55)])),
        // 29–31 · Weg zum Steg mit Einfassung, Zufahrt (Wartungsweg) — Bänder entlang ihrer Achse, ohne Bauwerk.
        band('cde-T29', 'Weg zum Steg', 'weg-wassergebunden', [P(26, -25), P(26, -1)]),
        aus('streifenfundament', 'cde-T30', 'Wegeinfassung', 'einfassung', [P(24.7, -25, -0.25), P(24.7, -1, -0.25)]),
        band('cde-T31', 'Zufahrt', 'weg-wassergebunden', [P(-10, 40), P(62, 40)], { breite: 3.5, dicke: 0.3 }),
        // 32–35 · Zaun, Tor, Pegellatte am Steg, Warnschild.
        aus('wand', 'cde-T32', 'Zaun Nord', 'zaun', [P(-8, -6), P(60, -6)]),
        aus('wand', 'cde-T33', 'Tor', 'tor', [P(24, -6.6), P(28, -6.6)]),
        aus('pfosten', 'cde-T34', 'Pegellatte', 'pegellatte', [P(28.5, 9, -2)], { laenge: 2.5 }),
        aus('pfosten', 'cde-T35', 'Warnschild', 'warnschild', [P(30, -7)]),
    ];
    const teich = ['cde-T5', 'cde-T6', 'cde-T7', 'cde-T8', 'cde-T9', 'cde-T10', 'cde-T11', 'cde-T12', 'cde-T13', 'cde-T14', 'cde-T15',
                   'cde-T16', 'cde-T17', 'cde-T18', 'cde-T19', 'cde-T20', 'cde-T21', 'cde-T22', 'cde-T24', 'cde-T32', 'cde-T33', 'cde-T34', 'cde-T35'];
    const steg = ['cde-T25a', 'cde-T25b', 'cde-T25c', 'cde-T25d', 'cde-T26a', 'cde-T26b', 'cde-T27', 'cde-T28a', 'cde-T28b'];
    const ohne = ['cde-T29', 'cde-T30', 'cde-T31'];
    kommandos.push(
        ...teich.map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-TEICH' } } })),
        ...steg.map(gid => k('bauwerk-zuordnen', { ziel: [gid], eingaben: { auswahl: { bauwerk: 'cde-STEG' } } })),
    );
    return { kommandos, teich, steg, ohne, RAND };
}

/** § 11.1 — was je Element ankommen soll: Klasse, Ausführung, Gewerk. */
export const P11_SOLL = Object.freeze({
    'cde-T5': ['IFCCOURSE', 'CORE', 'wasserbau'], 'cde-T6': ['IFCCOURSE', 'FILTER', 'wasserbau'],
    'cde-T7': ['IFCCOURSE', 'PROTECTION', 'wasserbau'], 'cde-T8': ['IFCEARTHWORKSFILL', 'USERDEFINED', 'landschaft'],
    'cde-T9': ['IFCCOURSE', 'ARMOUR', 'wasserbau'], 'cde-T10': ['IFCGEOGRAPHICELEMENT', 'VEGETATION', 'landschaft'],
    'cde-T11': ['IFCGEOGRAPHICELEMENT', 'VEGETATION', 'landschaft'], 'cde-T12': ['IFCSPACE', 'EXTERNAL', 'entwaesserung'],
    'cde-T13': ['IFCSPACE', 'EXTERNAL', 'entwaesserung'], 'cde-T14': ['IFCPIPESEGMENT', null, 'entwaesserung'],
    'cde-T15': ['IFCWALL', 'RETAININGWALL', 'wasserbau'], 'cde-T16': ['IFCCOURSE', 'ARMOUR', 'wasserbau'],
    'cde-T17': ['IFCFILTER', 'STRAINER', 'entwaesserung'], 'cde-T18': ['IFCDISTRIBUTIONCHAMBERELEMENT', 'MANHOLE', 'entwaesserung'],
    'cde-T19': ['IFCVALVE', 'REGULATING', 'entwaesserung'], 'cde-T20': ['IFCWALL', 'USERDEFINED', 'entwaesserung'],
    'cde-T21': ['IFCWALL', 'USERDEFINED', 'entwaesserung'], 'cde-T22': ['IFCPIPESEGMENT', null, 'entwaesserung'],
    'cde-T24': ['IFCCOURSE', 'ARMOUR', 'wasserbau'],
    'cde-T25a': ['IFCPILE', 'DRIVEN', 'konstruktiv'], 'cde-T26a': ['IFCBEAM', 'JOIST', 'konstruktiv'],
    'cde-T27': ['IFCSLAB', 'FLOOR', 'konstruktiv'], 'cde-T28a': ['IFCRAILING', 'HANDRAIL', 'ausstattung'],
    'cde-T29': ['IFCCOURSE', 'PAVEMENT', 'verkehr'], 'cde-T30': ['IFCKERB', 'NOTDEFINED', 'verkehr'], 'cde-T31': ['IFCCOURSE', 'PAVEMENT', 'verkehr'],
    'cde-T32': ['IFCRAILING', 'FENCE', 'ausstattung'], 'cde-T33': ['IFCDOOR', 'GATE', 'ausstattung'],
    'cde-T34': ['IFCSENSOR', 'LEVELSENSOR', 'ta'], 'cde-T35': ['IFCSIGN', 'PICTORAL', 'ausstattung'],
});
