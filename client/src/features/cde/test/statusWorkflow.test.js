// @vitest-environment jsdom
/**
 * Der ISO-19650-Status-Arbeitsfluss (Lücke ④, 2026-09-02).
 *
 * Vorher konnte jeder jeden Status auf jeden anderen setzen — WIP →
 * Archived mit einem Klick, ohne Weg über die Stufen und ohne Rang. Jetzt
 * gilt der Übergangs-Graph (vorwärts für alle ab WERKSTUDENT, rückwärts mit
 * Rang, ADMIN als Korrektur-Eskape), gespiegelt vom Server — der Client-
 * Guard ist Kosmetik, aber er sperrt die Knöpfe BEGRÜNDET, statt den Server
 * ablehnen zu lassen und nichts zu sagen.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { pruefeStatuswechsel, statusZiele, STATUS_UEBERGAENGE } from '../services/StatusWorkflow.js';
import { useCdeStore } from '../stores/useCdeStore.js';

describe('pruefeStatuswechsel (rein)', () => {
    it('vorwärts geht ab WERKSTUDENT — der Sprung über Stufen nie (außer ADMIN)', () => {
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', rolle: 'WERKSTUDENT' }).ok).toBe(true);
        expect(pruefeStatuswechsel({ von: 'Shared', nach: 'Published', rolle: 'MITARBEITER' }).ok).toBe(true);
        const sprung = pruefeStatuswechsel({ von: 'WIP', nach: 'Archived', rolle: 'MITARBEITER' });
        expect(sprung.ok).toBe(false);
        expect(sprung.grund).toContain('ISO-19650-Weg');
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Archived', rolle: 'ADMIN' }).ok).toBe(true);
    });

    it('rückwärts braucht Rang — und der Grund nennt ihn', () => {
        const zurueck = pruefeStatuswechsel({ von: 'Published', nach: 'Shared', rolle: 'MITARBEITER' });
        expect(zurueck.ok).toBe(false);
        expect(zurueck.grund).toContain('ADMIN');
        expect(pruefeStatuswechsel({ von: 'Shared', nach: 'WIP', rolle: 'WERKSTUDENT' }).ok).toBe(false);
        expect(pruefeStatuswechsel({ von: 'Shared', nach: 'WIP', rolle: 'MITARBEITER' }).ok).toBe(true);
    });

    it('ohne Rolle (lokal, nicht angemeldet) gilt der GRAPH, aber keine Rangschranke', () => {
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Shared', rolle: null }).ok).toBe(true);
        expect(pruefeStatuswechsel({ von: 'Published', nach: 'Shared', rolle: null }).ok).toBe(true);
        expect(pruefeStatuswechsel({ von: 'WIP', nach: 'Published', rolle: null }).ok).toBe(false);
    });

    it('statusZiele liefert je Ziel die Sperre samt Grund — fürs Auswahlfeld', () => {
        const ziele = statusZiele('WIP', 'WERKSTUDENT');
        const je = new Map(ziele.map(z => [z.status, z]));
        expect(je.get('WIP').ok).toBe(true);           // der geltende bleibt wählbar
        expect(je.get('Shared').ok).toBe(true);
        expect(je.get('Published').ok).toBe(false);
        expect(je.get('Published').grund).toBeTruthy();
    });

    it('der Graph deckt jeden Status ab — kein Endzustand ohne Ausweg', () => {
        for (const status of ['WIP', 'Shared', 'Published', 'Archived']) {
            expect(Object.keys(STATUS_UEBERGAENGE[status] ?? {}).length).toBeGreaterThan(0);
        }
    });
});

describe('setDokumentStatus hält den Arbeitsfluss ein', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('der Sprung wird abgelehnt, der Grund steht bereit — der Weg über Stufen geht', async () => {
        const cde = useCdeStore();
        await cde.ready;
        await cde.registerModel({ name: 'K.ifc', sha256: 'aaa', size: 3, projectGlobalId: 'g' });

        expect(await cde.setDokumentStatus('aaa', 'Archived')).toBe(false);
        expect(cde.statusGrund).toContain('ISO-19650-Weg');
        expect(cde.dokumente.find(d => d.sha256 === 'aaa').status).toBe('WIP');

        expect(await cde.setDokumentStatus('aaa', 'Shared')).toBe(true);
        expect(cde.statusGrund).toBe('');
        expect(await cde.setDokumentStatus('aaa', 'Published')).toBe(true);
        expect(cde.dokumente.find(d => d.sha256 === 'aaa').status).toBe('Published');
    });
});
