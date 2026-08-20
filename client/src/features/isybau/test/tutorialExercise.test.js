// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  EXERCISE_STEPS,
  makeSnapshot,
  isStepComplete,
  allAreasHaveRunoffCoeff,
  allAreasHaveSlope,
  nodesAreOutfalls,
  resolveStepDraw,
  resolveStepHighlight,
  TUTORIAL_AREA_POINTS,
  TUTORIAL_OUTFALL_NODES,
} from '../tutorial/tutorialExercise.js';
import { loadTutorialNetwork } from '../tutorial/loadTutorialNetwork.js';
import { loadTutorialDgm } from '../tutorial/loadTutorialDgm.js';
import { WELCOME_STEP } from '../tutorial/tutorialSteps.js';
import { TUTORIAL_INFO } from '../tutorial/tutorialInfo.js';
import fs from 'fs';
import path from 'path';

const storeWith = (o = {}) => ({ areas: [], nodes: new Map(), edges: new Map(), ...o });

describe('Übungs-Schritte: Struktur', () => {
  it('jeder Schritt hat id, mood und Nachricht', () => {
    for (const s of EXERCISE_STEPS) {
      expect(s.id, JSON.stringify(s)).toBeTruthy();
      expect(s.mood).toBeTruthy();
      expect(typeof s.message === 'string' || typeof s.message === 'function').toBe(true);
    }
  });

  it('Aufgaben-Schritte haben Aufgabe, Pruefung und Tipp', () => {
    const tasks = EXERCISE_STEPS.filter(s => s.task);
    expect(tasks.length).toBeGreaterThanOrEqual(4);
    for (const s of tasks) {
      expect(typeof s.check).toBe('function');
      expect(s.hint, s.id).toBeTruthy();
    }
  });

  it('Schritt-IDs sind eindeutig', () => {
    const ids = EXERCISE_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('allAreasHaveRunoffCoeff', () => {
  it('ist erst erfuellt, wenn JEDE Flaeche einen Beiwert hat', () => {
    // Ausgangslage der Beispiel-XML: Abflussbeiwert fehlt komplett (=0).
    const store = storeWith({ areas: [{ id: 'A', runoffCoeff: 0 }, { id: 'B', runoffCoeff: 0.9 }] });
    expect(allAreasHaveRunoffCoeff(store)).toBe(false);
    store.areas[0].runoffCoeff = 0.3;
    expect(allAreasHaveRunoffCoeff(store)).toBe(true);
  });

  it('weist unplausible Werte ab', () => {
    expect(allAreasHaveRunoffCoeff(storeWith({ areas: [{ runoffCoeff: 1.4 }] }))).toBe(false);
    expect(allAreasHaveRunoffCoeff(storeWith({ areas: [{ runoffCoeff: -0.2 }] }))).toBe(false);
    expect(allAreasHaveRunoffCoeff(storeWith({ areas: [{ runoffCoeff: null }] }))).toBe(false);
  });

  it('ohne Flaechen nicht erfuellt', () => {
    expect(allAreasHaveRunoffCoeff(storeWith())).toBe(false);
  });
});

describe('allAreasHaveSlope', () => {
  it('akzeptiert nur die Klassen 1..5', () => {
    expect(allAreasHaveSlope(storeWith({ areas: [{ slope: 3 }, { slope: 2 }] }))).toBe(true);
    expect(allAreasHaveSlope(storeWith({ areas: [{ slope: 3 }, { slope: null }] }))).toBe(false);
    expect(allAreasHaveSlope(storeWith({ areas: [{ slope: 7 }] }))).toBe(false);
  });
});

describe('nodesAreOutfalls', () => {
  const mk = (a, b) => storeWith({ nodes: new Map([['AL01', a], ['AL02', b]]) });

  it('verlangt Bauwerkstyp 5 fuer ALLE genannten Knoten', () => {
    expect(nodesAreOutfalls(mk({ bauwerkstyp: null }, { bauwerkstyp: null }), ['AL01', 'AL02'])).toBe(false);
    expect(nodesAreOutfalls(mk({ bauwerkstyp: 5 }, { bauwerkstyp: null }), ['AL01', 'AL02'])).toBe(false);
    expect(nodesAreOutfalls(mk({ bauwerkstyp: 5 }, { bauwerkstyp: 5 }), ['AL01', 'AL02'])).toBe(true);
  });

  it('akzeptiert den Typ auch als UI-Integer', () => {
    expect(nodesAreOutfalls(mk({ type: 5 }, { type: 5 }), ['AL01', 'AL02'])).toBe(true);
  });

  it('ohne genannte Knoten nicht erfuellt', () => {
    expect(nodesAreOutfalls(storeWith(), [])).toBe(false);
  });
});

describe('isStepComplete', () => {
  it('Erzaehlschritte ohne check gelten nie als automatisch erledigt', () => {
    expect(isStepComplete({ id: 'intro' }, storeWith(), null)).toBe(false);
  });

  it('faengt Fehler in einer Pruefung ab, statt die Uebung zu blockieren', () => {
    const step = { check: () => { throw new Error('kaputt'); } };
    expect(() => isStepComplete(step, storeWith(), null)).not.toThrow();
    expect(isStepComplete(step, storeWith(), null)).toBe(false);
  });
});

describe('loadTutorialNetwork', () => {
  it('laedt die XML und uebergibt sie an den Store', async () => {
    const loadParsedData = vi.fn();
    const store = { loadParsedData, nodes: new Map(), edges: new Map(), areas: [], metadata: {} };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<?xml version="1.0"?><Identifikation></Identifikation>',
    });
    const res = await loadTutorialNetwork(store, { fetchImpl });
    expect(res.ok).toBe(true);
    expect(loadParsedData).toHaveBeenCalledOnce();
    expect(store.metadata.fileName).toBe('Beispiel_Tutorial.xml');
  });

  it('meldet einen HTTP-Fehler, statt zu werfen', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const res = await loadTutorialNetwork({}, { fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/404/);
  });

  it('meldet einen Netzwerkfehler, statt zu werfen', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    const res = await loadTutorialNetwork({}, { fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/offline/);
  });
});

describe('Highlight-Anker zeigen auf real existierende Elemente', () => {
  // Ein vertippter Anker faellt sonst NICHT auf: useHighlight.js versucht es
  // 5x und gibt dann stillschweigend auf — im UI leuchtet einfach nichts.
  const collectAnchors = (dir) => {
    const found = new Set();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'test'].includes(entry.name)) continue;
        collectAnchors(full).forEach(a => found.add(a));
      } else if (entry.name.endsWith('.vue')) {
        const src = fs.readFileSync(full, 'utf-8');
        for (const m of src.matchAll(/data-tutorial="([^"]+)"/g)) found.add(m[1]);
      }
    }
    return found;
  };

  const anchors = collectAnchors(path.resolve(__dirname, '..'));

  // `highlight` darf eine Funktion des Zustands sein — also gegen BEIDE
  // Zustaende aufloesen (alle Fenster zu / alle offen) und vereinigen. Sonst
  // bliebe der Ersatz-Anker, den es nur bei geschlossenem Fenster gibt,
  // ungeprueft: genau der Fall, der den Fehler ausmachte.
  const ZU = storeWith({ ui: {}, rain: {} });
  const AUF = storeWith({
    ui: { showKostraModal: true, showPreprocessingModal: true, showElementModal: true, demImportPanelOpen: true },
    rain: {},
  });
  const stepsWithHighlight = [...EXERCISE_STEPS, WELCOME_STEP]
    .filter(s => s.highlight)
    .flatMap((s) => {
      const anker = new Set([
        ...(resolveStepHighlight(s, ZU) || []),
        ...(resolveStepHighlight(s, AUF) || []),
      ]);
      return Array.from(anker, h => [s.id, h]);
    });

  it('findet ueberhaupt Anker im Quellcode', () => {
    expect(anchors.size).toBeGreaterThan(0);
  });

  it.each(stepsWithHighlight)('Schritt "%s" hebt vorhandenen Anker "%s" hervor', (_id, anchor) => {
    expect(anchors.has(anchor)).toBe(true);
  });
});

