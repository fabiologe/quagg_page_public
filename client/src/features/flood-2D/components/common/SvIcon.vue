<template>
  <span
    class="sv-icon"
    role="img"
    :aria-label="label || name"
    :style="style"
  ></span>
</template>

<script setup>
import { computed } from 'vue';

/**
 * SvIcon — rendert ein Pixel-SVG aus public/saintv1d/icons als eingefärbte Maske.
 * Da die Icons einfarbige Silhouetten sind, färbt CSS-`mask` sie beliebig ein
 * (Standard: Lime-Green des SaintV-Themes) und behält die Pixel-Details.
 */
const props = defineProps({
  // Dateiname aus public/saintv1d/icons/. Ohne Endung → ".svg" wird ergänzt;
  // mit Endung (z. B. "Weir.png") wird der Name unverändert genutzt.
  name:  { type: String, required: true },
  size:  { type: [Number, String], default: 16 },
  color: { type: String, default: 'var(--sv-lime)' },
  label: { type: String, default: '' },
});

const style = computed(() => {
  const s = typeof props.size === 'number' ? `${props.size}px` : props.size;
  const file = /\.(svg|png|webp|gif)$/i.test(props.name) ? props.name : `${props.name}.svg`;
  const url = `url("/saintv1d/icons/${file}")`;
  return {
    width: s,
    height: s,
    backgroundColor: props.color,
    maskImage: url,
    webkitMaskImage: url,
  };
});
</script>

<style scoped>
.sv-icon {
  display: inline-block;
  vertical-align: -0.15em;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  flex-shrink: 0;
}
</style>
