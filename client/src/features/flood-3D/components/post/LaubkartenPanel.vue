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
            <option v-for="k in kandidaten" :key="k.run_id" :value="k.run_id">
              {{ k.run_id }}
            </option>
          </select>
        </div>

        <!-- Die Ampel ersetzt die frühere Sperre: sie sagt, WAS an einem
             Paar anders ist, statt es wortlos auszugrauen. -->
        <div v-if="ampel.stufe" class="f3d-ampel-karte" :class="ampel.stufe">
          <strong>{{ ampel.titel }}</strong>
          <p>{{ ampel.text }}</p>
          <ul v-if="unterschiede.length" class="f3d-unterschiede">
            <li v-for="u in unterschiede" :key="u.pfad">{{ unterschiedText(u) }}</li>
          </ul>
          <p v-if="mehrUnterschiede" class="f3d-muted f3d-small">
            … und weitere.
          </p>
        </div>
        <p v-else-if="vergleichLaeuft" class="f3d-muted f3d-small">
          prüfe das Paar …
        </p>

        <button class="f3d-btn f3d-btn-run"
                :disabled="!leerlaufId || !schwallId || rechnend
                  || !ampel.rechenbar"
                :title="ampel.rechenbar ? '' : ampel.text"
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

        <!-- Was ist hier eigentlich eingefärbt, und in welchem Bereich?
             Jede Karte hat eigene Vereinfachungen — deshalb ein eigenes
             Fragezeichen je Karte, kein gemeinsamer Text für alle fünf. -->
        <div class="f3d-field">
          <label>
            Farbskala
            <KennwertHilfe :groesse="KARTEN_HILFE[karte]" :wert="wertebereich.hi" />
          </label>
          <template v-if="karte !== 'C'">
            <div class="f3d-legend" :style="{ background: VIRIDIS_CSS }"></div>
            <div class="f3d-legend-labels">
              <span class="f3d-mono">{{ fmt(wertebereich.lo) }}</span>
              <span class="f3d-mono">
                {{ fmt(wertebereich.hi) }} {{ wertebereich.einheit }}
              </span>
            </div>
          </template>
          <ul class="f3d-legende">
            <template v-if="karte === 'C'">
              <li v-for="a in anteile" :key="a.klasse">
                <span class="f3d-swatch" :class="`kl-${a.klasse}`"></span>
                <span class="f3d-legende-text">{{ a.text }}</span>
              </li>
            </template>
            <!-- Die zwei Farben, die KEIN Wert sind. Ohne sie liest man
                 graue Flächen als „Null" statt als „gehört nicht dazu". -->
            <li>
              <span class="f3d-swatch" :style="{ background: FARBE_OHNE_WERT }"></span>
              <span class="f3d-legende-text">
                im Becken, aber ohne Wert ({{ ohneWertText }})
              </span>
            </li>
            <li>
              <span class="f3d-swatch" :style="{ background: FARBE_AUSSEN }"></span>
              <span class="f3d-legende-text">
                außerhalb der Bezugsfläche — im Leerlauf nie nass, nur
                Geländeschummerung
              </span>
            </li>
          </ul>
        </div>
        <!-- Gezeigt wird nur, was auf DIESE Karte wirkt. Ein Regler, der
             nichts tut, ist schlimmer als keiner — er behauptet Wirkung. -->
        <div v-if="zeigt('tau')" class="f3d-field">
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
        <div v-if="zeigt('nass')" class="f3d-field">
          <label>Nass ab {{ fmt(nassTiefe * 1000, 0) }} mm Wassertiefe</label>
          <input type="range" min="0" max="100" step="1"
                 :value="nassReglerPos" @input="nassAusRegler($event)" />
          <p class="f3d-muted f3d-small">
            „Trockengefallen" ist eine Setzung, keine Naturkonstante: ein
            Millimeterfilm trocknet von selbst weg, eine 3-cm-Lache nicht.
            Die Karte zeigt, wann hier zuletzt so viel Wasser stand.
          </p>
        </div>
        <div v-if="zeigt('ablagerung')" class="f3d-field">
          <label>Ablagerung ab Faktor {{ fmt(aSchwelle) }}</label>
          <input type="range" min="1" max="8" step="0.25" v-model.number="aSchwelle" />
          <p class="f3d-muted f3d-small">
            1 = mittlere Belegung. {{ fmt(aSchwelle) }} heißt
            {{ fmt(aSchwelle) }}-fache Laubmenge gegenüber dem Mittel.<template
              v-if="karte === 'A'"> Alles darunter wird gedämpft gezeichnet —
              das ist genau, was Karte C aussortiert.</template>
          </p>
        </div>
        <div v-if="zeigt('spuel')" class="f3d-field">
          <label>Spülintegral mindestens (N·s/m²)</label>
          <input type="number" class="f3d-num" step="0.5" min="0"
                 v-model.number="iMin" />
          <p class="f3d-muted f3d-small">
            0 heißt: jede Überschreitung von τ_krit genügt. Größere Werte
            verlangen, dass die Belastung auch lange genug anliegt.
          </p>
        </div>

        <div class="f3d-laub-knoepfe">
          <button class="f3d-btn" :disabled="!vorgabeGeaendert || sichert"
                  title="Schwellen in den Fall schreiben — sie wandern dann mit Geometrie-Ständen und stehen im Bericht"
                  @click="alsVorgabeSichern">
            {{ sichert ? 'sichert …' : 'Als Fallvorgabe sichern' }}
          </button>
          <button class="f3d-btn" @click="exportPng">PNG exportieren</button>
        </div>
        <p v-if="vorgabeMeldung" class="f3d-muted f3d-small">
          {{ vorgabeMeldung }}
        </p>
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
import { VIRIDIS_CSS, viridis } from '../../utils/colormap'
import { gelaendeFarbe, gelaendeSchummerung, mische } from '../../utils/rasterBild'
import { paarKandidaten, paarStufe, rasterVergleich, unterschiedText }
  from '../../utils/laubpaar'
