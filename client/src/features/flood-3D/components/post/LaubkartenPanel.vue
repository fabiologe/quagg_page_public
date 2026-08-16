<template>
  <section class="f3d-laub">
    <aside class="f3d-laub-side">
      <article class="f3d-card">
        <header class="f3d-card-head"><h3>Laufpaar</h3></header>
        <div class="f3d-field">
          <label>Leerlauf (Ablagerung)</label>
          <select class="f3d-select" v-model="leerlaufId">
            <option value="">– wählen –</option>
            <option v-for="r in fertigeLaeufe" :key="r.run_id" :value="r.run_id">
              {{ r.run_id }}
            </option>
          </select>
        </div>
        <div class="f3d-field">
          <label>Spülschwall (Spülwirkung)</label>
          <select class="f3d-select" v-model="schwallId" :disabled="!leerlaufId">
            <option value="">– wählen –</option>
            <option v-for="k in kandidaten" :key="k.run_id" :value="k.run_id"
                    :disabled="!k.passt">
              {{ k.run_id }}{{ k.passt ? '' : (k.unbekannt
                ? ' (Netz unbekannt)' : ' (anderes Netz)') }}
            </option>
          </select>
          <p class="f3d-muted f3d-small">
            Nur Läufe auf demselben Netz sind wählbar
            (Netz {{ netzKurz(netzHash) }}) — sonst liegen die Karten nicht
            Zelle auf Zelle übereinander.
          </p>
        </div>
        <button class="f3d-btn f3d-btn-run"
                :disabled="!leerlaufId || !schwallId || rechnend"
                @click="rechnen">
          {{ rechnend ? 'rechnet …' : 'Karten rechnen' }}
        </button>
        <div v-if="rechnend || fortschritt > 0" class="f3d-laub-bar">
          <div :style="{ width: `${Math.round(fortschritt * 100)}%` }"></div>
        </div>
        <p v-if="phase" class="f3d-muted f3d-small">{{ phase }}</p>
        <p v-if="fehler" class="f3d-error">{{ fehler }}</p>
      </article>

      <article v-if="erg" class="f3d-card">
        <header class="f3d-card-head">
          <h3>Karte</h3>
        </header>
        <div class="f3d-field">
          <select class="f3d-select" v-model="karte">
            <option value="A">A — Ablagerung (Laub)</option>
            <option value="T">A′ — Trockenfallzeit</option>
            <option value="B">B — Spülwirkung (Integral)</option>
            <option value="Bt">B′ — Überschreitungsdauer</option>
            <option value="C">C — Verschnitt (Klassen)</option>
          </select>
        </div>
        <div class="f3d-field">
          <label>
            τ_krit = {{ fmt(tauKrit) }} N/m²
            <KennwertHilfe groesse="bed_shear" :wert="tauKrit" />
          </label>
          <input type="range" min="0" max="100" step="1"
                 :value="tauReglerPos" @input="tauAusRegler($event)" />
          <p class="f3d-muted f3d-small">
            {{ tauHerkunft }}
          </p>
        </div>
        <div class="f3d-field">
          <label>Ablagerung ab Faktor {{ fmt(aSchwelle) }}</label>
          <input type="range" min="1" max="8" step="0.25" v-model.number="aSchwelle" />
          <p class="f3d-muted f3d-small">
            1 = mittlere Belegung. {{ fmt(aSchwelle) }} heißt
            {{ fmt(aSchwelle) }}-fache Laubmenge gegenüber dem Mittel.
          </p>
        </div>
        <div class="f3d-field">
          <label>Spülintegral mindestens (N·s/m²)</label>
          <input type="number" class="f3d-num" step="0.5" min="0"
                 v-model.number="iMin" />
          <p class="f3d-muted f3d-small">
            0 heißt: jede Überschreitung von τ_krit genügt. Größere Werte
            verlangen, dass die Belastung auch lange genug anliegt.
          </p>
        </div>
      </article>

      <article v-if="erg" class="f3d-card">
        <header class="f3d-card-head">
          <h3>Flächen
            <KennwertHilfe groesse="laub_kritisch" :wert="kritischProzent" />
          </h3>
        </header>
        <ul class="f3d-legende">
          <li v-for="a in anteile" :key="a.klasse">
            <span class="f3d-swatch" :class="`kl-${a.klasse}`"></span>
            <span class="f3d-legende-text">{{ a.text }}</span>
            <span class="f3d-legende-zahl">
              {{ (a.anteil * 100).toFixed(1) }} % · {{ fmt(a.flaeche) }} m²
            </span>
          </li>
        </ul>
        <p class="f3d-muted f3d-small">
          Bezugsfläche ist, was im Leerlauf überhaupt einmal nass war
          ({{ fmt(bezugsflaeche) }} m²) — nicht das ganze Modellgebiet.
        </p>
      </article>
    </aside>

    <div class="f3d-laub-main">
      <div ref="canvasHost" class="f3d-laub-canvas">
        <canvas ref="canvas"></canvas>
        <p v-if="!erg && !rechnend" class="f3d-muted f3d-laub-leer">
          Zwei Läufe wählen und rechnen. Der Leerlauf liefert, wo sich
          schwimmendes Laub sammelt; der Spülschwall, wo die Sohle genug
          belastet wird. Karte C ist der Verschnitt.
        </p>
      </div>

      <article v-if="erg" class="f3d-card f3d-laub-fuss">
        <h4>{{ kartenTitel }}</h4>
        <p class="f3d-muted f3d-small">{{ kartenText }}</p>

        <dl class="f3d-stats">
          <div class="f3d-stat">
            <dt>Laub am Ende (von {{ erg.bilanz.ausgesaet }} Tracern)</dt>
            <dd :class="erg.bilanz.stimmt ? 'good' : 'bad'">
              {{ erg.bilanz.gestrandet }} trockengefallen ·
              {{ erg.bilanz.restwasser }} in Restpfützen ·
              {{ erg.bilanz.draussen }} hinausgetrieben
              <template v-if="!erg.bilanz.stimmt"> — Bilanz geht nicht auf!</template>
            </dd>
          </div>
          <div class="f3d-stat">
            <dt>Abtastung (Advektions-CFL)</dt>
            <dd :class="erg.cfl.median > 1 ? 'bad' : erg.cfl.median > 0.5 ? 'warn' : 'good'">
              {{ fmt(erg.cfl.median) }} im Median
            </dd>
          </div>
          <div class="f3d-stat">
            <dt>Leerlauf</dt>
            <dd :class="erg.entleert > 0.5 ? 'good' : 'warn'">
              {{ (erg.entleert * 100).toFixed(0) }} % des Anfangsvolumens
              abgelaufen
            </dd>
          </div>
          <div class="f3d-stat">
            <dt>Spülereignis</dt>
            <dd>{{ fmt(erg.schwallDauer) }} s · τ_max
              {{ fmt(erg.tauMax) }} N/m²</dd>
          </div>
        </dl>

        <p v-for="w in warnungen" :key="w.text" class="f3d-hint"
           :class="`f3d-hint-${w.level}`">{{ w.text }}</p>
      </article>
    </div>
  </section>
