// Geld-Store: Sichten/Reihe/Liste laden, anlegen laedt neu, Filter-Durchreiche.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/PedantApi', () => ({
  default: {
    geldSichten: vi.fn(async () => ({
      bezahlt: { summe_cent: 50000, anzahl: 1 },
      offen: { summe_cent: 120000, anzahl: 2, ueberfaellig_cent: 20000, ueberfaellig_anzahl: 1 },
      kommend: { summe_cent: 700000, anzahl: 2 },
    })),
    geldMonatsreihe: vi.fn(async () => ([
      { monat: '2027-01', bezahlt_cent: 0, offen_cent: 120000, kommend_cent: 0 },
    ])),
    erwartet: vi.fn(async () => ([{ id: 1, bezeichnung: 'Vergabe A', status: 'beauftragt' }])),
    erwartetAnlegen: vi.fn(async () => ({ id: 2 })),
    erwartetSpeichern: vi.fn(async () => ({ id: 1 })),
  },
}));

import PedantApi from '../services/PedantApi';
import { useGeldStore } from '../stores/useGeldStore';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useGeldStore', () => {
  it('laedt Sichten, Reihe und Liste in einem Zug', async () => {
    const store = useGeldStore();
    await store.ladeAlles();
    expect(store.sichten.kommend.summe_cent).toBe(700000);
    expect(store.reihe).toHaveLength(1);
    expect(store.erwartet).toHaveLength(1);
  });

  it('anlegen laedt danach alles neu', async () => {
    const store = useGeldStore();
    await store.legeAn({ bezeichnung: 'B', betrag_cent: 1000, erwartet_am: '2027-03-01' });
    expect(PedantApi.erwartetAnlegen).toHaveBeenCalled();
    expect(PedantApi.geldSichten).toHaveBeenCalled();
  });

  it('reicht den erledigte-Filter durch', async () => {
    const store = useGeldStore();
    await store.zeigeErledigte(true);
    expect(PedantApi.erwartet).toHaveBeenCalledWith(true);
    expect(store.mitErledigten).toBe(true);
  });
});
