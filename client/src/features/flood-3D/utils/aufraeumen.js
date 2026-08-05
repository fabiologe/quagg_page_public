import { KIND_NAMEN, KIND_PATHS } from './kindPfade'

// Löschen räumt auf: was ohne das gelöschte Objekt keinen Inhalt mehr hat,
// verschwindet mit; was einen eigenen Ort behält, wird gemeldet.
//
// Vorher blieb alles liegen. Ein Nachweiskriterium auf einem gelöschten
// Pegel, eine Flächenverfeinerung auf einem entfernten Bauwerk, ein Eintrag
// in der Kraftauswertung — jedes davon war danach ein Fehlerbefund, den der
// Bearbeiter von Hand suchen musste.
//
// DIE GRENZE: automatisch entfernt wird, was ohne den Verweis keinen Inhalt
// mehr hat UND keinen eigenen Ort trägt. Ein Kriterium ist „Größe X am Ort
// Y ≤ Grenzwert" — ohne Y ist der Grenzwert eine Zahl ohne Aussage. Eine
// Verfeinerungsbox dagegen ist ein Quader mit sechs Koordinaten an einer
// Stelle des Gebiets; ein zweites Bauwerk kann darin stehen. Ein Pegel bei
// (x, y) ist ein Messort. Beides bleibt stehen und wird nur gemeldet.
//
// KEINE HERKUNFTSINFORMATION: was ein Rezept anlegt und tatsächlich am
// Bauwerk hängt, ist genau das, was einen Verweis trägt. Ein Feld
// `herkunft: <id>` wäre eine zweite Wahrheit, die niemand pflegt — den
// Pegel 50 m wegschieben, und sie lügt. Rezeptreste werden stattdessen
// GEOMETRISCH gemeldet: was im Grundriss des gelöschten Objekts liegt.
// „Pegel steht im Grundriss des entfernten Bauwerks" ist überprüfbar,
// „gehörte zum Rezept" wäre eine Behauptung über die Vergangenheit.

import {
  PUNKT_FELDER, QUELL_NAMEN, REFERENZ_QUELLEN, referenzListe,
} from './feldTypen'



const klon = (o) => JSON.parse(JSON.stringify(o))

/** Welche Kennungen je Verweisquelle es im Fall gibt. */
function kennungen(spec) {
  const raus = {}
  for (const quelle of Object.keys(QUELL_NAMEN)) {
    raus[quelle] = new Set(referenzListe(spec, quelle))
  }
  return raus
}

/**
 * Verweisfelder eines Objekts als [feld, quelle]-Paare. Deckt
 * Nachweiskriterien (über `kind`) und Flächenverfeinerung/Außenkante
 * (über `type`) ab — dieselbe Kunde, die auch die Auswahlfelder speist.
 */
function verweiseVon(obj) {
  const tabelle = REFERENZ_QUELLEN[obj.kind] ?? REFERENZ_QUELLEN[obj.type]
  return tabelle ? Object.entries(tabelle) : []
}

// Halbe Breite quer zur Achse. Ohne sie wäre die Hüllbox einer Wand eine
// LINIE und die eines runden Schachts ein PUNKT — im Grundriss läge dann
// so gut wie nie etwas.
const QUER_MASS = ['thickness', 'crest_width', 'diameter', 'width']

function planRadius(obj) {
  let r = obj.radius ?? 0
  for (const k of QUER_MASS) {
    if (Number.isFinite(obj[k])) r = Math.max(r, obj[k] / 2)
  }
  if (Number.isFinite(obj.wall_thickness)) {
    r = Math.max(r, obj.wall_thickness)
  }
  const p = obj.profile ?? {}
  for (const k of ['diameter', 'width']) {
    if (Number.isFinite(p[k])) r = Math.max(r, p[k] / 2)
  }
  return r
}

/** Hüllbox eines Objekts im Grundriss, oder null. */
export function huellbox(obj) {
  const xs = []
  const ys = []
  const punkt = (p) => {
    if (Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])) {
      xs.push(p[0]); ys.push(p[1])
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!Array.isArray(v)) continue
    if (k === 'extent' && v.length >= 4) {
      // 4er: x0,y0,x1,y1 — 6er: x0,y0,z0,x1,y1,z1
      const [a, b, c, d] = v.length >= 6 ? [v[0], v[1], v[3], v[4]]
        : [v[0], v[1], v[2], v[3]]
      punkt([a, b]); punkt([c, d])
    } else if (k === 'center' || k === 'point') {
      punkt(v)
    } else if (PUNKT_FELDER.has(k)) {
      for (const p of v) punkt(p)
    }
  }
  for (const p of obj.alignment?.points ?? []) punkt(p)
  if (!xs.length) return null
  const r = planRadius(obj)
  return [Math.min(...xs) - r, Math.min(...ys) - r,
    Math.max(...xs) + r, Math.max(...ys) + r]
}

const drin = (box, x, y, rand = 0) => box
  && x >= box[0] - rand && x <= box[2] + rand
  && y >= box[1] - rand && y <= box[3] + rand