</template>

<script setup>
// Laubkarten: wo bleibt Laub liegen, und spült der Schwall es weg?
//
// Zwei Läufe, zwei Fragen, eine Rasterebene:
//   A  LEERLAUF — schwimmendes Laub treibt mit der zurückweichenden
//      Wasserlinie und strandet, wo die Fläche zuletzt steht.
//   B  SPÜLSCHWALL — wie lange und wie stark die Sohle belastet wird.
//   C  der Verschnitt: viel Ablagerung UND zu wenig Spülung = kritisch.
//
// Der Regler für τ_krit reagiert sofort, weil Karte B NICHT für einen
// festen Schwellwert aggregiert wird, sondern als Überschreitungskurve je
// Zelle (utils/laubkarten.js). Ein Reglerzug kostet einen Durchlauf über
// ein kleines Array statt eines erneuten Durchlaufs über alle Zeitschritte.
//
// Was das Modul NICHT kann, steht sichtbar am Ergebnis (KennwertHilfe
// „laub_kritisch") — Einwegkopplung, masseloser Tracer, nur kurze
// Standzeiten, τ nur auf dem Geländepatch.
import { computed, ref, watch } from 'vue'
import KennwertHilfe from './KennwertHilfe.vue'
import { usePostStore } from '../../stores/usePostStore'
import { getGeometry, getTimesteps, getVolume, planFieldsCached }
  from '../../composables/useFieldCache'
