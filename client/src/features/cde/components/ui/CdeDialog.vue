<template>
  <Teleport to="body">
    <div v-if="offen" class="cde-dialog-schleier" @click.self="$emit('close')">
      <section class="cde-dialog" role="dialog" aria-modal="true" :aria-label="titel">
        <header class="cd-kopf">
          <CdeIcon :name="icon" :size="15" />
          <h3 class="cd-titel">{{ titel }}</h3>
          <button class="cd-zu" :title="`${titel} schließen [Esc]`" @click="$emit('close')">
            <CdeIcon name="close" :size="14" />
          </button>
        </header>
        <div class="cd-rumpf"><slot /></div>
        <footer v-if="$slots.fuss" class="cd-fuss"><slot name="fuss" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * CdeDialog — das Dialog-Gehäuse der CDE (Teil XI, U2).
 *
 * In Teil I geplant („eigenes Dialog-Gehäuse statt des geliehenen
 * DraggableModal"), nie gebaut — der Commit-Dialog ist sein erster Nutzer.
 * Teleport nach body, weil Tokens auf :root liegen (die dokumentierte
 * Teleport-Falle) und der Dialog über ALLEN Ansichten stehen muss.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import CdeIcon from './CdeIcon.vue';

defineProps({
  titel: { type: String, required: true },
  icon: { type: String, default: 'info' },
  offen: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

function onTaste(e) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close'); }
}
onMounted(() => document.addEventListener('keydown', onTaste, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onTaste, true));
</script>

<style scoped>
.cde-dialog-schleier {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: var(--cde-scrim);
  padding: 1rem;
}
.cde-dialog {
  display: flex; flex-direction: column;
  width: min(560px, 100%); max-height: min(80dvh, 640px);
  background: var(--cde-bg);
  border: 1px solid var(--cde-line-strong);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow);
  color: var(--cde-text);
}
.cd-kopf {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--cde-line);
  color: var(--cde-text-bright, var(--cde-text));
}
.cd-titel { flex: 1; margin: 0; font-size: var(--cde-font-md); }
.cd-zu {
  display: flex; padding: 0.3rem; cursor: pointer;
  background: none; border: none; border-radius: var(--cde-radius-sm);
  color: var(--cde-text-mute, var(--cde-text-dim));
  touch-action: manipulation;
}
.cd-zu:hover { color: var(--cde-danger); background: var(--cde-fill); }
.cd-rumpf { flex: 1; min-height: 0; overflow: auto; padding: 0.75rem; }
.cd-fuss {
  display: flex; justify-content: flex-end; gap: 0.4rem;
  padding: 0.55rem 0.75rem;
  border-top: 1px solid var(--cde-line);
}
</style>
