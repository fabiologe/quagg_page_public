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
    // Seit Stufe 5 liegt sie in `composables/useAnnotationen.js`.
    const ann = lies('composables/useAnnotationen.js');
    expect(ann).toMatch(/watch\(\s*\n?\s*\(\)\s*=>\s*ifc\.annotations\.map/);
    expect(ann).toContain('engine.value?.setAnnotations(ifc.annotations)');
    // Und es bleibt bei EINER: eine zweite Spiegelung wäre der Rückfall.
    expect(ann.match(/setAnnotations\(/g) ?? []).toHaveLength(1);
  });
});

describe('Kein doppelter Code für die Schnitt-Rückmeldung', () => {
  // Gefunden: die Registrierung stand Zeichen für Zeichen an zwei Stellen —
  // beim Einschalten des Werkzeugs und beim Anfahren eines Geschosses.
  //
  // Seit Stufe 5 liegt der Schnitt in `composables/useSchnitt.js`; der Viewer
  // ruft nur noch. Dass dieser Test die Verschiebung bemerkt hat, ist genau
  // sein Zweck — er prüft eine Eigenschaft, nicht eine Zeile.
  it('wird an einer Stelle angemeldet', () => {
    const schnitt = lies('composables/useSchnitt.js');
    expect(schnitt.match(/setSectionChangeCallback\(\(\)\s*=>/g) ?? []).toHaveLength(1);
    expect(schnitt).toContain('_rueckmeldungAnmelden');
  });

  it('lässt den Viewer den Schnittzustand nicht mehr selbst schreiben', () => {
    // Zwei Stellen setzten die vier Refs von außen. Jetzt gibt es dafür
    // `verwerfen()` und `uebernehmeVonEngine()`.
    const viewer = lies('components/IfcViewer.vue');
    // `=(?!=)` — sonst trifft die Regel auch VERGLEICHE. Genau das ist am
    // 31.08.2026 passiert: die Vorlage bekam `schnitt.modus.value === 'translate'`
    // (die Refs brauchen dort .value, siehe refsInVorlagen.test.js), und dieser
    // Wächter meldete einen Schreibzugriff, den es nie gab. Eine Regel, die
    // Zuweisung und Vergleich verwechselt, misst nicht das, was sie verspricht.
    expect(viewer).not.toMatch(/schnitt\.(aktiv|leisteOffen|modus|position)\.value\s*=(?!=)/);
    expect(viewer).toContain('schnitt.verwerfen()');
    expect(viewer).toContain('schnitt.uebernehmeVonEngine()');
  });
});

describe('Tastenkürzel stehen an zwei Stellen', () => {
  /**
   * Befund aus Stufe 5, NICHT behoben — bewusst.
   *
   * Die Kürzel sind zweimal beschrieben: als `key:` in der Befehls-Registry
   * (daraus baut `IfcShortcutsOverlay` die Hilfe) und als if-Kette in
   * `onKeyDown`. Sie zu vereinen scheitert daran, dass die Registry-Werte
   * BESCHRIFTUNGEN sind, keine Dispatch-Angaben: `key: 'T/R'` hängt am Befehl
   * „Schnitt umschalten", während T und R im Handler den Schnitt-MODUS setzen.
   * Würde man T durch die Registry leiten, schaltete es den Schnitt aus.
   *
   * Das geradezuziehen heißt, die Bedeutung der Registry zu ändern — eine
   * eigene Aufgabe. Bis dahin hält dieser Test wenigstens fest, dass jede
   * Taste, auf die der Viewer reagiert, auch in der Hilfe steht. Sonst gibt es
   * Kürzel, die niemand findet.
   */
  it('jede Taste im Handler ist in der Hilfe dokumentiert', () => {
    const viewer = lies('components/IfcViewer.vue');
    const handler = viewer.slice(viewer.indexOf('function onKeyDown'));
    const block = handler.slice(0, handler.indexOf('\n}\n'));

    const imHandler = new Set(
      [...block.matchAll(/e\.key === '([^']+)'/g)]
        .map((m) => m[1])
        .filter((k) => k.length === 1)          // Escape u. Ä. sind keine Kürzel
        .map((k) => k.toUpperCase()),
    );
    // In der Registry stehen Beschriftungen wie 'T/R' und 'Shift+A'.
    // Dokumentiert heisst: an einem sichtbaren Ort — in der Leisten-
    // Registry ODER in der Hilfe-Liste selbst (seit X2 wohnen Views und
    // Hilfe nicht mehr in der Leiste; ihre Tasten stehen im Overlay).
    const hilfe = lies('components/IfcShortcutsOverlay.vue');
    const dokumentiert = new Set(
      [...viewer.matchAll(/key: '([^']+)'/g), ...hilfe.matchAll(/keys: \['([^']+)'/g)]
        .flatMap((m) => m[1].split('/'))
        .map((k) => k.replace(/^Shift\+/, '').toUpperCase()),
    );
    // Strg+K und Strg+F sind Palettenkürzel und stehen dort eigens.
    for (const frei of ['K', 'F']) imHandler.delete(frei);

    expect(imHandler.size).toBeGreaterThan(4);   // Schutz gegen Leerlauf
    expect([...imHandler].filter((k) => !dokumentiert.has(k))).toEqual([]);
  });
});
