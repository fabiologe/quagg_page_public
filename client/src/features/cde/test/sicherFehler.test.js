// @vitest-environment jsdom
/**
 * Ein gescheitertes Speichern des Verlaufs wird gesagt (Abnahme 2026-09-12).
 *
 * `RepoFacade.set` gibt bei einem Netzfehler `false`, und `_sichern` machte
 * stumm weiter: die Arbeit lag nur noch im Speicher, und niemand wusste es.
 * Jetzt steht es in `sicherFehler` (Viewer-Banner und Verlauf lesen es), und
 * der nächste gelungene Schritt räumt es wieder.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { repo } from '../services/RepoFacade.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.restoreAllMocks();
});

describe('sicherFehler', () => {
    it('ein abgelehntes Speichern steht da — der nächste gelungene Schritt räumt es', async () => {
        const ae = useAenderungen();
        vi.spyOn(repo, 'set').mockResolvedValueOnce(false);
        await ae.eintragen({ art: 'kg', globalId: 'G1', nachher: '410', wer: 'fabio' });
        expect(ae.sicherFehler).not.toBe(null);                                   // vorher: null, stumm
        await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '420', wer: 'fabio' });
        expect(ae.sicherFehler).toBe(null);
    });

    it('ein Wurf beim Speichern nennt seinen Grund', async () => {
        const ae = useAenderungen();
        vi.spyOn(repo, 'set').mockRejectedValueOnce(new Error('Network Error'));
        await ae.eintragen({ art: 'kg', globalId: 'G1', nachher: '410', wer: 'fabio' });
        expect(ae.sicherFehler).toMatchObject({ grund: 'Network Error' });
    });
});
