import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/ProjekteApi', () => ({
  default: {
    liste: vi.fn(), kennzahlen: vi.fn(), abgleich: vi.fn(), lesen: vi.fn(),
    anlegen: vi.fn(), aendern: vi.fn(), verschieben: vi.fn(), uebernehmen: vi.fn(),
    beteiligterAnlegen: vi.fn(), beteiligterAendern: vi.fn(), beteiligterLoeschen: vi.fn(),
    meilensteinAnlegen: vi.fn(), meilensteinAendern: vi.fn(), meilensteinLoeschen: vi.fn(),
  },
}));

import ProjekteApi from '../services/ProjekteApi';
import { useProjekteStore } from '../stores/useProjekteStore';

const PROJEKT = { id: 1338, name: 'Kanal', phase: '00_Angebote', ordner_vorhanden: true,
  honorarmodell: 'hoai', beteiligte: [], meilensteine: [] };

describe('useProjekteStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    ProjekteApi.liste.mockResolvedValue([PROJEKT]);
    ProjekteApi.kennzahlen.mockResolvedValue({ gesamt: 1, je_phase: { '00_Angebote': 1 }, faellig: 0 });
    ProjekteApi.abgleich.mockResolvedValue({ ordner_ohne_akte: [], akte_ohne_ordner: [] });
  });

  it('lädt das Portfolio in einem Rutsch und gruppiert je Phase', async () => {
    const store = useProjekteStore();
    await store.ladePortfolio();
    expect(store.projekte).toHaveLength(1);
    expect(store.kennzahlen.gesamt).toBe(1);
    expect(store.jePhase['00_Angebote']).toHaveLength(1);
    expect(store.fehler).toBe('');
  });

  it('meldet den Server-Grund, wenn das Laden scheitert', async () => {
    ProjekteApi.liste.mockRejectedValue({ response: { data: { detail: 'storagebox ist nicht gemountet' } } });
    const store = useProjekteStore();
    await store.ladePortfolio();
    expect(store.fehler).toBe('storagebox ist nicht gemountet');
  });

  it('übernimmt nach einer Schreibaktion die frische Akte und aktualisiert die Liste', async () => {
    const store = useProjekteStore();
    await store.ladePortfolio();
    ProjekteApi.verschieben.mockResolvedValue({ ...PROJEKT, phase: '01_Laufend' });
    const neu = await store.verschiebe(1338, '01_Laufend');
    expect(neu.phase).toBe('01_Laufend');
    expect(store.akte.phase).toBe('01_Laufend');
    expect(store.projekte[0].phase).toBe('01_Laufend');
    expect(store.projekte[0].beteiligte).toBeUndefined();
  });

  it('legt an und lädt danach das Portfolio neu', async () => {
    const store = useProjekteStore();
    ProjekteApi.anlegen.mockResolvedValue({ ...PROJEKT, id: 1339 });
    const neu = await store.legeAn({ name: 'Neu', honorarmodell: 'pauschal' });
    expect(neu.id).toBe(1339);
    expect(ProjekteApi.liste).toHaveBeenCalledTimes(1);
  });

  it('gibt null zurück und setzt fehler, wenn eine Schreibaktion abgelehnt wird', async () => {
    const store = useProjekteStore();
    ProjekteApi.aendern.mockRejectedValue({ response: { data: { detail: 'name darf nicht leer sein' } } });
    expect(await store.aendere(1338, { name: '' })).toBeNull();
    expect(store.fehler).toBe('name darf nicht leer sein');
  });
});