describe('resolveStepHighlight', () => {
  const auf = (ui) => storeWith({ ui, rain: {} });

  it('liefert immer eine Liste — auch fuer einen einzelnen Anker', () => {
    expect(resolveStepHighlight({ highlight: 'sidebar' }, auf({}))).toEqual(['sidebar']);
    expect(resolveStepHighlight({ highlight: ['a', 'b'] }, auf({}))).toEqual(['a', 'b']);
  });

  it('ohne highlight, mit leerem Ergebnis oder ohne Schritt: null', () => {
    expect(resolveStepHighlight({}, auf({}))).toBeNull();
    expect(resolveStepHighlight(null, auf({}))).toBeNull();
    expect(resolveStepHighlight({ highlight: () => null }, auf({}))).toBeNull();
    expect(resolveStepHighlight({ highlight: [] }, auf({}))).toBeNull();
    expect(resolveStepHighlight({ highlight: [null, 42, ''] }, auf({}))).toBeNull();
  });

  it('ein kaputtes Ziel blockiert die Uebung nicht', () => {
    const kaputt = { highlight: () => { throw new Error('bumm'); } };
    expect(resolveStepHighlight(kaputt, auf({}))).toBeNull();
  });

  // Der eigentliche Fehler: beide Schritte pruefen den Endzustand und sind
  // deshalb bewusst OHNE `requires` gebaut — sie ueberleben also das
  // Schliessen ihres Fensters. Frueher zeigten sie danach auf einen Knopf,
  // den es nicht mehr gab, und useHighlight gab nach fuenf Versuchen auf.
  it('der KOSTRA-Schritt zeigt bei geschlossenem Fenster auf den Weg zurueck', () => {
    const step = EXERCISE_STEPS.find(s => s.id === 'ex-rain-uebernehmen');
    expect(resolveStepHighlight(step, auf({ showKostraModal: true }))).toEqual(['kostra-uebernehmen']);
    expect(resolveStepHighlight(step, auf({ showKostraModal: false }))).toEqual(['kostra-oeffnen']);
  });

  it('der Auslass-Schritt zeigt bei geschlossenem Fenster auf den Weg zurueck', () => {
    const step = EXERCISE_STEPS.find(s => s.id === 'ex-outfalls-uebernehmen');
    expect(resolveStepHighlight(step, auf({ showPreprocessingModal: true }))).toEqual(['preprocessing-uebernehmen']);
    expect(resolveStepHighlight(step, auf({ showPreprocessingModal: false }))).toEqual(['daten-bearbeiten']);
  });
});

