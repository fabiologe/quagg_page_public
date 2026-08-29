<template>
  <Teleport to="body">
    <div class="ped-modal-schleier" @click.self="$emit('schliessen')">
      <div class="ped-modal" role="dialog" aria-modal="true" @keydown.esc="$emit('schliessen')">
        <header class="ped-modal-kopf">
          <h3>
            <PedantIcon v-if="icon" :name="icon" :size="15" />
            {{ titel }}
          </h3>
          <button class="ped-modal-zu" type="button" @click="$emit('schliessen')">
            <PedantIcon name="schliessen" :size="15" />
          </button>
        </header>
        <div class="ped-modal-inhalt"><slot /></div>
        <footer v-if="$slots.fuss" class="ped-modal-fuss"><slot name="fuss" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// PedantModal — der eine Modal-Rahmen des Features. Teleport unter <body>,
// deshalb leben die --ped-Tokens auf :root. Esc und Schleier-Klick schliessen.
import { onMounted, onUnmounted } from 'vue';
import PedantIcon from './PedantIcon.vue';

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
.ped-modal-schleier {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: var(--ped-schleier);
}
.ped-modal {
  width: min(34rem, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  display: flex;
  flex-direction: column;
  background: var(--ped-flaeche);
  border: 1px solid var(--ped-rand-stark);
  border-radius: 10px;
  box-shadow: var(--ped-schatten);
  color: var(--ped-text);
}
.ped-modal-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--ped-rand);
}
.ped-modal-kopf h3 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.95rem;
}
.ped-modal-zu {
  border: none;
  background: none;
  color: var(--ped-text-dim);
  cursor: pointer;
}
.ped-modal-inhalt {
  padding: 1rem;
  overflow-y: auto;
}
.ped-modal-fuss {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  border-top: 1px solid var(--ped-rand);
}
</style>
