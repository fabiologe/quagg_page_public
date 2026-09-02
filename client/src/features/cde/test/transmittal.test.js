// @vitest-environment jsdom
/**
 * Übergabepakete — Transmittals (Lücke ⑩).
 *
 * Die fachliche Regel wohnt in `pruefeAuswahl`: übergeben wird nur SHARED
 * oder PUBLISHED. WIP ist Arbeitsstand, Archived ist aus dem Verkehr — wer
 * Archiviertes verschicken will, hebt es erst sichtbar zurück (Lücke ④),
 * nicht über die Hintertür eines Pakets.
 */
import { describe, expect, it } from 'vitest';
import {
    UEBERGABEFAEHIG, baueSchein, paketName, protokollEintrag, pruefeAuswahl,
} from '../services/Transmittal.js';

const DOKU = [
    { name: 'Kanal_R02.ifc', sha256: 'a'.repeat(64), revision: 2, status: 'Published' },
    { name: 'Lageplan.pdf', sha256: 'b'.repeat(64), revision: 1, status: 'Shared' },
];

describe('pruefeAuswahl', () => {
    it('Shared und Published gehen — WIP und Archived nie, mit Namen im Grund', () => {
        expect(pruefeAuswahl(DOKU).ok).toBe(true);
        const wip = pruefeAuswahl([...DOKU, { name: 'Entwurf.ifc', status: 'WIP' }]);
        expect(wip.ok).toBe(false);
        expect(wip.grund).toContain('Entwurf.ifc');
        expect(pruefeAuswahl([{ name: 'Alt.ifc', status: 'Archived' }]).ok).toBe(false);
        expect(pruefeAuswahl([]).ok).toBe(false);
        expect(UEBERGABEFAEHIG).toEqual(['Shared', 'Published']);
    });
});

describe('baueSchein', () => {
    it('nennt Auftrag, Empfänger, Absender und JEDES Dokument mit Prüfsumme', () => {
        const schein = baueSchein({
            auftrag: { nummer: '1337', name: 'Genau' },
            empfaenger: 'Stadtwerke', wer: 'fabio', wann: 1756800000000,
            anmerkung: 'Vorabzug der Ausführung', dokumente: DOKU,
        });
        expect(schein).toContain('1337 Genau');
        expect(schein).toContain('Stadtwerke');
        expect(schein).toContain('fabio');
        expect(schein).toContain('Vorabzug der Ausführung');
        expect(schein).toContain('Kanal_R02.ifc');
        expect(schein).toContain('a'.repeat(64));
        expect(schein).toContain('Revision 2 · Status Published');
        expect(schein).toContain('Dokumente (2)');
    });
});

describe('Protokoll und Paketname', () => {
    it('der Protokolleintrag trägt alles Nachweisrelevante — schlank, ohne Blobs', () => {
        const e = protokollEintrag({ empfaenger: 'SW', wer: 'fabio', wann: 5, dokumente: DOKU });
        expect(e.id).toBeTruthy();
        expect(e.dokumente).toEqual([
            { name: 'Kanal_R02.ifc', sha256: 'a'.repeat(64), revision: 2, status: 'Published' },
            { name: 'Lageplan.pdf', sha256: 'b'.repeat(64), revision: 1, status: 'Shared' },
        ]);
        expect(Object.keys(e).sort()).toEqual(['anmerkung', 'dokumente', 'empfaenger', 'id', 'wann', 'wer']);
    });

    it('der Paketname ist sprechend und dateisystemfest', () => {
        const name = paketName({ nummer: '1337/G' }, new Date('2026-09-02T12:00:00').getTime());
        expect(name).toBe('Uebergabe_1337_G_2026-09-02.zip');
    });
});