describe('DGM-Abfolge: Angebot -> Importieren-Knopf -> Bestaetigung', () => {
  const stepById = (id) => EXERCISE_STEPS.find(s => s.id === id);
  const angebot = stepById('ex-tour-dgm');
  const importieren = stepById('ex-tour-dgm-import');
  const fertig = stepById('ex-tour-dgm-fertig');

  it('die drei Schritte stehen in dieser Reihenfolge hintereinander', () => {
    const i = EXERCISE_STEPS.indexOf(angebot);
    expect(EXERCISE_STEPS[i + 1]).toBe(importieren);
    expect(EXERCISE_STEPS[i + 2]).toBe(fertig);
  });

  it('das Angebot schaltet weiter, sobald die Aufloesungs-Rueckfrage offen steht', () => {
    expect(angebot.check(storeWith({ ui: { demImportPanelOpen: false } }))).toBe(false);
    expect(angebot.check(storeWith({ ui: { demImportPanelOpen: true } }))).toBe(true);
  });

  it('der Importieren-Schritt zeigt auf den Knopf und wartet auf das Gelaende', () => {
    expect(importieren.highlight).toBe('dgm-importieren');
    expect(importieren.check(storeWith({ terrain: null }))).toBe(false);
    expect(importieren.check(storeWith({ terrain: { cellsize: 10 } }))).toBe(true);
  });

  it('zeigt nicht auf den Knopf, wenn das Panel gar nicht offen ist', () => {
    // Wer das Angebot mit [Weiter] uebergeht, darf nicht auf einem Schritt
    // landen, der zu einem nicht vorhandenen Knopf lotst.
    expect(importieren.requires(storeWith({ ui: { demImportPanelOpen: false } }))).toBe(false);
    expect(importieren.requires(storeWith({ ui: { demImportPanelOpen: true } }))).toBe(true);
  });

  it('die Bestaetigung erscheint nur mit tatsaechlich geladenem Gelaende', () => {
    expect(fertig.requires(storeWith({ terrain: null }))).toBe(false);
    expect(fertig.requires(storeWith({ terrain: { cellsize: 10 } }))).toBe(true);
  });

  it('beide Zusatzschritte zaehlen nicht als Aufgabe', () => {
    // Sonst stuende bei der ersten echten Aufgabe eine zu hohe Gesamtzahl —
    // das DGM-Angebot auszuschlagen ist kein Versaeumnis.
    expect(angebot.optional).toBe(true);
    expect(importieren.optional).toBe(true);
  });
});

