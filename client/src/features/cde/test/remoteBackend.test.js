import { describe, expect, it, vi } from 'vitest';
import { RemoteBackend, RepoFacade } from '../services/RepoFacade.js';

function fakeApi() {
  const repo = { 'global:saved-views': [{ name: 'Nord' }] };
  const register = {
    basis: '01_Laufend/1338_Kanal', dokumente: [
      { sha256: 'aaa', datei: 'Kanal_R01.ifc', art: 'modell', groesse: 10, hochgeladen_am: '2026-08-25T10:00:00+00:00', status: 'WIP', revision: 1, vorhanden: true, pfad: 'CDE/Kanal_R01.ifc' },
      { sha256: 'bbb', datei: 'Lageplan.pdf', art: 'plan', groesse: 5, hochgeladen_am: '2026-08-25T10:00:00+00:00', status: 'WIP', revision: 1, vorhanden: true, pfad: 'CDE/Lageplan.pdf' },
    ] };
  const calls = [];
  return {
    calls,
    get: vi.fn(async (url, cfg) => {
      calls.push(['get', url, cfg]);
      if (url.endsWith('/cde/repo')) return { data: repo };
      if (url.endsWith('/cde')) return { data: register };
      if (url === '/projects/file') return { data: new Blob(['ISO-10303']) };
      throw new Error(`unbekannt ${url}`);
    }),
    put: vi.fn(async (url, body) => { calls.push(['put', url, body]); return { data: { ok: true } }; }),
    delete: vi.fn(async (url) => { calls.push(['delete', url]); return { data: { ok: true } }; }),
    post: vi.fn(async (url, body, cfg) => { calls.push(['post', url, cfg]); register.dokumente.push({ sha256: 'ccc', datei: 'neu.ifc', art: 'modell', groesse: 1, hochgeladen_am: '2026-08-26T10:00:00+00:00', status: 'WIP', revision: 1, vorhanden: true, pfad: 'CDE/neu.ifc' }); return { data: {} }; }),
  };
}

describe('RemoteBackend (CDE Stufe C)', () => {
  it('liest, schreibt und löscht Schlüssel über das Projekt-Repository', async () => {
    const api = fakeApi();
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));
    expect(await repo.get('saved-views')).toEqual([{ name: 'Nord' }]);
    expect(await repo.get('fehlt')).toBeNull();
    expect(await repo.set('annotations:gid:x', { issues: [] })).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/projekte/1338/cde/repo/global%3Aannotations%3Agid%3Ax', { issues: [] });
    expect(await repo.get('annotations:gid:x')).toEqual({ issues: [] });
    expect((await repo.list('annotations:'))).toEqual(['annotations:gid:x']);
    expect(await repo.delete('saved-views')).toBe(true);
    expect(api.delete).toHaveBeenCalledWith('/projekte/1338/cde/repo/global%3Asaved-views');
    expect(await repo.get('saved-views')).toBeNull();
    expect(api.get.mock.calls.filter((c) => c[0].endsWith('/cde/repo'))).toHaveLength(1); // ein Ladevorgang, danach Cache
  });

  it('bildet Modell-Blobs auf das CDE-Register ab', async () => {
    const api = fakeApi();
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));
    const liste = await repo.listBlobs('model:');
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ key: 'model:aaa', meta: { name: 'Kanal_R01.ifc', revision: 1 }, size: 10 });
    const blob = await repo.getBlob('model:aaa');
    expect(await blob.blob.text()).toBe('ISO-10303');
    expect(api.get).toHaveBeenCalledWith('/projects/file', { params: { path: '01_Laufend/1338_Kanal/CDE/Kanal_R01.ifc' }, responseType: 'blob' });
    expect(await repo.getBlob('model:zzz')).toBeNull();
    expect(await repo.setBlob('model:aaa', new Blob(['x']), { name: 'egal.ifc' })).toBe(true);
    expect(api.post).not.toHaveBeenCalled();                                   // bekannt -> kein Upload
    expect(await repo.setBlob('model:ccc', new Blob(['neu']), { name: 'neu.ifc' })).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);                                 // neu -> Upload ins Register
    expect((await repo.listBlobs('model:')).map((r) => r.key)).toEqual(['model:aaa', 'model:ccc']);
    expect(await repo.deleteBlob('model:aaa')).toBe(false);                     // nie aus dem Viewer löschen
  });

  it('Abgeleitetes (Fragmentdatei, Meter-Bytes) geht NIE ins Register — nur Modelle', async () => {
    // Gemessen 2026-09-11 in 42069: die Fragmentdatei lag als „….ifc" im Register.
    const api = fakeApi();
    const repo = new RepoFacade('global', new RemoteBackend(1338, api));
    expect(await repo.setBlob('frag:ddd', new Blob(['x']), { name: 'Gelaende.ifc' })).toBe(false);
    expect(await repo.setBlob('frag:ddd:m', new Blob(['x']), { name: 'Gelaende.ifc' })).toBe(false);
    expect(await repo.setBlob('meter:ddd', new Blob(['x']), { name: 'Gelaende.ifc' })).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(await repo.setBlob('model:ddd', new Blob(['ISO-10303']), { name: 'Gelaende.ifc' })).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);                                 // das Modell selbst schon
  });

  it('lässt sich an der Fassade tauschen und meldet den Remote-Zustand', () => {
    const repo = new RepoFacade('global', new RemoteBackend(1, fakeApi()));
    expect(repo.remote).toBe(true);
    repo.setBackend(null);
    expect(repo.remote).toBe(false);
  });
});
