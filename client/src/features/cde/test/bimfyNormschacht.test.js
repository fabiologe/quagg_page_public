// @vitest-environment jsdom
/**
 * BIMFY I4 — der Normschacht aus einer Vorlage, über den echten Kommandoweg.
 *
 * Ein Kommando legt den Schacht an (Bauwerk + je Teil ein Bauteil, EIN Vorgang),
 * der Autor baut aus dem Journalstand, der Paketbauer verpackt — derselbe Weg
 * wie „Ausgeben". Gemessen wird, was im IFC ankäme: wie viele Teile, welche
 * Klassen, ob jeder Körper geschlossen ist und ob die Höhen lückenlos von der
 * Bodenunterkante bis zum Deckel reichen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { repo } from '../services/RepoFacade.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { IfcAutor } from '../services/IfcAutor.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { geometrieAusTeil } from '../services/Bauteilrezepte.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';
import { vorlageNach, vorlagenWerte } from '../services/rezept/Bauwerksvorlagen.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paketAus } from './hilfen/vorlagenKommandos.js';
import { k, e } from './hilfen/kammerKommandos.js';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../backend/app/ifc/tests/daten/paket_normschacht.json');
const KENNUNGEN = ['cde-S1', 'cde-UT', 'cde-BE', 'cde-R1', 'cde-R2', 'cde-HA', 'cde-AR1', 'cde-AB', 'cde-ST'];

class Speicher {
    constructor() { this.daten = new Map(); }
    async get(k) { return this.daten.has(k) ? JSON.parse(this.daten.get(k)) : null; }
    async set(k, v) { this.daten.set(k, JSON.stringify(v)); return true; }
    async delete(k) { this.daten.delete(k); return true; }
    async listKeys(p) { return [...this.daten.keys()].filter(k => k.startsWith(p)); }
    async getBlob() { return null; }
    async setBlob() { return false; }
    async deleteBlob() { return false; }
    async listBlobs() { return []; }
}
beforeEach(() => { repo.setBackend(new Speicher()); setActivePinia(createPinia()); });
afterEach(() => repo.setBackend(null));

const r3 = (v) => Math.round(v * 1000) / 1000;
const WERTE = { tiefe: 3, dn: 1, oeffnung: 0.625, anschlussDn: 0.3, unterteilHoehe: 0, auflageringe: 0, oberteil: 1,
                steighilfe: 1, gerinneform: 0, abgang: 0, zulauf: 180, steigRichtung: 90, deckelklasse: 4 };

async function legeAn(werte = WERTE, { sohle = 102 } = {}) {
    const b = useBearbeitung();
    const erg = await b.fuehreAus({
        schema: KOMMANDO_SCHEMA, id: `ko-${Math.random()}`, werkzeug: 'bauwerk-aus-vorlage-normschacht', ziel: [], wer: 'test',
        wann: '2026-10-05T12:00:00Z', // Nahe am Ursprung: die Welt liegt im Programm lokal (Ladeversatz); bei 5,46 Mio. m hätte Float32 nur 0,5 m Auflösung.
        eingaben: { zug: [{ ost: 10, nord: 20, hoehe: sohle }] },
        werte: { name: 'S1', hoehe: '', ...werte },
    }, { kennungsgeber: (art) => `${art === 'operation' ? 'op' : 'cde'}-${Math.random().toString(36).slice(2, 9)}` });
    return erg;
}

describe('BIMFY I4 · Normschacht aus der Vorlage', () => {
    it('ein Kommando, ein Vorgang: Schacht und 8 Teile — jedes Teil ein geschlossener Körper', async () => {
        const erg = await legeAn();
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const stand = useAenderungen().wirksamerStand('erzeugt');
        const plaene = [...stand.values()];
        const schacht = plaene.find(p => p.rezept === 'bauwerk');
        expect(schacht).toMatchObject({ name: 'S1', parameter: { art: 'schacht', bauwerksvorlage: { id: 'normschacht' } } });
        const teile = plaene.filter(p => p.rezept !== 'bauwerk');
        expect(teile.map(t => t.rezept)).toEqual(['schachtunterteil', 'berme', 'schachtring', 'schachtring', 'schachthals',
                                                   'auflagering', 'schachtabdeckung', 'steigeisen']);
        for (const t of teile) {
            const r = (await import('../services/Bauteilrezepte.js')).rezeptNach(t.rezept);
            const g = r.baue(t.parameter);
            expect(g, t.rezept).toBeTruthy();
            const pos = g.getAttribute('position').array;
            expect(meshVolume(pos, pos.length / 9).closed, `${t.rezept} geschlossen`).toBe(true);
        }
        // Die Herleitung reist mit: Ringhöhe aus der Norm, Rahmenhöhe als Annahme.
        expect(teile[2].parameter.herleitung.hoehe).toMatchObject({ art: 'norm', beleg: { norm: 'DIN 4034-1:2020-04' } });
        expect(teile[6].parameter.herleitung.hoehe.art).toBe('annahme');
    });

    it('lückenlos: Bodenunterkante 101,85 bis Deckel 105,00, der Hals exzentrisch zur Steigseite (Nord)', async () => {
        await legeAn();
        const teile = [...useAenderungen().wirksamerStand('erzeugt').values()].filter(p => p.parameter?.punkte?.length === 2
            && !['berme'].includes(p.rezept));
        const hoehen = teile.map(t => [t.rezept, r3(t.parameter.punkte[0][1]), r3(t.parameter.punkte[1][1])]);
        expect(hoehen[0]).toEqual(['schachtunterteil', 101.85, 102.7]);
        expect(hoehen[hoehen.length - 1]).toEqual(['schachtabdeckung', 104.84, 105]);
        for (let i = 1; i < hoehen.length; i++) expect(Math.abs(hoehen[i][1] - hoehen[i - 1][2])).toBeLessThanOrEqual(0.02);
        const hals = teile.find(t => t.rezept === 'schachthals');
        // Nord ist −z in der Welt: oben um (1,0 − 0,625)/2 = 0,1875 nach Norden versetzt.
        const [u, o] = hals.parameter.punkte;
        expect(o[0] - u[0]).toBeCloseTo(0, 6);
        expect(o[2] - u[2]).toBeCloseTo(-0.1875, 6);
    });

    it('im Paket: Teile als IfcBuildingElementPart/IfcDiscreteAccessory mit Objekttyp, alle mit dem Schacht als Ganzem', async () => {
        await legeAn();
        const ae = useAenderungen();
        const stand = ae.wirksamerStand('erzeugt');
        const autor = new IfcAutor({ getFragments: () => null, holeQuellForm: () => null, kernel: erzeugeKernel(), getHoehenversatz: () => 0 });
        const g = await autor.eigenbauGeometrien([...stand].map(([globalId, wert]) => ({ globalId, wert })), { verdeckt: new Set() });
        const paket = baueEigenbauPaket({ teile: g.bauteile, stand, bauwerke: g.bauwerke,
                                          nachProjekt: (p) => ({ ost: p.x, nord: -p.z, hoehe: p.y }) });
        expect(paket.bauwerke).toEqual([expect.objectContaining({ art: 'schacht', name: 'S1' })]);
        const klassen = paket.bauteile.map(t => `${t.klasse}/${t.predefinedType}`);
        expect(klassen.filter(k => k === 'IFCBUILDINGELEMENTPART/USERDEFINED')).toHaveLength(6);
        expect(klassen.filter(k => k === 'IFCDISCRETEACCESSORY/USERDEFINED')).toHaveLength(2);
        const bw = paket.bauwerke[0].cdeId;
        expect(paket.bauteile.every(t => t.teilVon === bw)).toBe(true);
        expect(paket.bauteile.map(t => t.objektTyp)).toContain('Schachtring');
    });

    it('Werte der Vorlage: ohne Konus wird es eine Abdeckplatte, zu flach wird gesagt', () => {
        const v = vorlageNach('normschacht');
        const flach = v.kette({ ...vorlagenWerte(v), tiefe: 1.4, oberteil: 2 });
        expect(flach.teile.map(t => t.rolle)).toContain('abdeckplatte');
        const r = v.rollen({ ...vorlagenWerte(v) }, { x: 0, y: 0, z: 0 });
        expect(r.map(t => t.rolle)).toEqual(['unterteil', 'berme', 'ring1', 'ring2', 'hals', 'auflagering1', 'abdeckung', 'steigeisen']);
    });

    it('der Vertrag mit dem Schreiber: das Paket des Normschachts (Fixture für test_bauwerke.py)', async () => {
        const erg = await useBearbeitung().fuehreAus(k('bauwerk-aus-vorlage-normschacht', {
            neu: KENNUNGEN, eingaben: { zug: [e(5, -5, 102)] }, werte: { name: 'S1', hoehe: '', ...WERTE } }));
        expect(erg.ausgefuehrt, erg.grund ?? '').toBe(true);
        const p = await paketAus(useAenderungen());
        expect(p.bauwerke).toEqual([expect.objectContaining({ cdeId: 'cde-S1', art: 'schacht',
            merkmale: { Pset_DistributionChamberElementTypeManhole: expect.objectContaining({
                InvertLevel: 102, WallThickness: 0.12, BaseThickness: 0.15, HasSteps: true, AccessCoverLoadRating: 'D 400' }) } })]);
        expect(p.bauteile.find(t => t.cdeId === 'cde-R1').herleitung).toMatch(/^hoehe: norm — Regelbauhöhe 1000 mm \(DIN 4034-1:2020-04, 4\.3\.3\.8\.4\)/);
        if (process.env.NORMSCHACHT_VERTRAG_SCHREIBEN) writeFileSync(FIXTURE, JSON.stringify(p));
        expect(existsSync(FIXTURE), 'Fixture fehlt: NORMSCHACHT_VERTRAG_SCHREIBEN=1 …').toBe(true);
        const alt = JSON.parse(readFileSync(FIXTURE, 'utf8'));
        expect(alt.bauteile.map(x => [x.cdeId, x.klasse, x.predefinedType, x.objektTyp, x.teilVon]))
            .toEqual(p.bauteile.map(x => [x.cdeId, x.klasse, x.predefinedType, x.objektTyp, x.teilVon]));
    });
});
