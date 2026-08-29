<template>
  <div class="ped-vorschlag">
    <div class="ped-vorschlag-zeile">
      <StatusPille
        :zustand="befund.ok ? 'ok' : 'warnung'"
        :text="befund.ok ? 'plausibel' : 'unstimmig'"
      />
      <span v-if="!befund.ok && befund.grund" class="ped-vorschlag-grund">
        {{ befund.grund }}
        <template v-if="befund.erwartetBrutto !== null">
          — erwartet: <GeldBetrag :cent="befund.erwartetBrutto" />
        </template>
      </span>
    </div>
    <p v-if="vorschlag.hinweis" class="ped-vorschlag-hinweis">
      <PedantIcon name="pruefen" :size="13" />
      {{ vorschlag.hinweis }}
    </p>
  </div>
</template>

<script setup>
// BelegVorschlag — zeigt Plausibilitaets-Befund und GWG-Hinweis an; dumm.
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import StatusPille from '../ui/StatusPille.vue';

defineProps({
  befund: { type: Object, required: true },
  vorschlag: { type: Object, required: true },
});
</script>

<style scoped>
.ped-vorschlag {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--ped-rand);
  border-radius: 8px;
  background: var(--ped-flaeche-2);
}
.ped-vorschlag-zeile {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.ped-vorschlag-grund {
  font-size: 0.78rem;
  color: var(--ped-warn);
}
.ped-vorschlag-hinweis {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.78rem;
  color: var(--ped-text-dim);
}
</style>
