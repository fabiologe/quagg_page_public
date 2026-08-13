<template>
  <div class="f3d-start">
    <FlowNetBackground />
    <div class="f3d-start-veil"></div>

    <div class="f3d-start-content">
      <header class="f3d-start-head">
        <span class="f3d-brand f3d-start-brand">≋ flood-3D</span>
      </header>

      <div class="f3d-start-hero">
        <h1>Strömung.<br />Bauwerk.<br />Nachweis.</h1>
        <p class="f3d-start-sub">
          Dreidimensionale hydraulische Prüfung von Wasserbauwerken —
          vom Modell bis zum prüffähigen Kennwert.
        </p>
      </div>

      <section class="f3d-start-projects">
        <h2>Projekte</h2>
        <!-- Fehler von loadCases/openCase/createCaseAndOpen laufen über
             den EINEN Meldungsweg — die Hauptansicht rendert die Leiste
             erst im Editor, deshalb steht sie hier noch einmal -->
        <MeldungsLeiste />


        <button v-for="(c, i) in store.cases" :key="c.id"
                class="f3d-project" @click="store.openCase(c.id)">
          <span class="f3d-project-idx">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="f3d-project-main">
            <span class="f3d-project-title">{{ c.title || c.id }}</span>
            <span class="f3d-project-meta">
              {{ c.id }}
              <template v-if="summary(c.id)">
                · {{ summary(c.id).count }} {{ summary(c.id).count === 1 ? 'Lauf' : 'Läufe' }}
                <span class="f3d-project-dot" :class="`dot-${summary(c.id).status}`"></span>
                <span v-if="summary(c.id).fails" class="f3d-project-fail">
                  {{ summary(c.id).fails }} offen</span>
              </template>
              <template v-else>· noch kein Lauf</template>
            </span>
          </span>
          <span class="f3d-project-arrow">→</span>
        </button>

        <div class="f3d-project f3d-project-new">
          <span class="f3d-project-idx">+</span>
          <template v-if="!creating">
            <button class="f3d-project-newbtn" @click="creating = true">
              Neues Projekt
            </button>
          </template>
          <template v-else>
            <input ref="newInput" v-model="newId" class="f3d-project-input"
                   placeholder="kennung-des-projekts"
                   @keyup.enter="create" @keyup.esc="creating = false" />
            <button class="f3d-btn" :disabled="!newId.trim()" @click="create">
              Anlegen
            </button>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
// Startseite: avantgardistisch-minimale Projektwahl über dem animierten
// Strömungsnetz. Klick öffnet den Fall im Arbeitsbereich (Phase Modell).
import { nextTick, onMounted, ref, watch } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { flood3dApi } from '../../services/api'
import FlowNetBackground from '../common/FlowNetBackground.vue'
import MeldungsLeiste from '../common/MeldungsLeiste.vue'

const store = usePreStore()
const creating = ref(false)
const newId = ref('')
const newInput = ref(null)
const allRuns = ref([])

function summary(caseId) {
  const runs = allRuns.value.filter((r) => r.run_id.startsWith(`${caseId}_r`))
  if (!runs.length) return null
  const last = runs[runs.length - 1]
  return { count: runs.length, status: last.status,
    fails: last.n_nicht_erfuellt ?? 0 }
}

async function create() {
  const id = newId.value.trim()
  if (!id) return
  try {
    await store.createCaseAndOpen(id)
    newId.value = ''
    creating.value = false
  } catch { /* Fehler steht in der MeldungsLeiste */ }
}

watch(creating, async (on) => {
  if (on) {
    await nextTick()
    newInput.value?.focus()
  }
})

onMounted(() => {
  flood3dApi.listRuns().then((r) => { allRuns.value = r }).catch(() => {})
})
</script>

<style scoped>
.f3d-start {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.f3d-start-veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(900px 600px at 18% 40%, rgba(7, 11, 20, 0.88), rgba(7, 11, 20, 0.25) 70%),
    linear-gradient(90deg, rgba(7, 11, 20, 0.65), transparent 55%);
  pointer-events: none;
}
.f3d-start-content {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 28px 48px;
  max-width: 760px;
  overflow-y: auto;
}
.f3d-start-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 20px;
}
.f3d-start-brand { font-size: 1.15rem; }

.f3d-start-hero { margin: 7vh 0 6vh; }
.f3d-start-hero h1 {
  margin: 0;
  font-size: clamp(2.6rem, 6vh, 4.2rem);
  line-height: 1.04;
  font-weight: 200;
  letter-spacing: 0.01em;
  color: var(--f3d-text);
}
.f3d-start-sub {
  margin: 18px 0 0;
  max-width: 400px;
  color: var(--f3d-text-2);
  font-size: 0.92rem;
  line-height: 1.55;
}

.f3d-start-projects h2 {
  margin: 0 0 6px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--f3d-text-2);
}
.f3d-project {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 14px 6px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(44, 67, 112, 0.45);
  color: var(--f3d-text);
  text-align: left;
  cursor: pointer;
  transition: padding-left 0.18s ease, border-color 0.18s ease;
}
.f3d-project:hover {
  padding-left: 16px;
  border-bottom-color: var(--f3d-accent);
}
.f3d-project:hover .f3d-project-arrow { opacity: 1; transform: none; }
.f3d-project-idx {
  color: var(--f3d-text-2);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  width: 22px;
}
.f3d-project-main { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.f3d-project-title {
  font-size: 1.15rem;
  font-weight: 350;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.f3d-project-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--f3d-text-2);
  font-size: 0.74rem;
}
.f3d-project-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--f3d-text-2);
}
.f3d-project-dot.dot-completed { background: var(--f3d-good); }
.f3d-project-dot.dot-failed { background: var(--f3d-bad); }
.f3d-project-dot.dot-building, .f3d-project-dot.dot-meshing,
.f3d-project-dot.dot-solving, .f3d-project-dot.dot-extracting,
.f3d-project-dot.dot-converting_fields {
  background: var(--f3d-warn);
  animation: f3d-pulse 1.4s ease-in-out infinite;
}
.f3d-project-fail { color: var(--f3d-bad); }
.f3d-project-arrow {
  color: var(--f3d-accent);
  opacity: 0;
  transform: translateX(-6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.f3d-project-new { cursor: default; }
.f3d-project-newbtn {
  background: none;
  border: none;
  color: var(--f3d-text-2);
  font-size: 1.05rem;
  font-weight: 300;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease;
}
.f3d-project-newbtn:hover { color: var(--f3d-accent); }
.f3d-project-input {
  flex: 1;
  background: rgba(7, 11, 20, 0.7);
  border: 1px solid var(--f3d-border-strong);
  border-radius: 8px;
  color: var(--f3d-text);
  padding: 7px 10px;
  font-size: 0.9rem;
}
</style>