describe('Erzaehlskript: Orientierung vor den Aufgaben', () => {
  it('erklaert Karte, Ansichts-Leiste, Werkzeug und Seitenleiste', () => {
    const ids = EXERCISE_STEPS.map(s => s.id);
    for (const id of ['ex-tour-map', 'ex-tour-controls', 'ex-tour-toolbox', 'ex-tour-sidebar']) {
      expect(ids, id).toContain(id);
    }
  });

  it('zeigt die Orientierung VOR der ersten Aufgabe', () => {
    // Gezaehlt wird wie in useTutorialGuide: `optional` ist keine Aufgabe.
    const firstTask = EXERCISE_STEPS.findIndex(s => typeof s.check === 'function' && !s.optional);
    const lastTour = EXERCISE_STEPS.map(s => s.id).lastIndexOf('ex-tour-sidebar');
    expect(lastTour).toBeLessThan(firstTask);
  });

  it('Orientierungs-Schritte verlangen dem Nutzer nichts ab', () => {
    // Manche schalten inzwischen von selbst weiter (das DGM-Angebot), duerfen
    // aber nicht als Aufgabe zaehlen — sonst waere die Gesamtzahl gelogen.
    for (const s of EXERCISE_STEPS.filter(x => x.id.startsWith('ex-tour-'))) {
      if (typeof s.check === 'function') expect(s.optional, s.id).toBe(true);
      else expect(s.optional, s.id).toBeUndefined();
    }
  });

  it('jeder Orientierungs-Schritt zeigt auf etwas — ausser den Bestaetigungen', () => {
    // Ohne `highlight` weiss der Nutzer nicht, wovon die Ratte redet. Erlaubt
    // ist das nur, wo sie ein Ergebnis kommentiert statt auf ein Bedienelement
    // zu zeigen (z.B. "das Gelaende liegt jetzt unter dem Netz").
    const ohneZiel = ['ex-tour-dgm-fertig'];
    for (const s of EXERCISE_STEPS.filter(x => x.id.startsWith('ex-tour-'))) {
      if (ohneZiel.includes(s.id)) continue;
      expect(s.highlight, s.id).toBeTruthy();
    }
  });
});

describe('info-Schluessel zeigen auf vorhandene Lernkarten', () => {
  // Gleiche stille Fehlerklasse wie bei den Highlight-Ankern: ein Tippfehler
  // oder ein erfundener Key oeffnet eine LEERE "Mehr dazu"-Karte, ohne dass
  // irgendwo ein Fehler auftaucht.
  const steps = [...EXERCISE_STEPS, WELCOME_STEP].filter(s => s.info);

  it.each(steps.map(s => [s.id, s.info]))(
    'Schritt "%s" verweist auf existierende Lernkarte "%s"',
    (_id, key) => {
      expect(Object.keys(TUTORIAL_INFO)).toContain(key);
    });

  it('jede Lernkarte hat Titel und mindestens einen Block', () => {
    for (const [key, card] of Object.entries(TUTORIAL_INFO)) {
      expect(card.title, key).toBeTruthy();
      expect(Array.isArray(card.blocks) && card.blocks.length > 0, key).toBe(true);
    }
  });

  it('Kartentitel bleiben ASCII (Pixel-Font kennt keine Umlaute)', () => {
    for (const [key, card] of Object.entries(TUTORIAL_INFO)) {
      expect(card.title, key).not.toMatch(/[äöüÄÖÜß]/);
    }
  });
});

