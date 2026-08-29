// Bank-Store: Import laedt neu, Zuordnen zieht Journal/Rechnungen/Geld nach.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/PedantApi', () => ({
  default: {
    bank: vi.fn(async () => ([
      { id: 1, status: 'unabgeglichen', betrag_cent: 146311,
        buchungsdatum: '2027-02-15', verwendungszweck: 'RE-2027-0001',
        gegen_name: 'Stadtkasse', gegen_iban: 'DE12' },
    ])),
    bankImport: vi.fn(async () => ({ neu: 2, uebersprungen: 1 })),
    bankVorschlaege: vi.fn(async () => ([
      { art: 'rechnung', rechnung_id: 5, rechnungsnummer: 'RE-2027-0001',
        brutto_cent: 146311, konfidenz: 'sicher' },
    ])),
    bankZuordnen: vi.fn(async () => ({ id: 1, status: 'zugeordnet' })),
    bankIgnorieren: vi.fn(), bankLoesen: vi.fn(),
    bankAutoAbgleich: vi.fn(async () => ({ geprueft: 3, zugeordnet: 1 })),
    // von den nachgezogenen Stores:
    status: vi.fn(async () => ({})), kette: vi.fn(async () => ({})),
    buchungen: vi.fn(async () => ([])), konten: vi.fn(async () => ([])),
    rechnungen: vi.fn(async () => ([])),
    geldSichten: vi.fn(async () => ({})), geldMonatsreihe: vi.fn(async () => ([])),
    erwartet: vi.fn(async () => ([])),
  },
}));

import PedantApi from '../services/PedantApi';
import { useBankStore } from '../stores/useBankStore';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useBankStore', () => {
  it('importiert und laedt danach die Liste', async () => {
    const store = useBankStore();
    const ergebnis = await store.importiere(new Blob(['csv']));
    expect(ergebnis).toEqual({ neu: 2, uebersprungen: 1 });
    expect(PedantApi.bank).toHaveBeenCalled();
  });

  it('oeffnen laedt die Vorschlaege', async () => {
    const store = useBankStore();
    await store.lade();
    await store.oeffne(1);
    expect(store.vorschlaege[0].konfidenz).toBe('sicher');
    expect(store.aktiveBewegung.id).toBe(1);
  });

  it('zuordnen zieht Journal, Rechnungen und Geld nach', async () => {
    const store = useBankStore();
    await store.zuordnen(1, { rechnung_id: 5 });
    expect(PedantApi.bankZuordnen).toHaveBeenCalledWith(1, { rechnung_id: 5 });
    expect(PedantApi.kette).toHaveBeenCalled();
    expect(PedantApi.rechnungen).toHaveBeenCalled();
    expect(PedantApi.geldSichten).toHaveBeenCalled();
  });

  it('filtert nach status', async () => {
    const store = useBankStore();
    await store.lade();
    store.filter = 'zugeordnet';
    expect(store.gefiltert).toHaveLength(0);
    store.filter = 'unabgeglichen';
    expect(store.gefiltert).toHaveLength(1);
  });
});
