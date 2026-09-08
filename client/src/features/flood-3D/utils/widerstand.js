// Widerstandszonen — Rechen, Steinschüttung, Bewuchs.
//
// Für die Strömung sind die drei dasselbe: ein durchströmter Körper, der
// dem Wasser Impuls entzieht. Keiner von ihnen wird im Netz aufgelöst —
// weder die Stäbe noch die Steine noch die Äste. Der Fall bekommt an
// dieser Stelle eine Zellzone und darauf eine Darcy-Forchheimer-Quelle
// (casebuilder.topo_set_dict / fv_options).
//
// Was sie unterscheidet, ist die HERKUNFT des Beiwerts — und ob er eine
// Richtung hat:
//
//   Rechen          Flächenverlust ζ nach Kirschmer, auf die Zonentiefe
//                   verteilt (f = ζ/L), NUR senkrecht zur Ebene.
//   Steinschüttung  Volumenwiderstand nach Ergun, in alle Richtungen.
//   Bewuchs         Formwiderstand der Stämme, in alle Richtungen.
//
// Die Rechnungen stehen hier ein zweites Mal (die erste steht im Backend,
// casebuilder._screen_resistance). Das ist Absicht und keine Doppelung
// aus Versehen: der Nutzer soll beim Schieben eines Werts sofort sehen,
// was herauskommt, ohne den Fall zu speichern. Gerechnet wird trotzdem
// mit der Zahl aus dem Backend — die Prüfliste nennt sie im Klartext.
// Beide Seiten sind an denselben Zahlen festgenagelt (test/widerstand.test.js
// und tests/test_widerstandszone.py).

export const ZONEN_ARTEN = ['rechen', 'steinschuettung', 'bewuchs', 'manuell']

export const ART_NAME = {
  rechen: 'Rechen',
  steinschuettung: 'Steinschüttung',
  bewuchs: 'Bewuchs',
  manuell: 'Widerstandszone (eigene Beiwerte)',
}

// Vorbelegungen des Fallaufbaus — hier gespiegelt, damit die Vorschau
// dieselbe Zahl zeigt wie der Fall (casebuilder.py).
export const ZONEN_TIEFE_VOR = 0.15
export const BEWUCHS_CW = 1.2
const KIRSCHMER_BETA = { rechteck: 2.42, rund: 1.79, tropfen: 0.76 }

/** Name der Zone für Baum und Kopfzeile — die ART, nicht der Typ. */
export function zonenName(item) {
  if (item?.type !== 'screen') return null
  return ART_NAME[item.resistance?.kind ?? 'rechen'] ?? 'Widerstandszone'
}

export const zonenTiefe = (s) => Number(s?.zonen_tiefe) || ZONEN_TIEFE_VOR

/**
 * Hydraulische Fugenweite eines Haufwerks.
 *
 * d_h = 4·Porenvolumen/Oberfläche = (2/3)·d_p·ε/(1−ε) für Kugelpackungen.
 * Eine GRÖSSENORDNUNG, keine Siebweite: die Fuge, durch die das Wasser
 * geht, ist nicht die Fuge, die man an der Oberfläche sieht. Sie steht
 * hier, weil man eine Schüttung so beschreibt („Fugen 3 bis 5 cm") und
 * nicht über ihren Porenanteil.
 */
export function fugenweite(korngroesse, porositaet) {
  const dp = Number(korngroesse)
  const eps = Number(porositaet)
  if (!(dp > 0) || !(eps > 0) || !(eps < 1)) return null
  return (2 / 3) * dp * (eps / (1 - eps))
}

/**
 * Die Beiwerte, die der Fallaufbau ableiten wird — d (1/m²) und f (1/m),
 * jeweils der maßgebliche Wert, plus die Herkunft im Klartext.
 * `null`, solange die Angaben der gewählten Art fehlen.
 */