import { PAD, useRasterCanvas } from '../../composables/useRasterCanvas'
import { TIEFE_BENETZT } from '../../utils/anzeigeSchwellen'
import { viridis } from '../../utils/colormap'
import { gelaendeFarbe, gelaendeSchummerung, mische } from '../../utils/rasterBild'
import { netzKurz, paarKandidaten, rasterVergleich } from '../../utils/laubpaar'
import {
  KLASSE, erzeugeTauStufen, flaechenanteile, klassenFeld,
  neueSpuelAggregation, neueTrockenfall, spuelAuswerten, spuelSchritt,
  trockenfallAuswerten, trockenfallSchritt, zeitGewichte,
} from '../../utils/laubkarten'
import {
  ablagerungskarte, abschliessen, abtastGuete, advehiere, saeeTracer,
  tracerBilanz,
} from '../../utils/laubtracer'
import { VORBELEGUNG, tauKritVorgabe } from '../../utils/grenzwerte'
import { fmtKurz as fmt } from '../../utils/labels'

const store = usePostStore()
const canvasHost = ref(null)
const canvas = ref(null)

const leerlaufId = ref(store.selectedRunIds[0] ?? '')
const schwallId = ref('')
const karte = ref('C')
const tauKrit = ref(VORBELEGUNG.tau_krit)
const tauAusFall = ref(false)
const aSchwelle = ref(VORBELEGUNG.laub_schwelle)
const iMin = ref(0)
const rechnend = ref(false)
const fortschritt = ref(0)
const phase = ref('')
const fehler = ref('')

// Ergebnis der teuren Auswertung. Bewusst als ref auf ein einfaches
// Objekt: die grossen Arrays sollen NICHT reaktiv verpackt werden.
const erg = ref(null)
let daten = null            // { ablagerung, trocken, agg, terrainZ, … }
let lauf = 0                // Wächter gegen ein spät zurückkehrendes Rechnen

const fertigeLaeufe = computed(() =>
  store.visibleRuns.filter((r) => r.status === 'completed'))
const netzHash = computed(() =>
  fertigeLaeufe.value.find((r) => r.run_id === leerlaufId.value)?.netz_hash)
const kandidaten = computed(() =>
  paarKandidaten(fertigeLaeufe.value, leerlaufId.value))

// Ein Wechsel des Leerlaufs macht das Paar ungültig — sonst stünde das
// alte Bild neben der neuen Auswahl
watch(leerlaufId, () => {
  const k = kandidaten.value.find((x) => x.run_id === schwallId.value)
  if (!k?.passt) schwallId.value = ''
  erg.value = null
  daten = null
  phase.value = ''
  // Ohne dieses Leeren stünde die alte Karte neben der neuen Auswahl —
  // und sähe aus, als gehörte sie dazu.
  const cv = canvas.value
  if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height)
})

// --- Rechnen --------------------------------------------------------------

