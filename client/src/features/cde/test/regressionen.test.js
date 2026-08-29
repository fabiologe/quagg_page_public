/**
 * Wächter über Fehler, die schon einmal da waren.
 *
 * Alle fünf am 29.08.2026 beim Zerlegungs-Audit gefunden. Gemeinsam ist
 * ihnen, dass die Testsuite sie nicht sehen konnte: keiner der 42 Tests
 * importiert `IfcEngine` oder `IfcViewer.vue` — beide brauchen WebGL. Was
 * bleibt, ist die Hausantwort auf diese Lage: ein textlesender Strukturtest.
 * Er beweist nichts über das Laufzeitverhalten, aber er fängt genau den
 * Rückfall, der hier passiert ist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WURZEL = new URL('..', import.meta.url).pathname;
const lies = (p) => readFileSync(join(WURZEL, p), 'utf8');

describe('Bauteil-Kennung überlebt die Auswahl', () => {
  // Gefunden: `pickElement` gab nur die geparsten Merkmale zurück — ohne
  // modelId und localId. Damit waren `el.localId` und `el.modelId` in
  // IfcViewer.vue überall undefined. Folge: der Auswahl-Anker blieb null,
  // das Kontextmenü am Bauteil (AP-U4) erschien nie, „Issue hier anlegen"
  // brach still ab, und „Zoom auf Auswahl" rief zoomToElement(undefined,
  // undefined).
  const engine = lies('services/IfcEngine.js');

  it('gibt pickElement modelId und localId mit heraus', () => {
    const block = engine.slice(engine.indexOf('async pickElement'));
    const ende = block.slice(0, block.indexOf('\n    }'));
    expect(ende).toMatch(/modelId:\s*fmodel\.modelId/);
    expect(ende).toMatch(/localId/);
  });

  it('gibt refreshElement dieselbe Kennung mit', () => {
    // Sonst verliert das Bauteil sie beim Neuladen der Merkmale wieder.
    const block = engine.slice(engine.indexOf('async refreshElement'));
    const ende = block.slice(0, block.indexOf('\n    }'));
    expect(ende).toMatch(/modelId/);
    expect(ende).toMatch(/localId/);
  });
});

describe('Methoden, die Aufrufer voraussetzen, gibt es auch', () => {
  // Gefunden: `engine.getBoxes(...)` wurde an zwei Stellen benutzt — die
  // Methode existierte nie. An der einen schluckte ein try/catch den Fehler,
  // an der anderen nicht.
  it('IfcEngine.getBoxes existiert', () => {
    expect(lies('services/IfcEngine.js')).toMatch(/^\s*async getBoxes\(/m);
  });

  it('IfcCamera.dispose existiert', () => {
    // Die Engine fasste vorher `camera._auxRT` an — ein privates Feld des
    // Dienstes. Der Hausvertrag sagt: der Besitzer ruft Methoden.
    expect(lies('services/IfcCamera.js')).toMatch(/^\s*dispose\(\)/m);
    expect(lies('services/IfcEngine.js')).not.toContain('camera._auxRT');
  });

  it('jede in IfcViewer gerufene Engine-Methode gibt es', () => {
    // Die eigentliche Fehlerklasse hinter getBoxes: ein Tippfehler oder eine
    // nie gebaute Methode fällt erst im Browser auf.
    const viewer = lies('components/IfcViewer.vue');
    const engine = lies('services/IfcEngine.js');
    const vorhanden = new Set(
      [...engine.matchAll(/^\s{4}(?:async\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm)].map((m) => m[1]),
    );
    const gerufen = new Set(
      [...viewer.matchAll(/\bengine(?:\.value)?[?.]*\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)].map((m) => m[1]),
    );
    // Schutz gegen Leerlauf: ein Test, der zwei leere Mengen vergleicht, ist
    // immer gruen. Sollte ein Umbau die Aufrufform aendern (etwa weil der
    // Zugriff in ein Composable wandert), faellt das hier auf statt still zu
    // verschwinden.
    expect(vorhanden.size).toBeGreaterThan(80);
    expect(gerufen.size).toBeGreaterThan(40);
    expect(gerufen.has('getBoxes')).toBe(true);
    expect([...gerufen].filter((n) => !vorhanden.has(n))).toEqual([]);
  });
});

describe('Template-Refs sind deklariert', () => {
  // Gefunden: `storeyNavRef` wurde in drei Befehlen benutzt und im Template
  // gesetzt, aber in <script setup> nie als ref(null) deklariert — jeder
  // Aufruf der Ebenen-Befehle aus der Palette warf einen ReferenceError.
  it('jede ref="…" im Template hat ein const … = ref() im Script', () => {
    const quelle = lies('components/IfcViewer.vue');
    const template = quelle.slice(0, quelle.indexOf('<script setup>'));
    const script = quelle.slice(quelle.indexOf('<script setup>'));
    const refs = [...template.matchAll(/\sref="([a-zA-Z_][a-zA-Z0-9_]*)"/g)].map((m) => m[1]);
    expect(refs).toContain('storeyNavRef');   // Schutz gegen Leerlauf
    const fehlend = [];
    for (const m of template.matchAll(/\sref="([a-zA-Z_][a-zA-Z0-9_]*)"/g)) {
      const re = new RegExp(`\\b(?:const|let)\\s+${m[1]}\\s*=`);
      if (!re.test(script)) fehlend.push(m[1]);
    }
    expect(fehlend).toEqual([]);
  });
});

describe('Die Engine folgt dem Issue-Store', () => {
  // Gefunden: von sieben mutierenden Store-Operationen spiegelte genau EINE
  // in die Engine. Löschen, Farbwechsel, „alle löschen" und der BCF-Import
  // blieben als Pins im 3D-Bild stehen. Fehlerklasse „gespiegelter Zustand
  // läuft auseinander".
  it('eine Beobachtung statt sieben Einzelspiegelungen', () => {
    const viewer = lies('components/IfcViewer.vue');
    expect(viewer).toMatch(/watch\(\s*\n?\s*\(\)\s*=>\s*ifc\.annotations\.map/);
    expect(viewer).toContain('engine.value?.setAnnotations(ifc.annotations)');
  });
});

describe('Kein doppelter Code für die Schnitt-Rückmeldung', () => {
  // Gefunden: die Registrierung stand Zeichen für Zeichen an zwei Stellen.
  it('wird an einer Stelle angemeldet', () => {
    const viewer = lies('components/IfcViewer.vue');
    const direkt = viewer.match(/setSectionChangeCallback\(\(\)\s*=>/g) ?? [];
    expect(direkt.length).toBe(1);           // nur im Helfer
    expect(viewer).toContain('_schnittRueckmeldungAnmelden');
  });
});
