/**
 * Warum nichts passiert, muss dastehen (31.08.2026).
 *
 * Fabio öffnete `/cde` im Dev-Server ohne Anmeldung und meldete: „man kann
 * keine IFC ins Projekt laden — es passiert gar nichts". Das stimmte wörtlich.
 * Ohne Sitzung antwortet der Server auf jeden Projektzugriff mit 401, und der
 * Weg dahin verschluckte den Grund an DREI Stellen:
 *
 *   RepoFacade      catch → console.warn, `return false`
 *   _ablegen        `if (!ok) return;`
 *   registerModel   `.catch(() => { /* Register optional *\/ })`
 *
 * Jede einzelne Stelle war für sich begründbar — „die Arbeit soll nicht
 * abreißen". Zusammen ergaben sie einen Knopf, der nichts tut und nichts sagt.
 * Das ist schlimmer als ein Fehler: der Nutzer sucht ihn bei sich.
 *
 * Geprüft wird deshalb nicht, DASS es scheitert, sondern dass der GRUND
 * ankommt — und dass er handelbar ist: bei 401 steht die Abhilfe drin.
 */
import { describe, expect, it } from 'vitest';
import { fehlerLesbar } from '../services/RepoFacade.js';

const mitStatus = (status) => ({ response: { status } });

describe('fehlerLesbar — der Grund, nicht nur das Scheitern', () => {
    it('nennt bei 401 die Abhilfe, nicht nur den Zustand', () => {
        const r = fehlerLesbar(mitStatus(401));
        expect(r.status).toBe(401);
        expect(r.text).toMatch(/Nicht angemeldet/);
        expect(r.text).toMatch(/Sitzung/);
    });

    it('behandelt 403 wie 401 — für den Nutzer ist es dasselbe Problem', () => {
        expect(fehlerLesbar(mitStatus(403)).text).toMatch(/Nicht angemeldet/);
    });

    it('erklärt den 422 des Uploads in der Sprache des Nutzers', () => {
        // Der Server prüft beim Upload den NAMEN, nicht die Prüfsumme — der
        // Fall trifft jeden, der zweimal dieselbe Datei lädt.
        expect(fehlerLesbar(mitStatus(422)).text).toMatch(/gleicher Name/);
    });

    it('nennt einen unbekannten Status, statt ihn zu verschweigen', () => {
        expect(fehlerLesbar(mitStatus(500)).text).toMatch(/500/);
    });

    it('kommt auch ohne Antwort zurecht — Netz weg ist kein Status', () => {
        const r = fehlerLesbar(new Error('Network Error'));
        expect(r.status).toBe(null);
        expect(r.text).toMatch(/Network Error/);
    });

    it('erfindet nichts, wenn gar nichts da ist', () => {
        expect(fehlerLesbar(null).text).toBe('Kein Zugriff auf den Projektordner.');
    });
});

describe('Die Meldungen sind für Menschen geschrieben', () => {
    it('nennt keine Statuszahl, wo eine Handlung möglich ist', () => {
        // „401 Unauthorized" sagt einem Bauingenieur nichts. „Nicht angemeldet"
        // sagt ihm, was zu tun ist.
        expect(fehlerLesbar(mitStatus(401)).text).not.toMatch(/401|Unauthorized/);
    });

    it('endet jede Meldung als vollständiger Satz', () => {
        for (const s of [401, 403, 404, 422, 500, null]) {
            expect(fehlerLesbar(s ? mitStatus(s) : null).text).toMatch(/\.$/);
        }
    });
});