async function rechnen() {
  const meins = ++lauf
  rechnend.value = true
  fehler.value = ''
  fortschritt.value = 0
  erg.value = null
  daten = null
  try {
    phase.value = 'Läufe öffnen …'
    const [idxL, idxS, geo] = await Promise.all([
      getTimesteps(leerlaufId.value), getTimesteps(schwallId.value),
      getGeometry(leerlaufId.value),
    ])
    const vgl = rasterVergleich(idxL.grid, idxS.grid)
    if (!vgl.passt) throw new Error(vgl.grund)
    if (!idxS.fields.includes('bed_shear')) {
      throw new Error('Der Spüllauf enthält kein Feld „bed_shear" — ohne '
        + 'Sohlschubspannung lässt sich die Spülwirkung nicht bewerten.')
    }
    if (idxL.timesteps.length < 3 || idxS.timesteps.length < 3) {
      throw new Error('Mindestens drei Ausgabezeitpunkte je Lauf nötig — '
        + 'sonst gibt es weder eine Bahn noch eine Belastungsdauer.')
    }

    const [nx, ny] = idxL.grid.dims
    const { origin, spacing } = idxL.grid
    const geometrie = { nx, ny, origin, spacing }
    const terrainZ = geo.terrain?.z ?? null
    const zeitenL = idxL.timesteps.map((e) => e.time)
    const zeitenS = idxS.timesteps.map((e) => e.time)

    // --- Leerlauf: Trockenfall und Tracerbahnen -------------------------
    phase.value = 'Leerlauf: Laub verfolgen …'
    const tf = neueTrockenfall(nx * ny)
    let zustand = null
    let vorher = null
    let cflMax = { median: 0, p90: 0, cfl: 0, cflP90: 0 }
    let volAnfang = 0
    let volEnde = 0
    const zellflaeche = spacing[0] * spacing[1]

    for (let i = 0; i < zeitenL.length; i++) {
      const vol = await getVolume(leerlaufId.value, zeitenL[i], ['alpha', 'U'])
      if (meins !== lauf) return
      const pf = planFieldsCached(vol, terrainZ)
      trockenfallSchritt(tf, pf.depth, zeitenL[i], TIEFE_BENETZT)

      let summe = 0
      for (let c = 0; c < pf.depth.length; c++) summe += pf.depth[c]
      if (i === 0) volAnfang = summe * zellflaeche
      volEnde = summe * zellflaeche

      if (i === 0) {
        zustand = saeeTracer({ ...geometrie, tiefe: pf.depth, anzahl: 20000 })
      } else {
        const dt = zeitenL[i] - zeitenL[i - 1]
        const g = abtastGuete(vorher.ux, vorher.uy, dt, spacing)
        if (g.cfl > cflMax.median) cflMax = { median: g.cfl, p90: g.cflP90 }
        advehiere(zustand,
          { ux: vorher.ux, uy: vorher.uy, tiefe: vorher.depth },
          { ux: pf.ux, uy: pf.uy, tiefe: pf.depth },
          zeitenL[i - 1], zeitenL[i], geometrie)
      }
      vorher = pf
      fortschritt.value = 0.6 * ((i + 1) / zeitenL.length)
    }
    // Was am Ende noch treibt, liegt in einer Restpfütze — und gehört auf
    // die Karte. Ohne diesen Abschluss blieben ausgerechnet die Senken
    // leer, in denen sich das Laub sammelt (siehe laubtracer.js).
    abschliessen(zustand)

    // --- Schwall: Überschreitungskurve je Zelle -------------------------
    phase.value = 'Spülschwall: Belastungsbereich abtasten …'
    // Das Stufenraster muss VOR dem Sammeln stehen, der Spitzenwert wird
    // aber erst währenddessen bekannt. Deshalb fünf Proben über den Lauf
    // statt nur des ersten Zeitpunkts: der ist bei einem Schwall regelmäßig
    // noch trocken, und aus τ_max = 0 entstünde ein Raster, in dem später
    // ALLES in der obersten Stufe landet — der τ_krit-Regler würde dann
    // springen statt zu regeln.
    let tauMax = 0
    const proben = [...new Set([0, 0.25, 0.5, 0.75, 1]
      .map((f) => Math.round(f * (zeitenS.length - 1))))]
    for (const i of proben) {
      const v = await getVolume(schwallId.value, zeitenS[i],
        ['alpha', 'bed_shear'])
      if (meins !== lauf) return
      for (const t of planFieldsCached(v, terrainZ).tau ?? []) {
        if (t > tauMax) tauMax = t
      }
    }
    if (!(tauMax > 0)) {
      throw new Error('Im Spüllauf ist die Sohlschubspannung überall null — '
        + 'entweder erreicht der Schwall die Sohle nicht, oder das Feld '
        + '„bed_shear" wurde nicht geschrieben.')
    }
    // Reserve nach oben: die Proben treffen die Spitze nicht zwingend.
    // Werte darüber gehen nicht verloren — sie landen in der obersten
    // Stufe, deren τ·dt-Summe exakt mitgeführt wird.
    const agg = neueSpuelAggregation(nx * ny, erzeugeTauStufen(tauMax * 4))

    const gewichte = zeitGewichte(zeitenS)
    for (let i = 0; i < zeitenS.length; i++) {
      const vol = await getVolume(schwallId.value, zeitenS[i],
        ['alpha', 'bed_shear'])
      if (meins !== lauf) return
      const pf = planFieldsCached(vol, terrainZ)
      if (!pf.tau) continue
      const dt = gewichte[i]
      const nass = new Uint8Array(nx * ny)
      for (let c = 0; c < nass.length; c++) {
        nass[c] = pf.depth[c] > TIEFE_BENETZT ? 1 : 0
        if (pf.tau[c] > tauMax) tauMax = pf.tau[c]
      }
      spuelSchritt(agg, pf.tau, nass, dt)
      fortschritt.value = 0.6 + 0.4 * ((i + 1) / zeitenS.length)
    }

    // --- Auswertung -----------------------------------------------------
    const trocken = trockenfallAuswerten(tf)
    // Bezugsfläche: was im Leerlauf je nass war. Das ganze Modellgebiet
    // wäre der falsche Nenner — Böschungen und Vorland gehören nicht dazu.
    const gueltig = new Uint8Array(nx * ny)
    for (let c = 0; c < gueltig.length; c++) {
      gueltig[c] = Number.isFinite(trocken[c]) ? 1 : 0
    }
    const { karte: ablagerung } = ablagerungskarte(zustand,
      { ...geometrie, gueltig })

    daten = { ...geometrie, terrainZ, ablagerung, trocken, agg, gueltig,
      zellflaeche }
    erg.value = {
      bilanz: tracerBilanz(zustand),
      cfl: cflMax,
      entleert: volAnfang > 0 ? 1 - volEnde / volAnfang : 0,
      schwallDauer: agg.dauer,
      tauMax,
      nZeitL: zeitenL.length,
      nZeitS: zeitenS.length,
      dtL: zeitenL.length > 1 ? zeitenL[1] - zeitenL[0] : 0,
    }
    phase.value = `Fertig: ${zeitenL.length} + ${zeitenS.length} Zeitpunkte.`

    // τ_krit aus dem Fall-Kriterium des SPÜLLAUFS — es beschreibt, was
    // dieser Nachweis fordert; ein Faustwert daneben wäre irreführend
    const res = await store.ensureResult(schwallId.value).catch(() => null)
    const vorgabe = tauKritVorgabe(res)
    tauKrit.value = vorgabe.wert
    tauAusFall.value = vorgabe.ausFall
    zeichne()
  } catch (e) {
    if (meins === lauf) fehler.value = e.message
  } finally {
    if (meins === lauf) { rechnend.value = false; fortschritt.value = 0 }
  }
}

