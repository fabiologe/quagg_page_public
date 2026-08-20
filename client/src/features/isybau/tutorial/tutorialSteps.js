// Deklarativer Tutorial-Inhalt — die EINZIGE Stelle für Texte, Moods,
// Reihenfolge, Highlight-Ziele und Weiter-Bedingungen. Komponenten und
// Trigger-Verdrahtung kennen nur die Namen hier.
//
// Step-Schema:
//   id        eindeutiger Name (Debug/Tests)
//   mood      Key aus moods.js (happy | sad | asking | surprised | rain)
//   message   String ODER Funktion (store) => String für dynamische Texte
//   highlight optional: data-tutorial-Anker, der/die hervorgehoben werden —
//             String, Array mehrerer Anker ODER `(store) => String|Array|null`
//             fuer Ziele, die vom Zustand abhaengen (z.B. "der Uebernehmen-
//             Knopf, solange das Fenster offen ist — sonst der Knopf, der es
//             wieder oeffnet"). Aufgeloest von resolveStepHighlight().
//   once      optional (nur reaktiv): Step feuert nur einmal pro Sitzung
//   info      optional: Key aus tutorialInfo.js — zeigt [Mehr dazu]-Button
//             mit Lernkarte fuer Studenten

// ── Geführte Tour (erster Besuch, der Reihe nach) ────────────────────────────
// ── Einstiegspunkt ──────────────────────────────────────────────────────────
// Frueher lag hier eine siebenschrittige Fuehrung durch die Oberflaeche
// (Import -> Editor -> Regen -> Berechnung -> Ergebnisse). Die ist entfallen:
// Das interaktive Tutorial (tutorialExercise.js) erklaert dieselben Dinge
// gruendlicher UND laesst den Nutzer dabei selbst arbeiten. Zwei Fuehrungen
// nebeneinander waeren nur doppelt gepflegter Text gewesen.
//
// Uebrig bleibt bewusst nur die Begruessung mit zwei Moeglichkeiten:
// Tutorial starten oder die Ratte wegschicken.
export const TOUR_STEPS = [
  {
    id: 'welcome',
    mood: 'happy',
    message:
      'Guten Tag Kanaltaucher! Ich bin deine Kanalratte. Wenn du magst, zeig ich dir, '
      + 'wie man hier ein Kanalnetz durchrechnet — ein Uebungsnetz bring ich mit.',
  },
];

// ── Exit-Rückfrage & Kill-Sequenz ────────────────────────────────────────────
// „Tour beenden" führt erst zu dieser Rückfrage; [Nein] spielt die
// Kill-Sequenz ab und legt die Ratte für den Rest der Sitzung schlafen.
export const EXIT_CONFIRM_STEP = {
  id: 'confirm-exit',
  mood: 'asking',
  message: 'Okay... aber sag: Willst du mich wieder sehen?',
};

export const KILL_STEPS = [
  // Schuss: erschrockene Ratte, dann (nach GIF_DELAY_MS im Mascot) das
  // gespiegelte kill_rat.gif samt Knall. duration = Verzögerung + GIF-Zeit.
  {
    id: 'kill-shot',
    mood: 'surprised',
    gif: true,
    sound: '/saintv1d/tutorial/universfield-shotgun-blast-352038.mp3',
    duration: 2400,
  },
  // Abgang: rat_kill (2,5 s bei Speed 0.25) läuft einmal durch, bleibt auf
  // dem letzten Frame stehen und wird dann sanft ausgeblendet.
  { id: 'kill-aftermath', mood: 'kill', freeze: true, duration: 3400 },
];

// ── Reaktive Kommentare (nach der Tour, auf User-Aktionen) ───────────────────
export const REACTIVE_STEPS = {
  'xml-imported': {
    id: 'reactive-xml-imported',
    mood: 'happy',
    info: 'isybau-xml',
    message: (store) =>
      `Netz geladen: ${store.nodes.size} Schaechte und ${store.edges.size} Haltungen. Sieht gut aus!`,
  },
  'import-warnings': {
    id: 'reactive-import-warnings',
    mood: 'surprised',
    info: 'isybau-xml',
    message: (store) =>
      `Oha — beim Import gab es ${store.ui.importWarnings.length} Warnung(en). Schau dir die Meldung unten rechts an.`,
  },
  'rain-configured': {
    id: 'reactive-rain-configured',
    mood: 'rain',
    info: 'bemessungsregen',
    once: true,
    message: 'Regen steht! Dann kann die Berechnung ja losgehen.',
  },
  'simulation-running': {
    id: 'reactive-simulation-running',
    mood: 'asking',
    message: 'Der Solver rechnet... einen Moment, ich halt die Pfoten still.',
  },
  'simulation-success': {
    id: 'reactive-simulation-success',
    mood: 'happy',
    info: 'ergebnisse-lesen',
    message: 'Berechnung fertig! Schau dir die Ergebnisse oben an.',
  },
  'simulation-error': {
    id: 'reactive-simulation-error',
    mood: 'sad',
    info: 'fehlerdiagnose',
    message: (store) =>
      `Mist, die Berechnung ist fehlgeschlagen${store.simulation.error ? `: ${store.simulation.error}` : '.'} Pruef die Daten im Preprocessing.`,
  },
  'first-element-created': {
    id: 'reactive-first-element-created',
    mood: 'happy',
    once: true,
    message: 'Dein erstes Element steht! Weiter so — Schacht fuer Schacht zum Netz.',
  },
  'location-set': {
    id: 'reactive-location-set',
    mood: 'happy',
    info: 'standort-georeferenz',
    once: true,
    message: 'Startort gesetzt! Damit legt sich gleich die EZG-Karte mit Luftbild und Hoehenlinien unter dein Netz.',
  },
  'terrain-imported': {
    id: 'reactive-terrain-imported',
    mood: 'happy',
    info: 'dgm-gelaende',
    once: true,
    message: (store) =>
      `Eigenes Gelaendemodell geladen: ${store.terrain.ncols}x${store.terrain.nrows} Zellen. Ab jetzt schlage ich dir Deckelhoehen daraus vor.`,
  },
  'ezg-enabled': {
    id: 'reactive-ezg-enabled',
    mood: 'surprised',
    info: 'ezg-karte',
    once: true,
    message: 'EZG-Karte an: Luftbild und Hoehenlinien im Hintergrund helfen dir, das Netz am echten Gelaende auszurichten.',
  },
  'theme-toggled': {
    id: 'reactive-theme-toggled',
    mood: 'surprised',
    once: true,
    message: (store) =>
      store.ui.darkMode ? 'Oh, jetzt wird es dunkel hier unten!' : 'Autsch, Tageslicht! Aber gut fuer die Augen.',
  },
};
