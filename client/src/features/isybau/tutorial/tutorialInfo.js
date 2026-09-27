// Lernstoff für Studenten — die „Mehr dazu"-Ebene des Tutorials.
// Steps referenzieren Einträge hier über ihren Key (`info: 'bemessungsregen'`),
// mehrere Steps dürfen denselben Eintrag teilen.
//
// Block-Schema (gerendert von TutorialInfoCard.vue):
//   { type: 'p', text }        Absatz
//   { type: 'formula', text }  Formel-Zeile (hervorgehobene Mono-Box)
//   { type: 'ref', text }      Quellen-/Normverweis (gedimmt)
//   { type: 'link', text, href }  anklickbarer Verweis nach draussen (neuer Tab)
//
// Titel erscheinen in 'Press Start 2P', Fließtext in 'Share Tech Mono' — beide
// mit Umlauten (Google-Fonts-Satz „latin“; früher stand hier das Gegenteil,
// und die Texte waren durchweg ae/oe/ue geschrieben).

export const TUTORIAL_INFO = {

  // ── Lernstoff zu den interaktiven Uebungen (tutorialExercise.js) ──────────
  befestigungsgrad: {
    title: 'VERSIEGELUNGSGRAD',
    blocks: [
      {
        type: 'p',
        text: 'Nicht jeder Tropfen, der auf eine Fläche fällt, kommt im Kanal an. Ein Teil versickert, verdunstet oder bleibt in Pfützen und Mulden liegen. Der Wert ψ (psi) sagt, welcher Anteil tatsächlich abfließt.',
      },
      { type: 'formula', text: 'Q = ψ · i · A     ψ = 0 (alles versickert) … 1 (alles fließt ab)' },
      {
        type: 'p',
        text: 'Zwei Wörter, eine Zahl: Eingetragen wird der Versiegelungsgrad — wie viel der Fläche zugebaut ist. Weil genau dieser Anteil abfließt, rechnet das Modell damit als Abflussbeiwert weiter, und unter diesem Namen taucht der Wert später im Ergebnis und in der ISYBAU-Datei wieder auf.',
      },
      {
        type: 'p',
        text: 'Dach und Asphalt lassen fast alles ablaufen (ψ ≈ 0,9), Pflaster mit Fugen weniger (ψ ≈ 0,6), Rasen schluckt fast alles (ψ ≈ 0,1). Auch die Neigung spielt hinein — steiler heißt weniger Zeit zum Versickern.',
      },
      {
        type: 'p',
        text: 'Im SWMM-Modell wird ψ als „%Imperv“ (undurchlässiger Anteil) übergeben. Ein zu hoher Wert lässt das Netz überlastet aussehen, ein zu niedriger verharmlost den Starkregen — deshalb lohnt sich hier Sorgfalt.',
      },
      { type: 'ref', text: 'DWA-A 118 — Hydraulische Bemessung von Entwässerungssystemen' },
    ],
  },

  flaechenanschluss: {
    title: 'FLÄCHENANSCHLUSS',
    blocks: [
      {
        type: 'p',
        text: 'Eine Fläche muss wissen, wohin ihr Wasser läuft — sonst regnet es ins Nichts und die Fläche bleibt in der Berechnung wirkungslos. Zwei Wege gibt es: an einen einzelnen Schacht oder an eine ganze Haltung.',
      },
      {
        type: 'p',
        text: 'Beim Anschluss an einen Schacht landet alles an genau diesem Punkt. Das passt, wenn ein Hof oder ein Dach über eine Leitung in einen bestimmten Schacht entwässert.',
      },
      {
        type: 'p',
        text: 'Beim Anschluss an eine Haltung wird die Fläche automatisch 50/50 auf deren Zulauf- und Ablaufknoten aufgeteilt. Das ist die ehrlichere Annahme für ein Grundstück, das entlang der ganzen Leitung liegt: das Wasser sickert überall ein, nicht nur an einem Punkt.',
      },
      {
        type: 'p',
        text: 'Deshalb tauchen solche Flächen im SWMM-Modell als zwei Teilgebiete auf (z. B. FK001.1 und FK001.1_2) — das sind keine Doppelungen, sondern die beiden Teile desselben Anschlusses (Voreinstellung 50/50, die Aufteilung ist einstellbar).',
      },
      { type: 'ref', text: 'DWA-A 118 — Hydraulische Bemessung von Entwässerungssystemen' },
    ],
  },

  neigungsklasse: {
    title: 'NEIGUNGSKLASSE',
    blocks: [
      {
        type: 'p',
        text: 'Gemeint ist das Gefälle des Bodens, auf den der Regen fällt — nicht das der Rohre darunter. Die Neigung bestimmt, wie schnell das Wasser den Anschlusspunkt erreicht: flaches Gelände hält es zurück, steiles beschleunigt es. Der Scheitel der Abflusswelle wird dadurch früher und höher.',
      },
      {
        type: 'p',
        text: 'Statt eines gemessenen Winkels verlangt ISYBAU nur eine von fünf Stufen: 1 = bis 1 % (eben, man sieht das Gefälle nicht), 2 = 1–4 % (leicht geneigt), 3 = 4–10 % (merkliche Böschung), 4 = 10–14 % (steil), 5 = über 14 % (sehr steil). Zur Orientierung: 10 % sind 10 m Höhenunterschied auf 100 m Weg, also etwa eine steile Hofeinfahrt. Das Tool rechnet aus der Stufe einen repräsentativen Prozentwert für SWMM.',
      },
      {
        type: 'p',
        text: 'Im Zweifel lieber eine Stufe zu flach als zu steil: eine zu steil angesetzte Fläche liefert eine schärfere Spitze, als sie in Wirklichkeit auftritt.',
      },
      {
        type: 'p',
        text: 'Ist ein Geländemodell (DGM) geladen, lässt sich die Neigung aus den Höhendaten der Fläche schätzen — der Vorschlags-Knopf neben dem Feld macht genau das. Ohne DGM hilft nur der Blick ins Gelände oder auf die Höhenlinien.',
      },
      { type: 'ref', text: 'BFR Abwasser — ISYBAU-XML, Flächendaten (Neigungsklasse)' },
    ],
  },

  auslaufbauwerk: {
    title: 'AUSLAUFBAUWERK',
    blocks: [
      {
        type: 'p',
        text: 'Irgendwo muss das Wasser das Netz verlassen — in ein Gewässer, in einen Sammler oder zur Kläranlage. Dieser Punkt heißt Auslaufbauwerk (im SWMM: Outfall) und ist der einzige Ort, an dem die Rechnung Wasser aus dem System entlässt.',
      },
      {
        type: 'p',
        text: 'Solange ein solcher Punkt fehlt, hat das Modell keinen definierten Ausgang: das Wasser staut sich bis zur Geländeoberkante zurück und die Ergebnisse sehen dramatischer aus, als sie sind.',
      },
      {
        type: 'p',
        text: 'Am Auslass gilt eine Randbedingung — meist freier Auslauf, bei Gewässern auch ein fester Wasserstand. Steht das Gewässer hoch, drückt es zurück ins Netz; genau dafür braucht man die Dynamic-Wave-Rechnung, die Rückstau abbilden kann.',
      },
      { type: 'ref', text: 'EPA SWMM 5 Reference Manual, Vol. II — Outfall Boundary Conditions' },
    ],
  },
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
      {
        type: 'p',
        text: 'Eine ISYBAU-XML kennt sechs Datenbereiche — Stammdaten, Zustandsdaten (Inspektion), hydraulische Daten, Grundstücksentwässerung, Referenzlisten und Metadaten. Das Tool schreibt die Fassung 2017-07; ältere Fassungen (z. B. 2013) können anders aufgebaut sein.',
      },
      {
        type: 'p',
        text: 'Die Stammdaten sind ein Knoten-Kanten-Modell: Schächte als Knoten, Haltungen als Kanten dazwischen, Flächen mit ihrem Anschlusspunkt. Genau diesen Teil liest das Tool ein — und genau diesen Teil schreibt „XML exportieren" wieder heraus. Inspektions- und Zustandsdaten werden gelesen, beim Export aber nicht mitgeschrieben.',
      },
      { type: 'ref', text: 'BFR Abwasser — Arbeitshilfen Abwasser, ISYBAU-XML' },
      { type: 'link', text: 'Format nachlesen: A-7 ISYBAU-Austauschformate', href: 'https://www.bfr-abwasser.de/html/A7ISYBAU_ATF_XML.html' },
      { type: 'link', text: 'Beispieldatensätze (XML-2017)', href: 'https://www.bfr-abwasser.de/html/Materialien.1.30.html' },
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
        text: 'Kanalnetze werden nicht für „irgendeinen“ Regen bemessen, sondern für statistisch definierte Ereignisse: Ein Regen mit Wiederkehrzeit T = 5 a tritt im Mittel alle 5 Jahre auf. Je seltener, desto intensiver.',
      },
      {
        type: 'p',
        text: 'KOSTRA-DWD liefert für jede Koordinate in Deutschland die Regenspende rN in l/(s·ha) je Dauerstufe D und Wiederkehrzeit T. Das Tool holt diese Werte direkt für die Netz-Koordinaten.',
      },
      {
        type: 'p',
        text: 'Der Blockregen hält rN über die ganze Dauer D konstant — einfach, aber unrealistisch. Beim Modellregen Euler Typ II (DWA-A 118) beginnt das stärkste Intervall beim 0,3-Fachen der Dauer, auf 5 Minuten abgerundet; er ist der übliche Regen für Kanalnetz-Nachweise.',
      },
      {
        type: 'p',
        text: 'Zur Plausibilisierung dient das Fließzeitverfahren: Der Spitzenabfluss einer Fläche ergibt sich vereinfacht zu',
      },
      { type: 'formula', text: 'Q = psi · i · A' },
      {
        type: 'p',
        text: 'psi = Spitzenabflussbeiwert (0..1), i = Regenspende in l/(s*ha), A = Fläche in ha. Den Handwert kann man gegen den Spitzenabfluss im Ergebnisreiter „Teilflächen“ halten.',
      },
      { type: 'ref', text: 'DWA-A 118 — hydraulische Bemessung von Entwässerungssystemen; KOSTRA-DWD 2020' },
    ],
  },

  'dynamic-wave': {
    title: 'DYNAMIC WAVE / ST. VENANT',
    blocks: [
      {
        type: 'p',
        text: 'Die Dynamic-Wave-Berechnung löst die Saint-Venant-Gleichungen: Kontinuität (Massenerhaltung) plus Impulsgleichung mit allen Termen — Trägheit, Druck, Gefälle und Reibung.',
      },
      { type: 'formula', text: 'dA/dt + dQ/dx = 0   (Kontinuität)' },
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
        text: 'Auslastung Q/Qvoll: maximaler Abfluss im Verhältnis zum Vollfüllungsabfluss der Haltung. Über 1,0 ist die Haltung überlastet. Davon getrennt der Einstau: steht das Wasser bis zum Rohrscheitel (h/hvoll ≥ 0,99), ist die Haltung eingestaut — das geht auch mit wenig Abfluss, etwa im Rückstau.',
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
        text: 'Modellqualität: Der Kontinuitätsfehler (Massenbilanz) sollte unter 1 % liegen; bis 5 % ist das Ergebnis zu prüfen, darüber nicht belastbar. So stuft auch die Kachel „Modellgüte“ im Ergebnis ein — dazu Knoten mit 10 % Fehler und mehr.',
      },
      { type: 'ref', text: 'DWA-A 110; DWA-A 118 — Überstau- und Überflutungsnachweis' },
    ],
  },

  'standort-georeferenz': {
    title: 'STARTORT & GEOREFERENZ',
    blocks: [
      {
        type: 'p',
        text: 'Ein importiertes ISYBAU-XML bringt seine Koordinaten schon mit. Zeichnest du dagegen ein Netz von null, braucht das Tool einen Referenzpunkt — sonst weiß es nicht, wo auf der Erde dein Netz liegt.',
      },
      {
        type: 'p',
        text: 'Dieser Startort („Neu starten“: Adresssuche oder manuelle Koordinaten) treibt zwei Dinge an: die KOSTRA-Regendaten für den Bemessungsregen und die EZG-Karte (Luftbild + Höhenlinien) als Zeichenhilfe.',
      },
      {
        type: 'p',
        text: 'Ohne Startort bleibt beides deaktiviert — das Netz lässt sich trotzdem zeichnen und rechnen, nur eben ohne Ortsbezug.',
      },
    ],
  },

  'dgm-gelaende': {
    title: 'EIGENES GELÄNDEMODELL (DGM)',
    blocks: [
      {
        type: 'p',
        text: 'Ein DGM (Digitales Geländemodell) lässt sich als XYZ/TXT-Punktwolke oder als ESRI-ASCII-Grid (.asc) laden — deutlich präziser als die 30-m-Höhendaten der EZG-Karte.',
      },
      {
        type: 'p',
        text: 'Irreguläre Punktwolken werden per TIN (Dreiecksvermaschung) trianguliert und auf ein regelmäßiges Raster gerechnet. Das Tool schlägt dabei eine Zellweite aus der Punktdichte vor.',
      },
      {
        type: 'p',
        text: 'Sobald ein DGM geladen ist, schlägt das Tool Deckelhöhen an den Schächten direkt aus dem Raster vor — das ist die Grundlage für einen belastbaren Überflutungsnachweis, denn der hängt an der Differenz zwischen Wasserspiegel und echter Geländehöhe.',
      },
      { type: 'ref', text: 'DWA-A 118 — Überstau- und Überflutungsnachweis' },
    ],
  },

  'ezg-karte': {
    title: 'EZG-KARTE: LUFTBILD & HÖHENLINIEN',
    blocks: [
      {
        type: 'p',
        text: 'Die EZG-Karte legt ein georeferenziertes Luftbild (Esri World Imagery) und Höhenlinien unter dein Netz — eine schnelle Orientierung am echten Gelände, ohne eigene Vermessungsdaten.',
      },
      {
        type: 'p',
        text: 'Die Höhenlinien stammen aus SRTM/ASTER-Höhendaten (Terrarium-Kacheln, ca. 30 m Rasterweite) — grob genug für die Einzugsgebiets-Form (daher der Name), aber kein Ersatz für eine echte Vermessung.',
      },
      {
        type: 'p',
        text: 'Lädst du ein eigenes DGM hoch, treten die 30-m-Höhenlinien automatisch zurück: das präzisere Modell gewinnt.',
      },
      { type: 'ref', text: 'NASA SRTM / USGS EROS; Esri World Imagery' },
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
        text: 'Kontinuitätsfehler über ca. 5 % bedeuten: Das Modell „erfindet“ oder „verliert“ Wasser. Meist stecken einzelne instabile Knoten dahinter — der Report nennt sie namentlich.',
      },
      {
        type: 'p',
        text: 'Sehr kurze Haltungen (< 1-2 m) zwingen den Solver zu winzigen Zeitschritten und provozieren Instabilitäten. In „Daten bearbeiten“ zusammenlegen oder verlängern.',
      },
      {
        type: 'p',
        text: 'Systematisches Vorgehen: erst die Meldungen der Vorab-Prüfung abarbeiten (sie hält vor der Rechnung an und führt mit „→ Element öffnen“ zur Zeile), dann eine Handrechnung (Fließzeitverfahren) gegen den Reiter „Teilflächen“ halten, zuletzt den Debug-Report mit dem rohen .rpt lesen.',
      },
      { type: 'ref', text: 'EPA SWMM 5 Users Manual — Troubleshooting' },
    ],
  },
};
