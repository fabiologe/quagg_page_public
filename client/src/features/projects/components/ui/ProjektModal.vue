<template>
  <Teleport to="body">
    <div class="prj-modal-schleier" @click.self="$emit('schliessen')">
      <div class="prj-modal" role="dialog" aria-modal="true">
        <header class="prj-modal-kopf">
          <h3>
            <ProjektIcon v-if="icon" :name="icon" :size="15" />
            {{ titel }}
          </h3>
          <button class="prj-modal-zu" type="button" aria-label="Schließen" @click="$emit('schliessen')">
            <ProjektIcon name="schliessen" :size="15" />
          </button>
        </header>
        <div class="prj-modal-inhalt"><slot /></div>
        <footer v-if="$slots.fuss" class="prj-modal-fuss"><slot name="fuss" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// ProjektModal — Teleport unter <body>, deshalb leben die --prj-Tokens auf :root.
import { onMounted, onUnmounted } from 'vue';
import ProjektIcon from './ProjektIcon.vue';

defineProps({
  titel: { type: String, required: true },
  icon: { type: String, default: '' },
});
const emit = defineEmits(['schliessen']);

function beiTaste(ereignis) {
  if (ereignis.key === 'Escape') emit('schliessen');
}
onMounted(() => document.addEventListener('keydown', beiTaste));
onUnmounted(() => document.removeEventListener('keydown', beiTaste));
</script>

<style scoped>
.prj-modal-schleier {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: var(--prj-schleier);
  padding: 1rem;
}
.prj-modal {
  width: min(40rem, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  border: 1px solid var(--prj-rand);
  border-radius: 10px;
  box-shadow: var(--prj-schatten);
}
.prj-modal-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--prj-rand);
}
.prj-modal-kopf h3 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.95rem;
}
.prj-modal-zu {
  border: none;
  background: transparent;
  color: var(--prj-text-dim);
  cursor: pointer;
  padding: 0.2rem;
}
.prj-modal-inhalt {
  padding: 1rem;
  overflow: auto;
}
.prj-modal-fuss {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border-top: 1px solid var(--prj-rand);
}
</style>