// --- Abgeleitetes (reagiert auf die Regler) -------------------------------

const spuel = computed(() => {
  if (!erg.value || !daten) return null
  return spuelAuswerten(daten.agg, tauKrit.value)
})

const klassen = computed(() => {
  if (!spuel.value) return null
  return klassenFeld(daten.ablagerung, spuel.value.iSpuel,
    spuel.value.benetzt, aSchwelle.value, iMin.value)
})

const anteile = computed(() => (klassen.value
  ? flaechenanteile(klassen.value, daten.zellflaeche, daten.gueltig) : []))

const bezugsflaeche = computed(() =>
  anteile.value.reduce((a, x) => a + x.flaeche, 0))

const kritischProzent = computed(() => {
  const k = anteile.value.find((a) => a.klasse === KLASSE.KRITISCH)
  return k ? k.anteil * 100 : null
})

// Der Regler läuft logarithmisch: τ streut über Größenordnungen, linear
// wäre das untere Drittel (genau der Selbstreinigungsbereich) nicht
// einstellbar.
const TAU_MIN = 0.05
const TAU_MAX = 200
const tauReglerPos = computed(() => Math.round(100
  * Math.log(tauKrit.value / TAU_MIN) / Math.log(TAU_MAX / TAU_MIN)))
function tauAusRegler(e) {
  const p = Number(e.target.value) / 100
  tauKrit.value = Number((TAU_MIN * (TAU_MAX / TAU_MIN) ** p).toPrecision(2))
  tauAusFall.value = false
}
const tauHerkunft = computed(() => (tauAusFall.value
  ? 'Aus dem Fall-Kriterium „min_bed_shear" des Spüllaufs übernommen.'
  : `Vorbelegung ${VORBELEGUNG.tau_krit} N/m² (obere Kante des `
    + 'Selbstreinigungsbands für Rinnen). Ein Kriterium im Fall würde sie '
    + 'ersetzen.'))

