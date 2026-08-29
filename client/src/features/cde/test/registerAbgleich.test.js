/**
 * Ein Register, nicht zwei.
 *
 * Befund vom 29.08.2026: Beim Laden eines Modells schrieben ZWEI Wege in
 * denselben Projektordner — `repo.setBlob` lud die Datei hoch und trug sie
 * ins `CDE/manifest.yaml` ein, `cde.registerModel` legte daneben einen
 * eigenen Eintrag in `CDE/_repo/…dokumente.json` an, hart mit `status: 'WIP'`.
 *
 * Die sichtbare Folge: `resolveWatermarkText` liest das Client-Register.
 * Ein im Projekt-Cockpit auf *Published* gesetzter Plan (= kein Wasserzeichen)
 * bekam im Viewer-PDF trotzdem „VORABZUG" gestempelt. Ein falsches Blatt ging
 * raus, ohne dass irgendetwas meldete.
 *
 * Diese Tests halten fest, dass bei aktivem Server-Backend das Manifest die
 * Wahrheit ist — und dass die Übersetzung zwischen beiden Feldsätzen an genau
 * einer Stelle steht.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCdeStore } from '../stores/useCdeStore.js';
import { repo } from '../services/RepoFacade.js';
import { RemoteBackend, RepoFacade, dokumentAusManifest } from '../services/RepoFacade.js';
import { resolveWatermarkText } from '../stores/useCdeStore.js';

beforeEach(() => {
  localStorage.clear();
  repo.setBackend(null);
  setActivePinia(createPinia());
});

/** Ein Manifest-Eintrag, wie ihn `core/cde.py` schreibt. */
function eintrag(over = {}) {
  return {
    sha256: 'aaa', datei: 'Kanal_R02.ifc', basisname: 'Kanal', art: 'modell',
    revision: 2, status: 'Published', groesse: 4096, von: 'fabio',
    hochgeladen_am: '2026-08-25T10:00:00+00:00',
    projekt_global_id: '0aB$cd12345678901234',
    status_historie: [
      { status: 'WIP', von: 'fabio', am: '2026-08-25T10:00:00+00:00' },
      { status: 'Published', von: 'fabio', am: '2026-08-26T08:00:00+00:00' },
    ],
    vorhanden: true, pfad: 'CDE/Kanal_R02.ifc',
    ...over,
  };
}

function fakeApi(dokumente) {
  const register = { basis: '01_Laufend/1338_Kanal', dokumente };
  return {
    register,
    get: vi.fn(async (url) => {
      if (url.endsWith('/cde/repo')) return { data: {} };
      if (url.endsWith('/cde')) return { data: register };
      throw new Error(`unbekannt ${url}`);
    }),
    put: vi.fn(async (url, body) => {
      const sha = url.split('/cde/')[1].split('/')[0];
      const d = register.dokumente.find((x) => x.sha256 === sha);
      if (d) d.status = body.status;
      return { data: { ok: true } };
    }),
    delete: vi.fn(async (url) => {
      const sha = url.split('/cde/')[1];
      register.dokumente = register.dokumente.filter((x) => x.sha256 !== sha);
      return { data: { ok: true } };
    }),
    post: vi.fn(async () => ({ data: {} })),
  };
}

describe('Übersetzung Manifest → Viewer', () => {
  it('bildet jedes Feld ab, das der Viewer führt', () => {
    const d = dokumentAusManifest(eintrag());
    expect(d).toMatchObject({
      sha256: 'aaa', name: 'Kanal_R02.ifc', size: 4096,
      status: 'Published', revision: 2, art: 'modell', basisname: 'Kanal',
      von: 'fabio', vorhanden: true, projectGlobalId: '0aB$cd12345678901234',
    });
  });

  it('rechnet die Zeit in die Form um, die der Viewer sortiert', () => {
    // Das Manifest schreibt ISO-Strings, der Viewer rechnet in ms-Epoche.
    // Ohne Umrechnung sortiert das Dokumentregister nach NaN.
    const d = dokumentAusManifest(eintrag());
    expect(d.addedAt).toBe(Date.parse('2026-08-25T10:00:00+00:00'));
    expect(Number.isFinite(d.addedAt)).toBe(true);
    expect(d.statusHistorie.map((h) => h.status)).toEqual(['WIP', 'Published']);
    expect(Number.isFinite(d.statusHistorie[0].am)).toBe(true);
  });

  it('überlebt ein Manifest ohne die neuen Felder', () => {
    // Manifeste, die vor projekt_global_id geschrieben wurden, gibt es
    // bereits auf der Platte.
    const d = dokumentAusManifest({ sha256: 'x', datei: 'Alt.ifc' });
    expect(d.projectGlobalId).toBeNull();
    expect(d.status).toBe('WIP');
    expect(d.revision).toBe(1);
    expect(d.statusHistorie).toEqual([]);
  });
});

