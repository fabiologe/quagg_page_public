// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTutorialGuide } from '../tutorial/useTutorialGuide.js';
import { TOUR_STEPS, REACTIVE_STEPS, KILL_STEPS, EXIT_CONFIRM_STEP } from '../tutorial/tutorialSteps.js';

// Minimaler Store-Ersatz für message-Funktionen
const fakeStore = {
  nodes: { size: 12 },
  edges: { size: 11 },
  ui: { importWarnings: ['w1', 'w2'] },
  simulation: { error: 'ERR_TEST' },
};

describe('useTutorialGuide (Zustandsmaschine)', () => {
  let guide;

  beforeEach(() => {
    guide = useTutorialGuide();
    guide.resetGuideState();
  });

  it('startTour() beginnt mit dem Begrüßungs-Step', () => {
    guide.startTour();
    expect(guide.tourActive.value).toBe(true);
    expect(guide.activeStep.value.id).toBe('welcome');
    expect(guide.activeStep.value.isTour).toBe(true);
  });

  it('next() läuft die Tour in Reihenfolge durch und beendet sie am Ende', () => {
    guide.startTour();
    const seen = [guide.activeStep.value.id];
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      guide.next();
      seen.push(guide.activeStep.value.id);
    }
    expect(seen).toEqual(TOUR_STEPS.map((s) => s.id));

    guide.next(); // letzter Step → Tour zu Ende
    expect(guide.tourActive.value).toBe(false);
    expect(guide.activeStep.value).toBeNull();
  });

  it('advanceOn: passender Trigger schaltet weiter, fremde Trigger nicht', () => {
    guide.startTour();
    guide.next(); // → xml-import (advanceOn: 'xml-imported')
    expect(guide.activeStep.value.id).toBe('xml-import');

    guide.trigger('simulation-success', fakeStore); // falsches Signal
    expect(guide.activeStep.value.id).toBe('xml-import');

    guide.trigger('xml-imported', fakeStore);
    expect(guide.activeStep.value.id).toBe('editor');
  });

  it('während der Tour werden KEINE reaktiven Steps angezeigt', () => {
    guide.startTour();
    guide.trigger('simulation-error', fakeStore);
    expect(guide.activeStep.value.id).toBe('welcome');
  });

  it('reaktive Trigger nach der Tour zeigen den Step mit aufgelöster Nachricht', () => {
    guide.startTour();
    guide.dismiss(); // Tour still beenden → reaktiver Modus

    guide.trigger('xml-imported', fakeStore);
    expect(guide.activeStep.value.id).toBe('reactive-xml-imported');
    expect(guide.activeStep.value.isTour).toBe(false);
    expect(guide.activeStep.value.message).toContain('12 Schaechte');
    expect(guide.activeStep.value.message).toContain('11 Haltungen');
  });

  it('unbekannte Trigger tun nichts', () => {
    guide.trigger('gibt-es-nicht', fakeStore);
    expect(guide.activeStep.value).toBeNull();
  });

  it('once-Steps feuern nur einmal pro Sitzung', () => {
    guide.trigger('first-element-created', fakeStore);
    expect(guide.activeStep.value.id).toBe('reactive-first-element-created');

    guide.dismiss();
    guide.trigger('first-element-created', fakeStore);
    expect(guide.activeStep.value).toBeNull();
  });

  it('dismiss während der Tour beendet sie (wie skip), reaktiv nur ausblenden', () => {
    guide.startTour();
    guide.dismiss();
    expect(guide.tourActive.value).toBe(false);
    expect(guide.activeStep.value).toBeNull();

    guide.trigger('simulation-running', fakeStore);
    expect(guide.activeStep.value.id).toBe('reactive-simulation-running');
    guide.dismiss();
    expect(guide.activeStep.value).toBeNull();
  });

  it('resetAndStartTour() startet die Tour neu und leert die once-Merker', () => {
    guide.startTour();
    guide.dismiss();
    guide.trigger('first-element-created', fakeStore);
    guide.dismiss();

    guide.resetAndStartTour();
    expect(guide.tourActive.value).toBe(true);
    expect(guide.activeStep.value.id).toBe('welcome');

    // once-Merker wurde geleert
    guide.dismiss();
    guide.trigger('first-element-created', fakeStore);
    expect(guide.activeStep.value.id).toBe('reactive-first-element-created');
  });

  it('„Tour beenden" stellt erst die Rückfrage; [Ja] lässt die Ratte in Frieden gehen', () => {
    guide.startTour();
    guide.skipTour();
    expect(guide.activeStep.value.kind).toBe('confirm');
    expect(guide.tourActive.value).toBe(false);

    // Rückfrage wird nicht von reaktiven Kommentaren überschrieben
    guide.trigger('simulation-running', fakeStore);
    expect(guide.activeStep.value.kind).toBe('confirm');

    guide.confirmYes();
    expect(guide.activeStep.value).toBeNull();

    // reaktiver Modus lebt weiter
    guide.trigger('simulation-running', fakeStore);
    expect(guide.activeStep.value.id).toBe('reactive-simulation-running');
  });

  it('[Nein] spielt die Kill-Sequenz ab und legt die Ratte für die Sitzung still', () => {
    vi.useFakeTimers();
    try {
      guide.startTour();
      guide.skipTour();
      guide.confirmNo();

      expect(guide.activeStep.value.id).toBe('kill-shot');
      expect(guide.activeStep.value.gif).toBe(true);

      vi.advanceTimersByTime(KILL_STEPS[0].duration);
      expect(guide.activeStep.value.id).toBe('kill-aftermath');

      vi.advanceTimersByTime(KILL_STEPS[1].duration);
      expect(guide.activeStep.value).toBeNull();
      expect(guide.killed.value).toBe(true);

      // erschossen: weder Trigger noch Tour-Start wecken sie auf
      guide.trigger('simulation-error', fakeStore);
      expect(guide.activeStep.value).toBeNull();
      guide.startTour();
      expect(guide.tourActive.value).toBe(false);

      // aber der Hilfe-Modal-Neustart erweckt sie wieder
      guide.resetAndStartTour();
      expect(guide.killed.value).toBe(false);
      expect(guide.activeStep.value.id).toBe('welcome');
    } finally {
      vi.useRealTimers();
    }
  });

  it('alle Steps referenzieren nur existierende Moods', async () => {
    const { RAT_MOODS } = await import('../tutorial/moods.js');
    const allSteps = [...TOUR_STEPS, ...Object.values(REACTIVE_STEPS), ...KILL_STEPS, EXIT_CONFIRM_STEP];
    for (const step of allSteps) {
      expect(RAT_MOODS[step.mood], `Mood "${step.mood}" von Step "${step.id}"`).toBeDefined();
    }
  });

  it('toggleInfo() öffnet die Lernkarte; Step-Wechsel schließt sie', () => {
    guide.startTour(); // welcome hat info
    expect(guide.infoOpen.value).toBe(false);

    guide.toggleInfo();
    expect(guide.infoOpen.value).toBe(true);
    guide.toggleInfo();
    expect(guide.infoOpen.value).toBe(false);

    guide.toggleInfo();
    guide.next(); // Step-Wechsel → Karte zu
    expect(guide.infoOpen.value).toBe(false);

    guide.toggleInfo();
    guide.dismiss(); // Tour-Ende → Karte zu
    expect(guide.infoOpen.value).toBe(false);

    // reaktiver Step mit info: öffnen, nächster Trigger schließt
    guide.trigger('simulation-error', fakeStore);
    guide.toggleInfo();
    expect(guide.infoOpen.value).toBe(true);
    guide.trigger('simulation-running', fakeStore);
    expect(guide.infoOpen.value).toBe(false);
  });

  it('toggleInfo() tut nichts bei Steps ohne info (z.B. Rückfrage)', () => {
    guide.startTour();
    guide.skipTour(); // confirm-Step hat kein info
    guide.toggleInfo();
    expect(guide.infoOpen.value).toBe(false);
  });

  it('alle info-Keys existieren in TUTORIAL_INFO und sind wohlgeformt', async () => {
    const { TUTORIAL_INFO } = await import('../tutorial/tutorialInfo.js');
    const validTypes = ['p', 'formula', 'ref'];

    const allSteps = [...TOUR_STEPS, ...Object.values(REACTIVE_STEPS)];
    for (const step of allSteps) {
      if (!step.info) continue;
      expect(TUTORIAL_INFO[step.info], `info-Key "${step.info}" von Step "${step.id}"`).toBeDefined();
    }

    for (const [key, entry] of Object.entries(TUTORIAL_INFO)) {
      expect(entry.title, `title von "${key}"`).toBeTruthy();
      expect(entry.blocks?.length, `blocks von "${key}"`).toBeGreaterThan(0);
      for (const block of entry.blocks) {
        expect(validTypes, `type "${block.type}" in "${key}"`).toContain(block.type);
        expect(block.text, `text-Block in "${key}"`).toBeTruthy();
      }
    }
  });
});
