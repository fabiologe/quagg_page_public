// Lernstoff für Studenten — die „Mehr dazu"-Ebene des Tutorials.
// Steps referenzieren Einträge hier über ihren Key (`info: 'bemessungsregen'`),
// mehrere Steps dürfen denselben Eintrag teilen.
//
// Block-Schema (gerendert von TutorialInfoCard.vue):
//   { type: 'p', text }        Absatz
//   { type: 'formula', text }  Formel-Zeile (hervorgehobene Mono-Box)
//   { type: 'ref', text }      Quellen-/Normverweis (gedimmt)
//
// Titel erscheinen in 'Press Start 2P' (kein ä/ö/ü im Font — ASCII halten!),
// Fließtext in 'Share Tech Mono' (Umlaute ok).

export const TUTORIAL_INFO = {
  'swmm-ueberblick': {
    title: 'SWMM & KANALNETZ-SIMULATION',
    blocks: [
      {
        type: 'p',
        text: 'SWMM (Storm Water Management Model) der US-EPA ist seit den 1970ern der Standard für urbane Niederschlag-Abfluss-Simulation. Hier läuft der originale SWMM-5.2-Rechenkern — zu WebAssembly kompiliert, direkt im Browser.',
      },
      {
        type: 'p',
        text: 'Das Kanalnetz wird eindimensional (1D) abgebildet: Schächte sind Knoten, Haltungen sind Kanten eines gerichteten Graphen. An jedem Knoten gilt Massenerhaltung, in jeder Haltung wird der Abfluss hydraulisch berechnet.',
      },
      {
        type: 'p',
        text: 'Für die Berechnung nutzt SWMM hier die Dynamic-Wave-Methode: Sie löst die vollständigen Flachwassergleichungen und kann damit Rückstau, Fließumkehr und Einstau abbilden — Dinge, die das einfachere Kinematic-Wave-Verfahren nicht kann.',
      },
      { type: 'ref', text: 'EPA SWMM 5 Reference Manual, Vol. II — Hydraulics' },
    ],
  },

  'isybau-xml': {
    title: 'ISYBAU-AUSTAUSCHFORMAT',
    blocks: [
      {
        type: 'p',
        text: 'ISYBAU ist das standardisierte XML-Austauschformat der öffentlichen Hand (Arbeitshilfen Abwasser) für Kanaldaten. Kommunen und Ingenieurbüros tauschen damit Bestandsdaten aus.',
      },
      {
        type: 'p',
        text: 'Beim Import werden aus den Stammdaten die Schächte (mit Deckel- und Sohlhöhe), Haltungen (mit Profil, Nennweite, Material) und befestigte Flächen gelesen. Aus dem Material leitet das Tool die hydraulische Rauheit ab.',
      },
      {
        type: 'p',
        text: 'Fehlende Sohlhöhen werden zwischen bekannten Werten interpoliert — im Bericht als Annahme ausgewiesen. Faustregel: je vollständiger die Vermessung, desto belastbarer das Modell.',
      },
      { type: 'ref', text: 'BFR Abwasser — Arbeitshilfen Abwasser, ISYBAU-XML' },
    ],
  },

  netzmodell: {
    title: 'DAS NETZ ALS MODELL',
    blocks: [
      {
        type: 'p',
        text: 'Ein Kanalnetzmodell besteht aus drei Bausteinen: Schächte (Knoten mit Sohl- und Deckelhöhe), Haltungen (Rohre mit Profil, Länge, Gefälle, Rauheit) und Einzugsflächen, die ihren Abfluss in Schächte einleiten.',
      },
      {
        type: 'p',
        text: 'Das Sohlgefälle einer Haltung ergibt sich aus den Sohlhöhen ihrer Endschächte. Zusammen mit Profil und Rauheit bestimmt es die Leistungsfähigkeit — nach Manning-Strickler gilt für Normalabfluss:',
      },
      { type: 'formula', text: 'v = kst · R^(2/3) · I^(1/2)' },
      {
        type: 'p',
        text: 'kst = Rauheitsbeiwert (Beton ca. 75-90 m^(1/3)/s), R = hydraulischer Radius (A/U), I = Sohlgefälle. Kleines Gefälle oder raues Rohr => weniger Kapazität.',
      },
      {
        type: 'p',
        text: 'Jede Fläche bekommt einen Abflussbeiwert: Dachflächen geben fast alles ab, Grünflächen versickern den Großteil. Die Flächenaufteilung ist oft der größte Hebel im Modell.',
      },
      { type: 'ref', text: 'DWA-A 110 — hydraulische Bemessung; DWA-A 118' },
    ],
  },

  bemessungsregen: {
    title: 'BEMESSUNGSREGEN & KOSTRA',
    blocks: [
      {
        type: 'p',
        text: 'Kanalnetze werden nicht für "irgendeinen" Regen bemessen, sondern für statistisch definierte Ereignisse: Ein Regen mit Wiederkehrzeit T = 5 a tritt im Mittel alle 5 Jahre auf. Je seltener, desto intensiver.',
      },
      {
        type: 'p',
        text: 'KOSTRA-DWD liefert für jede Koordinate in Deutschland die Regenhöhe hN je Dauerstufe D und Wiederkehrzeit T. Das Tool holt diese Werte direkt für die Netz-Koordinaten.',
      },
      {
        type: 'p',
        text: 'Der Blockregen verteilt hN gleichmäßig über D — einfach, aber unrealistisch. Der Modellregen Euler Typ II legt die Spitzenintensität bei ca. 1/3 der Dauer und ist der Standard für Kanalnetz-Nachweise.',
      },
      {
        type: 'p',
        text: 'Zur Plausibilisierung dient das Fließzeitverfahren: Der Spitzenabfluss einer Fläche ergibt sich vereinfacht zu',
      },
      { type: 'formula', text: 'Q = psi · i · A' },
      {
        type: 'p',
        text: 'psi = Spitzenabflussbeiwert (0..1), i = Regenspende in l/(s*ha), A = Fläche in ha. Das Tool rechnet diesen Handwert automatisch gegen das SWMM-Ergebnis.',
      },
      { type: 'ref', text: 'DWA-A 118 — hydraulische Bemessung von Entwaesserungssystemen; KOSTRA-DWD 2020' },
    ],
  },

  'dynamic-wave': {
    title: 'DYNAMIC WAVE / ST. VENANT',
    blocks: [
      {
        type: 'p',
        text: 'Die Dynamic-Wave-Berechnung löst die Saint-Venant-Gleichungen: Kontinuität (Massenerhaltung) plus Impulsgleichung mit allen Termen — Trägheit, Druck, Gefälle und Reibung.',
      },
      { type: 'formula', text: 'dA/dt + dQ/dx = 0   (Kontinuitaet)' },
      {
        type: 'p',
        text: 'Nur damit lassen sich Rückstau von unten, Fließumkehr, Einstau bis zur Geländeoberkante und druckabflussartige Zustände korrekt abbilden — genau die Effekte, die bei Starkregen zählen.',
      },
      {
        type: 'p',
        text: 'Der Preis: Das Verfahren ist nur bei kleinen Zeitschritten stabil. SWMM passt den Zeitschritt dynamisch nach dem Courant-Kriterium an — die Welle darf pro Zeitschritt nicht weiter laufen als eine Rechenzelle lang ist.',
      },
      {
        type: 'p',
        text: 'Instabilitäten zeigen sich als zappelnde Ganglinien oder hohe Kontinuitätsfehler einzelner Knoten. Der Bericht listet solche Knoten explizit auf.',
      },
      { type: 'ref', text: 'EPA SWMM 5 Reference Manual, Vol. II — Dynamic Wave Routing' },
    ],
  },

  'ergebnisse-lesen': {
    title: 'ERGEBNISSE RICHTIG LESEN',
    blocks: [
      {
        type: 'p',
        text: 'Auslastung d/D: Verhältnis von maximalem Wasserstand zum Rohrdurchmesser. d/D < 0,9 gilt als unkritisch; ab 1,0 fließt die Haltung voll (Druckabfluss).',
      },
      {
        type: 'p',
        text: 'Überstau: Steigt der Wasserspiegel im Schacht über die Deckelhöhe, tritt Wasser aus. Das Überstauvolumen sagt, wie viel — es ist die zentrale Größe für den Überflutungsnachweis.',
      },
      {
        type: 'p',
        text: 'Fließgeschwindigkeit: v_max sollte grob zwischen 0,5 und 6 m/s liegen. Zu langsam => Ablagerungen, zu schnell => Abrieb und Lärm.',
      },
      {
        type: 'p',
        text: 'Modellqualität: Der Kontinuitätsfehler (Massenbilanz) sollte unter ca. 5 % liegen. Deutlich höhere Werte deuten auf numerische Probleme hin — dann den Ergebnissen nicht blind vertrauen.',
      },
      { type: 'ref', text: 'DWA-A 110; DWA-A 118 — Ueberstau- und Ueberflutungsnachweis' },
    ],
  },

  fehlerdiagnose: {
    title: 'WENN DIE SIMULATION STREIKT',
    blocks: [
      {
        type: 'p',
        text: 'Die häufigsten Ursachen für Abbrüche oder unbrauchbare Ergebnisse sind Datenfehler, nicht der Solver: fehlende oder vertauschte Sohlhöhen, Haltungen mit Gegengefälle, Nennweite 0 oder unverbundene Netzteile.',
      },
      {
        type: 'p',
        text: 'Kontinuitätsfehler über ca. 5 % bedeuten: Das Modell "erfindet" oder "verliert" Wasser. Meist stecken einzelne instabile Knoten dahinter — der Report nennt sie namentlich.',
      },
      {
        type: 'p',
        text: 'Sehr kurze Haltungen (< 1-2 m) zwingen den Solver zu winzigen Zeitschritten und provozieren Instabilitäten. Im Preprocessing zusammenlegen oder verlängern.',
      },
      {
        type: 'p',
        text: 'Systematisches Vorgehen: erst Datenvalidierung im Preprocessing, dann Handrechnung (Fließzeitverfahren) gegen das SWMM-Ergebnis halten, zuletzt den Debug-Report mit dem rohen .rpt lesen.',
      },
      { type: 'ref', text: 'EPA SWMM 5 Users Manual — Troubleshooting' },
    ],
  },
};
