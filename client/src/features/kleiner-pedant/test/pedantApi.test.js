// Prueft, dass PedantApi die richtigen Pfade ruft und response.data auspackt.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: { quelle: 'get' } })),
    post: vi.fn(async () => ({ data: { quelle: 'post' } })),
    put: vi.fn(async () => ({ data: { quelle: 'put' } })),
  },
}));

import api from '@/services/api';
import PedantApi from '../services/PedantApi';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PedantApi', () => {
  it('status/kette/konten laufen als GET auf /pedant/... und geben data zurueck', async () => {
    expect(await PedantApi.status()).toEqual({ quelle: 'get' });
    expect(await PedantApi.kette()).toEqual({ quelle: 'get' });
    expect(await PedantApi.konten()).toEqual({ quelle: 'get' });
    expect(api.get.mock.calls.map(([pfad]) => pfad)).toEqual(
      ['/pedant/status', '/pedant/kette', '/pedant/konten']);
  });

  it('buchungen reicht das Limit als Query-Parameter durch', async () => {
    await PedantApi.buchungen(25);
    expect(api.get).toHaveBeenCalledWith('/pedant/buchungen', { params: { limit: 25 } });
  });

  it('buchungAnlegen postet den Buchungsrumpf unveraendert', async () => {
    const buchung = { sollkonto: '6815', habenkonto: '1800', betrag_cent: 100 };
    expect(await PedantApi.buchungAnlegen(buchung)).toEqual({ quelle: 'post' });
    expect(api.post).toHaveBeenCalledWith('/pedant/buchungen', buchung);
  });

  it('storno postet den Grund an die Buchungsnummer', async () => {
    await PedantApi.storno(7, 'Zahlendreher');
    expect(api.post).toHaveBeenCalledWith('/pedant/buchungen/7/storno', { grund: 'Zahlendreher' });
  });

  it('belege filtert optional nach Status', async () => {
    await PedantApi.belege('erfasst', 25);
    expect(api.get).toHaveBeenCalledWith('/pedant/belege',
      { params: { status: 'erfasst', limit: 25 } });
    await PedantApi.belege();
    expect(api.get).toHaveBeenLastCalledWith('/pedant/belege', { params: { limit: 100 } });
  });

  it('belegHochladen schickt FormData mit dem Feld datei', async () => {
    const file = new Blob(['inhalt'], { type: 'application/pdf' });
    await PedantApi.belegHochladen(file);
    const [pfad, formData] = api.post.mock.calls[0];
    expect(pfad).toBe('/pedant/belege');
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('datei')).toBeTruthy();
  });

  it('belegDatei laedt als Blob', async () => {
    await PedantApi.belegDatei(3);
    expect(api.get).toHaveBeenCalledWith('/pedant/belege/3/datei',
      { responseType: 'blob' });
  });

  it('geld-endpunkte treffen die richtigen Pfade', async () => {
    await PedantApi.geldSichten();
    expect(api.get).toHaveBeenCalledWith('/pedant/geld/sichten');
    await PedantApi.geldMonatsreihe(3, 9);
    expect(api.get).toHaveBeenCalledWith('/pedant/geld/monatsreihe',
      { params: { zurueck: 3, vor: 9 } });
    await PedantApi.erwartet(true);
    expect(api.get).toHaveBeenCalledWith('/pedant/geld/erwartet',
      { params: { erledigte: true } });
    await PedantApi.erwartetAnlegen({ bezeichnung: 'x' });
    expect(api.post).toHaveBeenCalledWith('/pedant/geld/erwartet', { bezeichnung: 'x' });
    await PedantApi.erwartetSpeichern(4, { status: 'beauftragt' });
    expect(api.put).toHaveBeenCalledWith('/pedant/geld/erwartet/4', { status: 'beauftragt' });
  });

  it('bank-endpunkte treffen die richtigen Pfade', async () => {
    const file = new Blob(['csv']);
    await PedantApi.bankImport(file);
    const [pfad, formData] = api.post.mock.calls[0];
    expect(pfad).toBe('/pedant/bank/import');
    expect(formData).toBeInstanceOf(FormData);
    await PedantApi.bank('unabgeglichen', 50);
    expect(api.get).toHaveBeenCalledWith('/pedant/bank',
      { params: { status: 'unabgeglichen', limit: 50 } });
    await PedantApi.bankVorschlaege(7);
    expect(api.get).toHaveBeenCalledWith('/pedant/bank/7/vorschlaege');
    await PedantApi.bankZuordnen(7, { rechnung_id: 3 });
    await PedantApi.bankIgnorieren(7, 'privat');
    await PedantApi.bankLoesen(7, 'falsch');
    await PedantApi.bankAutoAbgleich();
    expect(api.post.mock.calls.slice(1).map(([p]) => p)).toEqual([
      '/pedant/bank/7/zuordnen', '/pedant/bank/7/ignorieren',
      '/pedant/bank/7/loesen', '/pedant/bank/auto-abgleich']);
  });

  it('speichern/freigeben/verwerfen treffen die richtigen Pfade', async () => {
    await PedantApi.belegSpeichern(3, { lieferant: 'x' });
    await PedantApi.belegFreigeben(3, { sollkonto: '6815' });
    await PedantApi.belegVerwerfen(3, 'privat');
    expect(api.put).toHaveBeenCalledWith('/pedant/belege/3', { lieferant: 'x' });
    expect(api.post.mock.calls.map(([pfad]) => pfad)).toEqual(
      ['/pedant/belege/3/freigeben', '/pedant/belege/3/verwerfen']);
  });
});