export function beiwerte(struct) {
  const w = struct?.resistance
  if (!w) return null
  const gesetzt = (v) => Array.isArray(v) && v.some((x) => Number(x))
  if (gesetzt(w.d) || gesetzt(w.f)) {
    return { d: Number(w.d?.[0]) || 0, f: Number(w.f?.[0]) || 0,
      isotrop: false, quelle: 'von Hand eingetragen' }
  }
  const art = w.kind ?? 'rechen'

  if (art === 'steinschuettung') {
    const eps = Number(w.porositaet)
    const dp = Number(w.korngroesse)
    if (!(dp > 0) || !(eps > 0) || !(eps < 1)) return null
    const rest = 1 - eps
    return {
      d: (150 * rest ** 2) / (eps ** 3 * dp ** 2),
      f: (3.5 * rest) / (eps ** 3 * dp),
      isotrop: true,
      quelle: `Ergun aus Korn ${(dp * 1000).toFixed(0)} mm, Poren ${eps.toFixed(2)}`,
    }
  }

  if (art === 'bewuchs') {
    const a = Number(w.flaechendichte)
    if (!(a > 0)) return null
    const cw = Number(w.cw) || BEWUCHS_CW
    return { d: 0, f: cw * a, isotrop: true,
      quelle: `Formwiderstand aus a = ${a} 1/m, c_w ${cw}` }
  }

  if (art === 'manuell') return null

  const teilung = Number(struct.bar_spacing)
  const dicke = Number(struct.bar_thickness)
  if (!(teilung > dicke) || !(dicke > 0)) return null
  const beta = KIRSCHMER_BETA[struct.bar_shape] ?? 2.42
  const zeta = beta * (dicke / (teilung - dicke)) ** (4 / 3)
    * Math.sin(((struct.approach_angle_deg ?? 90) * Math.PI) / 180)
  return { d: 0, f: zeta / zonenTiefe(struct), isotrop: false, zeta,
    quelle: `Kirschmer, ζ = ${zeta.toFixed(2)}` }
}

/**
 * Der Verlust der ganzen Zone als Vielfaches der Geschwindigkeitshöhe:
 * Δp = ξ·½ρu² mit ξ = f·L/(1−a)². Das ist die Zahl, die man mit einem
 * Tabellenwert vergleichen kann — f allein hängt an der Zonentiefe.
 */
export function verlustbeiwert(struct) {
  const b = beiwerte(struct)
  if (!b) return null
  const a = Math.min(Number(struct?.resistance?.blockage_ratio) || 0, 0.95)
  return (b.f * zonenTiefe(struct)) / (1 - a) ** 2
}