describe('loadTutorialDgm — Uebungs-Gelaende anbieten', () => {
  const mkStore = () => ({ ui: { pendingDemImportText: null, importWarnings: [] } });
  const XYZ = '409795.000 5479720.000 321.990\n409800.000 5479720.000 321.909\n';

  it('legt den Dateitext fuer Sidebar.vue ab, statt selbst zu importieren', async () => {
    // Der Terrain-Worker lebt in Sidebar.vue — es soll nur EINEN DGM-Weg geben.
    const store = mkStore();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => XYZ });
    const res = await loadTutorialDgm(store, { fetchImpl });
    expect(res.ok).toBe(true);
    expect(store.ui.pendingDemImportText).toBe(XYZ);
  });

  it('meldet die Punktzahl zurueck', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => XYZ });
    const res = await loadTutorialDgm(mkStore(), { fetchImpl });
    expect(res.points).toBe(2);
  });

  it('meldet HTTP- und Netzwerkfehler, statt zu werfen', async () => {
    const notFound = await loadTutorialDgm(mkStore(), {
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }) });
    expect(notFound).toMatchObject({ ok: false });
    expect(notFound.error).toMatch(/404/);

    const offline = await loadTutorialDgm(mkStore(), {
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(offline.ok).toBe(false);
  });

  it('weist eine leere Datei ab, statt den Worker damit zu fuettern', async () => {
    const store = mkStore();
    const res = await loadTutorialDgm(store, {
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, text: async () => '   \n  ' }) });
    expect(res.ok).toBe(false);
    expect(store.ui.pendingDemImportText).toBeNull();
  });
});

describe('Schritt-Aktionen ("Soll ich?"-Angebote der Ratte)', () => {
  it('der DGM-Schritt bietet das Uebungsgelaende aktiv an', () => {
    const step = EXERCISE_STEPS.find(s => s.id === 'ex-tour-dgm');
    expect(step.action).toBeTruthy();
    expect(step.action.label).toBeTruthy();
    expect(typeof step.action.run).toBe('function');
  });

  it('jede Aktion hat Label und run()', () => {
    for (const s of EXERCISE_STEPS.filter(x => x.action)) {
      expect(typeof s.action.label, s.id).toBe('string');
      expect(typeof s.action.run, s.id).toBe('function');
    }
  });
});

