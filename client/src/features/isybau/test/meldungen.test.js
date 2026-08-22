import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useIsybauStore } from '../store/index.js';

describe('Meldungskanal', () => {
  let store;
  beforeEach(() => { setActivePinia(createPinia()); store = useIsybauStore(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('zeigt eine Meldung mit Art und Text', () => {
    store.melde('Datei kaputt', 'fehler');
    expect(store.ui.meldungen).toHaveLength(1);
    expect(store.ui.meldungen[0]).toMatchObject({ art: 'fehler', text: 'Datei kaputt' });
  });

  it('vergibt eindeutige Nummern, auch bei gleichem Text', () => {
    const a = store.melde('gleich'); const b = store.melde('gleich');
    expect(a).not.toBe(b);
    expect(new Set(store.ui.meldungen.map((m) => m.id)).size).toBe(2);
  });

  it('schliesst genau die angesprochene Meldung', () => {
    const a = store.melde('eins'); store.melde('zwei');
    store.meldungSchliessen(a);
    expect(store.ui.meldungen.map((m) => m.text)).toEqual(['zwei']);
  });

  it('laesst Erfolgsmeldungen von selbst verschwinden', () => {
    store.melde('Kopiert.', 'erfolg');
    expect(store.ui.meldungen).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(store.ui.meldungen).toHaveLength(0);
  });

  it('laesst Fehler stehen, bis jemand sie schliesst', () => {
    // Wer gerade woanders hinsieht, soll einen fehlgeschlagenen Import
    // nicht verpassen - genau dafuer war ein alert() bisher da.
    store.melde('Import fehlgeschlagen', 'fehler');
    vi.advanceTimersByTime(60_000);
    expect(store.ui.meldungen).toHaveLength(1);
  });

  it('ist gegen unbekannte Nummern robust', () => {
    store.melde('da');
    store.meldungSchliessen(999);
    expect(store.ui.meldungen).toHaveLength(1);
  });
});
