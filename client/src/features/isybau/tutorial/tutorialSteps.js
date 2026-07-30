// Deklarativer Tutorial-Inhalt — die EINZIGE Stelle für Texte, Moods,
// Reihenfolge, Highlight-Ziele und Weiter-Bedingungen. Komponenten und
// Trigger-Verdrahtung kennen nur die Namen hier.
//
// Step-Schema:
//   id        eindeutiger Name (Debug/Tests)
//   mood      Key aus moods.js (happy | sad | asking | surprised | rain)
//   message   String ODER Funktion (store) => String für dynamische Texte
//   highlight optional: data-tutorial-Anker (String ODER Array mehrerer
//             Anker), der/die hervorgehoben werden
//   advanceOn optional (nur Tour): Trigger-Name ODER Array mehrerer
//             gleichwertiger Trigger-Namen, die den Step automatisch
//             weiterschalten ([Weiter] bleibt als Alternative sichtbar)
//   once      optional (nur reaktiv): Step feuert nur einmal pro Sitzung
//   info      optional: Key aus tutorialInfo.js — zeigt [Mehr dazu]-Button
//             mit Lernkarte fuer Studenten

// ── Geführte Tour (erster Besuch, der Reihe nach) ────────────────────────────
export const TOUR_STEPS = [
  {
    id: 'welcome',
    mood: 'happy',
    info: 'swmm-ueberblick',
    message:
      'Guten Tag Kanaltaucher! Ich bin deine Kanalratte und zeig dir, wie du hier ein Kanalnetz durchrechnest.',
  },
  {
    id: 'xml-import',
    mood: 'asking',
    info: 'isybau-xml',
    highlight: ['xml-import', 'neu-starten'],
    advanceOn: ['xml-imported', 'location-set'],
    message:
      'Hast du schon ein Netz, das du durchrechnen willst? Dann lad es links als ISYBAU-XML hoch. Fangen wir lieber neu an, klick auf "Neu starten" — dann waehlen wir zusammen einen Standort, und Luftbild samt Hoehenlinien legen sich gleich passend unter dein neues Netz.',
  },
  {
    id: 'editor',
    mood: 'happy',
    info: 'netzmodell',
    highlight: 'editor-toolbox',
    message:
      'Mit der Werkzeugleiste oben bearbeitest du das Netz: Schaechte setzen, Haltungen ziehen, Flaechen zeichnen, teilen und loeschen.',
  },
  {
    id: 'rain',
    mood: 'rain',
    info: 'bemessungsregen',
    highlight: 'rain-config',
    advanceOn: 'rain-configured',
    message:
      'Jetzt der Regen: Waehl links einen Modellregen oder hol dir echte KOSTRA-Daten fuer deine Koordinaten.',
  },
  {
    id: 'simulation',
    mood: 'asking',
    info: 'dynamic-wave',
    highlight: 'run-simulation',
    advanceOn: 'simulation-success',
    message:
      'Alles bereit — starte die Berechnung! Der SWMM-Solver rechnet direkt hier im Browser.',
  },
  {
    id: 'results',
    mood: 'happy',
    info: 'ergebnisse-lesen',
    highlight: 'view-results',
    message:
      'Geschafft! Die Ergebnisse findest du oben: als Karte, in 3D oder als Bericht mit allen Tabellen.',
  },
  {
    id: 'farewell',
    mood: 'happy',
    message:
      'Das wars von mir. Ich bleib in der Naehe und meld mich, wenn was passiert. Viel Erfolg, Kanaltaucher!',
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
