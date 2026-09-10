/**
 * Herkunft — der Chip im Register und die Vorschau „fällt weg" (Stufe 3 des
 * Aushub-Fachmodells).
 *
 * Die Vorschau muss DIESELBE Regel sein wie `verbund_lauf.auftrag_bauen` auf
 * dem Server (`weggelassen`, Grund „steckt in …"). Die Gegenseite prüft
 * `test_im_verbund_faellt_das_gelaende_des_erdbau_dokuments_heraus`; hier
 * steht dasselbe Manifest aus Sicht des Viewers.
 */
import { describe, expect, it } from 'vitest';
import { herkunftChip, imErdbauEnthalten, linieVon, quellenVeraltet } from '../services/Herkunft.js';

const GELAENDE = { sha256: 'a'.repeat(64), datei: 'Gelaende.ifc', revision: 1 };
const erdbau = (datei, quellen = [GELAENDE], mehr = {}) => ({
    sha256: `e-${datei}`, datei,
    herkunft: { art: 'erdbau', satz_name: 'Boden', quellen, pruefung: { verstoesse: 0 },
                journal: { commit: 'c-1', sitzungOffen: false }, ...mehr },
});

describe('Der Chip im Register', () => {
    it('ein hochgeladenes Dokument hat keinen — woher es kam, weiss der Planer', () => {
        expect(herkunftChip({ sha256: 'x', name: 'Kanal.ifc' })).toBeNull();
        expect(herkunftChip({ herkunft: null })).toBeNull();
    });

    it('ein Erdbau-Dokument nennt sein Gelände, die Prüfung und den Journalstand', () => {
        const c = herkunftChip(erdbau('Erdbau_Boden_R01.ifc'));
        expect(c).toMatchObject({ art: 'erdbau', text: 'Erdbau · aus Gelaende.ifc' });
        expect(c.titel).toMatch(/Ur-Gelände unverändert/);
        expect(c.titel).toMatch(/geprüft, 0 Verstöße/);
        expect(c.titel).toMatch(/Journalstand c-1/);
        expect(c.titel).toMatch(/Quelle Gelaende.ifc Rev. 1/);
        // Mehrere Gelände: das erste beim Namen, der Rest gezählt.
        expect(herkunftChip(erdbau('E.ifc', [GELAENDE, { sha256: 'b', datei: 'Gelaende_Nord.ifc' }])).text)
            .toBe('Erdbau · aus Gelaende.ifc +1');
    });

    it('ein Verbund zählt seine Quellen (der Live-Eigenbau zählt mit) und nennt, was wegfiel', () => {
        const c = herkunftChip({ herkunft: { art: 'verbund', quellen: [GELAENDE, { sha256: 'b' }], eigenbau: { groesse: 1 },
                                             weggelassen: [{ datei: 'Alt.ifc', grund: 'steckt in Erdbau_Boden_R02.ifc' }] } });
        expect(c.text).toBe('Verbund · 3 Quellen');
        expect(c.titel).toMatch(/Alt.ifc: steckt in Erdbau_Boden_R02.ifc/);
        expect(c.titel).toMatch(/ungeprüft/);            // ohne Prüfbefund wird nichts behauptet
    });
});

describe('Was im Verbund wegfällt — dieselbe Regel wie der Server', () => {
    it('das Gelände eines Erdbau-Dokuments im Satz fällt weg; anderes bleibt', () => {
        const satz = [GELAENDE, erdbau('Erdbau_Boden_R01.ifc'), { sha256: 'k'.repeat(64), datei: 'Kanal.ifc' }];
        const weg = imErdbauEnthalten(satz);
        expect([...weg]).toEqual([[GELAENDE.sha256, 'Erdbau_Boden_R01.ifc']]);
    });

    it('nimmt beide Formen einer Registerzeile — vom Server aufgelöst (`datei`) oder aus dem Manifest (`name`)', () => {
        const ausManifest = { sha256: 'e', name: 'Erdbau_Boden_R01.ifc', herkunft: { art: 'erdbau', quellen: [GELAENDE] } };
        expect(imErdbauEnthalten([ausManifest]).get(GELAENDE.sha256)).toBe('Erdbau_Boden_R01.ifc');
        expect(imErdbauEnthalten([]).size).toBe(0);
        expect(imErdbauEnthalten(null).size).toBe(0);
    });
});

describe('Veraltete Quellen (Stufe 4) — das Gelände ist im Register neuer als im Erdbau', () => {
    const r01 = { sha256: 'g1', name: 'Gelaende_R01.ifc', basisname: 'Gelaende', art: 'modell', revision: 1 };
    const r02 = { sha256: 'g2', name: 'Gelaende_R02.ifc', basisname: 'Gelaende', art: 'modell', revision: 2 };
    const erdbauAus = (q) => ({ sha256: 'e1', name: 'Erdbau_Boden_R01.ifc', basisname: 'Erdbau_Boden', art: 'modell', revision: 1,
                                herkunft: { art: 'erdbau', quellen: [{ sha256: q.sha256, datei: q.name, revision: q.revision }] } });

    it('linieVon spiegelt den Server: Projektkennung vor Stamm|Art', () => {
        expect(linieVon(r01)).toBe('Gelaende|modell');
        expect(linieVon({ ...r01, projectGlobalId: '0Osfh3c9f9_PSSk12wpzoa' })).toBe('0Osfh3c9f9_PSSk12wpzoa');
    });

    it('aus R01 gebaut, R02 liegt da: „neu erzeugen" — aus R02 gebaut: nichts', () => {
        expect(quellenVeraltet(erdbauAus(r01), [r01, r02, erdbauAus(r01)]))
            .toEqual([{ quelle: 'Gelaende_R01.ifc', neu: 'Gelaende_R02.ifc', revision: 2 }]);
        expect(quellenVeraltet(erdbauAus(r02), [r01, r02])).toEqual([]);
    });

    it('ein erzeugtes Dokument ist nie „die neuere Quelle"; eine Quelle, die nicht mehr im Register steht, ist unbekannt — nicht veraltet', () => {
        const verbundR05 = { sha256: 'v5', name: 'Verbund_Gelaende_R05.ifc', basisname: 'Gelaende', art: 'modell', revision: 5, herkunft: { art: 'verbund' } };
        expect(quellenVeraltet(erdbauAus(r01), [r01, verbundR05])).toEqual([]);
        expect(quellenVeraltet(erdbauAus(r01), [r02])).toEqual([]);
        expect(quellenVeraltet({ sha256: 'x', name: 'Hochgeladen.ifc' }, [r01, r02])).toEqual([]);
    });
});