describe('Das Wasserzeichen folgt dem Server', () => {
  it('stempelt einen freigegebenen Plan NICHT mit VORABZUG', async () => {
    // Der eigentliche Befund. Vorher: der Client legte beim Laden einen
    // eigenen Eintrag mit status 'WIP' an, und daraus las das Wasserzeichen.
    const api = fakeApi([eintrag({ status: 'Published' })]);
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));

    const vomServer = await repo.dokumente();
    expect(vomServer).toHaveLength(1);
    expect(resolveWatermarkText(vomServer, 'aaa')).toBeNull();
  });

  it('stempelt einen Vorabzug weiterhin', async () => {
    const api = fakeApi([eintrag({ status: 'WIP' })]);
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));
    expect(resolveWatermarkText(await repo.dokumente(), 'aaa')).toBe('VORABZUG');
  });

  it('bleibt bei einem unbekannten Modell konservativ', () => {
    expect(resolveWatermarkText([], 'unbekannt')).toBe('VORABZUG');
  });
});

describe('Statuswechsel und Entfernen gehen an den Server', () => {
  it('setzt den Status über PUT und liest danach neu', async () => {
    const api = fakeApi([eintrag({ status: 'WIP' })]);
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));

    expect(await repo.setzeStatus('aaa', 'Shared')).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/projekte/1338/cde/aaa/status', { status: 'Shared' });
    // Der Cache muss verworfen sein, sonst zeigt der Viewer den alten Stand.
    expect((await repo.dokumente())[0].status).toBe('Shared');
  });

  it('entfernt über DELETE — den Weg gab es serverseitig gar nicht', async () => {
    const api = fakeApi([eintrag()]);
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));

    expect(await repo.entferne('aaa')).toBe(true);
    expect(api.delete).toHaveBeenCalledWith('/projekte/1338/cde/aaa');
    expect(await repo.dokumente()).toEqual([]);
  });
});

describe('Ohne Server-Backend bleibt die lokale Liste das Register', () => {
  it('meldet kein Server-Register', async () => {
    // Arbeit ohne Netz: dort gibt es kein Manifest, an dem man sich
    // ausrichten könnte. Der Store muss das unterscheiden können.
    const repo = new RepoFacade('global');
    expect(await repo.dokumente()).toBeNull();
    expect(await repo.setzeStatus('aaa', 'Shared')).toBe(false);
    expect(await repo.entferne('aaa')).toBe(false);
    expect(repo.remote).toBe(false);
  });
});

describe('Ein abgelehnter Upload verschwindet nicht mehr', () => {
  it('reicht die 422-Begründung des Servers durch', async () => {
    // Der Server weist einen zweiten Upload GLEICHEN NAMENS ab — er prüft den
    // Namen, nicht die Prüfsumme. Vorher endete das in einem console.warn:
    // der Upload scheiterte, das Modell landete trotzdem im lokalen Register,
    // und die beiden liefen auseinander.
    const api = fakeApi([]);
    api.post = vi.fn(async () => {
      const e = new Error('Request failed');
      e.response = { status: 422, data: { detail: 'Kanal.ifc liegt bereits in CDE/' } };
      throw e;
    });
    const backend = new RemoteBackend(1338, api);
    await expect(
      backend.setBlob('ifc-repo:global:model:zzz', new Blob(['x']), { name: 'Kanal.ifc' }),
    ).rejects.toMatchObject({ name: 'CdeUploadAbgelehnt', message: 'Kanal.ifc liegt bereits in CDE/' });
  });

  it('gibt die IFCPROJECT-GlobalId mit hoch', async () => {
    // Sie zählt keine Revisionen (das tut der Dateiname), sagt aber, welche
    // Dateien dasselbe Ursprungsmodell meinen — Grundlage für Modellvergleich.
    const api = fakeApi([]);
    const backend = new RemoteBackend(1338, api);
    await backend.setBlob('ifc-repo:global:model:zzz', new Blob(['x']),
      { name: 'Neu.ifc', projectGlobalId: '0aB$cd12345678901234' });
    const cfg = api.post.mock.calls[0][2];
    expect(cfg.params).toMatchObject({ status: 'WIP', projekt_global_id: '0aB$cd12345678901234' });
  });
});


