import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useElementFocus } from '../composables/useElementFocus.js';
import { resolveStepFocus, EXERCISE_STEPS } from '../tutorial/tutorialExercise.js';

const { activeFocus, focusElement, clearFocus, isFocused, resetFocusState } = useElementFocus();

beforeEach(() => { resetFocusState(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useElementFocus — Grundverhalten', () => {
  it('setzt den Fokus mit Typ und ID', () => {
    expect(focusElement({ type: 'edge', id: 'H1' })).toBe(true);
    expect(activeFocus.value).toMatchObject({ type: 'edge', id: 'H1' });
  });

  it('waehlt das Element standardmaessig mit aus (ElementInfo oeffnet sich)', () => {
    focusElement({ type: 'node', id: 'K1' });
    expect(activeFocus.value.select).toBe(true);
  });

  it('kann die Auswahl unterdruecken (Tutorial: Panel wuerde die Sprechblase verdecken)', () => {
    focusElement({ type: 'node', id: 'K1' }, { select: false });
    expect(activeFocus.value.select).toBe(false);
  });

  it('weist unvollstaendige Referenzen ab', () => {
    expect(focusElement(null)).toBe(false);
    expect(focusElement({ type: 'node' })).toBe(false);
    expect(focusElement({ id: 'K1' })).toBe(false);
    expect(focusElement({ type: 'quatsch', id: 'K1' })).toBe(false);
    expect(activeFocus.value).toBeNull();
  });

  it('normalisiert die ID auf String (Tabellen liefern teils Zahlen)', () => {
    focusElement({ type: 'node', id: 42 });
    expect(activeFocus.value.id).toBe('42');
    expect(isFocused('node', 42)).toBe(true);
  });
});

describe('useElementFocus — flash vs. sticky', () => {
  it('flash loest sich nach der Standzeit von selbst auf', () => {
    focusElement({ type: 'node', id: 'K1' }, { mode: 'flash', holdMs: 1000 });
    expect(activeFocus.value).not.toBeNull();
    vi.advanceTimersByTime(1001);
    expect(activeFocus.value).toBeNull();
  });

  it('sticky bleibt stehen (Tutorial spricht weiter darueber)', () => {
    focusElement({ type: 'area', id: 'F1' }, { mode: 'sticky' });
    vi.advanceTimersByTime(60_000);
    expect(activeFocus.value).not.toBeNull();
    clearFocus();
    expect(activeFocus.value).toBeNull();
  });

  it('ein neuer flash setzt die Standzeit zurueck statt sie zu erben', () => {
    focusElement({ type: 'node', id: 'K1' }, { holdMs: 1000 });
    vi.advanceTimersByTime(900);
    focusElement({ type: 'node', id: 'K2' }, { holdMs: 1000 });
    vi.advanceTimersByTime(500); // waere fuer den ERSTEN Timer schon abgelaufen
    expect(activeFocus.value?.id).toBe('K2');
  });

  it('sticky nach flash loescht den alten Timer (kein Zombie-Clear)', () => {
    focusElement({ type: 'node', id: 'K1' }, { mode: 'flash', holdMs: 1000 });
    focusElement({ type: 'node', id: 'K2' }, { mode: 'sticky' });
    vi.advanceTimersByTime(5000);
    expect(activeFocus.value?.id).toBe('K2');
  });
});

describe('useElementFocus — dasselbe Element erneut fokussieren', () => {
  it('erhoeht den Token, damit Verbraucher erneut reagieren', () => {
    // Regression: der alte Mechanismus reagierte nur auf Wertwechsel — zweimal
    // dieselbe ID hintereinander war wirkungslos.
    focusElement({ type: 'node', id: 'K1' });
    const first = activeFocus.value.token;
    focusElement({ type: 'node', id: 'K1' });
    expect(activeFocus.value.token).toBeGreaterThan(first);
  });
});

describe('resolveStepFocus — Tutorial-Ziele', () => {
  const store = { areas: [], nodes: new Map(), edges: new Map() };

  it('loest ein festes Ziel auf', () => {
    expect(resolveStepFocus({ focus: { type: 'node', id: 'Pumpwerk' } }, store))
      .toEqual({ type: 'node', id: 'Pumpwerk' });
  });

  it('loest ein dynamisches Ziel gegen den Store auf', () => {
    const s = { areas: [{ id: 'F1', slope: 3 }, { id: 'F2', slope: null }] };
    const step = EXERCISE_STEPS.find(x => x.id === 'ex-slope');
    expect(resolveStepFocus(step, s)).toEqual({ type: 'area', id: 'F2' });
  });

  it('liefert null, wenn es gerade nichts zu zeigen gibt', () => {
    const s = { areas: [{ id: 'F1', slope: 3 }] }; // alle vollstaendig
    const step = EXERCISE_STEPS.find(x => x.id === 'ex-slope');
    expect(resolveStepFocus(step, s)).toBeNull();
  });

  it('ohne focus-Feld: null', () => {
    expect(resolveStepFocus({ id: 'ex-intro' }, store)).toBeNull();
  });

  it('faengt einen Fehler im Ziel-Ausdruck ab, statt die Uebung zu blockieren', () => {
    const step = { focus: () => { throw new Error('kaputt'); } };
    expect(() => resolveStepFocus(step, store)).not.toThrow();
    expect(resolveStepFocus(step, store)).toBeNull();
  });
});
