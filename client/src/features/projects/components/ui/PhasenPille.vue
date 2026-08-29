<template>
  <span class="prj-pille" :style="{ '--pille': `var(${token})` }">{{ titel }}</span>
</template>

<script setup>
// PhasenPille — Phase als Farbmarke; Farbe folgt der Phase (Token aus Phasen.js).
import { computed } from 'vue';
import { phaseTitel, phaseToken } from '../../services/Phasen';

const props = defineProps({ phase: { type: String, default: null } });
const titel = computed(() => phaseTitel(props.phase));
const token = computed(() => phaseToken(props.phase));
</script>

<style scoped>
.prj-pille {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--pille);
  color: var(--pille);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
