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
import {
    fruehereRevisionFehlt, gleicheLinie, herkunftChip, imErdbauEnthalten, istAbgabeContainer, quellenVeraltet,
    regenerierbar, teileRegister,
} from '../services/Herkunft.js';

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

    it('gleicheLinie spiegelt den Server, PAARWEISE: die Kennung nur, wenn BEIDE eine tragen', () => {
        const g = (x, pg) => ({ ...x, projectGlobalId: pg });
        expect(gleicheLinie(r01, r02)).toBe(true);                                      // Stamm|Art
        expect(gleicheLinie(r01, g(r02, '0Uktvit05mFcrH4auhENsK'))).toBe(true);          // R01 alt (ohne), R02 neu (mit)
        expect(gleicheLinie(g(r01, 'X'), g(r02, 'Y'))).toBe(false);                      // zwei Kennungen: zwei Modelle
        expect(gleicheLinie(g(r01, 'X'), g({ ...r02, basisname: 'Anders' }, 'X'))).toBe(true);   // umbenannt, dasselbe
    });

    it('der Wechsel R01 → R02 wird auch erkannt, wenn nur R02 eine Projektkennung trägt', () => {
        const r02neu = { ...r02, projectGlobalId: '0Uktvit05mFcrH4auhENsK' };
        expect(quellenVeraltet(erdbauAus(r01), [r01, r02neu])).toEqual([{ quelle: 'Gelaende_R01.ifc', neu: 'Gelaende_R02.ifc', revision: 2 }]);
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

describe('Das Register: geliefert und erzeugt, kein Verbund im Satz, R02 ohne R01 (Fahrplan Erdbau-Container)', () => {
    const lief = { sha256: 'l1', name: 'Gelaende.ifc', basisname: 'Gelaende', art: 'modell', revision: 1 };
    const verbund = { sha256: 'v1', name: 'Verbund_Boden_R01.ifc', basisname: 'Verbund_Boden', art: 'modell', revision: 1, herkunft: { art: 'verbund' } };
    const erd = { sha256: 'e1', name: 'Erdbau_Boden_R01.ifc', basisname: 'Erdbau_Boden', art: 'modell', revision: 1, herkunft: { art: 'erdbau' } };

    it('teilt in Lieferungen und Erzeugtes — die Reihenfolge bleibt', () => {
        expect(teileRegister([verbund, lief, erd])).toEqual({ lieferungen: [lief], erzeugte: [verbund, erd] });
        expect(teileRegister(null)).toEqual({ lieferungen: [], erzeugte: [] });
    });

    it('nur der Verbund ist ein Abgabe-Container — das Erdbau-Dokument ist ein Fachmodell', () => {
        expect([lief, verbund, erd].map(istAbgabeContainer)).toEqual([false, true, false]);
    });

    it('R02 ohne R01 im Register sagt es; mit R01, als R01 selbst oder bei anderer Linie nicht', () => {
        const r01 = { sha256: 'k1', name: 'Kanal_R01.ifc', basisname: 'Kanal', art: 'modell', revision: 1 };
        const r02 = { sha256: 'k2', name: 'Kanal_R02.ifc', basisname: 'Kanal', art: 'modell', revision: 2 };
        expect(fruehereRevisionFehlt(r02, [r02, lief])).toBe(true);
        expect(fruehereRevisionFehlt(r02, [r01, r02])).toBe(false);
        expect(fruehereRevisionFehlt(r01, [r01])).toBe(false);
        expect(fruehereRevisionFehlt(r02, [r02, { ...r01, basisname: 'Anders' }])).toBe(true);
    });
});

describe('Regenerierung: neu erzeugen — oder der Schritt davor (Fahrplan Erdbau-Container, Stufe 6)', () => {
    const r01 = { sha256: 'g1', name: 'Gelaende_R01.ifc', basisname: 'Gelaende', art: 'modell', revision: 1 };
    const r02 = { sha256: 'g2', name: 'Gelaende_R02.ifc', basisname: 'Gelaende', art: 'modell', revision: 2 };
    const dok = {
        sha256: 'e1', name: 'Erdbau_Boden_R01.ifc',
        herkunft: { art: 'erdbau', satz_id: 's-1', satz_name: 'Boden',
                    quellen: [{ sha256: 'g1', datei: 'Gelaende_R01.ifc', revision: 1, globalIds: ['1Ur'] }] },
    };

    it('ein Klick, wenn alles steht — und der Grund sagt, woraus', () => {
        expect(regenerierbar({ dok, alle: [r01, dok], aktiverSatzId: 's-1', geladen: ['g1'] }))
            .toMatchObject({ ok: true, handlung: null });
        expect(regenerierbar({ dok, alle: [r01, r02, dok], aktiverSatzId: 's-1', geladen: ['g2'] }))
            .toMatchObject({ ok: true, grund: expect.stringMatching(/Gelaende_R02/) });
    });

    it('in der Reihenfolge des Servers: erst der Satz, dann die Revision, dann das Journal', () => {
        expect(regenerierbar({ dok, alle: [r01, r02, dok], aktiverSatzId: 's-2', geladen: [], fehlend: ['1Ur'] }))
            .toMatchObject({ ok: false, handlung: 'satz', ziel: 's-1' });
        expect(regenerierbar({ dok, alle: [r01, r02, dok], aktiverSatzId: 's-1', geladen: ['g1'], fehlend: ['1Ur'] }))
            .toMatchObject({ ok: false, handlung: 'laden', ziel: 'g2' });
        expect(regenerierbar({ dok, alle: [r01, r02, dok], aktiverSatzId: 's-1', geladen: ['g2'], fehlend: ['1Ur'] }))
            .toMatchObject({ ok: false, handlung: 'rebase' });
    });

    it('eine fehlende Kennung abseits des Wirts hält nichts auf; ein Verbund ist nicht gemeint', () => {
        expect(regenerierbar({ dok, alle: [r01, dok], aktiverSatzId: 's-1', geladen: ['g1'], fehlend: ['2Rohr'] }).ok).toBe(true);
        expect(regenerierbar({ dok: { ...dok, herkunft: { art: 'verbund' } }, alle: [], aktiverSatzId: 's-1' }))
            .toMatchObject({ ok: false, handlung: null });
    });
});
