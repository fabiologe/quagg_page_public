<template>
  <div class="issue-list" :class="{ 'issue-list--dense': dense }">
    <div v-if="title || showCounts" class="issue-list__head">
      <span v-if="title" class="issue-list__title">{{ title }}</span>
      <span v-if="showCounts" class="issue-list__counts">
        <span v-if="counts.error" class="issue-badge issue-badge--error"><SvEmoji :emoji="icon('error')" :size="13" /> {{ counts.error }}</span>
        <span v-if="counts.warn"  class="issue-badge issue-badge--warn"><SvEmoji :emoji="icon('warn')" :size="13" /> {{ counts.warn }}</span>
        <span v-if="counts.info"  class="issue-badge issue-badge--info"><SvEmoji :emoji="icon('info')" :size="13" /> {{ counts.info }}</span>
      </span>
    </div>

    <ul v-if="issues.length" class="issue-list__items" :style="{ maxHeight }">
      <li
        v-for="(it, i) in issues"
        :key="it.code || i"
        class="issue-list__item"
        :class="['issue-list__item--' + norm(it.severity), { 'issue-list__item--clickable': clickable }]"
        :title="clickable ? 'Klicken: betroffenes Element auswählen' : null"
        @click="clickable && $emit('select', it, i)"
      >
        <span class="issue-list__icon"><SvEmoji :emoji="icon(it.severity)" :size="13" /></span>
        <span class="issue-list__text">
          <slot name="message" :issue="it">{{ it.message }}</slot>
          <span v-if="it.hint" class="issue-list__hint">
            <SvEmoji emoji="💡" :size="11" /> {{ it.hint }}
          </span>
        </span>
        <button
          v-if="dismissible"
          type="button"
          class="issue-list__dismiss"
          title="Ausblenden"
          @click="$emit('dismiss', it, i)"
        >×</button>
      </li>
    </ul>

    <div v-else class="issue-list__empty">
      <slot name="empty">{{ emptyText }}</slot>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SvEmoji from './SvEmoji.vue';

/**
 * Wiederverwendbare Issue-/Warn-Liste.
 * Feature-agnostisch: erwartet Objekte mit { severity, message, code?, hint? }.
 * severity ∈ 'error' | 'warn'(='warning') | 'info'. hint = optionaler Lösungsvorschlag
 * (zweite Zeile). Mit clickable emittiert ein Klick auf eine Zeile 'select' (issue, index)
 * — der Konsument entscheidet, was „auswählen" heißt (z. B. Netz-Element selektieren).
 */
const props = defineProps({
  issues: { type: Array, default: () => [] },          // [{ severity, message, code?, hint? }]
  title: { type: String, default: '' },
  dense: { type: Boolean, default: false },
  maxHeight: { type: String, default: '46vh' },
  dismissible: { type: Boolean, default: false },
  showCounts: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false },
  emptyText: { type: String, default: 'Keine Hinweise.' },
});

defineEmits(['dismiss', 'select']);

const norm = (sev) => {
  const s = String(sev || '').toLowerCase();
  if (s === 'error' || s === 'err') return 'error';
  if (s === 'warn' || s === 'warning') return 'warn';
  return 'info';
};

const ICONS = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
const icon = (sev) => ICONS[norm(sev)];

const counts = computed(() => {
  const c = { error: 0, warn: 0, info: 0 };
  for (const it of props.issues) c[norm(it.severity)]++;
  return c;
});
</script>

<style scoped>
.issue-list {
  font-family: 'Inter', 'Segoe UI', sans-serif;
  color: #e8eaf0;
}
.issue-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
}
.issue-list__title { font-size: 0.85rem; font-weight: 600; }
.issue-list__counts { display: flex; gap: 0.4rem; }
.issue-badge {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
}
.issue-badge--error { color: #ff8a9b; border-color: #7a2230; background: #2a1418; }
.issue-badge--warn  { color: #f0c060; border-color: #7a5a1d; background: #2a2210; }
.issue-badge--info  { color: #7fc6f0; border-color: #1d4e6b; background: #0e2438; }

.issue-list__items { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.issue-list__item {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.4rem;
  border-radius: 7px;
  font-size: 0.82rem;
  line-height: 1.45;
  background: #0e2438;
  border: 1px solid #1d4e6b;
}
.issue-list--dense .issue-list__item { padding: 0.35rem 0.5rem; font-size: 0.78rem; margin-bottom: 0.28rem; }
.issue-list__item--error { border-color: #7a2230; background: #2a1418; }
.issue-list__item--warn  { border-color: #7a5a1d; background: #2a2210; }
.issue-list__item--clickable { cursor: pointer; }
.issue-list__item--clickable:hover { border-color: var(--sv-lime, #a3e635); }
.issue-list__icon { flex-shrink: 0; }
.issue-list__text { flex: 1; }
.issue-list__hint {
  display: flex;
  gap: 0.35rem;
  align-items: baseline;
  margin-top: 0.2rem;
  font-size: 0.92em;
  color: #90a4ae;
}
.issue-list__dismiss {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: #90a4ae;
  cursor: pointer;
  font-size: 1.05rem;
  line-height: 1;
  padding: 0 0.15rem;
}
.issue-list__dismiss:hover { color: #e8eaf0; }
.issue-list__empty {
  font-size: 0.8rem;
  color: #90a4ae;
  padding: 0.5rem 0.2rem;
}
</style>
