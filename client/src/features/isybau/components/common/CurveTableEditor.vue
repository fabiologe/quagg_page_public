<template>
  <div class="curve-table-editor">
    <table class="curve-table">
      <thead>
        <tr>
          <th>{{ xLabel }}</th>
          <th>{{ yLabel }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(pt, i) in points" :key="i">
          <td>
            <input
              type="number"
              step="0.01"
              class="small-input"
              :aria-label="`${xLabel}, Zeile ${i + 1}`"
              :value="pt[xKey]"
              @input="updatePoint(i, xKey, $event.target.value)"
              @click.stop
            >
          </td>
          <td>
            <input
              type="number"
              step="0.01"
              class="small-input"
              :aria-label="`${yLabel}, Zeile ${i + 1}`"
              :value="pt[yKey]"
              @input="updatePoint(i, yKey, $event.target.value)"
              @click.stop
            >
          </td>
          <td>
            <button
              type="button"
              class="row-remove-btn"
              :disabled="points.length <= 2"
              title="Zeile entfernen (mind. 2 Stützstellen nötig)"
              @click.stop="removeRow(i)"
            >✕</button>
          </td>
        </tr>
      </tbody>
    </table>
    <button type="button" class="row-add-btn" @click.stop="addRow">+ Zeile</button>
  </div>
</template>

<script setup>
// Wiederverwendbarer Stützstellen-Editor für SWMM-Kurven (Tiefe/Fläche für
// TABULAR-Speicher, künftig auch Diverted-Flow/Inflow für Divider-TABULAR).
// xKey/yKey erlauben die Einbettung direkt auf Domain-Feldern wie
// {depth, area} statt eines generischen {x, y}, ohne Adapter-Boilerplate im Aufrufer.
const props = defineProps({
  points: { type: Array, required: true },
  xLabel: { type: String, default: 'X' },
  yLabel: { type: String, default: 'Y' },
  xKey:   { type: String, default: 'x' },
  yKey:   { type: String, default: 'y' },
});
const emit = defineEmits(['update:points']);

const updatePoint = (i, key, rawValue) => {
  const value = parseFloat(rawValue);
  const next = props.points.map((pt, idx) => idx === i ? { ...pt, [key]: Number.isFinite(value) ? value : 0 } : pt);
  emit('update:points', next);
};

const addRow = () => {
  const last = props.points[props.points.length - 1] ?? { [props.xKey]: 0, [props.yKey]: 0 };
  emit('update:points', [...props.points, { ...last }]);
};

const removeRow = (i) => {
  if (props.points.length <= 2) return; // SWMM braucht mind. 2 Stützstellen
  emit('update:points', props.points.filter((_, idx) => idx !== i));
};
</script>

<style scoped>
.curve-table-editor { margin: var(--isy-space-1) 0; }
.curve-table { width: 100%; border-collapse: collapse; font-size: var(--isy-fs-sm); }
.curve-table th { text-align: left; padding: var(--isy-space-1) var(--isy-space-1); color: var(--isy-pixel-border); font-weight: 700; }
.curve-table td { padding: var(--isy-space-1) var(--isy-space-1); }
/* Scoped Style greift nicht auf die Parent-Modal-Regel für .small-input durch
   (Vue-Scoping) — daher hier vollständig eigenständig im selben (dunklen) Look
   wie PreprocessingModal.vue .small-input, statt nacktem Browser-Input daneben. */
.curve-table .small-input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--isy-space-1) var(--isy-space-1);
  border: 1px solid var(--isy-pixel-border);
  border-radius: var(--isy-radius-sm);
  background: var(--isy-pixel-bg-alt);
  color: var(--isy-pixel-text);
  font-size: var(--isy-fs-md);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.curve-table .small-input:focus {
  /* Fokusring liegt zentral in theme.css und INNEN - ein aeusserer
     wuerde von clip-path weggeschnitten. */
  outline: none;
  border-color: var(--isy-pixel-green);
}
.row-remove-btn {
  background: none; border: none; color: var(--isy-pixel-danger); cursor: var(--isy-cursor-hand);
  font-family: var(--isy-pixel-font); font-size: var(--isy-fs-pixel-md); padding: 0 var(--isy-space-1);
}
.row-remove-btn:disabled { color: var(--isy-pixel-text-dim); cursor: var(--isy-cursor-gesperrt); }
.row-add-btn {
  margin-top: var(--isy-space-1); background: none; border: 1px dashed var(--isy-pixel-border); border-radius: var(--isy-radius-sm);
  color: var(--isy-pixel-border); font-family: var(--isy-pixel-font); font-size: var(--isy-fs-pixel-md); padding: var(--isy-space-1) var(--isy-space-2); cursor: var(--isy-cursor-hand);
  transition: background 0.15s;
}
.row-add-btn:hover { background: var(--isy-pixel-content-bg); }
</style>
