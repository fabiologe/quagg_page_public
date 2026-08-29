<template>
  <Teleport to="body">
    <Transition name="pal-fade">
      <div v-if="open" class="pal-backdrop" @click.self="close">
        <div class="pal-box" role="dialog" aria-label="Befehle">
          <div class="pal-input-row">
            <CdeIcon name="search" :size="16" />
            <input
              ref="inputRef"
              v-model="query"
              class="pal-input"
              placeholder="Befehl oder Element suchen…"
              spellcheck="false"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="confirm"
              @keydown.esc="close"
            />
            <kbd class="pal-kbd">Esc</kbd>
          </div>

          <div v-if="!eintraege.length" class="pal-empty">
            Nichts gefunden.
          </div>

          <ul v-else ref="listRef" class="pal-list">
            <template v-for="(e, i) in eintraege" :key="e.key">
              <li v-if="e.kopf" class="pal-head">{{ e.kopf }}</li>
              <li
                v-else
                class="pal-item"
                :class="{ sel: i === auswahl }"
                @mouseenter="auswahl = i"
                @click="pick(e)"
              >
                <CdeIcon :name="e.icon ?? 'command'" :size="15" />
                <span class="pal-title">{{ e.titel }}</span>
                <span v-if="e.meta" class="pal-meta">{{ e.meta }}</span>
                <kbd v-if="e.taste" class="pal-kbd">{{ e.taste }}</kbd>
              </li>
            </template>
          </ul>

          <div class="pal-foot">
            <span><kbd class="pal-kbd">↑</kbd><kbd class="pal-kbd">↓</kbd> wählen</span>
            <span><kbd class="pal-kbd">⏎</kbd> ausführen</span>
            <span class="pal-foot-hint">Strg+K öffnet diese Liste jederzeit</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * Befehls-Palette (Strg+K) — ein Eingabefeld für alles (Sprint U, AP-U3).
 *
 * Vereint zwei bisher getrennte Wege: die Element-Suche (früher Strg+F, nur
 * Modell-Elemente) und die Werkzeuge, die man vorher in der Leiste suchen
 * musste. Die Befehle kommen aus der Registry, die Elemente aus dem
 * vorhandenen Suchindex des Modells.
 */
import { ref, computed, watch, nextTick } from 'vue';
import CdeIcon from './CdeIcon.vue';
import { usePaletteCommands, filterCommands } from '../../stores/useCommands.js';
import { useIfcStore } from '../../stores/useIfcStore.js';
import { useViewerApi } from '../composables/viewerApi.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Startet direkt im Element-Modus (Strg+F-Verhalten) */
  nurElemente: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const cmds = usePaletteCommands();
const api = useViewerApi();
const ifc = useIfcStore();

const query = ref('');
const auswahl = ref(0);
const inputRef = ref(null);
const listRef = ref(null);

const MAX_ELEMENTE = 25;

/** Element-Treffer aus dem vorhandenen Suchindex des Modells. */
const elemente = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const e of (ifc.getSearchIndex() ?? [])) {
    if (out.length >= MAX_ELEMENTE) break;
    const name = (e.name ?? '').toLowerCase();
    const cat = (e.category ?? '').toLowerCase();
    const gid = (e.globalId ?? '').toLowerCase();
    if (name.includes(q) || cat.includes(q) || gid.includes(q)) out.push(e);
  }
  return out;
});

const befehle = computed(() =>
  props.nurElemente ? [] : filterCommands(cmds.alle, query.value, cmds.zuletzt));

/** Flache Liste mit Zwischenüberschriften — Überschriften sind nicht wählbar. */
const eintraege = computed(() => {
  const out = [];
  if (befehle.value.length) {
    out.push({ kopf: 'Befehle', key: 'h-cmd' });
    for (const c of befehle.value) {
      out.push({
        key: `c-${c.id}`, art: 'cmd', id: c.id,
        titel: c.titel, icon: c.icon, meta: c.gruppe, taste: c.key,
      });
    }
  }
  if (elemente.value.length) {
    out.push({ kopf: 'Elemente', key: 'h-el' });
    for (const e of elemente.value) {
      out.push({
        key: `e-${e.modelId}-${e.localId}`, art: 'element', el: e,
        titel: e.name || `#${e.localId}`,
        icon: 'zoom-to',
        meta: (e.category ?? '').replace(/^IFC/, ''),
      });
    }
  }
  return out;
});

