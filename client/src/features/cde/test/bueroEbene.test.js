// @vitest-environment jsdom
/**
 * Die Büro-Ebene (Sprint I, Stufe 6).
 *
 * Planköpfe, Blattformate, Linienstil-Presets, Symbolsätze, IDS-Regelwerke und
 * KG-Kennwerte sind Bürowissen, kein Projektwissen. Bis hierher lagen sie je
 * Projekt im Repo und fingen in jedem neuen Projekt bei null an.
 *
 * Die Ebene liegt NEBEN dem Projekt-Repository, nicht darin — deshalb ein
 * eigenes Backend und kein weiterer Scope. `RemoteBackend` ist fest an eine
 * Projektnummer gebunden; ein Scope hätte daran nichts geändert.
 *
 * Der Kern ist die Vorrangregel. Sie steht als reine Funktion da, damit sie
 * ohne Backend prüfbar ist und an genau EINER Stelle lebt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BueroBackend, RepoFacade, waehleMitVorrang, repo } from '../services/RepoFacade';
import { usePlan } from '../stores/usePlan';

/** Fake-Axios für die Büroablage. */
function fakeApi(anfang = {}) {
  const daten = { ...anfang };
  return {
    daten,
    get: vi.fn(async (url) => {
      if (url === '/buero/cde/repo') return { data: daten };
      throw new Error(`unbekannt ${url}`);
    }),
    put: vi.fn(async (url, wert) => {
      daten[decodeURIComponent(url.split('/').pop())] = wert;
      return { data: { ok: true } };
    }),
    delete: vi.fn(async (url) => {
      delete daten[decodeURIComponent(url.split('/').pop())];
      return { data: { ok: true } };
    }),
  };
}

beforeEach(() => {
  localStorage.clear();
  repo.setBackend(null);
  repo.setBueroBackend(null);
  setActivePinia(createPinia());
});

describe('waehleMitVorrang', () => {
  it('Projekt schlägt Büro schlägt Standard', () => {
    expect(waehleMitVorrang('p', 'b', 's')).toBe('p');
    expect(waehleMitVorrang(null, 'b', 's')).toBe('b');
    expect(waehleMitVorrang(null, null, 's')).toBe('s');
    expect(waehleMitVorrang(undefined, undefined, 's')).toBe('s');
  });

  it('unterscheidet „nicht gesetzt" von „bewusst leer"', () => {
    // Wer die Linienstile eines Projekts auf nichts setzt, will nicht die
    // Bürostile zurückbekommen. Nur null und undefined heißen „nicht gesetzt".
    expect(waehleMitVorrang([], ['buero'], null)).toEqual([]);
    expect(waehleMitVorrang({}, { a: 1 }, null)).toEqual({});
    expect(waehleMitVorrang(0, 42, null)).toBe(0);
    expect(waehleMitVorrang(false, true, null)).toBe(false);
    expect(waehleMitVorrang('', 'buero', null)).toBe('');
  });

  it('kommt ohne Standard aus', () => {
    expect(waehleMitVorrang(null, null)).toBeNull();
  });
});

