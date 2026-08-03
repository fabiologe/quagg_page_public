<template>
  <section class="f3d-bauwerke">
    <article v-for="e in entries" :key="e.key" class="f3d-card">
      <header class="f3d-card-head">
        <h3>{{ e.patch }}</h3>
        <span class="f3d-muted f3d-small">{{ e.runId }}</span>
      </header>

      <dl class="f3d-stats">
        <div v-for="w in e.werte" :key="w.label" class="f3d-stat">
          <dt>
            {{ w.label }}
            <KennwertHilfe v-if="w.hilfe" :groesse="w.hilfe" :wert="w.roh" />
          </dt>
          <dd :class="w.cls">{{ w.value }}</dd>
        </div>
      </dl>

      <p v-if="e.hinweis" class="f3d-muted f3d-small">{{ e.hinweis }}</p>

      <UPlotChart v-if="e.charts.length" :title="`Belastung ${e.patch}`"
                  :series="e.charts" ylabel="" :height="220"
                  sync-key="f3d-bauwerke" />
    </article>

    <p v-if="!entries.length" class="f3d-muted">
      Für die gewählten Läufe liegen keine Bauwerksgrößen vor. Kräfte werden
      nur für Bauwerke gerechnet, bei denen im Modell „Kräfte auswerten“
      angehakt ist; die Schubspannung entsteht für jedes Bauwerk mit Gelände.
    </p>
  </section>
</template>

<script setup>
// Belastung der Bauwerke: Kraft, Kippmoment und Wandschubspannung.
//
// Für den Standsicherheitsnachweis zählt nicht der Kraftbetrag allein,
// sondern wo die Resultierende angreift — deshalb wird hier aus Moment und
// Kraft der Hebelarm über der Bauwerksunterkante ausgewiesen. Der
// Momentbezugspunkt ist die Fußmitte des jeweiligen Körpers; um den
// Modellursprung gerechnet wäre das Moment eine Zahl ohne Bedeutung.
//
// Die Schubspannung am Bauwerk beantwortet die zweite Frage: Kolk am
// Pfeiler und Angriff auf die Oberfläche. Maximum und Flächenmittel stehen
// nebeneinander, weil das Maximum an einer einzelnen Kante hängen kann.
import { ref, watchEffect } from 'vue'
import { usePostStore, SERIES_COLORS } from '../../stores/usePostStore'
import { fmt } from '../../utils/labels'
import { flood3dApi } from '../../services/api'
import KennwertHilfe from './KennwertHilfe.vue'
import UPlotChart from './UPlotChart.vue'

const store = usePostStore()
const entries = ref([])

const letzte = (s) => (s?.v?.length ? s.v[s.v.length - 1] : null)

async function reihen(runId, quantity, component) {
  try {
    return (await flood3dApi.series(runId, quantity, component)).series ?? []
  } catch {
    return []
  }
}

async function laden() {
  const out = []
  for (const runId of store.selectedRunIds) {
    const [fx, fy, fz, mBetrag, tauMax, tauMittel] = await Promise.all([
      reihen(runId, 'force', 'x'), reihen(runId, 'force', 'y'),
      reihen(runId, 'force', 'z'), reihen(runId, 'moment', 'magnitude'),
      reihen(runId, 'bed_shear', 'max'), reihen(runId, 'bed_shear', 'mean'),
    ])
    const patches = [...new Set([...fx, ...tauMax].map((s) => s.location_id))]
    for (const patch of patches) {
      const bei = (liste) => liste.find((s) => s.location_id === patch)
      const x = letzte(bei(fx))
      const y = letzte(bei(fy))
      const z = letzte(bei(fz))
      const mom = letzte(bei(mBetrag))
      const tmax = letzte(bei(tauMax))
      const tmit = letzte(bei(tauMittel))
      const waagerecht = x != null && y != null ? Math.hypot(x, y) : null
      const hebel = mom != null && waagerecht > 1e-6 ? mom / waagerecht : null

      const werte = []
      if (waagerecht != null) {
        werte.push({ label: 'Horizontalkraft', value: `${fmt(waagerecht / 1000)} kN`,
          hilfe: 'force', roh: waagerecht / 1000 })
        werte.push({ label: 'davon in x / y',
          value: `${fmt(x / 1000)} / ${fmt(y / 1000)} kN` })
        werte.push({ label: z >= 0 ? 'Auftrieb (z)' : 'Abtrieb (z)',
          value: `${fmt(z / 1000)} kN`, cls: z > 0 ? 'warn' : '',
          hilfe: 'force', roh: z / 1000 })
      }
      if (mom != null) {
        werte.push({ label: 'Kippmoment um die Fußmitte',
          value: `${fmt(mom / 1000)} kNm`, hilfe: 'moment', roh: mom / 1000 })
      }
      if (hebel != null) {
        werte.push({ label: 'Hebelarm der Resultierenden',
          value: `${fmt(hebel)} m über Unterkante`, hilfe: 'moment' })
      }
      if (tmax != null) {
        werte.push({ label: 'Schubspannung max.', value: `${fmt(tmax)} N/m²`,
          cls: tmax > 20 ? 'warn' : '', hilfe: 'bed_shear', roh: tmax })
        werte.push({ label: 'Schubspannung im Mittel',
          value: `${fmt(tmit)} N/m²`, hilfe: 'bed_shear', roh: tmit })
      }

      const charts = []
      if (bei(fx)) {
        const s = bei(fx)
        charts.push({ label: 'Horizontalkraft in kN', color: SERIES_COLORS[0],
          t: s.t, v: s.v.map((q, i) => Math.hypot(q, bei(fy)?.v[i] ?? 0) / 1000) })
      }
      if (bei(tauMax)) {
        const s = bei(tauMax)
        charts.push({ label: 'Schubspannung max. in N/m²',
          color: SERIES_COLORS[1], t: s.t, v: s.v })
      }

      let hinweis = ''
      if (tmax != null && tmit != null && tmit > 0 && tmax / tmit > 8) {
        hinweis = `Das Maximum liegt beim ${fmt(tmax / tmit)}-fachen des `
          + 'Flächenmittels — ein solcher Ausreißer sitzt meist an einer '
          + 'einzelnen Kante. Für die Kolkbewertung zählt die Fläche über '
          + 'dem Grenzwert, nicht der Spitzenwert einer Zelle.'
      }

      out.push({ key: `${runId}|${patch}`, runId, patch, werte, charts,
        hinweis })
    }
  }
  entries.value = out
}

watchEffect(laden)
</script>

<style scoped>
.f3d-bauwerke {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow: auto;
}
.f3d-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.5rem 1rem;
  margin: 0.5rem 0;
}
.f3d-stat dt { font-size: 0.74rem; opacity: 0.75; }
.f3d-stat dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-size: 1.05rem;
}
.f3d-stat dd.warn { color: #e0a63a; }
</style>
