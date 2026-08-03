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
.curve-table-editor { margin: 0.25rem 0; }
.curve-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.curve-table th { text-align: left; padding: 2px 4px; color: var(--isy-pixel-border, #4a4844); font-weight: 700; }
.curve-table td { padding: 2px 4px; }
/* Scoped Style greift nicht auf die Parent-Modal-Regel für .small-input durch
   (Vue-Scoping) — daher hier vollständig eigenständig im selben (dunklen) Look
   wie PreprocessingModal.vue .small-input, statt nacktem Browser-Input daneben. */
.curve-table .small-input {
  width: 100%;
  box-sizing: border-box;
  padding: 3px 4px;
  border: 1px solid var(--isy-pixel-border, #4a4844);
  border-radius: 4px;
  background: var(--isy-pixel-bg-alt, #0a0d5c);
  color: var(--isy-pixel-text, #fff);
  font-size: 0.82rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.curve-table .small-input:focus {
  outline: none;
  border-color: var(--isy-pixel-green, #219653);
  box-shadow: 0 0 0 2px rgba(46, 204, 113, 0.2);
}
.row-remove-btn {
  background: none; border: none; color: var(--isy-pixel-danger, #e74c3c); cursor: pointer;
  font-family: var(--isy-pixel-font); font-size: 0.55rem; padding: 0 4px;
}
.row-remove-btn:disabled { color: var(--isy-pixel-text-dim, #4a4a4a); cursor: not-allowed; }
.row-add-btn {
  margin-top: 4px; background: none; border: 1px dashed var(--isy-pixel-border, #4a4844); border-radius: 4px;
  color: var(--isy-pixel-border, #4a4844); font-family: var(--isy-pixel-font); font-size: 0.5rem; padding: 4px 8px; cursor: pointer;
  transition: background 0.15s;
}
.row-add-btn:hover { background: var(--isy-pixel-content-bg, #f3f2fb); }
</style>