describe('Uebungs-Einzugsgebiet: Umriss, Befestigung, Anschluss', () => {
  const stepById = (id) => EXERCISE_STEPS.find(s => s.id === id);
  const zeichnen = stepById('ex-add-area');
  const befestigung = stepById('ex-area-befestigung');
  const anschluss = stepById('ex-area-anschluss');

  it('die drei Schritte stehen in dieser Reihenfolge', () => {
    const i = EXERCISE_STEPS.indexOf(zeichnen);
    expect(EXERCISE_STEPS[i + 1]).toBe(befestigung);
    expect(EXERCISE_STEPS[i + 2]).toBe(anschluss);
  });

  it('der Umriss liegt im Netz — nicht 630 m daneben', () => {
    // Der zweite Eckpunkt war als 409059.31 angegeben; das laege weit
    // westlich ausserhalb der Netzausdehnung (X 409572..409924). Dieser Test
    // haelt die Korrektur fest: faellt jemand auf den Tippfehler zurueck,
    // schlaegt er fehl statt still eine Nadel quer durch die Karte zu malen.
    for (const p of TUTORIAL_AREA_POINTS) {
      expect(p.x, `X ausserhalb des Netzes: ${p.x}`).toBeGreaterThan(409572);
      expect(p.x, `X ausserhalb des Netzes: ${p.x}`).toBeLessThan(409924);
      expect(p.y).toBeGreaterThan(5479731);
      expect(p.y).toBeLessThan(5480285);
    }
  });

  it('der Umriss umschliesst eine plausible Wiese', () => {
    // Gauss'sche Trapezformel — eine entartete Flaeche (alle Punkte fast auf
    // einer Linie) waere als Zeichenvorlage unbrauchbar.
    const p = TUTORIAL_AREA_POINTS;
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i].x * q.y - q.x * p[i].y;
    }
    const m2 = Math.abs(a / 2);
    expect(m2).toBeGreaterThan(100);
    expect(m2).toBeLessThan(2000);
  });

  it('der Zeichenschritt bringt den Umriss mit und wartet auf den Dialog', () => {
    expect(resolveStepDraw(zeichnen, {})).toHaveLength(3);
    expect(zeichnen.check(storeWith({ ui: { showElementModal: false } }))).toBe(false);
    expect(zeichnen.check(storeWith({
      ui: { showElementModal: true, elementModal: { mode: 'area' } },
    }))).toBe(true);
  });

  it('der Zeichenschritt wartet NICHT auf einen fremden Dialog', () => {
    // Ein Schacht-Dialog ist nicht das, worauf der Schritt wartet.
    expect(zeichnen.check(storeWith({
      ui: { showElementModal: true, elementModal: { mode: 'node' } },
    }))).toBe(false);
  });

  it('der Befestigungs-Schritt gilt nur bei offenem Dialog', () => {
    const zu = storeWith({ ui: { showElementModal: false } });
    const auf = storeWith({ ui: { showElementModal: true, elementModal: { mode: 'area' } } });
    expect(befestigung.requires(zu)).toBe(false);
    expect(befestigung.requires(auf)).toBe(true);
  });

  it('der Anschluss-Schritt haengt NICHT am offenen Dialog', () => {
    // Sonst wuerde er beim Speichern mit falschem Anschluss stillschweigend
    // uebersprungen — der Nutzer bekaeme seinen Fehler nie zu sehen. Hier
    // zaehlt der Endzustand, nicht das Fenster.
    expect(anschluss.requires).toBeUndefined();
  });

  it('der Befestigungs-Schritt schaltet weiter, sobald gespeichert wurde', () => {
    // "Weiter" soll nicht noetig sein, wenn der Nutzer das Formular in einem
    // Rutsch ausfuellt — die Ratte merkt es am Zustand.
    const snap = { areaIds: new Set(['alt-1']) };
    const store = storeWith({ areas: [{ id: 'alt-1' }, { id: 'neu', runoffCoeff: 0.2 }] });
    expect(befestigung.check(store, snap)).toBe(true);
    expect(befestigung.optional, 'zaehlt nicht als eigene Aufgabe').toBe(true);
  });

  it('erledigt ist der Anschluss erst mit Haltung UND Befestigungsgrad', () => {
    const snap = { areaIds: new Set(['alt-1']) };
    const mit = (over) => storeWith({ areas: [{ id: 'alt-1' }, { id: 'neu', ...over }] });

    expect(anschluss.check(mit({ edgeId: 'R_019', runoffCoeff: 0.2 }), snap)).toBe(true);
    expect(anschluss.check(mit({ edgeId: 'R_019', runoffCoeff: 0.9 }), snap)).toBe(false);
    expect(anschluss.check(mit({ edgeId: 'R_007', runoffCoeff: 0.2 }), snap)).toBe(false);
    expect(anschluss.check(mit({ runoffCoeff: 0.2 }), snap)).toBe(false);
  });

  it('eine passende BESTANDSflaeche erfuellt die Aufgabe nicht', () => {
    // Sonst waere die Uebung schon vor dem ersten Klick erledigt.
    const store = storeWith({ areas: [{ id: 'alt-1', edgeId: 'R_019', runoffCoeff: 0.2 }] });
    expect(anschluss.check(store, { areaIds: new Set(['alt-1']) })).toBe(false);
  });

  it('resolveStepDraw haelt kaputte Umrisse zurueck, statt zu werfen', () => {
    expect(resolveStepDraw({ draw: [{ x: 1, y: 2 }] }, {})).toBeNull();
    expect(resolveStepDraw({ draw: [{ x: NaN, y: 2 }, { x: 3, y: 4 }] }, {})).toBeNull();
    expect(resolveStepDraw({ draw: () => { throw new Error('kaputt'); } }, {})).toBeNull();
    expect(resolveStepDraw({}, {})).toBeNull();
  });
});