import { flood3dApi } from '../../services/api'
import {
  KARTEN_EINHEIT, KARTEN_HILFE, KARTEN_NAME, KLASSE, bildunterschrift,
  erzeugeTauStufen, flaechenanteile,
  jeBenetzt, klassenFeld, neueSpuelAggregation, neueTrockenfall, reglerFuer,
  spuelAuswerten, spuelSchritt, trockenfallAuswerten, trockenfallSchritt,
  zeitGewichte,
} from '../../utils/laubkarten'
import { usePreStore } from '../../stores/usePreStore'
import {
  ablagerungskarte, abschliessen, abtastGuete, advehiere, saeeTracer,
  tracerBilanz,
} from '../../utils/laubtracer'
import { VORBELEGUNG, tauKritVorgabe } from '../../utils/grenzwerte'
import { fmtKurz as fmt } from '../../utils/labels'

// `include` von KeepAlive greift auf den Komponentennamen zu — nicht auf
// den aus dem Dateinamen abgeleiteten hoffen (ErgebnisPhase.vue).
defineOptions({ name: 'LaubkartenPanel' })

const store = usePostStore()
const pre = usePreStore()
const canvasHost = ref(null)
const canvas = ref(null)

const leerlaufId = ref(store.selectedRunIds[0] ?? '')
const schwallId = ref('')
const karte = ref('C')
const tauKrit = ref(VORBELEGUNG.tau_krit)
const tauAusFall = ref(false)

// Die drei Schwellen ohne eigenes Zuhause im Fall — Vorbelegung aus
// `evaluation.laubkarten`, sonst die benannten Faustwerte. (τ_krit steht
// NICHT hier: es kommt aus dem Kriterium `min_bed_shear`, siehe unten.)
const gespeichert = () => pre.spec?.evaluation?.laubkarten ?? {}
const aSchwelle = ref(gespeichert().ablagerung_ab ?? VORBELEGUNG.laub_schwelle)
const iMin = ref(gespeichert().spuel_min ?? 0)
const nassTiefe = ref(gespeichert().nass_tiefe ?? VORBELEGUNG.laub_nass_tiefe)
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
const kandidaten = computed(() =>
  paarKandidaten(fertigeLaeufe.value, leerlaufId.value))

// --- Paarung: der Server beurteilt, das Panel sagt es an ------------------
// Der Vergleich ist billig (Index + gesicherter Stand) und läuft VOR dem
// teuren Rechnen — vorher erfuhr man erst nach Minuten, dass zwei Läufe
// nicht zusammenpassen.
const vergleich = ref(null)
const vergleichLaeuft = ref(false)
const UNTERSCHIEDE_SICHTBAR = 6

const ampel = computed(() => paarStufe(vergleich.value))
const unterschiede = computed(() =>
  (vergleich.value?.unterschiede ?? []).slice(0, UNTERSCHIEDE_SICHTBAR))
const mehrUnterschiede = computed(() =>
  (vergleich.value?.unterschiede ?? []).length > UNTERSCHIEDE_SICHTBAR)

