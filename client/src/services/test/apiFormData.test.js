// @vitest-environment jsdom
/**
 * FormData durch die zentrale api-Instanz (31.08.2026).
 *
 * DER FEHLER: Die Instanz setzt `Content-Type: application/json` als Vorgabe.
 * axios 1.x wertet das in `transformRequest` aus und macht bei JSON-Header aus
 * einer FormData per `formDataToJSON` ein JSON-Objekt — die Datei wird darin zu
 * `{}`. Der Server sieht keinen multipart-Rumpf und meldet
 * `{"type":"missing","loc":["body","datei"],"msg":"Field required"}`.
 *
 * So ist der IFC-Upload in der Projekt-Akte gescheitert. Betroffen waren drei
 * Aufrufer (ProjekteApi.cdeHochladen, RepoFacade.setBlob,
 * PedantApi.belegHochladen); drei weitere hatten es je einzeln umschifft, indem
 * sie den Header selbst setzten. Einer davon trug den Kommentar „Content-Type
 * bewusst NICHT setzen — Axios erzeugt den multipart-Boundary selbst". Das
 * stimmt nur, solange keine JSON-Vorgabe im Weg steht.
 *
 * Der zweite Teil dieser Datei ist der wichtigere: die Kur darf die Aufrufer
 * NICHT anfassen, die ihren Content-Type absichtlich setzen. Der Login schickt
 * `x-www-form-urlencoded` — würde der mit entfernt, käme niemand mehr herein.
 */
import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { entferneJsonVorgabeBeiFormData } from '../api';

/** Ein Konfigurationsobjekt wie im Interceptor: headers sind AxiosHeaders. */
function konfig(data, headers = {}) {
    return { data, headers: axios.AxiosHeaders.from(headers) };
}

function contentType(config) {
    return config.headers.get('Content-Type') ?? null;
}

const formDataMitDatei = () => {
    const fd = new FormData();
    fd.append('datei', new Blob(['ISO-10303-21;'], { type: 'application/octet-stream' }), 'Kanal.ifc');
    return fd;
};

describe('Die JSON-Vorgabe weicht der FormData', () => {
    it('entfernt application/json, wenn der Rumpf eine FormData ist', () => {
        const c = konfig(formDataMitDatei(), { 'Content-Type': 'application/json' });
        entferneJsonVorgabeBeiFormData(c);
        expect(contentType(c)).toBe(null);
    });

    it('lässt eine FormData ohne Header in Ruhe — da ist nichts zu entfernen', () => {
        const c = konfig(formDataMitDatei());
        entferneJsonVorgabeBeiFormData(c);
        expect(contentType(c)).toBe(null);
    });

    it('rührt gewöhnliche JSON-Anfragen nicht an', () => {
        const c = konfig({ name: 'Projekt' }, { 'Content-Type': 'application/json' });
        entferneJsonVorgabeBeiFormData(c);
        expect(contentType(c)).toBe('application/json');
    });

    it('erträgt eine Anfrage ganz ohne Rumpf', () => {
        expect(() => entferneJsonVorgabeBeiFormData(konfig(undefined))).not.toThrow();
        expect(() => entferneJsonVorgabeBeiFormData(null)).not.toThrow();
    });
});

describe('Absichtlich gesetzte Header bleiben — sonst bricht die Anmeldung', () => {
    it('lässt x-www-form-urlencoded stehen (Login)', () => {
        const c = konfig(formDataMitDatei(), { 'Content-Type': 'application/x-www-form-urlencoded' });
        entferneJsonVorgabeBeiFormData(c);
        expect(contentType(c)).toBe('application/x-www-form-urlencoded');
    });

    it('lässt multipart/form-data stehen (DocReader, documentApi)', () => {
        const c = konfig(formDataMitDatei(), { 'Content-Type': 'multipart/form-data' });
        entferneJsonVorgabeBeiFormData(c);
        expect(contentType(c)).toBe('multipart/form-data');
    });
});

describe('Und jetzt das, worauf es wirklich ankommt', () => {
    /** axios' eigene Umwandlung — die Stelle, an der die Datei verschwand. */
    const umwandeln = (config) => {
        const t = axios.defaults.transformRequest[0];
        return t.call({ headers: config.headers }, config.data, config.headers);
    };

    it('BEWEIS des Fehlers: mit JSON-Vorgabe wird die Datei zu {}', () => {
        const c = konfig(formDataMitDatei(), { 'Content-Type': 'application/json' });
        const rumpf = umwandeln(c);
        expect(typeof rumpf).toBe('string');
        expect(JSON.parse(rumpf)).toEqual({ datei: {} });
    });

    it('BEWEIS der Kur: danach geht die FormData unverändert hinaus', () => {
        const c = konfig(formDataMitDatei(), { 'Content-Type': 'application/json' });
        entferneJsonVorgabeBeiFormData(c);
        expect(umwandeln(c)).toBe(c.data);
    });
});
