/**
 * Der Draht der CDE zum Verbundexport — was wirklich an den Server geht.
 *
 * Geprüft wird die Form des Aufrufs, nicht ein Nachbau des Servers: dieselben
 * Felder und Pfade, die `router.py` erwartet (`satz_id`, `crs`, `projektname`
 * als Formularfelder, `eigenbau` als DATEI; Abholen unter
 * `/cde/verbund/<lauf_id>`; der Download über `/projects/file`). Die Gegenseite
 * steht in backend/app/api/projekt/tests/test_verbund_lauf.py — dort geht ein
 * echter Verbund durch denselben Endpunkt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aufrufe = vi.hoisted(() => []);

vi.mock('@/services/api', () => ({
  default: {
    post: vi.fn(async (url, body) => {
      aufrufe.push({ art: 'post', url, body });
      return { data: { lauf_id: 'v-1-abcdef', zustand: 'wartet', quellen: ['Kanal.ifc'] } };
    }),
    get: vi.fn(async (url, cfg) => {
      aufrufe.push({ art: 'get', url, cfg });
      if (url.includes('/cde/verbund/')) return { data: { zustand: 'laeuft', schritt: 'Kontexte vereinen' } };
      return { data: new Blob(['ISO-10303-21;']) };
    }),
  },
}));

import { AuftragApi } from '../services/AuftragApi.js';

beforeEach(() => { aufrufe.length = 0; });

describe('AuftragApi — Verbund', () => {
  it('stößt den Verbund mit dem Satz an — ohne Eigenbau kein Dateifeld', async () => {
    const antwort = await AuftragApi.verbundStarten(7, 's-abc');
    expect(antwort.lauf_id).toBe('v-1-abcdef');
    const [a] = aufrufe;
    expect(a.url).toBe('/projekte/7/cde/verbund');
    expect(a.body).toBeInstanceOf(FormData);
    expect(a.body.get('satz_id')).toBe('s-abc');
    expect(a.body.has('eigenbau')).toBe(false);
    expect(a.body.has('crs')).toBe(false);
  });

  it('schickt das Eigenbau-Paket als DATEI, das Projekt-CRS als Feld', async () => {
    const paket = { bauteile: [{ cdeId: 'cde-1', klasse: 'IFCEARTHWORKSCUT' }], crs: 'EPSG:31466' };
    await AuftragApi.verbundStarten(7, 's-abc', { eigenbau: paket, crs: 'EPSG:31466' });
    const form = aufrufe[0].body;
    expect(form.get('crs')).toBe('EPSG:31466');
    const datei = form.get('eigenbau');
    expect(datei.name).toBe('eigenbau.json');
    expect(JSON.parse(await datei.text())).toEqual(paket);
  });

  it('der Erdbau ist derselbe Draht mit `modus` — das Paket als Datei, der Modus als Feld (Stufe 3)', async () => {
    await AuftragApi.verbundStarten(7, 's-abc', { eigenbau: { version: 2, bauteile: [] }, modus: 'erdbau' });
    const form = aufrufe[0].body;
    expect(form.get('modus')).toBe('erdbau');
    expect(form.get('eigenbau').name).toBe('eigenbau.json');
    // Ohne Angabe fehlt das Feld — der Server nimmt dann `verbund`.
    aufrufe.length = 0;
    await AuftragApi.verbundStarten(7, 's-abc');
    expect(aufrufe[0].body.has('modus')).toBe(false);
  });

  it('holt den Lauf unter seiner Kennung ab', async () => {
    const st = await AuftragApi.verbundStatus(7, 'v-1-abcdef');
    expect(aufrufe[0].url).toBe('/projekte/7/cde/verbund/v-1-abcdef');
    expect(st.zustand).toBe('laeuft');
  });

  it('lädt die Verbunddatei über den Pfad aus dem Laufstatus', async () => {
    await AuftragApi.datei('00_Angebote/42069_BlazeIT/CDE/Verbund_Boden_R01.ifc');
    expect(aufrufe[0].url).toBe('/projects/file');
    expect(aufrufe[0].cfg).toEqual({
      params: { path: '00_Angebote/42069_BlazeIT/CDE/Verbund_Boden_R01.ifc' }, responseType: 'blob',
    });
  });

  it('S4 neu: die angehakten Modelle als JSON-Liste, Autor und Organisation als Felder — ohne Auswahl kein Feld', async () => {
    await AuftragApi.verbundStarten(7, 's-abc', { modelle: ['a'.repeat(64)], autor: 'Anna Muster', organisation: 'Büro Muster' });
    const form = aufrufe[0].body;
    expect(JSON.parse(form.get('modelle'))).toEqual(['a'.repeat(64)]);
    expect([form.get('autor'), form.get('organisation')]).toEqual(['Anna Muster', 'Büro Muster']);
    aufrufe.length = 0;
    await AuftragApi.verbundStarten(7, 's-abc');
    expect(['modelle', 'autor', 'organisation'].some(k => aufrufe[0].body.has(k))).toBe(false);
  });
});