describe('Auslaufbauwerke: Fuehrung durch die Datenbearbeitung', () => {
  const stepById = (id) => EXERCISE_STEPS.find(s => s.id === id);
  const folge = ['ex-outfalls-oeffnen', 'ex-outfalls-suchen', 'ex-outfalls-typ', 'ex-outfalls-uebernehmen'];

  it('die vier Schritte stehen luecken los hintereinander', () => {
    const idx = folge.map(id => EXERCISE_STEPS.indexOf(stepById(id)));
    expect(idx.every(i => i >= 0)).toBe(true);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1);
  });

  it('jeder Schritt hebt ein Bedienelement hervor', () => {
    // Ausdruecklicher Nutzer-Wunsch: was abgegangen wird, leuchtet gruen.
    for (const id of folge) expect(stepById(id).highlight, id).toBeTruthy();
  });

  it('die drei Fuehrungs-Schritte haengen am geoeffneten Fenster', () => {
    const zu = storeWith({ ui: { showPreprocessingModal: false } });
    const auf = storeWith({ ui: { showPreprocessingModal: true } });
    expect(stepById('ex-outfalls-oeffnen').check(zu)).toBe(false);
    expect(stepById('ex-outfalls-oeffnen').check(auf)).toBe(true);
    expect(stepById('ex-outfalls-suchen').requires(zu)).toBe(false);
    expect(stepById('ex-outfalls-suchen').requires(auf)).toBe(true);
  });

  it('der Abschluss haengt NICHT am Fenster, sondern am Ergebnis', () => {
    // Wer ohne "Uebernehmen" schliesst, soll den Schritt behalten.
    expect(stepById('ex-outfalls-uebernehmen').requires).toBeUndefined();
  });

  it('erledigt ist es erst, wenn BEIDE Knoten Auslaufbauwerke sind', () => {
    const mk = (a, b) => storeWith({
      nodes: new Map([['AL1_RBB', { id: 'AL1_RBB', bauwerkstyp: a }], ['AL2_RRB', { id: 'AL2_RRB', bauwerkstyp: b }]]),
    });
    const check = stepById('ex-outfalls-uebernehmen').check;
    expect(check(mk(null, null))).toBe(false);
    expect(check(mk(5, null))).toBe(false);
    expect(check(mk(5, 5))).toBe(true);
  });

  it('die Knoten-IDs stimmen mit der Beispiel-XML ueberein', () => {
    // AL1 endet auf RBB, AL2 auf RRB — die Asymmetrie steckt so in den Daten.
    // Ein stiller Tippfehler hier haette die Aufgabe unloesbar gemacht.
    const xml = fs.readFileSync(
      path.resolve(__dirname, '../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml'), 'utf-8');
    for (const id of TUTORIAL_OUTFALL_NODES) {
      expect(xml, `Knoten "${id}" fehlt in der Beispiel-XML`).toContain(`<Objektbezeichnung>${id}</Objektbezeichnung>`);
    }
  });

  it('das Pumpwerk heisst in der Beispiel-XML wirklich so', () => {
    const xml = fs.readFileSync(
      path.resolve(__dirname, '../../../../public/saintv1d/tutorial/Beispiel_Tutorial.xml'), 'utf-8');
    expect(xml).toContain('<Objektbezeichnung>Pumpwerk</Objektbezeichnung>');
  });
});

describe('Regen: Fuehrung durch das KOSTRA-Fenster', () => {
  const stepById = (id) => EXERCISE_STEPS.find(s => s.id === id);
  const folge = ['ex-rain-kostra', 'ex-rain-abrufen', 'ex-rain-uebernehmen'];

  it('die drei Schritte folgen direkt auf "Uebernehmen" in der Datenbearbeitung', () => {
    const nachher = EXERCISE_STEPS.indexOf(stepById('ex-outfalls-uebernehmen'));
    const idx = folge.map(id => EXERCISE_STEPS.indexOf(stepById(id)));
    expect(idx[0]).toBe(nachher + 1);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1);
  });

  it('jeder Schritt hebt sein Bedienelement hervor', () => {
    for (const id of folge) expect(stepById(id).highlight, id).toBeTruthy();
  });

  it('das Abrufen gilt nur bei geoeffnetem KOSTRA-Fenster', () => {
    expect(stepById('ex-rain-abrufen').requires(storeWith({ ui: { showKostraModal: false } }))).toBe(false);
    expect(stepById('ex-rain-abrufen').requires(storeWith({ ui: { showKostraModal: true } }))).toBe(true);
  });

  it('das Abrufen ist erledigt, sobald ein Ergebnis vorliegt', () => {
    const check = stepById('ex-rain-abrufen').check;
    expect(check(storeWith({ ui: {}, rain: { kostraData: null } }))).toBe(false);
    expect(check(storeWith({ ui: {}, rain: { kostraData: { 5: { RN_001A: 200 } } } }))).toBe(true);
    // ...oder wenn der Nutzer schon durchgeklickt und uebernommen hat
    expect(check(storeWith({ ui: {}, rain: { method: 'kostra', intensity: 120 } }))).toBe(true);
  });

  // Regressionsschutz: frueher stand hier ein eigenes Flag (ui.kostraResultReady),
  // das der Abruf setzte und niemand zuruecksetzte. Das Fenster haengt an v-if,
  // beim Schliessen starb sein lokales `result` — das Flag blieb stehen. Folge:
  // beim Wiederoeffnen uebersprang die Ratte das Abrufen und leuchtete auf einen
  // [Uebernehmen]-Knopf, den es nicht gab. `rain.kostraData` ueberlebt das
  // Schliessen absichtlich (es IST das Ergebnis), deshalb bleibt der Schritt
  // erledigt — und 1b sorgt dafuer, dass das Leuchten trotzdem stimmt.
  it('das Abrufen bleibt erledigt, wenn der Nutzer das Fenster schliesst', () => {
    const nachAbruf = { ui: { showKostraModal: false }, rain: { kostraData: { 5: {} } } };
    expect(stepById('ex-rain-abrufen').check(storeWith(nachAbruf))).toBe(true);
  });

  it('uebernommen ist der Regen erst mit Methode UND Wert', () => {
    const check = stepById('ex-rain-uebernehmen').check;
    expect(check(storeWith({ rain: { method: 'model', intensity: 120 } }))).toBe(false);
    expect(check(storeWith({ rain: { method: 'kostra', intensity: 0 } }))).toBe(false);
    expect(check(storeWith({ rain: { method: 'kostra', intensity: 120 } }))).toBe(true);
  });

  it('der Abschluss haengt NICHT am offenen Fenster', () => {
    expect(stepById('ex-rain-uebernehmen').requires).toBeUndefined();
  });
});

