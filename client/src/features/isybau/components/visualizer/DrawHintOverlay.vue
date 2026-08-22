<template>
  <!-- Zeichen-Vorschau des Tutorials: Geisterumriss der Fläche, die der Nutzer
       gleich selbst zeichnen soll. Der Umriss zieht sich in Schleife selbst
       nach, die Klickpunkte sind durchnummeriert — zusammen zeigt das
       Reihenfolge UND Ort. `:key` startet die Animation neu, wenn derselbe
       Umriss erneut gesetzt wird. -->
  <g v-if="hint" class="draw-hint" :key="hint.token">
    <path class="draw-hint-fill" :d="hint.d" />
    <path
      class="draw-hint-trace"
      :d="hint.d"
      pathLength="100"
      :stroke-width="hint.strokeWidth"
      fill="none"
    />
    <g v-for="(p, i) in hint.vertices" :key="i">
      <circle
        class="draw-hint-dot"
        :cx="p.x" :cy="p.y" :r="hint.dotRadius"
        :stroke-width="hint.strokeWidth"
      />
      <text
        class="draw-hint-num"
        :x="p.x" :y="p.y"
        :font-size="hint.fontSize"
        text-anchor="middle"
        dominant-baseline="central"
      >{{ i + 1 }}</text>
    </g>
  </g>
</template>

<script setup>
/**
 * Reine Darstellungsschicht der Zeichen-Vorschau (siehe
 * composables/useDrawingHint.js). Bewusst eine eigene Komponente statt
 * weiterer Zeilen in IsybauViewer.vue — die Vorschau hat mit dem Netz
 * nichts zu tun und soll den Viewer nicht weiter aufblähen.
 *
 * Die Punkte holt sie sich selbst aus dem Singleton; vom Viewer braucht sie
 * nur, was der besitzt: Ausdehnung und Zoomstufe.
 */
import { computed } from 'vue';
import { useDrawingHint } from '../../composables/useDrawingHint.js';

const props = defineProps({
    // { minX, maxY, … } — Ursprung der lokalen SVG-Koordinaten
    bounds: { type: Object, required: true },
    scale: { type: Number, default: 1 },
});

const { hintPoints, hintToken } = useDrawingHint();

// Weltkoordinaten -> lokale SVG-Koordinaten, dieselbe Abbildung wie im Viewer:
// x - minX, maxY - y. Strichstärke, Punktgröße und Schrift werden gegen
// `scale` normiert — sonst wäre die Vorschau herausgezoomt ein Klecks und
// hereingezoomt ein unsichtbarer Haarstrich (Prinzip wie beim Fokus-Ring).
const hint = computed(() => {
    const pts = hintPoints.value;
    if (!pts || pts.length < 2 || !props.bounds) return null;
    const s = props.scale || 1;
    const vertices = pts.map(p => ({ x: p.x - props.bounds.minX, y: props.bounds.maxY - p.y }));
    const d = vertices.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
        + (vertices.length >= 3 ? ' Z' : '');
    return {
        d,
        vertices,
        strokeWidth: 2.5 / s,
        dotRadius: 5 / s,
        fontSize: 7 / s,
        token: hintToken.value,
    };
});
</script>

<style scoped>
/* Alle Ebenen klickdurchlässig — die Vorschau darf nicht genau das Zeichnen
   blockieren, zu dem sie auffordert. */
.draw-hint { pointer-events: none; }

.draw-hint-fill {
  fill: color-mix(in srgb, var(--isy-tutorial-glow) 14%, transparent);
  stroke: none;
}

/* Der Umriss zieht sich selbst nach: stroke-dasharray 100 deckt dank
   pathLength="100" genau die volle Pfadlänge ab (unabhängig von Zoom und
   Flächengröße), der dashoffset läuft von 100 (nichts sichtbar) auf 0 (ganz
   gezeichnet). Danach eine Ruhepause, in der der fertige Umriss steht —
   ohne die wirkt es hektisch statt erklärend. */
.draw-hint-trace {
  stroke: var(--isy-tutorial-glow);
  stroke-linejoin: round;
  stroke-linecap: round;
  stroke-dasharray: 100;
  animation: draw-hint-trace 3.2s ease-in-out infinite;
}

@keyframes draw-hint-trace {
  0%        { stroke-dashoffset: 100; }
  65%, 100% { stroke-dashoffset: 0; }
}

.draw-hint-dot {
  fill: var(--isy-pixel-bg);
  stroke: var(--isy-tutorial-glow);
}

.draw-hint-num {
  fill: var(--isy-pixel-text);
  font-family: var(--isy-pixel-font);
  pointer-events: none;
}

/* Wer Bewegung reduziert haben will, bekommt den fertigen Umriss statt der
   Schleife — die Information (WO zeichnen) bleibt vollständig erhalten. */
@media (prefers-reduced-motion: reduce) {
  .draw-hint-trace { animation: none; stroke-dashoffset: 0; }
}
</style>
