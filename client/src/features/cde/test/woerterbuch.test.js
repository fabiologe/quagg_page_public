/**
 * Das Wörterbuch ist ERZEUGT (backend/app/ifc/generiere_client.py aus dem
 * Schema-Schnappschuss) — hier wird geprüft, dass der Client es so benutzt,
 * wie der Schreiber es meint.
 *
 * ZWEI UMSETZUNGEN, EINE TABELLE: die Normierung steht als Algorithmus in
 * Python (`schema.normalisiere`, der Schreiber) und hier
 * (`normalisiereKategorie`). `NORMIERT` erzeugt der Schreiber aus seiner — der
 * Client muss für JEDEN Eintrag dasselbe sagen.
 *
 * Und die Befunde vom 2026-09-11, damit sie nicht zurückkommen: das alte
 * Wörterbuch war ein bSDD-Export. Es liess abgekündigte Klassen weg, führte
 * PredefinedType-Abflachungen als Klassen, kappte Vorlagennamen bei 50 Zeichen
 * und hängte Verteilungs-Vorlagen per „*" an jedes Bauteil.
 */
import { describe, expect, it } from 'vitest';
import { ENTITY_META, getEntityInfo } from '../data/entity-schema.js';
import { ABGEKUENDIGT, ALTNAMEN, GESTRICHEN, NORMIERT } from '../data/altnamen.js';
import { getPsetsForType, PSET_TEMPLATES } from '../data/pset-templates.js';
import { fachbereichVon } from '../data/fachbereiche.js';
import { imWoerterbuch, normalisiereKategorie, vererbungskette } from '../services/bauform/Typprofile.js';
import { istSchreibbar } from '../services/Bauteilrezepte.js';

const namen = t => getPsetsForType(...t).map(([n]) => n);

describe('Normierung: Client und Schreiber sagen dasselbe', () => {
    it('für jeden Altnamen, jede Waise und jede abgekündigte Klasse', () => {
        const eintraege = Object.entries(NORMIERT);
        expect(eintraege.length).toBeGreaterThan(20);        // Schutz gegen Leerlauf: gemessen 26
        const abweichend = eintraege.filter(([k, v]) => normalisiereKategorie(k) !== v);
        expect(abweichend).toEqual([]);
    });

    it('jedes Ziel eines Altnamens steht im Wörterbuch', () => {
        for (const ziel of Object.values(ALTNAMEN)) expect(ENTITY_META[ziel], ziel).toBeTruthy();
    });
});

describe('Das Wörterbuch ist das Schema, nicht der bSDD-Export', () => {
    it('führt IfcCivilElement — abgekündigt, aber in IFC4X3_ADD2', () => {
        const e = ENTITY_META.IFCCIVILELEMENT;
        expect(e.schema).toEqual(['IFC4', 'IFC4X3_ADD2']);
        expect(e.abgekuendigt).toBe(true);
        expect(ABGEKUENDIGT).toContain('IFCCIVILELEMENT');
        expect(vererbungskette('IFCCIVILELEMENT').slice(0, 2)).toEqual(['IFCCIVILELEMENT', 'IFCELEMENT']);
    });

    it('führt die Waisen älterer Schemata — mit Nachfolger oder als gestrichen', () => {
        expect(ENTITY_META.IFCBEAMSTANDARDCASE.schema).toEqual(['IFC4']);
        expect(ENTITY_META.IFCBEAMSTANDARDCASE.nachfolger).toBe('IfcBeam');
        expect(ENTITY_META.IFCPROXY.nachfolger).toBe(null);
        for (const g of GESTRICHEN) expect(imWoerterbuch(g), g).toBe(true);
        // Die Kette endet in ADD2-Begriffen, dort, wo die Typprofile stehen.
        expect(vererbungskette('IFCBUILDINGELEMENTCOMPONENT')[1]).toBe('IFCBUILTELEMENT');
    });

    it('führt keine PredefinedType-Abflachungen mehr als Klassen', () => {
        expect(ENTITY_META.IFCPIPESEGMENTCULVERT).toBeUndefined();
        expect(ENTITY_META.IFCPIPESEGMENT.predefined).toContain('CULVERT');
    });

    it('zeigt die EXPRESS-Attribute (der Block im Eigenschaftsfenster blieb vorher leer)', () => {
        const a = getEntityInfo('IFCWALL').standardAttributes;
        expect(a[0]).toEqual({ name: 'GlobalId', type: 'IfcGloballyUniqueId', card: '1:1' });
        expect(a.at(-1)).toEqual({ name: 'PredefinedType', type: 'IfcWallTypeEnum', card: '0:1' });
        expect(getEntityInfo('IFCGIBTSNICHT').standardAttributes).toEqual([]);
    });
});

describe('Schreibbar heisst: ADD2, konkret, ein Bauteil — wie im Backend', () => {
    // Dieselben Fälle prüft backend/app/ifc/tests/test_schema.py (ist_schreibbar).
    it.each([
        ['IFCEARTHWORKSCUT', true],
        ['IFCCIVILELEMENT', true],          // abgekündigt, aber schemakonform
        ['IFCFEATUREELEMENT', false],       // abstrakt
        ['IFCCARTESIANPOINT', false],       // kein Produkt
        ['IFCPROXY', false],                // Waise: lesbar, nicht schreibbar
        ['IFCPIPESEGMENTCULVERT', false],   // bSDD-Abflachung, keine Klasse
    ])('%s → %s', (typ, soll) => {
        expect(istSchreibbar(typ)).toBe(soll);
    });
});

describe('Vorlagen folgen der Vererbung', () => {
    it('Pset_WallCommon auch an der Unterfassung', () => {
        expect(namen(['IFCWALLSTANDARDCASE'])).toContain('Pset_WallCommon');
    });

    it('keine Verteilungs-Vorlage an der Wand (der alte Export hatte sie per „*")', () => {
        expect(namen(['IFCWALL'])).not.toContain('Pset_ElectricalDeviceCommon');
        expect(namen(['IFCPIPESEGMENT'])).toContain('Pset_ElectricalDeviceCommon');
    });

    it('PredefinedType-gebundene Vorlagen nur mit passendem Typ', () => {
        expect(namen(['IFCDISTRIBUTIONCHAMBERELEMENT'])).not.toContain('Pset_DistributionChamberElementTypeManhole');
        expect(namen(['IFCDISTRIBUTIONCHAMBERELEMENT', 'MANHOLE'])).toContain('Pset_DistributionChamberElementTypeManhole');
    });

    it('keine gekappten Namen (der bSDD-Export kappte bei 50 Zeichen)', () => {
        expect(PSET_TEMPLATES.Pset_DistributionChamberElementTypeInspectionChamb).toBeUndefined();
        expect(PSET_TEMPLATES.Pset_DistributionChamberElementTypeInspectionChamber).toBeTruthy();
    });
});

describe('Fachbereiche hängen am Baum, nicht an der Klasse', () => {
    it('die nächste Stufe gewinnt', () => {
        expect(fachbereichVon(ENTITY_META.IFCPIPESEGMENT.hierarchy)).toBe('Infrastruktur / Kanal');
        expect(fachbereichVon(ENTITY_META.IFCDUCTSEGMENT.hierarchy)).toBe('TGA / Lüftung');
        expect(fachbereichVon(ENTITY_META.IFCCIVILELEMENT.hierarchy)).toBe('Bauteil');
        expect(fachbereichVon([])).toBe('');
    });
});