describe('Pumpwerk ist aus der Uebung entfernt', () => {
  it('kein Schritt verlangt mehr eine Dimensionierung', () => {
    expect(EXERCISE_STEPS.some(s => s.id === 'ex-pump')).toBe(false);
    expect(EXERCISE_STEPS.some(s => /pump/i.test(s.task || ''))).toBe(false);
  });
});

describe('Abschluss: Berechnung starten und uebergeben', () => {
  const stepById = (id) => EXERCISE_STEPS.find(s => s.id === id);
  const lauf = stepById('ex-run');
  const fehler = stepById('ex-handover-fehler');
  const fertig = stepById('ex-done');
  const sim = (o) => storeWith({ simulation: { status: 'idle', error: null, preSolveWarnings: [], ...o } });

  it('die Berechnung ist der letzte Handgriff, danach folgt die Uebergabe', () => {
    const i = EXERCISE_STEPS.indexOf(lauf);
    expect(EXERCISE_STEPS[i + 1]).toBe(fehler);
    expect(EXERCISE_STEPS[i + 2]).toBe(fertig);
    expect(EXERCISE_STEPS[i + 2]).toBe(EXERCISE_STEPS[EXERCISE_STEPS.length - 1]);
  });

  it('der Lauf gilt als erledigt, egal ob er glueckt oder scheitert', () => {
    // Die Uebung endet mit dem Druck auf den Knopf — was danach kommt, ist
    // echte Arbeit am Netz und nicht mehr Sache des Tutorials.
    expect(lauf.check(sim({ status: 'idle' }))).toBe(false);
    expect(lauf.check(sim({ status: 'running' }))).toBe(false);
    expect(lauf.check(sim({ status: 'success' }))).toBe(true);
    expect(lauf.check(sim({ status: 'error' }))).toBe(true);
  });

  it('genau EINE der beiden Abschluss-Varianten greift immer', () => {
    // Sonst endete die Uebung wortlos.
    for (const zustand of [
      sim({ status: 'success' }),
      sim({ status: 'error', error: 'Knoten X ohne Sohlhoehe' }),
      sim({ status: 'success', preSolveWarnings: [{ id: 'A', text: 'w' }] }),
    ]) {
      const treffer = [fehler, fertig].filter(s => s.requires(zustand));
      expect(treffer, JSON.stringify(zustand.simulation)).toHaveLength(1);
    }
  });

  it('die Uebergabe nennt den konkreten Fehler', () => {
    const txt = fehler.message(sim({ status: 'error', error: 'Knoten X ohne Sohlhoehe' }));
    expect(txt).toContain('Knoten X ohne Sohlhoehe');
    expect(txt).toMatch(/bist du dran/i);
  });

  it('die Uebergabe zaehlt auch reine Warnungen auf', () => {
    const txt = fehler.message(sim({ status: 'success', preSolveWarnings: [{ id: 'A' }, { id: 'B' }] }));
    expect(txt).toContain('2');
    expect(txt).toMatch(/bist du dran/i);
  });
});

// Der Waechter ueber den Fortschritts-Signalen steht jetzt in
// test/fortschrittsSignale.test.js. Hier las er die .vue-Datei als Zeichenkette
// und verglich sie mit neun von Hand gepflegten Feldnamen — er mass also etwas
// anderes als das, was bricht, und deckte nur einen Teil ab.