// --- Vorlagen --------------------------------------------------------------
//
// Sie setzen MASSE, keine Beiwerte: was daraus folgt, rechnet der
// Fallaufbau. Wer eine Vorlage nimmt und danach die Korngröße ändert,
// bekommt deshalb einen passenden Widerstand und nicht den alten.
export const ZONEN_VORLAGEN = [
  { id: 'rechen_fein', art: 'rechen', name: 'Feinrechen, Spalt 20 mm',
    hinweis: 'Stabrechen vor Pumpen oder Drosseln.',
    werte: { bar_spacing: 0.02, bar_thickness: 0.008, bar_depth: 0.06,
      bar_shape: 'rechteck', approach_angle_deg: 75 },
    widerstand: { blockage_ratio: 0.3 } },
  { id: 'rechen_grob', art: 'rechen', name: 'Grobrechen, Spalt 100 mm',
    hinweis: 'Treibgutrechen am Einlauf; hält Äste, kein Laub.',
    werte: { bar_spacing: 0.1, bar_thickness: 0.012, bar_depth: 0.08,
      bar_shape: 'rechteck', approach_angle_deg: 75 },
    widerstand: { blockage_ratio: 0.3 } },

  { id: 'schotter', art: 'steinschuettung', name: 'Schotter 32/63, Fugen rund 2 cm',
    hinweis: 'Filter- oder Tragschicht, stark bremsend.',
    werte: { zonen_tiefe: 0.5 },
    widerstand: { korngroesse: 0.045, porositaet: 0.4 } },
  { id: 'wasserbau_klein', art: 'steinschuettung',
    name: 'Steinschüttung 80–120 mm, Fugen 3–5 cm',
    hinweis: 'Wasserbausteine der kleinen Klassen — Sohl- und '
      + 'Böschungssicherung.',
    werte: { zonen_tiefe: 0.6 },
    widerstand: { korngroesse: 0.1, porositaet: 0.4 } },
  { id: 'wasserbau_grob', art: 'steinschuettung',
    name: 'Steinschüttung 200–300 mm, Fugen 8–12 cm',
    hinweis: 'Grobe Wasserbausteine, Kolkschutz, Störsteinriegel.',
    werte: { zonen_tiefe: 1.0 },
    widerstand: { korngroesse: 0.25, porositaet: 0.42 } },

  { id: 'busch_dicht', art: 'bewuchs', name: 'Busch, dicht bewachsen',
    hinweis: 'Geschlossenes Gebüsch, rund 300 Triebe je m² à 10 mm.',
    werte: { zonen_tiefe: 3.0 },
    widerstand: { flaechendichte: 3.0, cw: 1.2 } },
  { id: 'busch_locker', art: 'bewuchs', name: 'Busch, locker',
    hinweis: 'Einzelsträucher mit Lücken, rund 100 Triebe je m².',
    werte: { zonen_tiefe: 3.0 },
    widerstand: { flaechendichte: 1.0, cw: 1.2 } },
  { id: 'roehricht', art: 'bewuchs', name: 'Röhricht / Schilf',
    hinweis: 'Halme rund 200 je m² à 10 mm; im Sommer dichter.',
    werte: { zonen_tiefe: 1.5 },
    widerstand: { flaechendichte: 2.0, cw: 1.0 } },
  { id: 'gras_hoch', art: 'bewuchs', name: 'Hochstauden / hohes Gras',
    hinweis: 'Nur wirksam, solange der Bewuchs überströmt wird.',
    werte: { zonen_tiefe: 0.8 },
    widerstand: { flaechendichte: 0.6, cw: 1.0 } },
  { id: 'auwald', art: 'bewuchs', name: 'Auwald (Stämme)',
    hinweis: 'Rund 0,5 Stämme je m² à 200 mm — das Unterholz ist nicht drin.',
    werte: { zonen_tiefe: 10.0 },
    widerstand: { flaechendichte: 0.1, cw: 1.0 } },
]

// Maße, die nur zu EINER Art gehören. Beim Wechsel müssen sie weg —
// sonst hängt eine Stabteilung an einer Steinschüttung und behauptet
// etwas, das dort niemand rechnet.
const MASSE_JE_ART = {
  rechen: ['bar_spacing', 'bar_thickness', 'bar_depth'],
  steinschuettung: [],
  bewuchs: [],
  manuell: [],
}
const ALLE_MASSE = [...new Set(Object.values(MASSE_JE_ART).flat())]

/**
 * Ein Bauwerk auf eine neue Zonenart umstellen — reine Funktion.
 *
 * Die Untergruppe räumt beim Artwechsel nur ihre EIGENEN Felder auf
 * (feldTypen.artGewechselt); die Stabmaße liegen aber eine Ebene höher,
 * am Bauwerk selbst. Ohne diesen Schritt bliebe die Stabteilung an einer
 * Steinschüttung stehen — unsichtbar, aber im Fall gespeichert.
 */
export function zonenArtGewechselt(struct, neueArt) {
  const neu = { ...struct,
    resistance: { ...struct.resistance, kind: neueArt } }
  const bleibt = new Set(MASSE_JE_ART[neueArt] ?? [])
  for (const k of ALLE_MASSE) if (!bleibt.has(k)) neu[k] = null
  if (neueArt === 'rechen' && !neu.bar_spacing) {
    // Ohne Stabmaße lehnt das Modell den Rechen ab (casespec).
    neu.bar_spacing = 0.02
    neu.bar_thickness = 0.008
    neu.bar_depth = 0.06
  }
  return neu
}

/** Eine Vorlage auf ein Bauwerk anwenden — reine Funktion. */
export function vorlageAnwenden(struct, vorlage) {
  const neu = zonenArtGewechselt(struct, vorlage.art)
  Object.assign(neu, vorlage.werte)
  // Beiwerte von Hand werden ÜBERSCHRIEBEN: eine Vorlage, die einen alten
  // f-Wert stehen lässt, hätte keine Wirkung — er hat Vorrang.
  neu.resistance = { ...neu.resistance, d: [0, 0, 0], f: [0, 0, 0],
    korngroesse: null, porositaet: null, flaechendichte: null, cw: null,
    ...vorlage.widerstand }
  return neu
}