const waehlbar = computed(() => eintraege.value.filter(e => !e.kopf));

function move(step) {
  const idx = eintraege.value
    .map((e, i) => (e.kopf ? -1 : i))
    .filter(i => i >= 0);
  if (!idx.length) return;
  const pos = idx.indexOf(auswahl.value);
  const next = idx[(pos + step + idx.length) % idx.length];
  auswahl.value = next;
  nextTick(() => {
    listRef.value?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
  });
}

function confirm() {
  const e = eintraege.value[auswahl.value];
  if (e && !e.kopf) pick(e);
}

async function pick(e) {
  close();
  if (e.art === 'cmd') cmds.run(e.id);
  else if (e.art === 'element') await api.zoomToLocalId(e.el.localId, e.el.modelId);
}

function close() { emit('close'); }

watch(() => props.open, (o) => {
  if (!o) return;
  query.value = '';
  auswahl.value = 0;
  nextTick(() => {
    inputRef.value?.focus();
    // erste wählbare Zeile vorauswählen
    const first = eintraege.value.findIndex(x => !x.kopf);
    if (first >= 0) auswahl.value = first;
  });
});

watch(eintraege, () => {
  const first = eintraege.value.findIndex(x => !x.kopf);
  if (!eintraege.value[auswahl.value] || eintraege.value[auswahl.value].kopf) {
    auswahl.value = first >= 0 ? first : 0;
  }
});

defineExpose({ waehlbar });
</script>

<style scoped>
.pal-backdrop {
  position: fixed; inset: 0;
  background: var(--cde-scrim);
  display: flex; justify-content: center;
  padding-top: 12vh;
  z-index: var(--cde-z-palette);
}

.pal-box {
  width: 560px; max-width: 92vw;
  max-height: 62vh;
  display: flex; flex-direction: column;
  background: var(--cde-surface-alt);
  border: 1px solid var(--cde-line-strong);
  border-radius: var(--cde-radius-lg);
  box-shadow: var(--cde-shadow);
  overflow: hidden;
}

.pal-input-row {
  display: flex; align-items: center; gap: var(--cde-gap-sm);
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--cde-line);
  color: var(--cde-text-mute);
}
.pal-input {
  flex: 1;
  background: none; border: none; outline: none;
  color: var(--cde-text-bright);
  font-size: 0.92rem;
  caret-color: var(--cde-accent);
}
.pal-input::placeholder { color: var(--cde-text-dimmer); }

.pal-list {
  flex: 1; margin: 0; padding: 0.25rem 0; list-style: none;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}
.pal-head {
  padding: 0.35rem 0.85rem 0.2rem;
  font-size: var(--cde-font-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cde-text-dimmer);
}
.pal-item {
  display: flex; align-items: center; gap: var(--cde-gap-sm);
  padding: 0.35rem 0.85rem;
  cursor: pointer;
  color: var(--cde-text);
  font-size: var(--cde-font-md);
}
.pal-item.sel { background: var(--cde-accent-fill); color: var(--cde-text-bright); }
.pal-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pal-meta { font-size: var(--cde-font-xs); color: var(--cde-text-dim); }

.pal-empty {
  padding: 1.4rem; text-align: center;
  color: var(--cde-text-dim); font-size: var(--cde-font-md);
}

.pal-foot {
  display: flex; align-items: center; gap: var(--cde-gap);
  padding: 0.4rem 0.8rem;
  border-top: 1px solid var(--cde-line);
  font-size: var(--cde-font-xs);
  color: var(--cde-text-dimmer);
}
.pal-foot-hint { margin-left: auto; }

.pal-kbd {
  background: var(--cde-tint);
  border: 1px solid var(--cde-line-strong);
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
  font-family: inherit;
  font-size: var(--cde-font-xs);
  color: var(--cde-text-dim);
}

.pal-fade-enter-active, .pal-fade-leave-active { transition: opacity 0.12s; }
.pal-fade-enter-from, .pal-fade-leave-to { opacity: 0; }
</style>