describe('Der Store führt EINE Liste, nicht zwei', () => {
  it('liest das Register neu, statt einen zweiten WIP-Eintrag anzulegen', async () => {
    // Der Kern des Befunds — und er zeigt sich NUR im echten Ablauf:
    //
    //   _loadBuffer -> _persistModelBlob (Upload, Server traegt ein)
    //               -> cde.registerModel (…und was macht der?)
    //
    // Beim registerModel ist die zuletzt geladene Liste also VERALTET: die
    // Datei liegt schon im Manifest, der Viewer weiss davon noch nichts.
    // Vorher legte er daraufhin einen eigenen Eintrag mit `status: 'WIP'` an,
    // und genau der speiste das Wasserzeichen im Export — auch wenn der Plan
    // im Cockpit laengst freigegeben war.
    //
    // (Ein Test, bei dem die Liste schon aktuell ist, beweist hier nichts: er
    //  bliebe auch ohne die Kur gruen, weil registerModel den Eintrag dann
    //  einfach findet.)
    const api = fakeApi([]);                       // Register anfangs LEER
    repo.setBackend(new RemoteBackend(1338, api));

    const cde = useCdeStore();
    await cde.ready;
    await cde.setActiveProject(await cde.createProject({ nummer: '1338', name: 'Kanal' }));
    expect(cde.dokumente).toEqual([]);

    // Der Server bekommt die Datei (so, wie es _persistModelBlob tut) …
    api.register.dokumente.push(eintrag({ status: 'Published' }));

    // … und jetzt meldet der Viewer das geladene Modell an.
    const doc = await cde.registerModel({
      sha256: 'aaa', name: 'Kanal_R02.ifc', size: 4096,
      projectGlobalId: '0aB$cd12345678901234',
    });

    expect(cde.dokumente).toHaveLength(1);
    expect(doc?.status).toBe('Published');          // vom Server, nicht 'WIP'
    expect(doc?.revision).toBe(2);                  // Serverzaehlung, nicht 1
    expect(resolveWatermarkText(cde.dokumente, 'aaa')).toBeNull();
  });

  it('schreibt mit Server-Backend keine eigene dokumente-Datei', async () => {
    // Die zweite Liste lag als CDE/_repo/project:<id>:dokumente.json NEBEN
    // dem Manifest, im selben Ordner, über dieselben Dateien.
    const api = fakeApi([eintrag()]);
    repo.setBackend(new RemoteBackend(1338, api));

    const cde = useCdeStore();
    await cde.ready;
    await cde.setActiveProject(await cde.createProject({ nummer: '1338', name: 'Kanal' }));
    await cde.registerModel({ sha256: 'aaa', name: 'Kanal_R02.ifc' });

    const geschrieben = api.put.mock.calls.map((c) => c[0]);
    expect(geschrieben.filter((u) => u.includes('dokumente'))).toEqual([]);
  });

  it('reicht den Statuswechsel an den Server durch', async () => {
    const api = fakeApi([eintrag({ status: 'WIP' })]);
    repo.setBackend(new RemoteBackend(1338, api));

    const cde = useCdeStore();
    await cde.ready;
    await cde.setActiveProject(await cde.createProject({ nummer: '1338', name: 'Kanal' }));

    expect(await cde.setDokumentStatus('aaa', 'Shared')).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/projekte/1338/cde/aaa/status', { status: 'Shared' });
    expect(cde.dokumente[0].status).toBe('Shared');
  });

  it('entfernt über den Server statt nur aus der eigenen Liste', async () => {
    const api = fakeApi([eintrag()]);
    repo.setBackend(new RemoteBackend(1338, api));

    const cde = useCdeStore();
    await cde.ready;
    await cde.setActiveProject(await cde.createProject({ nummer: '1338', name: 'Kanal' }));

    expect(await cde.removeDokument('aaa')).toBe(true);
    expect(api.delete).toHaveBeenCalledWith('/projekte/1338/cde/aaa');
    expect(cde.dokumente).toEqual([]);
  });

  it('führt ohne Server-Backend die lokale Liste weiter', async () => {
    // Offline-Fall: kein Manifest, an dem man sich ausrichten könnte.
    const cde = useCdeStore();
    await cde.ready;
    await cde.setActiveProject(await cde.createProject({ nummer: 'P1', name: 'Lokal' }));

    const doc = await cde.registerModel({ sha256: 'lok', name: 'Haus.ifc' });
    expect(doc?.status).toBe('WIP');
    expect(cde.dokumente).toHaveLength(1);
    expect(await cde.setDokumentStatus('lok', 'Shared')).toBe(true);
    expect(cde.dokumente[0].status).toBe('Shared');
  });
});