const KARTEN = {
  A: ['Karte A — Ablagerung', 'Konzentrationsfaktor der gestrandeten '
    + 'Tracer: 1 = mittlere Belegung, 3 = dreifache. Wo das Laub liegen '
    + 'bleibt, wenn das Becken leerläuft.'],
  T: ['Karte A′ — Trockenfallzeit', 'Wann eine Stelle zuletzt Wasser trug '
    + '(0 = früh, 1 = zuletzt). Spät trockenfallende Bereiche sind die '
    + 'geometrisch zwingenden Sammelstellen — unabhängig vom Tracerbild.'],
  B: ['Karte B — Spülintegral', 'Aufsummierte Überschreitung von τ_krit '
    + 'über die Zeit (N·s/m²). Nicht nur ob, sondern wie lange und wie '
    + 'kräftig gespült wurde.'],
  Bt: ['Karte B′ — Überschreitungsdauer', 'Wie lange τ über τ_krit lag (s).'],
  C: ['Karte C — Verschnitt', 'Die Planungsaussage: viel Ablagerung und zu '
    + 'wenig Spülung. „Tote Fläche" erreicht der Schwall gar nicht erst — '
    + 'daran ändert kein τ_krit etwas.'],
}
const kartenTitel = computed(() => KARTEN[karte.value][0])
const kartenText = computed(() => KARTEN[karte.value][1])

