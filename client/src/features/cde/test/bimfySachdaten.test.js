/**
 * Fahrplan Sachdaten P4 — die Abbildung der ISYBAU-Sachdaten auf IFC.
 * Wächter: jede Regel erfüllt ihr eigenes Beispiel; jedes bSI-Ziel steht in
 * der Vorlage (pset-templates.js) und nimmt den Wert, den die Regel liefert.
 */
import { describe, expect, it } from 'vitest';
import { ABBILDUNGSREGELN, COMMON_SATZ, STATUS_NACH_BSI, SCHLUESSEL_JE_FELD, bildeAb } from '../services/bimfy/isybau/Abbildung.js';
import { PSET_TEMPLATES } from '../data/pset-templates.js';

describe('Abbildung · Wächter', () => {
    for (const r of ABBILDUNGSREGELN) {
        it(`${r.id}: das Beispiel`, () => {
            const e = r.regel(r.beispiel.stammdaten, { klasse: '', ...(r.beispiel.kontext ?? {}) });
            expect(e).toMatchObject(r.beispiel.erwartet);
        });
    }
    it('jeder Common-Satz gilt für seine Klasse und kennt Reference und Status mit den Werten der Tabelle', () => {
        for (const [klasse, satz] of Object.entries(COMMON_SATZ)) {
            const t = PSET_TEMPLATES[satz];
            expect(t, satz).toBeTruthy();
            expect(t.applicableTo).toContain(klasse);
            const status = t.props.find(p => p.name === 'Status');
            expect(t.props.map(p => p.name)).toContain('Reference');
            for (const z of Object.values(STATUS_NACH_BSI)) expect(status.values).toContain(z.wert);
        }
    });
    it('jeder Status G105 hat eine Zeile mit Grund', () => {
        for (const code of ['0', '1', '2', '3', '4', '5', '6']) expect(STATUS_NACH_BSI[code]?.grund, code).toBeTruthy();
    });
});

describe('Abbildung · bildeAb', () => {
    it('Klartexte nach dem letzten Namen im Pfad, beide Formate; Unbekanntes ohne Text mit Befund', () => {
        const e = bildeAb({ 'Knoten.Schacht.Abdeckung.Abdeckungsklasse': 'D', 'Knoten.Abdeckungen.Deckel.Abdeckungsklasse': 'B',
                            'Kante.Material': 'XYZ', Objektbezeichnung: 'S1' });
        expect(e.texte).toEqual({ 'Knoten.Schacht.Abdeckung.Abdeckungsklasse_Text': 'D 400', 'Knoten.Abdeckungen.Deckel.Abdeckungsklasse_Text': 'B 125' });
        expect(e.befunde.map(b => b.regel)).toEqual(['klartext-unbekannt']);
    });
    it('ohne bekannte Klasse keine bSI-Merkmale, nur Texte', () => {
        expect(bildeAb({ Status: '0', Objektbezeichnung: 'X' }, { klasse: 'IFCWALL' }).merkmale).toEqual({});
    });
    it('Status ausserhalb G105: kein Pset-Status, ein Befund', () => {
        const e = bildeAb({ Status: '9' }, { klasse: 'IFCPIPESEGMENT' });
        expect(e.merkmale).toEqual({});
        expect(e.befunde.map(b => b.regel)).toEqual(['klartext-unbekannt', 'status-unbekannt']);
    });
    it('jede Schlüsselliste ist eine Tabelle Code → Text', () => {
        for (const [feld, liste] of Object.entries(SCHLUESSEL_JE_FELD)) expect(Object.keys(liste).length, feld).toBeGreaterThan(1);
    });
});
