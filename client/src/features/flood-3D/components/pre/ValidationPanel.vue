<template>
  <section class="f3d-card f3d-validation">
    <header class="f3d-card-head">
      <h3>Prüfung</h3>
      <span class="f3d-muted f3d-small" v-if="!store.validation.length">
        keine Befunde
      </span>
      <button v-else class="f3d-btn f3d-btn-s" :disabled="store.loading"
              title="Randbedingung auf die Fläche legen, an der ihr Bauwerk endet · Rohrachse bis dorthin führen · Verfeinerungsquader ins Gebiet beschneiden"
              @click="anschluss">⚯ Anschlüsse herstellen</button>
    </header>
    <div v-for="(f, i) in store.validation" :key="i"
         class="f3d-finding" :class="`sev-${f.severity}`">
      <button class="f3d-finding-body" @click="jump(f)">
        <span class="f3d-finding-head">
          <span class="f3d-finding-icon">{{ icon(f.severity) }}</span>
          <span class="f3d-finding-obj">{{ f.object_id }}</span>
        </span>
        <span class="f3d-finding-msg">{{ f.message }}</span>
      </button>
      <button v-if="f.fix" class="f3d-btn f3d-btn-s f3d-kur"
              :disabled="store.loading" @click.stop="kur(f.fix)">
        ⚕ {{ f.fix.label }}
      </button>
    </div>
  </section>
</template>

<script setup>
// Validierungspanel (Spez. Kap. 6.1): Meldungen nach Schweregrad, jede mit
// Sprung zum betroffenen Objekt.
import { usePreStore, KIND_PATHS } from '../../stores/usePreStore'

const store = usePreStore()

// Nach Drehung oder Zuschnitt zeigt die Randbedingung auf die falsche
// Gebietsfläche und die Rohrachse endet im Nirgendwo — beides folgt
// zwingend aus der Geometrie und wird hier in einem Zug gerichtet.
async function anschluss() {
  const m = await store.anschlussHerstellen()
  store.melden(m.length ? m.join(' · ') : 'Anschlüsse waren bereits stimmig',
    m.length ? 'hinweis' : 'erfolg')
}

// Die Kur zu einem einzelnen Befund. Was sie geändert hat, steht danach im
// Klartext da — eine Reparatur, die man nicht nachvollziehen kann, ist
// keine Hilfe, sondern eine Blackbox.
async function kur(fix) {
  const text = await store.kurAnwenden(fix)
  if (text) store.melden(text, 'hinweis')
}

const icon = (s) => ({ fehler: '✗', warnung: '⚠', hinweis: 'ℹ' }[s] ?? '·')

function jump(finding) {
  for (const kind of Object.keys(KIND_PATHS)) {
    const list = KIND_PATHS[kind](store.spec) ?? []
    if (list.some((o) => o.id === finding.object_id)) {
      store.select(kind, finding.object_id)
      return
    }
  }
}
</script>

<style scoped>
.f3d-validation { display: flex; flex-direction: column; gap: 6px; }
.f3d-finding {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--f3d-bg);
  border: 1px solid var(--f3d-border);
  border-left-width: 3px;
  border-radius: 6px;
  padding: 6px 8px;
}
.f3d-finding-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.f3d-kur { align-self: flex-start; }
.f3d-finding.sev-fehler { border-left-color: var(--f3d-bad); }
.f3d-finding.sev-warnung { border-left-color: var(--f3d-warn); }
.f3d-finding.sev-hinweis { border-left-color: var(--f3d-accent); }
.f3d-finding-head { display: flex; gap: 6px; align-items: center; }
.f3d-finding-icon { font-size: 0.75rem; }
.sev-fehler .f3d-finding-icon { color: var(--f3d-bad); }
.sev-warnung .f3d-finding-icon { color: var(--f3d-warn); }
.sev-hinweis .f3d-finding-icon { color: var(--f3d-accent); }
.f3d-finding-obj { color: var(--f3d-text); font-size: 0.76rem; font-weight: 600; }
.f3d-finding-msg { color: var(--f3d-text-2); font-size: 0.74rem; }
</style>
