/**
 * Die Entflechtung der Engine (Sprint I, Stufe 5).
 *
 * `IfcEngine` war eine Klasse mit rund 95 Methoden über ein Dutzend Belange.
 * Prüfbar war davon nichts: kein einziger der Tests importiert sie, weil sie
 * WebGL braucht. Genau deshalb lagen dort sechs Fehler unentdeckt.
 *
 * Ausgelagert wird nach dem Hausmuster von `IfcCamera` und
 * `IfcSelectionHandler`: ES-Klasse, EIN Optionsobjekt im Konstruktor,
 * Abhängigkeiten als Getter-Closures (die World gibt es erst nach `init()`),
 * und der Besitzer behält 1:1-Delegationen, damit Aufrufer unberührt bleiben.
 *
 * Diese Tests halten den Vertrag fest. Sie prüfen Text, nicht Verhalten — das
 * ist die Hausantwort, wenn eine Einheit ohne WebGL nicht instanziierbar ist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = new URL('..', import.meta.url).pathname;
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');
const ENGINE = lies('services/IfcEngine.js');

/** Öffentliche Methoden einer Dienstklasse (ohne Unterstrich, ohne constructor). */
function methoden(quelle) {
  return [...quelle.matchAll(/^ {4}(?:async )?([a-zA-Z][a-zA-Z0-9_]*)\s*\(/gm)]
    .map((m) => m[1])
    .filter((n) => n !== 'constructor');
}

const DIENSTE = [
  { datei: 'services/IfcCamera.js',      feld: 'camera' },
  { datei: 'services/IfcAnnotations.js', feld: 'annotations' },
  { datei: 'services/IfcMeasure.js',     feld: 'measure' },
  { datei: 'services/IfcGridAxes.js',    feld: 'gridAxes' },
  { datei: 'services/IfcSection.js',     feld: 'section' },
  { datei: 'services/IfcStoreys.js',     feld: 'storeys' },
  // Teil XVI: der eine Besitzer temporärer Grafik (Zeiger, Vorschau, Griffe, Fang).
  { datei: 'services/IfcOverlay.js',     feld: 'overlay' },
];

describe('Hausmuster der Dienste', () => {
  it.each(DIENSTE)('$datei ist eine Klasse mit Optionsobjekt', ({ datei }) => {
    const q = lies(datei);
    expect(q).toMatch(/^export class Ifc[A-Za-z]+ \{$/m);
    // Entweder ein destrukturiertes Optionsobjekt oder gar kein Argument
    // (IfcGridAxes braucht nichts von außen).
    expect(q).toMatch(/constructor\((\{[^)]*\}|)\) \{/);
  });

  it.each(DIENSTE)('$datei hält seine Felder privat', ({ datei }) => {
    // Öffentliche Felder wären eine Einladung, von außen hineinzugreifen —
    // genau das war der Fall, als IfcEngine.dispose() an camera._auxRT ging.
    const q = lies(datei);
    const oeffentlich = [...q.matchAll(/^ {8}this\.([a-zA-Z][a-zA-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
    expect(oeffentlich).toEqual([]);
  });
});

describe('Die Engine delegiert vollständig', () => {
  it.each(DIENSTE)('delegiert nur an Methoden, die es in $datei gibt', ({ datei, feld }) => {
    // Die Richtung, die zählt. Umgekehrt („jede Dienstmethode braucht eine
    // Delegation") wäre falsch: ein Dienst darf Innenleben haben, das die
    // Engine nichts angeht — `IfcCamera.getControls` etwa bedient nur sie
    // selbst. Eine Delegation INS LEERE dagegen ist immer ein Fehler, und
    // sie fällt erst zur Laufzeit auf.
    const vorhanden = new Set(methoden(lies(datei)));
    const gerufen = [...ENGINE.matchAll(new RegExp(`this\\.${feld}\\.([a-zA-Z][a-zA-Z0-9_]*)\\(`, 'g'))]
      .map((m) => m[1])
      .filter((m) => !m.startsWith('_'));
    expect(gerufen.length).toBeGreaterThan(0);            // Schutz gegen Leerlauf
    expect(gerufen.filter((m) => !vorhanden.has(m))).toEqual([]);
  });

  it('lässt keine Vue-Komponente an den Diensten vorbeigreifen', () => {
    // `engine.camera.foo()` aus einer Komponente wäre der vierte Weg zur
    // Engine — die Fassade ist die viewerApi, nicht das Feld.
    const quellen = ['components/IfcViewer.vue', 'views/CdeView.vue'].map(lies).join('\n');
    for (const { feld } of DIENSTE) {
      expect(quellen, `${feld} wird direkt angefasst`).not.toMatch(
        new RegExp(`engine(\\.value)?[?.]*\\.${feld}\\.`),
      );
    }
  });

  it('legt die Dienste in init() an, nicht im Konstruktor', () => {
    // Die World existiert erst nach init(); ein Dienst, der sie im
    // Konstruktor griffe, bekäme undefined. Deshalb Getter-Closures.
    const init = ENGINE.slice(ENGINE.indexOf('async init('), ENGINE.indexOf('async loadIfc('));
    for (const { feld } of DIENSTE) {
      expect(init, `${feld} wird nicht in init() angelegt`).toMatch(new RegExp(`this\\.${feld}\\s*=\\s*new `));
    }
  });

  it('reicht die Weltabhängigkeit als Funktion herein, nicht als Wert', () => {
    expect(ENGINE).toMatch(/getWorld:\s*\(\)\s*=>\s*this\._getWorld\(\)/);
  });
});

describe('Ausgelagerte Belange sind wirklich draußen', () => {
  it('lässt keine Felder der Dienste in der Engine zurück', () => {
    // Ein zurückgewandertes Feld ist der Anfang der Wiedervereinigung: erst
    // liegt es hier, dann greift eine Methode darauf zu, dann zwei.
    const verirrt = [
      '_annotationGroup', '_annotations',
      '_measureGroup', '_measurePoints', '_measurements', '_hoverMarker', '_firstMarker',
      '_ifcGridGroups', '_auxRT', '_lastPlotFrustum',
      '_clippingPlane', '_planePivot', '_transformControls', '_tcHelper',
      '_sectionRenderHook', '_sectionChangeCallback', '_storeyElementCache',
    ].filter((f) => ENGINE.includes(`this.${f}`));
    expect(verirrt).toEqual([]);
  });

  it('behält das Picking — davon leben beide Dienste', () => {
    // `_probeWorldPoint` gehört zur Auswahl, nicht zu Messung oder Annotation.
    // Es wird beiden als Rückruf hereingereicht, statt zweimal nachgebaut.
    expect(ENGINE).toMatch(/_probeWorldPoint\(clientX, clientY\)/);
    expect(ENGINE).toMatch(/const probePoint = \(x, y\) => this\._probeWorldPoint\(x, y\)/);
    for (const d of ['services/IfcAnnotations.js', 'services/IfcMeasure.js']) {
      expect(lies(d)).toContain('this._probePoint(');
      expect(lies(d), `${d} baut das Picking nach`).not.toContain('_probeWorldPoint');
    }
  });

  it('lässt den Kern ungeschnitten', () => {
    // Kategorien, Auswahl, Sichtbarkeit und Zoom hängen über
    // `_categoryGroups` (acht Fremdzugriffe aus fünf Gruppen) und
    // `_selectedItems` so eng zusammen, dass sie EIN Belang sind. Sie zu
    // trennen hieße, die Kopplung durch Rückrufe zu ersetzen statt sie
    // aufzulösen.
    expect(ENGINE).toContain('this._categoryGroups');
    expect(ENGINE).toContain('this._selectedItems');
  });
});

describe('Eine Verdrahtungsart', () => {
  it('führt keine Engine-Rückrufe mehr im Store', () => {
    // Es gab drei Wege von Vue zur Engine: viewerApi (provide/inject), im
    // Store hinterlegte Rückrufe, und direkte engine-Referenzen. Beim
    // Zerlegen wäre daraus ein vierter geworden. Der Store hält jetzt
    // Zustand, er vermittelt nicht.
    const store = lies('stores/useIfcStore.js');
    for (const n of ['registerPsetHandler', 'registerSpatialHandler', 'registerZoomHandler',
                     'registerZoomCategoryHandler', 'registerBoxHandler']) {
      expect(store, `${n} lebt wieder`).not.toContain(n);
    }
  });
});
