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

describe('Netzfehler ist nicht „leer" (Tragfähig, T3)', () => {
    // `get` gibt bei einem Fehler null — wie bei einem fehlenden Schlüssel.
    // Scheiterte das ERSTE Laden, startete das Journal leer, und der nächste
    // Schritt schrieb „leer + neu" über den Serverstand. Gemessen wird, was
    // auf dem Server ankäme: die PUTs.
    const netzweg = () => { throw { response: { status: 502 }, message: 'Bad Gateway' }; };
    beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); });
    afterEach(() => repo.setBackend(null));

    async function backend(api) {
        const { RemoteBackend } = await import('../services/RepoFacade.js');
        const b = new RemoteBackend('p1');
        b._api = { put: vi.fn(async () => ({ data: { ok: true } })), delete: vi.fn(async () => ({ data: {} })), ...api };
        return b;
    }

    it('Erstladen scheitert: get null, das Backend sperrt sich, set schickt KEINEN PUT', async () => {
        const b = await backend({ get: vi.fn(async () => netzweg()) });
        expect(await b.get('ifc-repo:global:aenderungen')).toBeNull();
        expect(b._ladeFehler).toMatchObject({ status: 502 });
        expect(await b.set('ifc-repo:global:aenderungen', { version: 2 })).toBe(false);
        expect(await b.delete('ifc-repo:global:x')).toBe(false);
        expect(b._api.put).not.toHaveBeenCalled();
        expect(b._api.delete).not.toHaveBeenCalled();
        // Auch wenn das Netz zurückkommt: bis zum Neuladen der Seite bleibt es gesperrt.
        b._api.get = vi.fn(async () => ({ data: { aenderungen: { version: 2 } } }));
        expect(await b.set('ifc-repo:global:aenderungen', { version: 2 })).toBe(false);
        expect(b._api.put).not.toHaveBeenCalled();
        const { RepoFacade } = await import('../services/RepoFacade.js');
        expect(new RepoFacade('global', b).unerreichbar).toMatchObject({ status: 502, text: expect.any(String) });
    });

    it('das Journal liest dann nur, sagt warum, und schreibt nichts', async () => {
        const b = await backend({ get: vi.fn(async () => netzweg()) });
        repo.setBackend(b);
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.nurLesen).toMatchObject({ ebene: 'auftrag', grund: expect.stringMatching(/nicht erreichbar.*neu laden/) });
        const v = await ae.eintragenVorgang([{ art: 'kg', globalId: 'G1', nachher: '410' }]);
        expect(v.ok).toBe(false);
        expect(b._api.put).not.toHaveBeenCalled();
    });

    it('getFrisch scheitert nach gutem Laden: der Wächter liest es NICHT als „nichts da" — kein PUT', async () => {
        let weg = false;
        const b = await backend({ get: vi.fn(async () => (weg ? netzweg() : { data: {} })) });
        repo.setBackend(b);
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.nurLesen).toBeNull();
        weg = true;
        // Ein Netzfehler beim Sichern lässt den Schritt lokal stehen (so
        // entschieden; der nächste Schritt versucht es erneut) — aber der
        // Wächter wird nicht übersprungen: kein PUT ohne frischen Stand.
        await ae.eintragenVorgang([{ art: 'kg', globalId: 'G1', nachher: '410' }]);
        expect(ae.sicherFehler).toMatchObject({ ebene: 'auftrag', grund: expect.stringMatching(/502/) });
        expect(b._api.put).not.toHaveBeenCalled();
        // Der Cache blieb, wie er war — kein Nachladen im Kreis.
        expect(b._cache).toBeInstanceOf(Map);
    });

    it('ein gescheiterter PUT hinterlässt keinen Phantomwert im Cache', async () => {
        const b = await backend({ get: vi.fn(async () => ({ data: { 'global:x': 1 } })) });
        b._api.put = vi.fn(async () => { throw { response: { status: 500 }, message: 'kaputt' }; });
        expect(await b.set('ifc-repo:global:x', 2)).toBe(false);
        expect(await b.get('ifc-repo:global:x')).toBe(1);                         // vorher: 2 — nie auf dem Server
        b._api.delete = vi.fn(async () => { throw { response: { status: 500 } }; });
        expect(await b.delete('ifc-repo:global:x')).toBe(false);
        expect(await b.get('ifc-repo:global:x')).toBe(1);
    });

    it('eine unlesbare Journaldatei auf dem Server (T4): nur lesen, nichts überschreiben', async () => {
        const b = await backend({ get: vi.fn(async () => ({ data: { '@unlesbar': ['global:aenderungen'] } })) });
        repo.setBackend(b);
        const ae = useAenderungen();
        await ae.bereit;
        expect(ae.nurLesen).toMatchObject({ grund: expect.stringMatching(/unlesbar/) });
        expect(await b.get('ifc-repo:global:@unlesbar')).toBeNull();              // kein Schlüssel im Cache
        await ae.eintragenVorgang([{ art: 'kg', globalId: 'G1', nachher: '410' }]);
        expect(b._api.put).not.toHaveBeenCalled();
    });

    it('die Satz-Migration setzt ihre Marke nicht, wenn der Ordner unerreichbar war', async () => {
        const { RepoFacade } = await import('../services/RepoFacade.js');
        const { migriere } = await import('../services/SatzMigration.js');
        const b = await backend({ get: vi.fn(async () => netzweg()) });
        const bericht = await migriere({ repo: new RepoFacade('global', b), satzAnlegen: vi.fn() });
        expect(bericht.gelaufen).toBe(false);
        expect(bericht.fehler).toHaveLength(1);
        expect(b._api.put).not.toHaveBeenCalled();                                // vorher: Marke gesetzt, Migration nie wieder
    });
});
