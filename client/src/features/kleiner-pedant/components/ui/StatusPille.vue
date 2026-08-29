<template>
  <span class="ped-pille" :class="`ped-pille-${zustand}`">
    <PedantIcon :name="icon" :size="13" />
    {{ text }}
  </span>
</template>

<script setup>
// StatusPille — ok / warnung / fehler als kompakte, farbige Pille.
import { computed } from 'vue';
import PedantIcon from './PedantIcon.vue';

const props = defineProps({
  zustand: {
    type: String,
    required: true,
    validator: (wert) => ['ok', 'warnung', 'fehler'].includes(wert),
  },
  text: { type: String, required: true },
});

const icon = computed(() => (
  { ok: 'ok', warnung: 'warnung', fehler: 'fehler' }[props.zustand]
));
</script>

<style scoped>
.ped-pille {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid transparent;
}
.ped-pille-ok {
  color: var(--ped-ok);
  background: var(--ped-akzent-weich);
  border-color: var(--ped-ok);
}
.ped-pille-warnung {
  color: var(--ped-warn);
  background: var(--ped-warn-weich);
  border-color: var(--ped-warn);
}
.ped-pille-fehler {
  color: var(--ped-fehler);
  background: var(--ped-fehler-weich);
  border-color: var(--ped-fehler);
}
</style>