describe('BueroBackend', () => {
  it('liest, schreibt und löscht über /buero/cde/repo', async () => {
    const api = fakeApi({ 'plankopf-vorlagen': [{ name: 'A3 quer' }] });
    const b = new RepoFacade('global', new BueroBackend(api));

    expect(await b.get('plankopf-vorlagen')).toEqual([{ name: 'A3 quer' }]);
    expect(await b.get('gibtsnicht')).toBeNull();

    expect(await b.set('linienstile', { IFCWALL: { w: 0.35 } })).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/buero/cde/repo/linienstile', { IFCWALL: { w: 0.35 } });
    expect(await b.get('linienstile')).toEqual({ IFCWALL: { w: 0.35 } });

    expect(await b.delete('linienstile')).toBe(true);
    expect(await b.get('linienstile')).toBeNull();
  });

  it('schneidet den Scope ab — die Büroablage hat nur eine Ebene', async () => {
    // Im Projekt heißt der Schlüssel `project:p123:linienstile`. Im Büro wäre
    // ein Projekt-Namensraum sinnlos und stünde nur im Dateinamen.
    const api = fakeApi();
    const b = new RepoFacade('global', new BueroBackend(api));
    await b.set('linienstile', 1);
    expect(api.put).toHaveBeenCalledWith('/buero/cde/repo/linienstile', 1);
    expect(Object.keys(api.daten)).toEqual(['linienstile']);
  });

  it('lädt genau einmal und bedient danach aus dem Speicher', async () => {
    const api = fakeApi({ a: 1, b: 2 });
    const b = new RepoFacade('global', new BueroBackend(api));
    await b.get('a'); await b.get('b'); await b.get('a');
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('führt keine Modelle — die gehören zu einem Projekt', async () => {
    const b = new RepoFacade('global', new BueroBackend(fakeApi()));
    expect(await b.listBlobs('model:')).toEqual([]);
    expect(await b.getBlob('model:abc')).toBeNull();
    expect(await b.setBlob('model:abc', new Blob(['x']))).toBe(false);
  });

  it('bleibt still, wenn das Netz fehlt', async () => {
    // Ohne Büroablage fällt die Vorrangregel auf den Standard — kein Fehler,
    // Büroeinstellungen sind nichts, was ein einzelner Browser halten sollte.
    const kaputt = { get: vi.fn(async () => { throw new Error('offline'); }) };
    const b = new RepoFacade('global', new BueroBackend(kaputt));
    expect(await b.get('plankopf-vorlagen')).toBeNull();
  });
});

describe('Die Fassade führt zwei Ränge', () => {
  it('mitVorrang fragt beide Ebenen und wendet die Regel an', async () => {
    repo.setBueroBackend(new BueroBackend(fakeApi({ linienstile: { quelle: 'buero' } })));

    // Nur Büro gesetzt → Büro gewinnt.
    expect(await repo.mitVorrang('linienstile', { quelle: 'standard' })).toEqual({ quelle: 'buero' });

    // Projektwert dazu → Projekt gewinnt.
    await repo.set('linienstile', { quelle: 'projekt' });
    expect(await repo.mitVorrang('linienstile', { quelle: 'standard' })).toEqual({ quelle: 'projekt' });

    // Projektwert weg → wieder Büro.
    await repo.delete('linienstile');
    expect(await repo.mitVorrang('linienstile', { quelle: 'standard' })).toEqual({ quelle: 'buero' });
  });

  it('fällt ohne Büroablage auf den Standard', async () => {
    expect(repo.buero).toBeNull();
    expect(await repo.mitVorrang('gibtsnicht', 'standard')).toBe('standard');
  });

  it('reicht die Büroebene an Geschwister-Scopes weiter', async () => {
    // Sonst verlöre ein Aufruf im Projekt-Scope (`project:<id>`) den
    // Vorrang-Rückfall — und genau dort liegen die Dokumente.
    repo.setBueroBackend(new BueroBackend(fakeApi({ x: 'buero' })));
    const projekt = repo.withScope('project:p123');
    expect(projekt.buero).not.toBeNull();
    expect(await projekt.mitVorrang('x', 'standard')).toBe('buero');
  });
});

describe('Plan-Vorgaben aus dem Büro', () => {
  it('lädt Blattgewohnheiten aus dem Büro, wenn das Projekt keine hat', async () => {
    repo.setBueroBackend(new BueroBackend(fakeApi({
      'plan-schriftfeld': { firma: 'Quagg Engineering', bearbeiter: '' },
      'plan-logo': 'data:image/png;base64,AAA',
    })));
    const plan = usePlan();
    await plan.bereit;
    expect(plan.schriftfeld.firma).toBe('Quagg Engineering');
    expect(plan.logo).toBe('data:image/png;base64,AAA');
  });

  it('übernimmt den aktuellen Stand als Bürovorgabe', async () => {
    const api = fakeApi();
    repo.setBueroBackend(new BueroBackend(api));
    const plan = usePlan();
    await plan.bereit;
    plan.setzeSchriftfeld({ firma: 'Quagg Engineering' });

    expect(await plan.alsBuerovorgabe()).toBe(true);
    expect(api.daten['plan-schriftfeld'].firma).toBe('Quagg Engineering');
  });

  it('meldet ehrlich, wenn keine Büroablage da ist', async () => {
    const plan = usePlan();
    await plan.bereit;
    expect(await plan.alsBuerovorgabe()).toBe(false);
  });

  it('kommt über „verwerfen" zur Bürovorgabe zurück', async () => {
    // Solange ein Projektwert steht, ist die Bürovorgabe unsichtbar. Ohne
    // diesen Weg käme man nie zu ihr zurück.
    repo.setBueroBackend(new BueroBackend(fakeApi({
      'plan-schriftfeld': { firma: 'Büro-Firma' },
    })));
    const plan = usePlan();
    await plan.bereit;
    expect(plan.schriftfeld.firma).toBe('Büro-Firma');

    plan.setzeSchriftfeld({ firma: 'Projekt-Firma' });
    await plan.bereit;
    expect(plan.schriftfeld.firma).toBe('Projekt-Firma');

    await plan.zurueckAufBuero();
    expect(plan.schriftfeld.firma).toBe('Büro-Firma');
  });
});
