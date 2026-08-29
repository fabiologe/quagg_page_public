// Beleg-Store: Laden, Upload, Freigabe (inkl. Journal-Refresh), Duplikat-Meldung.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/PedantApi', () => ({
  default: {
    belege: vi.fn(async () => ([{ id: 1, belegnummer: 'B-2027-0001', status: 'erfasst' }])),
    belegHochladen: vi.fn(async () => ({ id: 2, belegnummer: 'B-2027-0002', status: 'erfasst' })),
    belegSpeichern: vi.fn(async () => ({ id: 1, status: 'geprueft' })),
    belegFreigeben: vi.fn(async () => ({ lfd_nr: 7, bereits_gebucht: false })),
    belegVerwerfen: vi.fn(async () => ({ id: 1, status: 'verworfen' })),
    // vom mitgeladenen Journal-Store benutzt:
    status: vi.fn(async () => ({})), kette: vi.fn(async () => ({})),
    buchungen: vi.fn(async () => ([])), konten: vi.fn(async () => ([])),
  },
}));

import PedantApi from '../services/PedantApi';
import { useBelegStore } from '../stores/useBelegStore';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useBelegStore', () => {
  it('laedt Belege und haelt den aktiven Beleg', async () => {
    const store = useBelegStore();
    await store.ladeBelege();
    expect(store.belege).toHaveLength(1);
    store.oeffne(1);
    expect(store.aktiverBeleg.belegnummer).toBe('B-2027-0001');
    store.schliesse();
    expect(store.aktiverBeleg).toBeNull();
  });

  it('hochladen laedt neu und oeffnet den frischen Beleg', async () => {
    const store = useBelegStore();
    const beleg = await store.hochladen(new Blob(['x']));
    expect(beleg.id).toBe(2);
    expect(PedantApi.belege).toHaveBeenCalled();
    expect(store.aktiverBelegId).toBe(2);
  });

  it('freigeben zieht das Journal nach', async () => {
    const store = useBelegStore();
    const ergebnis = await store.freigeben(1, { sollkonto: '6815' });
    expect(ergebnis.lfd_nr).toBe(7);
    expect(PedantApi.status).toHaveBeenCalled();
    expect(PedantApi.kette).toHaveBeenCalled();
    expect(PedantApi.buchungen).toHaveBeenCalled();
  });

  it('uebersetzt den 409-Duplikat-Fehler in eine lesbare Meldung', async () => {
    PedantApi.belegHochladen.mockRejectedValueOnce({
      response: { data: { detail: { grund: 'duplikat', belegnummer: 'B-2027-0001', status: 'gebucht' } } },
    });
    const store = useBelegStore();
    await expect(store.hochladen(new Blob(['x']))).rejects.toThrow('B-2027-0001');
    expect(store.fehler).toContain('bereits erfasst');
  });
});
