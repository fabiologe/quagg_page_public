<template>
  <div class="cde-card-header">
    <span class="cde-card-title">
      <CdeIcon :name="icon" :size="15" />
      <span class="titel">{{ titel }}</span>
      <small v-if="zusatz">{{ zusatz }}</small>
    </span>
    <div v-if="$slots.default" class="cde-card-actions"><slot /></div>
  </div>
</template>

<script setup>
/**
 * Kopfzeile einer Auswertungs-Kachel.
 *
 * Die sieben Kacheln des Planungs-Cockpits bauten diesen Kopf bisher je selbst
 * nach — samt eigener Kopie des CSS und einem Emoji als Symbol. Hier steht er
 * einmal; das Bild kommt über `CdeIcon` aus dem Icon-Tor, die Leitfarbe über
 * `--card-accent` von der Kachel darum herum.
 */
import CdeIcon from './CdeIcon.vue';

defineProps({
  /** Semantischer Icon-Name (siehe CdeIcon). */
  icon:   { type: String, required: true },
  titel:  { type: String, required: true },
  /** Kleingedrucktes hinter dem Titel, z. B. eine Anzahl. */
  zusatz: { type: String, default: '' },
});
</script>

<style scoped>
/* Der Titel darf schrumpfen, damit die Knöpfe rechts nie aus dem Panel laufen. */
.titel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