// Die Datenlage-Ampel: das Modul rechnet selbst aus, ob seine Aussage
// trägt — und sagt es hin, statt eine hübsche Karte ohne Deckung zu zeigen.
const warnungen = computed(() => {
  const e = erg.value
  if (!e) return []
  const w = []
  if (e.cfl.median > 1) {
    w.push({ level: 'bad', text: `Advektions-CFL ${fmt(e.cfl.median)}: ein `
      + 'Tracer springt je gespeichertem Zeitschritt über mehr als eine '
      + 'Rasterzelle. Die Rezirkulationen, in denen sich Laub sammelt, '
      + 'stecken damit gar nicht in den Daten — Karte A zeigt eine grobe '
      + `Tendenz. Abhilfe: Felder alle ${fmt(e.dtL / (e.cfl.median / 0.5))} s `
      + 'statt alle ' + fmt(e.dtL) + ' s schreiben.' })
  } else if (e.cfl.median > 0.5) {
    w.push({ level: 'warn', text: `Advektions-CFL ${fmt(e.cfl.median)} — `
      + 'grenzwertig. Feiner geschriebene Felder schärfen Karte A.' })
  }
  if (e.entleert < 0.5) {
    w.push({ level: 'warn', text: `Im „Leerlauf" sind nur `
      + `${(e.entleert * 100).toFixed(0)} % des Anfangsvolumens abgelaufen. `
      + 'Karte A setzt voraus, dass die Wasserfläche zurückweicht — bei '
      + 'quasistationärem Zufluss strandet kaum ein Tracer und die Karte '
      + 'ist leer statt unauffällig.' })
  }
  if (!e.bilanz.stimmt) {
    w.push({ level: 'bad', text: 'Die Tracer-Bilanz geht nicht auf — die '
      + 'Advektion hat Tracer verloren. Karte A ist in diesem Zustand '
      + 'nicht verwertbar.' })
  }
  if (e.bilanz.abgelagert < e.bilanz.ausgesaet * 0.2) {
    w.push({ level: 'warn', text: `Nur ${e.bilanz.abgelagert} von `
      + `${e.bilanz.ausgesaet} Tracern sind im Gebiet geblieben; der Rest `
      + 'ist über den Rand hinausgetrieben. Die Ablagerungskarte beruht '
      + 'damit auf einem kleinen Teil der Saat — bei einem Becken mit '
      + 'Ablauf ist das erwartbar, sonst ein Hinweis auf einen zu klein '
      + 'geschnittenen Ausschnitt.' })
  }
  return w
})

// --- Zeichnen -------------------------------------------------------------

const masse = () => (daten
  ? { nx: daten.nx, ny: daten.ny, origin: daten.origin, spacing: daten.spacing }
  : null)

const { layout, worldToCanvas, flaecheVorbereiten } = useRasterCanvas({
  host: canvasHost, canvas, masse, zeichne: () => zeichne(),
})

const KLASSEN_RGB = [[45, 212, 160], [232, 161, 60], [255, 107, 107],
  [143, 160, 194]]

/** Werte der aktuellen Karte plus Bereich; null = Klassenbild. */
function kartenWerte() {
  const s = spuel.value
  if (karte.value === 'A') return daten.ablagerung
  if (karte.value === 'T') return daten.trocken
  if (karte.value === 'B') return s.iSpuel
  if (karte.value === 'Bt') return s.tExceed
  return null
}

