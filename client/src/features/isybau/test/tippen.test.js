import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTippen, ZEICHEN_MS } from '../tutorial/tippen.js';

describe('Sprechblase: Tippen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); delete globalThis.matchMedia; });

  const TEXT = 'Schau mal: Ein Stück Wiese fehlt noch.';

  it('tippt in höchstens 14 ms je Zeichen (vorher 32)', () => {
    const t = useTippen();
    t.tippe(TEXT);
    expect(t.text.value).toBe('S');
    vi.advanceTimersByTime(ZEICHEN_MS * (TEXT.length - 1));
    expect(t.text.value).toBe(TEXT);
    expect(t.fertig.value).toBe(true);
    expect(ZEICHEN_MS).toBeLessThanOrEqual(14);
  });

  it('ein Klick zeigt sofort den ganzen Text und hält das Tippen an', () => {
    const t = useTippen();
    t.tippe(TEXT);
    vi.advanceTimersByTime(ZEICHEN_MS * 3);
    expect(t.text.value.length).toBeLessThan(TEXT.length);
    t.zeigeAlles();
    expect(t.text.value).toBe(TEXT);
    vi.advanceTimersByTime(1000);
    expect(t.text.value).toBe(TEXT); // kein Nachtippen darüber
  });

  it('„Bewegung reduzieren“: kein Tippen, der Text steht sofort', () => {
    globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') });
    const t = useTippen();
    t.tippe(TEXT);
    expect(t.text.value).toBe(TEXT);
    expect(t.fertig.value).toBe(true);
  });

  it('eine neue Nachricht ersetzt die laufende, ohne Reste', () => {
    const t = useTippen();
    t.tippe('Erste Nachricht, lang genug.');
    vi.advanceTimersByTime(ZEICHEN_MS * 5);
    t.tippe('Zweite.');
    vi.advanceTimersByTime(1000);
    expect(t.text.value).toBe('Zweite.');
  });
});
