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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

        const drin = await ae.eintragen({ art: 'kg', globalId: 'G2', nachher: '420', wer: 'fabio' });

        // Der fremde Stand steht UNVERÄNDERT in der Ablage …
        expect(gespeichert()).toEqual(fremd);
        // … der eigene Schritt ist ABGELEHNT, nicht still lokal (Teil XXIV, K2 —
        // Fabios E5: der Mehrbenutzer-Wächter darf ablehnen, und ein Vorgang gilt
        // ganz oder gar nicht). Bis K2 lebte er lokal weiter und ging beim
        // Neuladen verloren, ohne dass es jemand gesagt hätte …
        expect(drin).toBeNull();
        expect(new Map(ae.wirksamerStand('kg')).has('G2')).toBe(false);
        expect(new Map(ae.wirksamerStand('kg')).get('G1')).toBe('410');
        // … und der Konflikt ist sichtbar, nicht still.
        expect(ae.schreibKonflikt).toMatchObject({ wer: 'petra', wann: 1234 });
        const v = await ae.eintragenVorgang([{ art: 'kg', globalId: 'G3', nachher: '430' }]);
        expect(v).toMatchObject({ ok: false, eintraege: [] });
        expect(v.grund).toMatch(/petra hat den Verlauf inzwischen geändert/);
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

describe('der Server-Wächter für mindestClient (Teil XXIV, Fahrplan R9)', () => {
    // Der Server lehnt ein Journal ab, dessen `mindestClient` unter dem
    // gespeicherten liegt (409). Der Client nimmt das wie die Verweigerung des
    // Mehrbenutzer-Wächters: der Vorgang gilt nicht, der Grund steht da — und
    // ab jetzt liest dieser Tab nur. Ein Netzfehler bleibt ein Netzfehler.
    const ablehnung = { response: { status: 409, data: { detail: 'Journal global:aenderungen: gespeichert fuer Clients ab Stufe 4 … Bitte die Seite neu laden.' } } };
    function server({ put }) {
        return { get: vi.fn(async () => ({ data: {} })), put: vi.fn(put), delete: vi.fn() };
    }
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));

    it('409 vom Server: der Vorgang ist abgelehnt, der Tab liest nur — nichts bleibt lokal', async () => {
        const { RemoteBackend } = await import('../services/RepoFacade.js');
        const b = new RemoteBackend('p1');
        b._api = server({ put: async (url) => { if (/aenderungen/.test(url)) throw ablehnung; return { data: { ok: true } }; } });
        repo.setBackend(b);
        const ae = useAenderungen();
        await ae.bereit;
        const v = await ae.eintragenVorgang([{ art: 'kg', globalId: 'G1', nachher: '410' }]);
        expect(v).toMatchObject({ ok: false, eintraege: [] });                    // vorher: ok, und der Schritt lebte nur lokal
        expect(v.grund).toMatch(/Server hat das Sichern abgelehnt.*neu laden/);
        expect(new Map(ae.wirksamerStand('kg')).has('G1')).toBe(false);
        expect(ae.nurLesen).toMatchObject({ ebene: 'auftrag' });
        // Der nächste Vorgang kommt gar nicht erst bis zum Server.
        const puts = b._api.put.mock.calls.length;
        expect((await ae.eintragenVorgang([{ art: 'kg', globalId: 'G2', nachher: '420' }])).ok).toBe(false);
        expect(b._api.put.mock.calls.length).toBe(puts);
    });

    it('ein Netzfehler (500) bleibt, was er war: kein „nur lesen"', async () => {
        const { RemoteBackend } = await import('../services/RepoFacade.js');
        const b = new RemoteBackend('p1');
        b._api = server({ put: async () => { throw { response: { status: 500 }, message: 'kaputt' }; } });
        expect(await b.set('ifc-repo:global:aenderungen', { version: 2 })).toBe(false);
        b._api = server({ put: async () => { throw ablehnung; } });
        expect(await b.set('ifc-repo:global:aenderungen', { version: 2 })).toEqual({ abgelehnt: expect.stringMatching(/Stufe 4/) });
    });
});
