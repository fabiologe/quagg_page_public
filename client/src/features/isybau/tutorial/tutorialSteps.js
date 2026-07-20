// Deklarativer Tutorial-Inhalt — die EINZIGE Stelle für Texte, Moods,
// Reihenfolge, Highlight-Ziele und Weiter-Bedingungen. Komponenten und
// Trigger-Verdrahtung kennen nur die Namen hier.
//
// Step-Schema:
//   id        eindeutiger Name (Debug/Tests)
//   mood      Key aus moods.js (happy | sad | asking | surprised | rain)
//   message   String ODER Funktion (store) => String für dynamische Texte
//   highlight optional: data-tutorial-Anker, der hervorgehoben wird
//   advanceOn optional (nur Tour): Trigger-Name, der den Step automatisch
//             weiterschaltet ([Weiter] bleibt als Alternative sichtbar)
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
    highlight: 'xml-import',
    advanceOn: 'xml-imported',
    message:
      'Zuerst brauchen wir ein Netz: Lad links ein ISYBAU-XML hoch — oder klick auf Weiter und zeichne selbst eins.',
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
};
