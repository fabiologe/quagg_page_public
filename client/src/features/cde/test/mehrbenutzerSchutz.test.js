// @vitest-environment jsdom
/**
 * Der Mehrbenutzer-Wächter (Lücke ⑥, 2026-09-02).
 *
 * Zwei Leute im selben Auftrag, und der Zweite überschrieb still die Commits
 * des Ersten — „letzter gewinnt" auf Datei-Ebene, ohne dass es jemand sah.
 * Jetzt trägt jede gesicherte Nutzlast einen `schreibstand` {zaehler, marke,
 * wer, wann}; vor dem Sichern wird der Ablagestand FRISCH gelesen, und ein
 * höherer Zähler mit fremder Marke VERWEIGERT die Schreibung: die fremde
 * Arbeit bleibt, die eigene bleibt lokal, der Konflikt steht sichtbar da.
 *
 * Getestet am localStorage-Backend — es hat keinen Cache, also sieht der
 * frische Lesezugriff die „fremde" Schreibung, die der Test direkt in den
 * Speicher legt. Für das Server-Backend prüft ein eigener Fall, dass
 * `getFrisch` den Cache wirklich verwirft (sonst sähe der Wächter NIE etwas).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { repo } from '../services/RepoFacade.js';

const SCHLUESSEL = 'ifc-repo:global:aenderungen';

function gespeichert() {
    return JSON.parse(localStorage.getItem(SCHLUESSEL));
}

describe('schreibstand an der Nutzlast', () => {
    beforeEach(() => {
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('jede Sicherung zählt hoch und trägt die eigene Marke', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'G1', nachher: '410', wer: 'fabio' });
        const s1 = gespeichert();
        expect(s1.schreibstand.zaehler).toBe(1);
        expect(s1.schreibstand.marke).toBeTruthy();
        expect(s1.schreibstand.wer).toBe('fabio');

        await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '420', wer: 'fabio' });
        const s2 = gespeichert();
        expect(s2.schreibstand.zaehler).toBe(2);
        expect(s2.schreibstand.marke).toBe(s1.schreibstand.marke);
        expect(ae.schreibKonflikt).toBeNull();
    });

    it('ein FREMDER neuerer Stand verweigert das Sichern — und überschreibt nichts', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'G1', nachher: '410', wer: 'fabio' });

        // Die Kollegin schreibt dazwischen: höherer Zähler, andere Marke.
        const fremd = {
            version: 2, commits: [], sitzung: null,
            schreibstand: { zaehler: 7, marke: 'FREMD', wer: 'petra', wann: 1234 },
        };
        localStorage.setItem(SCHLUESSEL, JSON.stringify(fremd));

        await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '420', wer: 'fabio' });

        // Der fremde Stand steht UNVERÄNDERT in der Ablage …
        expect(gespeichert()).toEqual(fremd);
        // … der eigene Schritt lebt lokal weiter …
        expect(new Map(ae.wirksamerStand('kg')).get('G2')).toBe('420');
        // … und der Konflikt ist sichtbar, nicht still.
        expect(ae.schreibKonflikt).toMatchObject({ wer: 'petra', wann: 1234 });
    });

    it('der eigene ältere Stand sperrt NICHT — auch nach F5 (Marke neu, Zähler übernommen)', async () => {
        const ae = useAenderungen();
        await ae.eintragen({ art: 'kg', globalId: 'G1', nachher: '410', wer: 'fabio' });
        const vorher = gespeichert();

        // Neue Browser-Sitzung: neue Pinia, neue Marke — aber derselbe Stand.
        setActivePinia(createPinia());
        const ae2 = useAenderungen();
        await ae2.bereit;
        await ae2.eintragen({ art: 'kg', globalId: 'G2', nachher: '420', wer: 'fabio' });
        const nachher = gespeichert();
        expect(nachher.schreibstand.zaehler).toBe(vorher.schreibstand.zaehler + 1);
        expect(ae2.schreibKonflikt).toBeNull();
    });

    it('ein Stand OHNE schreibstand (v1/Altbestand) sperrt nichts', async () => {
        localStorage.setItem(SCHLUESSEL, JSON.stringify({ version: 2, commits: [], sitzung: null }));
        const ae = useAenderungen();
        await ae.bereit;
        await ae.eintragen({ art: 'kg', globalId: 'G1', nachher: '410' });
        expect(gespeichert().schreibstand.zaehler).toBe(1);
        expect(ae.schreibKonflikt).toBeNull();
    });
});

describe('getFrisch am Server-Backend', () => {
    it('verwirft den Cache — sonst sähe der Wächter fremde Schreibungen NIE', async () => {
        // Die Fassade reicht getFrisch nur durch, wenn das Backend es kann;
        // localStorage/IndexedDB fallen auf `get` zurück.
        expect(typeof repo.getFrisch).toBe('function');

        const { RemoteBackend } = await import('../services/RepoFacade.js');
        const b = new RemoteBackend('p1');
        let stand = { aenderungen: { schreibstand: { zaehler: 1 } } };
        b._api = { get: vi.fn(async () => ({ data: stand })), put: vi.fn(), delete: vi.fn() };

        expect((await b.get('ifc-repo:aenderungen')).schreibstand.zaehler).toBe(1);
        // Der Server bewegt sich — der gecachte `get` sieht es nicht …
        stand = { aenderungen: { schreibstand: { zaehler: 5 } } };
        expect((await b.get('ifc-repo:aenderungen')).schreibstand.zaehler).toBe(1);
        // … `getFrisch` schon.
        expect((await b.getFrisch('ifc-repo:aenderungen')).schreibstand.zaehler).toBe(5);
    });
});
