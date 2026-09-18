/**
 * Ausgeben ohne Aushub — gesagt, bevor hochgeladen wird (Abnahme 2026-09-12, D4).
 *
 * Fabio: „das Paket enthaelt keinen Aushub — ein Erdbau-Dokument ohne Erdbau
 * ist keins". Der Server lehnte erst nach dem Hochladen ab, in seinen Worten.
 * Die sichtbare Grube lebt in der Anzeige (dem geformten Gelände) und steht
 * nie im Paket — gezählt wird nur der Aushubkörper.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aushubFehlt } from '../services/EigenbauDiagnose.js';

const WURZEL = new URL('..', import.meta.url).pathname;

describe('aushubFehlt', () => {
    it('mit Aushub gibt es nichts zu sagen', () => {
        expect(aushubFehlt({ bauteile: [{ klasse: 'IFCEARTHWORKSCUT' }] })).toBe(null);
    });

    it('ohne Aushub: EIN Satz, der den Grund nennt', () => {
        expect(aushubFehlt({ bauteile: [], misserfolge: [{ globalId: 'x' }] }, { satz: 'Test03' }))
            .toBe('Kein Aushub im Satz „Test03“ — 1 Teil ließ sich nicht bauen. Im Verlauf nachsehen.');
        expect(aushubFehlt({ bauteile: [], verborgen: ['a', 'b'] })).toMatch(/2 eigene Teile sind gelöscht/);
        expect(aushubFehlt({ bauteile: [{ klasse: 'IFCEARTHWORKSFILL' }], leer: ['c'] })).toMatch(/1 Teil ist leer/);
        expect(aushubFehlt({ bauteile: [] }, { satz: 'Neu' }))
            .toBe('Kein Aushub im Satz „Neu“ — im Verlauf dieses Satzes steht kein Aushub.');
    });

    it('der Ausgeben-Dialog fragt, BEVOR er hochlädt (S4 neu: eigene Komponente)', () => {
        const view = readFileSync(join(WURZEL, 'components/AusgebenDialog.vue'), 'utf8');
        const start = view.indexOf('async function starten');
        const pruefung = view.indexOf('aushubFehlt(eigenbau', start);
        const upload = view.indexOf('AuftragApi.verbundStarten(', start);
        expect(pruefung).toBeGreaterThan(start);
        expect(pruefung).toBeLessThan(upload);
    });
});