// --- Die Zone muss ins NETZ passen ----------------------------------------
//
// topoSet wählt Zellen nach ihrem MITTELPUNKT. Ein Kasten, der dünner als
// eine Zelle ist, erwischt je nach Lage keine einzige — die Zone stünde im
// Fall, bremste aber nichts, und nichts würde rot.
//
// Aber auch darüber kommt nicht der ganze Verlust an. An einem
// 1D-Kastenfall in interFoam v2406 gegen den Ergun-Wert gemessen:
//
//     2 Zellen quer  63 %      8 Zellen quer  92 %
//     4 Zellen quer  83 %     16 Zellen quer  97 %
//
// Vier ist deshalb das Ziel, nicht zwei (validate.zone_wirksam nennt im
// Befund den Anteil, der bei der eingestellten Zellgröße ankommt).
export const ZELLEN_QUER = 4

/**
 * Der Kasten, den topoSet ausschneidet: die Anströmfläche, um die
 * Zonentiefe entlang ihrer Normalen nach hinten gezogen. Rückgabe als
 * Ausdehnung [x0,y0,z0,x1,y1,z1] wie eine Verfeinerungsbox.
 */
export function zonenKasten(struct, rand = 0) {
  const p = struct?.plane_polygon
  if (!Array.isArray(p) || p.length < 4) return null
  const [ax, ay, az] = p[0]
  const i = [p[1][0] - ax, p[1][1] - ay, p[1][2] - az]
  const j = [p[3][0] - ax, p[3][1] - ay, p[3][2] - az]
  const n = [i[1] * j[2] - i[2] * j[1], i[2] * j[0] - i[0] * j[2],
    i[0] * j[1] - i[1] * j[0]]
  const len = Math.hypot(...n)
  if (!(len > 0)) return null
  const t = zonenTiefe(struct)
  const versatz = n.map((v) => (v / len) * t)
  const ecken = [...p, ...p.map((q) => q.map((v, k) => v + versatz[k]))]
  const min = [0, 1, 2].map((k) => Math.min(...ecken.map((q) => q[k])) - rand)
  const max = [0, 1, 2].map((k) => Math.max(...ecken.map((q) => q[k])) + rand)
  return [...min, ...max]
}

/**
 * Eine Rechen-Zone, die zu fein für das Netz ist, wird VERTIEFT statt das
 * Netz zu verfeinern.
 *
 * Das geht nur beim Rechen, und es ist der Grund, warum die Zonentiefe
 * dort überhaupt frei ist: ζ gilt für die Ebene und wird auf die Tiefe
 * verteilt (f = ζ/L). Eine doppelt so tiefe Zone bekommt den halben
 * Beiwert — der Verlust bleibt auf die Stelle genau derselbe, das Netz
 * darf grob bleiben. Bei einer Steinschüttung wäre dieselbe Änderung eine
 * FÄLSCHUNG: dort ist die Tiefe die Dicke des Bauwerks.
 */
export function zoneAnsNetz(struct, baseCell) {
  if (struct?.type !== 'screen') return null
  if ((struct.resistance?.kind ?? 'rechen') !== 'rechen') return null
  if (!(baseCell > 0)) return null
  const noetig = ZELLEN_QUER * baseCell
  if (zonenTiefe(struct) >= noetig) return null
  return {
    zonen_tiefe: Number(noetig.toFixed(3)),
    text: `Die Widerstandszone wurde auf ${noetig.toFixed(2)
      .replace('.', ',')} m vertieft (${ZELLEN_QUER} Zellen bei `
      + `${String(baseCell).replace('.', ',')} m Basiszelle). Der Verlust `
      + 'ändert sich dadurch nicht — der Beiwert wird auf die Tiefe '
      + 'verteilt. Über weniger Zellen käme nur ein Teil davon an: bei '
      + 'zwei Zellen rund zwei Drittel, bei einer womöglich gar nichts.',
  }
}