function zeichne() {
  if (!daten || !canvas.value || !canvasHost.value) return
  const { L, ctx } = flaecheVorbereiten()
  const { nx, ny } = daten
  const { shade } = gelaendeSchummerung(daten.terrainZ, nx * ny)

  const img = document.createElement('canvas')
  img.width = nx
  img.height = ny
  const ictx = img.getContext('2d')
  const bild = ictx.createImageData(nx, ny)

  const werte = kartenWerte()
  const kl = klassen.value
  let lo = 0
  let hi = 1
  if (werte) {
    hi = -Infinity
    for (let c = 0; c < werte.length; c++) {
      if (daten.gueltig[c] && Number.isFinite(werte[c]) && werte[c] > hi) {
        hi = werte[c]
      }
    }
    if (!Number.isFinite(hi) || hi <= 0) hi = 1
  }
  const spanne = Math.max(hi - lo, 1e-9)

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const col = j * nx + i
      const p = ((ny - 1 - j) * nx + i) * 4
      let [r, g, b] = gelaendeFarbe(shade[col])
      if (daten.gueltig[col]) {
        if (werte) {
          const v = werte[col]
          if (Number.isFinite(v) && v > 0) {
            const [mr, mg, mb] = mische([r, g, b],
              viridis((v - lo) / spanne), 0.85)
            r = mr; g = mg; b = mb
          } else {
            // im Bezugsgebiet, aber ohne Wert: schwach blau, damit die
            // Bezugsfläche als solche sichtbar bleibt
            const [mr, mg, mb] = mische([r, g, b], [60, 90, 140], 0.35)
            r = mr; g = mg; b = mb
          }
        } else if (kl) {
          const [mr, mg, mb] = mische([r, g, b], KLASSEN_RGB[kl[col]], 0.85)
          r = mr; g = mg; b = mb
        }
      }
      bild.data[p] = r
      bild.data[p + 1] = g
      bild.data[p + 2] = b
      bild.data[p + 3] = 255
    }
  }
  ictx.putImageData(bild, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, PAD, PAD, L.worldW * L.scale, L.worldH * L.scale)

  // Achsenrahmen und Maßstab — dieselbe Optik wie der Grundriss
  ctx.strokeStyle = 'rgba(143,160,194,0.5)'
  ctx.lineWidth = 1
  ctx.strokeRect(PAD, PAD, L.worldW * L.scale, L.worldH * L.scale)
  ctx.fillStyle = '#8fa0c2'
  ctx.font = '10px system-ui'
  ctx.textAlign = 'center'
  for (let t = 0; t <= 5; t++) {
    const wx = daten.origin[0] + (L.worldW * t) / 5
    const [cx] = worldToCanvas(L, wx, daten.origin[1])
    ctx.fillText(wx.toFixed(0), cx, L.h - PAD + 14)
  }
}

watch([karte, spuel, klassen], () => zeichne())
</script>

<style scoped>
.f3d-laub {
  display: flex;
  gap: 12px;
  padding: 12px;
  height: 100%;
  min-height: 0;
}
.f3d-laub-side {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.f3d-laub-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.f3d-laub-canvas {
  flex: 1 1 auto;
  min-height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.f3d-laub-leer {
  position: absolute;
  max-width: 30rem;
  text-align: center;
  line-height: 1.5;
}
.f3d-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.f3d-field > label { color: var(--f3d-text-2); font-size: 0.76rem; }
.f3d-num { width: 110px; }
.f3d-laub-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--f3d-border);
  overflow: hidden;
}
.f3d-laub-bar > div { height: 100%; background: var(--f3d-accent); }
.f3d-legende { list-style: none; margin: 0; padding: 0; }
.f3d-legende li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 0.78rem;
}
.f3d-legende-text { flex: 1; }
.f3d-legende-zahl { font-variant-numeric: tabular-nums; color: var(--f3d-text-2); }
.f3d-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  flex: none;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.f3d-swatch.kl-0 { background: var(--f3d-klasse-unkritisch); }
.f3d-swatch.kl-1 { background: var(--f3d-klasse-beobachten); }
.f3d-swatch.kl-2 { background: var(--f3d-klasse-kritisch); }
.f3d-swatch.kl-3 { background: var(--f3d-klasse-tot); }
.f3d-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.5rem 1rem;
  margin: 0.5rem 0;
}
.f3d-stat dt { font-size: 0.74rem; opacity: 0.75; }
.f3d-stat dd { margin: 0; font-variant-numeric: tabular-nums; font-size: 0.95rem; }
.f3d-stat dd.good { color: var(--f3d-good); }
.f3d-stat dd.warn { color: var(--f3d-warn); }
.f3d-stat dd.bad { color: var(--f3d-bad); }
.f3d-hint { margin: 6px 0 0; font-size: 0.74rem; line-height: 1.45;
  color: var(--f3d-text-hilfe); }
.f3d-hint-warn { color: var(--f3d-warn); }
.f3d-hint-bad { color: var(--f3d-bad); }
.f3d-laub-fuss { flex: none; }
</style>