let vergleichLauf = 0

watch([leerlaufId, schwallId], async ([a, b]) => {
  // Jede Änderung der Auswahl macht Bild und Urteil ungültig — sonst
  // stünde beides neben einem Paar, zu dem es nicht gehört.
  erg.value = null
  daten = null
  phase.value = ''
  vergleich.value = null
  const cv = canvas.value
  if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height)
  if (!a || !b) return

  const meins = ++vergleichLauf
  vergleichLaeuft.value = true
  try {
    const v = await flood3dApi.laufVergleich(a, b)
    if (meins === vergleichLauf) vergleich.value = v
  } catch (e) {
    if (meins === vergleichLauf) {
      fehler.value = `Paarung nicht prüfbar: ${e.message}`
    }
  } finally {
    if (meins === vergleichLauf) vergleichLaeuft.value = false
  }
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
      trockenfallSchritt(tf, pf.depth, zeitenL[i])

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
    // Bezugsfläche: was im Leerlauf JE nass war (feinste Tiefenstufe). Das
    // ganze Modellgebiet wäre der falsche Nenner — Böschungen und Vorland
    // gehören nicht dazu. Bewusst unabhängig von der Nass-Schwelle: sonst
    // sprängen die Flächenanteile in Karte C, sobald jemand an A′ dreht.
    const gueltig = jeBenetzt(tf)
    const { karte: ablagerung } = ablagerungskarte(zustand,
      { ...geometrie, gueltig })

    daten = { ...geometrie, terrainZ, ablagerung, tf, agg, gueltig,
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

// Karte A′: die Nass-Schwelle wählt nur eine Spalte der Stufenkurve aus —
// deshalb reagiert der Regler ohne Neurechnen (utils/laubkarten.js).
const trocken = computed(() => {
  if (!erg.value || !daten) return null
  return trockenfallAuswerten(daten.tf, nassTiefe.value)
})

// Welche Regler wirken auf die gezeigte Karte?
const zeigt = (name) => reglerFuer(karte.value).includes(name)

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

// Die Nass-Schwelle ebenfalls logarithmisch: zwischen 1 mm Film und 30 cm
// Lache liegen mehr als zwei Größenordnungen, und die interessante Frage
// steht im unteren Drittel.
const NASS_MIN = 0.001
const NASS_MAX = 0.3
const nassReglerPos = computed(() => Math.round(100
  * Math.log(nassTiefe.value / NASS_MIN) / Math.log(NASS_MAX / NASS_MIN)))
function nassAusRegler(e) {
  const p = Number(e.target.value) / 100
  nassTiefe.value = Number((NASS_MIN * (NASS_MAX / NASS_MIN) ** p)
    .toPrecision(2))
}

// --- Schwellen als Fallvorgabe -------------------------------------------
// τ_krit steht bewusst NICHT dabei: es hat schon ein Zuhause, das
// Fall-Kriterium „min_bed_shear". Zwei Speicherorte für dieselbe Zahl
// wären genau die Doppelquelle, die anderswo schon Ärger gemacht hat.

const sichert = ref(false)
const vorgabeMeldung = ref('')

const vorgabeGeaendert = computed(() => {
  const g = pre.spec?.evaluation?.laubkarten
  return !g || g.ablagerung_ab !== aSchwelle.value
    || g.spuel_min !== iMin.value || g.nass_tiefe !== nassTiefe.value
})

async function alsVorgabeSichern() {
  if (!pre.spec) {
    vorgabeMeldung.value = 'Kein Fall geöffnet — Schwellen bleiben in der Sitzung.'
    return
  }
  sichert.value = true
  vorgabeMeldung.value = ''
  try {
    pre.updateSettings((s) => {
      s.evaluation = s.evaluation ?? {}
      s.evaluation.laubkarten = {
        ablagerung_ab: aSchwelle.value,
        spuel_min: iMin.value,
        nass_tiefe: nassTiefe.value,
      }
    })
    const ok = await pre.saveCase()
    vorgabeMeldung.value = ok
      ? 'Im Fall gesichert — die Schwellen wandern mit Geometrie-Ständen.'
      : 'Speichern fehlgeschlagen; die Meldungsleiste nennt den Grund.'
  } finally {
    sichert.value = false
  }
}

// Die Namen stehen in utils/laubkarten.js (KARTEN_NAME) — Panel und
// Bildexport lesen dieselbe Tabelle. Hier nur die Erklärtexte.
const KARTEN_TEXT = {
  A: 'Konzentrationsfaktor der gestrandeten Tracer: 1 = mittlere Belegung, '
    + '3 = dreifache. Wo das Laub liegen bleibt, wenn das Becken leerläuft.',
  T: 'Sekunden seit Laufbeginn, zu denen hier zuletzt Wasser über der '
    + 'eingestellten Tiefe stand. Spät trockenfallende Bereiche sind die '
    + 'geometrisch zwingenden Sammelstellen — unabhängig vom Tracerbild.',
  B: 'Aufsummierte Überschreitung von τ_krit über die Zeit (N·s/m²). Nicht '
    + 'nur ob, sondern wie lange und wie kräftig gespült wurde.',
  Bt: 'Wie lange τ über τ_krit lag (s).',
  C: 'Die Planungsaussage: viel Ablagerung und zu wenig Spülung. „Tote '
    + 'Fläche" erreicht der Schwall gar nicht erst — daran ändert kein '
    + 'τ_krit etwas.',
}
// Die beiden Sonderfarben der Legende entstehen aus DENSELBEN Funktionen
// wie das Bild (gelaendeFarbe/mische, siehe zeichne()) — bei mittlerer
// Schummerung. Feste Hexwerte daneben wären beim ersten Farbwechsel falsch,
// ohne dass es jemand merkt.
const _rgb = (f) => `rgb(${f.map((v) => Math.round(v)).join(',')})`
const FARBE_AUSSEN = _rgb(gelaendeFarbe(0.5))
const FARBE_OHNE_WERT = _rgb(mische(gelaendeFarbe(0.5), [60, 90, 140], 0.35))

// Was bedeutet „im Bezugsgebiet, aber nicht eingefärbt"? Je Karte etwas
// anderes — und genau das liest man sonst falsch als „Null".
const OHNE_WERT = {
  A: 'kein Laub liegen geblieben',
  T: 'nie über der eingestellten Nass-Schwelle',
  B: 'τ_krit nie überschritten',
  Bt: 'τ_krit nie überschritten',
  C: 'unkritisch',
}
const ohneWertText = computed(() => OHNE_WERT[karte.value] ?? 'Wert 0')

const kartenTitel = computed(() => KARTEN_NAME[karte.value] ?? karte.value)
const kartenText = computed(() => KARTEN_TEXT[karte.value] ?? '')

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
  if (karte.value === 'T') return trocken.value
  if (karte.value === 'B') return s.iSpuel
  if (karte.value === 'Bt') return s.tExceed
  return null
}

/**
 * Wertebereich der gezeigten Karte, aus DEM Bezugsgebiet.
 *
 * Bewusst ein computed und nicht eine lokale Variable in `zeichne()`: die
 * Legende neben der Karte muss dieselben Grenzen nennen, die das Bild
 * benutzt. Zwei getrennte Rechnungen waren die naheliegende Falle.
 */
const wertebereich = computed(() => {
  const einheit = KARTEN_EINHEIT[karte.value] ?? ''
  if (!erg.value || !daten) return { lo: 0, hi: 1, einheit }
  const werte = kartenWerte()
  if (!werte) return { lo: 0, hi: 1, einheit }
  let hi = -Infinity
  for (let c = 0; c < werte.length; c++) {
    if (daten.gueltig[c] && Number.isFinite(werte[c]) && werte[c] > hi) {
      hi = werte[c]
    }
  }
  if (!Number.isFinite(hi) || hi <= 0) hi = 1
  return { lo: 0, hi, einheit }
})

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
  // Bereich aus DERSELBEN Quelle wie die Legende — sonst zeigt der Balken
  // daneben andere Zahlen als das Bild.
  const { lo, hi } = wertebereich.value
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
            // Karte A: was unter der Ablagerungsschwelle liegt, wird
            // gedämpft — damit sieht man auf A selbst, was Karte C als
            // „viel Laub" nimmt, statt es raten zu müssen.
            const deckung = (karte.value === 'A' && v < aSchwelle.value)
              ? 0.3 : 0.85
            const [mr, mg, mb] = mische([r, g, b],
              viridis((v - lo) / spanne), deckung)
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

watch([karte, spuel, klassen, trocken, aSchwelle], () => zeichne())

// --- Bildexport -----------------------------------------------------------
// Ohne die eingebrannten Parameter ist eine Laubkarte im Bericht nicht
// nachvollziehbar: die Schwellen SIND die Aussage. Muster wie
// Raum3DPanel::exportPng — Bild plus Fußleiste.

function exportPng() {
  const quelle = canvas.value
  if (!quelle || !daten) return
  const zeilen = bildunterschrift({
    karte: karte.value,
    leerlauf: leerlaufId.value,
    schwall: schwallId.value,
    tauKrit: tauKrit.value,
    tauHerkunft: tauAusFall.value ? 'Fall-Kriterium' : 'Vorbelegung',
    aSchwelle: aSchwelle.value,
    iMin: iMin.value,
    nassTiefe: nassTiefe.value,
    anteile: anteile.value,
    bilanz: erg.value?.bilanz ?? null,
    datum: new Date().toLocaleDateString('de-DE'),
  })

  const zeilenhoehe = 18
  const rand = 12
  // mindestens so hoch, dass der Farbschluessel rechts hineinpasst
  const leiste = Math.max(zeilen.length * zeilenhoehe, 34) + 2 * rand
  const ziel = document.createElement('canvas')
  ziel.width = quelle.width
  ziel.height = quelle.height + leiste
  const ctx = ziel.getContext('2d')
  ctx.fillStyle = '#0a101f'
  ctx.fillRect(0, 0, ziel.width, ziel.height)
  ctx.drawImage(quelle, 0, 0)
  ctx.fillStyle = '#e9eefb'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  zeilen.forEach((z, i) => {
    ctx.fillText(z, rand, quelle.height + rand + (i + 1) * zeilenhoehe - 4)
  })

  // Ohne Farbschlüssel ist das Bild im Bericht nicht lesbar: man sieht,
  // WO etwas ist, aber nicht WAS. Rechts in der Fußleiste, wie im
  // 3D-Export.
  const bw = Math.min(200, ziel.width / 3)
  const bx = ziel.width - bw - rand
  const by = quelle.height + rand + 2
  if (karte.value === 'C') {
    const breite = bw / KLASSEN_RGB.length
    KLASSEN_RGB.forEach((rgb, i) => {
      ctx.fillStyle = `rgb(${rgb.join(',')})`
      ctx.fillRect(bx + i * breite, by, breite, 12)
    })
    ctx.fillStyle = '#8fa0c2'
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillText('unkritisch … tote Fläche', bx, by + 26)
  } else {
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0)
    for (const o of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      grad.addColorStop(o, `rgb(${viridis(o).map(Math.round).join(',')})`)
    }
    ctx.fillStyle = grad
    ctx.fillRect(bx, by, bw, 12)
    ctx.fillStyle = '#8fa0c2'
    ctx.font = '11px system-ui, sans-serif'
    const { lo, hi, einheit } = wertebereich.value
    ctx.fillText(`${fmt(lo)} bis ${fmt(hi)} ${einheit}`.trim(), bx, by + 26)
  }

  const a = document.createElement('a')
  a.download = `${leerlaufId.value}_x_${schwallId.value}_karte${karte.value}.png`
  a.href = ziel.toDataURL('image/png')
  a.click()
}
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
/* Die Ampel steht zwischen Auswahl und Knopf — dort, wo die Entscheidung
   fällt. Der farbige Balken links trägt die Stufe, der Text die Aussage;
   Farbe allein wäre für Rot-Grün-Schwäche keine Information. */
.f3d-ampel-karte {
  border-left: 3px solid var(--f3d-border);
  padding: 6px 0 6px 10px;
  margin-bottom: 10px;
  font-size: 0.76rem;
  line-height: 1.45;
}
.f3d-ampel-karte strong { color: var(--f3d-text); }
.f3d-ampel-karte p { margin: 3px 0 0; color: var(--f3d-text-hilfe); }
.f3d-ampel-karte.gruen { border-left-color: var(--f3d-good); }
.f3d-ampel-karte.gelb { border-left-color: var(--f3d-warn); }
.f3d-ampel-karte.rot { border-left-color: var(--f3d-bad); }
.f3d-unterschiede {
  list-style: none;
  margin: 5px 0 0;
  padding: 0;
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  color: var(--f3d-text-2);
}
.f3d-unterschiede li { padding: 1px 0; overflow-wrap: anywhere; }
.f3d-legend { height: 12px; border-radius: 4px; }
.f3d-legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--f3d-text-2);
}
.f3d-mono { font-variant-numeric: tabular-nums; }
.f3d-laub-knoepfe { display: flex; gap: 8px; flex-wrap: wrap; }
.f3d-laub-knoepfe .f3d-btn { flex: 1 1 auto; }
</style>