/**
 * Objekte mit eigenem Ort, die im Grundriss des gelöschten liegen. Sie
 * werden NICHT entfernt — nur benannt, damit der Bearbeiter entscheiden
 * kann. Das findet die Reste eines Bauwerksrezepts, ohne sich auf eine
 * Herkunftsangabe zu verlassen.
 */
export function verwaisteNachbarn(spec, box) {
  if (!box) return []
  const raus = []
  for (const g of spec.evaluation?.gauges ?? []) {
    if (drin(box, g.point?.[0], g.point?.[1])) {
      raus.push({ kind: 'gauge', id: g.id })
    }
  }
  for (const s of spec.evaluation?.sections ?? []) {
    const p = s.polyline ?? []
    if (!p.length) continue
    const mx = p.reduce((a, q) => a + q[0], 0) / p.length
    const my = p.reduce((a, q) => a + q[1], 0) / p.length
    if (drin(box, mx, my)) raus.push({ kind: 'section', id: s.id })
  }
  for (const r of spec.mesh?.refinements ?? []) {
    if (r.type !== 'box' || !Array.isArray(r.extent)) continue
    const [x0, y0, , x1, y1] = r.extent
    if (drin(box, x0, y0) && drin(box, x1, y1)) {
      raus.push({ kind: 'refinement', id: r.id })
    }
  }
  return raus
}

/** Ein Kriterium in Klartext, damit die Meldung den Grenzwert nennt. */
function kriteriumText(t) {
  const grenze = t.limit_max != null ? `≤ ${t.limit_max}`
    : (t.limit_min != null ? `≥ ${t.limit_min}` : '')
  return `„${t.id}" (${t.kind}${grenze ? ` ${grenze}` : ''})`
}

/** Eine Runde: alles entfernen, dessen Verweise ins Leere zeigen. */
function eineRunde(spec, meldungen) {
  const da = kennungen(spec)
  let treffer = 0

  const tot = (obj) => verweiseVon(obj).find(([feld, quelle]) => {
    const wert = obj[feld]
    return wert != null && wert !== '' && !da[quelle]?.has(wert)
  })

  const ziele = spec.evaluation?.targets ?? []
  for (let i = ziele.length - 1; i >= 0; i--) {
    const treffend = tot(ziele[i])
    if (!treffend) continue
    const [feld, quelle] = treffend
    meldungen.push(`Nachweiskriterium ${kriteriumText(ziele[i])} entfernt — `
      + `${QUELL_NAMEN[quelle]} „${ziele[i][feld]}" gibt es nicht mehr`)
    ziele.splice(i, 1)
    treffer++
  }

  const refs = spec.mesh?.refinements ?? []
  for (let i = refs.length - 1; i >= 0; i--) {
    if (refs[i].type !== 'surface') continue
    const treffend = tot(refs[i])
    if (!treffend) continue
    meldungen.push(`Flächenverfeinerung „${refs[i].id}" entfernt — die Fläche `
      + `„${refs[i].target}" gibt es nicht mehr`)
    refs.splice(i, 1)
    treffer++
  }

  // Reine Namenslisten: ein toter Eintrag erzeugt beim Fallbau eine
  // Auswertung auf einen Patch, den es nicht gibt
  const patches = da.patch ?? new Set()
  for (const [liste, was] of [
    [spec.evaluation?.force_patches, 'Kraftauswertung'],
    [spec.mesh?.boundary_layers?.patches, 'Grenzschichtliste'],
  ]) {
    if (!Array.isArray(liste)) continue
    for (let i = liste.length - 1; i >= 0; i--) {
      if (patches.has(liste[i])) continue
      meldungen.push(`„${liste[i]}" aus der ${was} entfernt — das Bauwerk `
        + 'gibt es nicht mehr')
      liste.splice(i, 1)
      treffer++
    }
  }
  return treffer
}

/**
 * Ein Objekt löschen und den Fall danach in sich stimmig hinterlassen.
 *
 * Rückgabe: { spec, meldungen, verwaist, runden }. `spec` ist eine Kopie —
 * der Aufrufer entscheidet, ob er sie übernimmt.
 */
export function aufraeumplan(spec, kind, id) {
  const neu = klon(spec)
  const liste = KIND_PATHS[kind]?.(neu)
  const i = liste?.findIndex((o) => o.id === id)
  if (i == null || i < 0) {
    return { spec: neu, meldungen: [], verwaist: [], runden: 0, ok: false }
  }
  const [weg] = liste.splice(i, 1)
  const meldungen = []

  // Kaskade als Fixpunkt. `runden` zählt nur die WIRKSAMEN Durchläufe —
  // der Verweisgraph ist heute flach, einer genügt, und ein Test hält das
  // fest. Der Deckel ist die Versicherung gegen eine spätere
  // Kriterienart, die auf ein Kriterium zeigt.
  let runden = 0
  for (let i = 0; i < 5; i++) {
    if (!eineRunde(neu, meldungen)) break
    runden++
  }

  const nachbarn = verwaisteNachbarn(neu, huellbox(weg)).map((n) => ({
    ...n, label: `${KIND_NAMEN[n.kind]} „${n.id}"` }))

  return { spec: neu, meldungen, verwaist: nachbarn, runden, ok: true,
    entfernt: `${KIND_NAMEN[kind] ?? kind} „${id}"` }
}
