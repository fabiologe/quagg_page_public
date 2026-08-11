// Einordnung der Ergebnisgrößen — die Antwort auf „ist 1,2 viel oder wenig?".
//
// Eine Zahl ohne Maßstab ist keine Aussage. Zu jeder Größe steht hier
// deshalb: was sie physikalisch bedeutet, in welcher Einheit sie ausgegeben
// wird (die Verwechslung kinematisch/N je m² kostet den Faktor 1000), wie
// sich der Zahlenbereich in wasserbauliche Begriffe übersetzt und was man
// beim Ablesen falsch machen kann.
//
// `stufen` ist immer nach `bis` aufsteigend sortiert; `einordnen()` gibt die
// erste Stufe zurück, deren Obergrenze der Wert nicht überschreitet.

export const KENNWERTE = {
  bed_shear: {
    label: 'Sohlschubspannung τ',
    einheit: 'N/m²',
    was: 'Die Kraft, mit der das Wasser je Quadratmeter an der Sohle zerrt — '
      + 'nicht die Geschwindigkeit, sondern das, was die Strömung am Boden '
      + 'anrichtet. Sie folgt aus dem Geschwindigkeitsgefälle direkt an der '
      + 'Wand (τ = ρ·u*²).',
    stufen: [
      { bis: 1, text: 'praktisch keine Bewegung — Feinsediment setzt sich ab. '
        + 'Im Absetzbecken erwünscht, in einer Trockenwetterrinne der Beginn '
        + 'der Verschlammung.', cls: 'ruhig' },
      { bis: 2, text: 'Grenzbereich der Selbstreinigung. Regelwerke setzen für '
        + 'Rinnen rund 1 bis 2 N/m² an — darunter bleibt Schlamm liegen.',
      cls: 'ok' },
      { bis: 5, text: 'Feinsand und abgesetzter Schlamm werden mobilisiert. '
        + 'Für die Selbstreinigung gut, für ein Absetzbecken schon zu viel.',
      cls: 'ok' },
      { bis: 15, text: 'Sand bis Feinkies gerät in Bewegung. Unbefestigte '
        + 'Sohlen beginnen zu erodieren.', cls: 'warn' },
      { bis: 40, text: 'Kies wird transportiert — ohne Sohlsicherung entsteht '
        + 'hier Kolk.', cls: 'warn' },
      { bis: Infinity, text: 'Sohlsicherung erforderlich. In dieser '
        + 'Größenordnung bemisst man Steinschüttung oder eine feste Sohle.',
      cls: 'bad' },
    ],
    faustformel: 'Bewegungsbeginn nach Shields grob τ_c ≈ 0,8 N/m² je mm '
      + 'Korndurchmesser: 1 mm Sand ab etwa 0,8, 10 mm Kies ab etwa 8, '
      + '50 mm Schotter ab etwa 40 N/m².',
    achtung: 'OpenFOAM gibt die Wandschubspannung KINEMATISCH aus (m²/s², '
      + 'also τ/ρ). Hier ist bereits mit der Dichte multipliziert — 1,2 N/m² '
      + 'ist ein Rinnenwert, 1,2 m²/s² wären 1200 N/m² und damit absurd. Und: '
      + 'der Wert hängt an der eingestellten Wandrauheit und der Zellgröße; '
      + 'als Vergleich zwischen Varianten belastbar, nicht auf zwei '
      + 'Nachkommastellen.',
  },

  umag: {
    label: 'Fließgeschwindigkeit',
    einheit: 'm/s',
    was: 'Betrag der Strömungsgeschwindigkeit. Für Nachweise zählt meist die '
      + 'tiefengemittelte Geschwindigkeit, nicht die an der Oberfläche — die '
      + 'ist immer die höchste im Profil.',
    stufen: [
      { bis: 0.3, text: 'Ablagerungsbereich. Was hier ankommt, sinkt ab.',
        cls: 'ruhig' },
      { bis: 0.7, text: 'Selbstreinigungsbereich für Rinnen und Kanäle.',
        cls: 'ok' },
      { bis: 1.0, text: 'Übliche Anströmung an Rechen; darüber steigen '
        + 'Rechenverluste und Rechengut wird gegen die Stäbe gepresst.',
      cls: 'ok' },
      { bis: 2.0, text: 'Befestigte Gerinne unkritisch, unbefestigte Sohlen '
        + 'und Böschungen erosionsgefährdet.', cls: 'warn' },
      { bis: 4.0, text: 'Nur mit Sicherung (Steinschüttung, Beton). '
        + 'Erosion an jeder ungeschützten Kante.', cls: 'warn' },
      { bis: Infinity, text: 'Absturz- und Tosbeckenbereich. Zusätzlich auf '
        + 'Kavitation an scharfen Kanten und auf Luftmitnahme achten.',
      cls: 'bad' },
    ],
    faustformel: 'Für die Gefährdung von Personen ist nicht v allein '
      + 'maßgeblich, sondern das Produkt v·h: ab etwa 0,5 m²/s gilt Stehen '
      + 'im Wasser als nicht mehr sicher.',
  },

  froude: {
    label: 'Froude-Zahl Fr',
    einheit: '—',
    was: 'Verhältnis von Fließ- zu Wellengeschwindigkeit (Fr = v/√(g·h)). Sie '
      + 'sagt, ob sich eine Störung stromauf ausbreiten kann — und damit, wo '
      + 'ein Bauwerk den Wasserspiegel oberstrom noch beeinflusst.',
    stufen: [
      { bis: 0.7, text: 'strömend (unterkritisch): der Wasserspiegel wird vom '
        + 'Unterwasser gesteuert, Störungen wandern stromauf.', cls: 'ok' },
      { bis: 1.3, text: 'Übergangsbereich um den kritischen Zustand. Hier '
        + 'schwankt der Wasserspiegel unruhig — für Messstellen und Pegel '
        + 'ungeeignet.', cls: 'warn' },
      { bis: Infinity, text: 'schießend (überkritisch): die Strömung wird vom '
        + 'Oberwasser gesteuert. Der Übergang zurück ins Strömen erfolgt im '
        + 'Wechselsprung — dort wird Energie umgesetzt.', cls: 'warn' },
    ],
    faustformel: 'Beim Wechselsprung entscheidet Fr davor über die Form: '
      + '1,7–2,5 schwach, 2,5–4,5 oszillierend (unruhig, für Tosbecken '
      + 'ungünstig), 4,5–9,0 stabil und gut, darüber stark mit rauer '
      + 'Oberfläche.',
  },

  k: {
    label: 'Turbulente kinetische Energie k',
    einheit: 'm²/s²',
    was: 'Die Energie der Geschwindigkeitsschwankungen — ein Maß dafür, wie '
      + 'stark es an einer Stelle „brodelt". Hoch heißt kräftige Durchmischung '
      + 'und Energieumwandlung, nicht unbedingt hohe Geschwindigkeit.',
    stufen: [
      { bis: 0.005, text: 'sehr ruhig, nahezu geschichtete Strömung — '
        + 'typisch für den Beckenkörper abseits des Zulaufs.', cls: 'ruhig' },
      { bis: 0.05, text: 'normale Kanal- und Gerinneströmung.', cls: 'ok' },
      { bis: 0.5, text: 'kräftige Mischung: Wehrunterwasser, Rechenanströmung, '
        + 'Einlaufstrahl.', cls: 'warn' },
      { bis: Infinity, text: 'starke Energieumwandlung wie im Tosbecken oder '
        + 'Absturz.', cls: 'warn' },
    ],
    faustformel: 'Anschaulich wird k über die Schwankungsgeschwindigkeit: '
      + "u' ≈ √(2k/3). k = 0,015 m²/s² entspricht also rund 0,1 m/s "
      + 'Schwankung — bei 1 m/s Grundströmung ein Turbulenzgrad von 10 %.',
  },

  omega: {
    label: 'Turbulente Frequenz ω',
    einheit: '1/s',
    was: 'Wie schnell die turbulente Energie zerfällt. Eine reine Modellgröße '
      + 'des k-ω-SST — für sich genommen kaum zu deuten, aber zusammen mit k '
      + 'ergibt sie die Wirbelgröße.',
    stufen: [
      { bis: 1, text: 'große, träge Wirbel — großräumige Walzen.', cls: 'ok' },
      { bis: 100, text: 'übliche Werte im Gerinne.', cls: 'ok' },
      { bis: Infinity, text: 'kleinskalige, schnell zerfallende Turbulenz — '
        + 'meist in Wandnähe.', cls: 'ok' },
    ],
    faustformel: 'Wirbelgröße grob l ≈ √k / (0,09·ω). Ist l deutlich kleiner '
      + 'als die Zellgröße, löst das Netz die Wirbel nicht auf, die dort '
      + 'entstehen.',
  },

  nut: {
    label: 'Wirbelviskosität ν_t',
    einheit: 'm²/s',
    was: 'Die vom Turbulenzmodell zusätzlich eingebrachte Zähigkeit. Sie zeigt, '
      + 'wie stark die Turbulenz Impuls quer zur Strömung verteilt.',
    stufen: [
      { bis: 1e-5, text: 'kaum turbulent — im Wasserbau meist ein Zeichen, '
        + 'dass an dieser Stelle nichts passiert oder das Netz zu grob ist.',
      cls: 'ruhig' },
      { bis: 1e-3, text: 'schwach bis mäßig turbulent.', cls: 'ok' },
      { bis: 1e-1, text: 'kräftig turbulent — normale Werte in einem '
        + 'durchströmten Becken.', cls: 'ok' },
      { bis: Infinity, text: 'sehr hohe Mischung. Plausibel im Tosbecken, '
        + 'sonst ein Hinweis auf zu grobe Auflösung.', cls: 'warn' },
    ],
    faustformel: 'Aussagekräftig ist das Verhältnis zur Zähigkeit des Wassers '
      + '(ν = 1,0·10⁻⁶ m²/s): ν_t/ν unter 10 heißt praktisch laminar, '
      + '100 bis 1000 ist der Normalfall, über 10.000 ist viel.',
  },

  p_rgh: {
    label: 'Druck p_rgh',
    einheit: 'Pa',
    was: 'Druck OHNE den hydrostatischen Anteil. Diese Größe zeigt, wo die '
      + 'Strömung selbst Druck aufbaut oder absenkt — der ruhende '
      + 'Wasserspiegel fällt heraus.',
    stufen: [
      { bis: -20000, text: 'starker Unterdruck. An scharfen Kanten und '
        + 'Überfällen auf Ablösung und Kavitation prüfen.', cls: 'bad' },
      { bis: -2000, text: 'Unterdruckgebiet — typisch hinter Kanten und in '
        + 'Ablösewalzen.', cls: 'warn' },
      { bis: 2000, text: 'nahezu hydrostatisch, keine nennenswerte '
        + 'Beschleunigung.', cls: 'ok' },
      { bis: Infinity, text: 'Staudruck: die Strömung wird abgebremst, '
        + 'typisch an der Anströmseite von Pfeilern und Wehren.', cls: 'ok' },
    ],
    faustformel: '9810 Pa entsprechen genau einem Meter Wassersäule — '
      + 'so rechnet man Druck in Druckhöhe um.',
  },

  p: {
    label: 'Druck p (gesamt)',
    einheit: 'Pa',
    was: 'Absoluter Druck einschließlich des hydrostatischen Anteils. Für '
      + 'Bauteillasten die maßgebliche Größe; um Strömungseffekte zu sehen, '
      + 'ist p_rgh der bessere Blick.',
    stufen: [
      { bis: 0, text: 'Unterdruck gegenüber der Atmosphäre — nur an '
        + 'Ablösungen plausibel.', cls: 'warn' },
      { bis: 10000, text: 'bis etwa ein Meter Wassersäule.', cls: 'ok' },
      { bis: 50000, text: 'einige Meter Wassersäule — normale Beckenlast.',
        cls: 'ok' },
      { bis: Infinity, text: 'große Druckhöhe; Bauteil- und Auftriebsnachweis '
        + 'prüfen.', cls: 'warn' },
    ],
    faustformel: '9810 Pa je Meter Wassertiefe.',
  },

  alpha: {
    label: 'Wasseranteil α',
    einheit: '—',
    was: 'Anteil Wasser in einer Zelle: 1 ist voll Wasser, 0 ist Luft. Die '
      + 'Wasseroberfläche wird als Fläche α = 0,5 gezeichnet.',
    stufen: [
      { bis: 0.05, text: 'Luft.', cls: 'ruhig' },
      { bis: 0.95, text: 'Übergangszone. Über mehrere Zellen verschmiert '
        + 'heißt: die Oberfläche ist dort nicht sauber aufgelöst.',
      cls: 'warn' },
      { bis: Infinity, text: 'Wasser.', cls: 'ok' },
    ],
    faustformel: 'Eine scharfe Oberfläche springt innerhalb von ein bis zwei '
      + 'Zellen von 0 auf 1. Braucht sie fünf, ist das Netz dort zu grob.',
  },

  T: {
    label: 'Markierungsstoff',
    einheit: '—',
    was: 'Anteil des Wassers, das seit Rechenbeginn neu eingetreten ist. Wo '
      + 'der Wert klein bleibt, steht altes Wasser — das ist das tote '
      + 'Volumen, das nicht am Austausch teilnimmt.',
    stufen: [
      { bis: 0.1, text: 'praktisch unberührt — hier findet kein Austausch '
        + 'statt.', cls: 'bad' },
      { bis: 0.5, text: 'teilweise ausgetauscht.', cls: 'warn' },
      { bis: Infinity, text: 'überwiegend frisches Wasser — gut durchströmt.',
        cls: 'ok' },
    ],
    faustformel: 'Am Ablauf abgelesen ergibt der Verlauf die '
      + 'Durchbruchskurve, aus der Verweilzeit und Kurzschlussanteil folgen.',
  },

  depth: {
    label: 'Wassertiefe',
    einheit: 'm',
    was: 'Wassersäule über der Sohle, aus dem Wasseranteil über die Zelle '
      + 'aufsummiert.',
    stufen: [
      { bis: 0.05, text: 'Benetzungsrand. Solche Werte sind numerisch '
        + 'unsicher — Geschwindigkeiten und Froude-Zahlen dort nicht '
        + 'auswerten.', cls: 'warn' },
      { bis: Infinity, text: 'auswertbare Wassertiefe.', cls: 'ok' },
    ],
    faustformel: 'Unter zwei Rechenzellen Wassertiefe bildet der Solver keine '
      + 'brauchbare Oberfläche mehr ab.',
  },

  discharge: {
    label: 'Durchfluss Q',
    einheit: 'm³/s',
    was: 'Wasservolumen je Sekunde durch einen Querschnitt oder eine '
      + 'Randfläche.',
    stufen: [
      { bis: Infinity, text: 'Maßstab ist immer der Bemessungszufluss: Weicht '
        + 'die Summe der Abläufe stark davon ab, füllt oder entleert sich das '
        + 'Modell noch — siehe den Tab „Bilanz".', cls: 'ok' },
    ],
  },

  y_plus: {
    label: 'Wandabstand y⁺',
    einheit: '—',
    was: 'Dimensionsloser Abstand der ersten Zellmitte von der Wand. Er '
      + 'entscheidet, ob die verwendete Wandfunktion überhaupt gültig ist.',
    stufen: [
      { bis: 30, text: 'zu fein für Wandfunktionen: die erste Zelle liegt in '
        + 'der viskosen Unterschicht, das Modell greift dort daneben.',
      cls: 'warn' },
      { bis: 300, text: 'Gültigkeitsbereich der Wandfunktion — so soll es '
        + 'sein.', cls: 'ok' },
      { bis: Infinity, text: 'zu grob: die Wandschicht wird überbrückt, '
        + 'Schubspannungen sind nur noch Größenordnungen.', cls: 'warn' },
    ],
  },

  level: {
    label: 'Wasserspiegellage',
    einheit: 'm NHN',
    was: 'Absolute Höhe der Wasseroberfläche am Pegelpunkt. Nicht die '
      + 'Wassertiefe — die ergibt sich erst aus dem Abstand zur Sohle.',
    stufen: [
      { bis: Infinity, text: 'Maßstab ist immer die Bezugshöhe des Bauwerks: '
        + 'Kronenhöhe, Geländeoberkante oder zulässiger Einstau. Erst der '
        + 'Vergleich damit macht die Zahl zur Aussage.', cls: 'ok' },
    ],
    faustformel: 'Steigt der Pegel am Ende noch merklich, ist der Lauf nicht '
      + 'eingeschwungen — im Tab „Bilanz" nachsehen.',
  },

  volume: {
    label: 'Wasservolumen im Gebiet',
    einheit: 'm³',
    was: 'Gesamtes Wasser im Rechengebiet. Seine Änderung je Sekunde ist die '
      + 'Speicheränderung und schließt die Bilanz: Zufluss minus Ablauf.',
    stufen: [
      { bis: Infinity, text: 'Eine waagerechte Kurve heißt eingeschwungen. '
        + 'Steigt sie, füllt sich das Modell noch; fällt sie, entleert es '
        + 'sich.', cls: 'ok' },
    ],
    faustformel: 'Volumen geteilt durch Zufluss ergibt die rechnerische '
      + 'Verweilzeit τ — die Zeitspanne, in der das Becken einmal '
      + 'ausgetauscht wird.',
  },

  speicher: {
    label: 'Speicheränderung',
    einheit: 'm³/s',
    was: 'Wie viel Wasser je Sekunde im Gebiet zurückbleibt. Sie ist der '
      + 'Prüfstein für die Aussagekraft eines Laufs: nur wenn sie klein '
      + 'gegen den Zufluss ist, beschreibt das Ergebnis einen '
      + 'Betriebszustand.',
    stufen: [
      { bis: Infinity, text: 'Bewertet wird das Verhältnis zum Zufluss: unter '
        + '2 % gilt der Lauf als eingeschwungen, über 10 % zeigt er den '
        + 'Füllvorgang.', cls: 'ok' },
    ],
  },

  force: {
    label: 'Kraft auf ein Bauteil',
    einheit: 'kN',
    was: 'Resultierende Strömungskraft auf die gewählte Fläche, aus Druck- '
      + 'und Reibungsanteil. Für die Standsicherheit ist die waagerechte '
      + 'Komponente maßgeblich, für den Auftriebsnachweis die senkrechte.',
    stufen: [
      { bis: Infinity, text: 'Der Vergleichsmaßstab ist die statische '
        + 'Wasserdruckkraft: bei einer Wand ist sie rund ½·ρ·g·h² je Meter '
        + 'Breite — 0,5 t je Meter bei 1 m Einstau. Deutlich mehr heißt, dass '
        + 'die Strömung selbst nennenswert drückt.', cls: 'ok' },
    ],
    faustformel: 'Ein positiver z-Anteil ist Auftrieb — der geht direkt in '
      + 'den Nachweis gegen Aufschwimmen ein.',
  },

  moment: {
    label: 'Kippmoment',
    einheit: 'kNm',
    was: 'Moment der Strömungskraft um die Fußmitte des Bauwerks. Geteilt '
      + 'durch die Kraft ergibt es den Hebelarm — die Höhe, in der die '
      + 'Resultierende angreift.',
    stufen: [
      { bis: Infinity, text: 'Aussagekräftig ist der Hebelarm: bei rein '
        + 'hydrostatischer Belastung liegt er bei einem Drittel der '
        + 'Wassertiefe über der Sohle. Deutlich höher heißt, dass ein '
        + 'dynamischer Anteil dazukommt.', cls: 'ok' },
    ],
  },

  energy_head: {
    label: 'Energiehöhe',
    einheit: 'm',
    was: 'Wasserspiegel plus Geschwindigkeitshöhe v²/2g. Ihr Gefälle zwischen '
      + 'zwei Querschnitten ist die Verlusthöhe — das, was ein Bauwerk der '
      + 'Strömung an Energie entzieht.',
    stufen: [
      { bis: Infinity, text: 'Die Energielinie kann nur fallen. Steigt sie '
        + 'in Fließrichtung, stimmt etwas nicht — meist ein Querschnitt in '
        + 'einer Ablösezone.', cls: 'ok' },
    ],
    faustformel: 'v²/2g ist bei 1 m/s nur 5 cm, bei 3 m/s schon 46 cm — '
      + 'unterhalb eines Absturzes dominiert die Geschwindigkeitshöhe.',
  },

  overfall_cd: {
    label: 'Überfallbeiwert C_d',
    einheit: '—',
    was: 'Wirkungsgrad des Wehrs in der Überfallformel '
      + 'Q = ⅔·C_d·√(2g)·b·h^1,5. Er fasst zusammen, wie gut die Krone '
      + 'angeströmt wird.',
    stufen: [
      { bis: 0.5, text: 'auffällig niedrig — meist Rückstau von unten, '
        + 'schräge Anströmung oder eine zu kurze Kronenlänge im Modell.',
      cls: 'warn' },
      { bis: 0.75, text: 'übliche Werte: scharfkantig rund 0,6 bis 0,65, '
        + 'breitkronig rund 0,5 bis 0,6, rundkronig bis etwa 0,75.',
      cls: 'ok' },
      { bis: Infinity, text: 'hoch — plausibel nur bei gut ausgerundeter '
        + 'Krone; sonst Überfallhöhe und Bezugspegel prüfen.', cls: 'warn' },
    ],
  },

  continuity: {
    label: 'Kontinuitätsfehler',
    einheit: 'm³',
    was: 'Wasser, das die Rechnung über die Laufzeit „verloren" oder '
      + 'erfunden hat. Ein reiner Rechenfehler, keine Physik.',
    stufen: [
      { bis: Infinity, text: 'Maßstab ist das umgesetzte Volumen: unter etwa '
        + '1 % davon ist unkritisch. Wächst der Fehler stetig, stimmt etwas '
        + 'mit Netz oder Zeitschritt nicht.', cls: 'ok' },
    ],
  },

  residual: {
    label: 'Residuum',
    einheit: '—',
    was: 'Wie weit die Lösung einer Gleichung je Zeitschritt noch von der '
      + 'Erfüllung entfernt ist. Ein Maß für die Konvergenz, nicht für die '
      + 'Richtigkeit.',
    stufen: [
      { bis: 1e-4, text: 'gut auskonvergiert.', cls: 'ok' },
      { bis: 1e-2, text: 'brauchbar für instationäre Läufe.', cls: 'ok' },
      { bis: Infinity, text: 'zu hoch — der Zeitschritt ist zu groß oder das '
        + 'Netz an einer Stelle zu schlecht.', cls: 'warn' },
    ],
  },

  massenbilanz: {
    label: 'Massenbilanzfehler',
    einheit: '—',
    was: 'Relativer Fehler der Wasserbilanz über den Lauf. Die wichtigste '
      + 'einzelne Kennzahl dafür, ob ein Ergebnis überhaupt verwertbar ist.',
    stufen: [
      { bis: 0.01, text: 'unkritisch — unter einem Prozent.', cls: 'ok' },
      { bis: 0.05, text: 'erhöht: Ergebnisse mit Vorbehalt verwenden.',
        cls: 'warn' },
      { bis: Infinity, text: 'zu groß. Netz, Zeitschritt und '
        + 'Randbedingungen prüfen, bevor irgendetwas ausgewertet wird.',
      cls: 'bad' },
    ],
  },

  verweilzeit: {
    label: 'Verweilzeit',
    einheit: 's',
    was: 'Wie lange Wasser im Becken bleibt. τ = V/Q ist der rechnerische '
      + 'Wert; t₁₀ und t₅₀ kommen aus der gemessenen Durchbruchskurve und '
      + 'sagen, wie das Becken wirklich durchströmt wird.',
    stufen: [
      { bis: Infinity, text: 'Entscheidend ist das Verhältnis t₁₀/τ: unter '
        + '0,3 läuft ein Teil praktisch direkt durch (Kurzschluss), über 0,5 '
        + 'ist die Durchströmung gleichmäßig. t₅₀ nahe τ heißt nahezu '
        + 'ideale Verdrängung.', cls: 'ok' },
    ],
    faustformel: 'Absetzwirkung braucht Verweilzeit: Was in t₁₀ '
      + 'durchrauscht, hatte keine Gelegenheit, sich abzusetzen.',
  },

  timestep: {
    label: 'Zeitschrittweite',
    einheit: 's',
    was: 'Vom Solver selbst gewählte Schrittweite. Sie folgt aus der '
      + 'Courant-Bedingung und bestimmt unmittelbar die Rechenzeit.',
    stufen: [
      { bis: Infinity, text: 'Bricht sie plötzlich ein, hat der Solver eine '
        + 'schnelle Zelle gefunden — meist an einer Netzstelle, die man '
        + 'entschärfen kann. Genau dort liegt der Hebel gegen lange '
        + 'Rechenzeiten.', cls: 'ok' },
    ],
  },

  courant: {
    label: 'Courant-Zahl',
    einheit: '—',
    was: 'Wie weit Wasser innerhalb eines Zeitschritts durch eine Zelle '
      + 'wandert. Sie steuert die Zeitschrittweite und damit die Rechenzeit.',
    stufen: [
      { bis: 1, text: 'stabiler Bereich.', cls: 'ok' },
      { bis: 5, text: 'lokal zulässig, solange die Bilanz stimmt.',
        cls: 'warn' },
      { bis: Infinity, text: 'zu groß — Ergebnisse sind unzuverlässig.',
        cls: 'bad' },
    ],
    faustformel: 'Liegt das Maximum weit über dem Mittel, bremsen wenige '
      + 'Zellen den ganzen Lauf aus. Meist lohnt es, genau dort das Netz zu '
      + 'entschärfen statt überall zu vergröbern.',
  },
}

// Erste Stufe, deren Obergrenze der Wert nicht überschreitet
export function einordnen(schluessel, wert) {
  const k = KENNWERTE[schluessel]
  if (!k || wert == null || !isFinite(wert)) return null
  for (const stufe of k.stufen) {
    if (wert <= stufe.bis) return stufe
  }
  return k.stufen[k.stufen.length - 1]
}

