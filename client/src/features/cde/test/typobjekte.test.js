// @vitest-environment jsdom
/**
 * Typobjekte (Teil XXIII, A9b — Befund B21): die Vorlage wird im IFC ein TYP.
 *
 * A1 hat der Instanz ihre Vorlage gelassen (`parameter.vorlage`). Im IFC stand
 * davon bisher nichts: zwei Schächte aus derselben Vorlage waren zwei
 * unverbundene Bauteile. Jetzt trägt das Paket je Bauteil mit Vorlage
 * `typ: {id, name}`, und der Schreiber macht daraus EIN `Ifc…Type` je Vorlage
 * mit `IfcRelDefinesByType`.
 *
 * Das Paket kommt aus der ECHTEN Kette (Zeichnen aus der Bibliothek wie der
 * Viewer → Journal → Autor → Paket) und liegt als Fixture für
 * `test_eigenbau.py::test_typen_aus_der_vorlage`:
 *
 *     PAKET_VERTRAG_SCHREIBEN=1 npx vitest run src/features/cde/test/typobjekte.test.js
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useZeichnen } from '../composables/useZeichnen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { EINGEBAUTE_VORLAGEN, vorlagenbezugVon } from '../services/Bibliothek.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { baueEigenbauPaket, typAusVorlage } from '../services/EigenbauPaket.js';

const FIXTURE = resolve(process.cwd(), '../backend/app/ifc/tests/daten/paket_typen.json');
const DN1000 = EINGEBAUTE_VORLAGEN.find(v => v.id === 'schacht-dn1000');

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

/** Drei Schächte: zwei aus der Vorlage „Schacht DN 1000", einer ohne — so wie der Viewer zeichnet. */
async function dreiSchaechte() {
    const bearbeitung = useBearbeitung();
    const ae = useAenderungen();
    const zeichnen = useZeichnen({ bearbeitung, cde: { bearbeiter: 'Fabio' }, getModellSha: () => 'sha1', getHoehenversatz: () => 0 });
    for (const [x, vorlage] of [[5, DN1000], [15, DN1000], [25, null]]) {
        expect(zeichnen.starte('schacht-zeichnen')).toBe(true);
        if (vorlage) bearbeitung.vorbelegeAusVorlage(vorlage);
        zeichnen.setzePunkt({ x, y: 297, z: 5 });
        zeichnen.setzePunkt({ x, y: 300, z: 5.001 });
        await zeichnen.abschliessen();
    }
    return ae;
}

async function paketAus(ae, typVon) {
    const s = ae.wirksamerStand('erzeugt');
    const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: async () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 300 });
    const schritte = [...s].map(([globalId, wert]) => ({ art: 'erzeugt', globalId, modell: 'cde', wert }));
    const g = await autor.eigenbauGeometrien(schritte, { verdeckt: new Set() });
    expect(g.misserfolge ?? []).toEqual([]);
    return baueEigenbauPaket({
        teile: g.bauteile, kanten: g.kanten, stand: s, anzeigeformen: g.anzeigeformen,
        nachProjekt: (p) => ({ ost: 410300 + p.x, nord: 5460100 - p.z, hoehe: p.y - 50 }),
        crs: 'EPSG:25832', projektname: 'Typen', schluessel: 'typen',
        journal: { commit: 'c-typen', sitzungOffen: false }, jetzt: new Date('2026-09-18T00:00:00Z'),
        ...(typVon ? { typVon } : {}),
    });
}

describe('Die Vorlage geht als Typ ins Paket', () => {
    it('ohne Vorlage kein Typ — und kein leerer Schlüssel', () => {
        expect(typAusVorlage({ parameter: { vorlage: 'schacht-dn1000' } })).toEqual({ id: 'schacht-dn1000', name: null });
        expect(typAusVorlage({ parameter: {} })).toBeNull();
        expect(typAusVorlage({ parameter: { vorlage: '' } })).toBeNull();
    });

    it('zwei Schächte aus derselben Vorlage tragen denselben Typ mit Namen, der dritte keinen', async () => {
        const ae = await dreiSchaechte();
        const typVon = (plan) => { const b = vorlagenbezugVon(plan, EINGEBAUTE_VORLAGEN); return b ? { id: b.id, name: b.name } : null; };
        const paket = await paketAus(ae, typVon);
        expect(paket.bauteile.map(b => b.klasse)).toEqual(['IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDISTRIBUTIONCHAMBERELEMENT', 'IFCDISTRIBUTIONCHAMBERELEMENT']);
        expect(paket.bauteile.map(b => b.typ ?? null)).toEqual([
            { id: 'schacht-dn1000', name: 'Schacht DN 1000' }, { id: 'schacht-dn1000', name: 'Schacht DN 1000' }, null]);
        expect('typ' in paket.bauteile[2]).toBe(false);
        expect(paket.bauteile.every(b => b.dreiecke.length > 0)).toBe(true);

        if (process.env.PAKET_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(paket));
        expect(existsSync(FIXTURE), 'Fixture fehlt — mit PAKET_VERTRAG_SCHREIBEN=1 schreiben').toBe(true);
        const fix = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        const form = (p) => p.bauteile.map(t => ({ klasse: t.klasse, rezept: t.rezept, typ: t.typ ?? null, k: Object.keys(t).sort() }));
        expect(form(fix)).toEqual(form(paket));
    });

    it('ohne Bibliothek bleibt der Bezug: die Id, ohne Namen', async () => {
        const ae = await dreiSchaechte();
        const paket = await paketAus(ae, null);
        expect(paket.bauteile[0].typ).toEqual({ id: 'schacht-dn1000', name: null });
    });
});
