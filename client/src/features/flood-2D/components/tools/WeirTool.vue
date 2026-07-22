<template>
  <div
    class="tool-ui-panel weir-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      <SvIcon name="Weir.png" :size="18" class="header-icon" /> Wehr / Überlauf
      <span v-if="!panelVisible" class="collapse-toggle">···</span>
    </div>

    <div class="panel-content" v-show="panelVisible">

        <div v-if="weir3DState.phase === 'DRAW'" class="state-idle">
          <div class="hint drawing-hint" v-if="weir3DState.draftPoints.length">
            <span class="step-badge">{{ weir3DState.draftPoints.length }}</span>
            Punkte gesetzt — <strong>Enter</strong> schließt die Linie ab (≥ 2)
          </div>
          <div class="hint" v-else>
            <span class="step-badge">1</span>
            Wehr-Punkte aufs Terrain klicken (Polylinie)
          </div>
          <div class="sub-hint">Backspace: letzter Punkt · Esc: abbrechen</div>
          <div class="actions">
            <button class="btn btn-save" :disabled="weir3DState.draftPoints.length < 2" @click="weir3d.finishDrawing()">Linie abschließen</button>
            <button class="btn btn-cancel" @click="weir3d.cancel()">Abbrechen</button>
          </div>
        </div>

        <div v-else-if="weir3DState.phase === 'EDIT'" class="state-idle">
          <div class="location-badge" v-if="editingWeir"><SvEmoji emoji="✏" :size="13" /> {{ editingWeir.points.length }} Ecken · {{ (editingWeir.openings || []).length }} Öffnung(en)</div>
          <div class="sub-hint">Enter: fertig · Esc: abbrechen</div>
          <div class="input-group">
            <label>Krone alle Ecken [m NHN]</label>
            <input type="number" step="0.05" v-model.number="crestHc" @change="weir3d.setCrest(crestHc)" />
          </div>
          <div class="input-group">
            <label>Wand-Breite [m]</label>
            <input type="number" step="0.5" min="0.5" v-model.number="weirWidth" @change="weir3d.setWidth(weirWidth)" />
          </div>

          <!-- Öffnungen (Durchlass): rund / rechteckig / polygonal -->
          <div class="existing-list">
            <div class="list-title">Öffnungen (Durchlass)</div>
            <div v-for="(o, k) in (editingWeir?.openings || [])" :key="k" class="op-row">
              <div class="op-head">
                <span class="weir-label">{{ {round:'⚪',rect:'▭',poly:'⬠'}[o.type] || '🛢' }} #{{ k + 1 }} · {{ {round:'rund',rect:'rechteckig',poly:'polygonal'}[o.type] || 'rund' }}</span>
                <button class="btn-remove" @click="weir3d.removeOpening(k)" title="Löschen">✕</button>
              </div>
              <div class="op-fields">
                <label v-if="o.type !== 'poly'" class="op-soffit">Soffit ü. Gelände [m]
                  <input type="number" step="0.05" :value="r2(soffitRel(o))" @change="weir3d.setOpeningSoffit(k, parseFloat($event.target.value) + weir3d.terrainZAt(o.x, o.y))" />
                </label>
                <label v-if="o.type !== 'poly'" class="op-soffit">Breite
                  <input type="number" step="0.5" min="0.2" :value="r2(o.width)" @change="weir3d.setOpeningWidth(k, parseFloat($event.target.value))" />
                </label>
                <label v-if="o.type === 'rect'" class="op-soffit">Höhe
                  <input type="number" step="0.2" min="0.2" :value="r2(o.height)" @change="weir3d.setOpeningHeight(k, parseFloat($event.target.value))" />
                </label>
                <span v-if="o.type === 'poly'" class="op-soffit">Ecken im Profil ziehen ({{ o.points?.length || 0 }})</span>
              </div>
            </div>
            <div class="actions" style="margin-top:6px">
              <button class="btn btn-cancel btn-slim" @click="weir3d.addOpening('round')">⚪ Rund</button>
              <button class="btn btn-cancel btn-slim" @click="weir3d.addOpening('rect')">▭ Rechteck</button>
              <button class="btn btn-cancel btn-slim" @click="weir3d.addOpening('poly')">⬠ Polygon</button>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-save" @click="onFinishWeir">Fertig</button>
            <button class="btn btn-remove-wide" @click="weir3d.deleteCurrent()">Löschen</button>
          </div>
        </div>

        <div v-else class="state-idle">
          <div class="hint"><span class="step-badge">＋</span> Neue Wehr-Polylinie zeichnen — oder bestehende anklicken</div>
          <div class="actions"><button class="btn btn-save" @click="weir3d.startDrawing()">Neue Polylinie</button></div>
        </div>

        <div v-if="weirLines.length > 0" class="existing-list">
          <div class="list-title">Wehr-Polylinien</div>
          <div v-for="l in weirLines" :key="l.id" class="weir-item">
            <span class="weir-label">{{ l.label || l.id.substring(0,10) }}</span>
            <span class="weir-meta">{{ l.points.length }} Pkt · hc={{ l.hc.toFixed(2) }}m</span>
            <button class="btn-edit" @click="editWeirLine(l.id)" title="Bearbeiten"><SvEmoji emoji="✏" :size="13" /></button>
            <button class="btn-remove" @click="geoStore.removeWeirLine(l.id)" title="Löschen">✕</button>
          </div>
        </div>

    </div>
  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { ref, computed, watch } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import SvIcon from '../common/SvIcon.vue';
import { weir3DState, getWeir3DToolInstance } from '../../composables/editor/useWeir3DTool.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

const simStore = useSimulationStore();
const geoStore = useGeoStore();
const weir3d = getWeir3DToolInstance();

const isActive = computed(() => simStore.activeTool === 'WEIR');

// Panel einklappbar per Hover (analog ShovelTool/BridgeTool).
const { onPanelEnter, onPanelLeave, panelVisible } = useCollapsiblePanel();

// „Fertig": Bearbeitung abschließen UND das Werkzeug deaktivieren (Auto-Reset), damit nicht
// versehentlich gleich die nächste Wehr-Polylinie gezeichnet wird.
const onFinishWeir = () => {
  weir3d.finishEdit();
  simStore.setActiveTool(null);
};
const weirLines = computed(() => geoStore.weirLines);
const editingWeir = computed(() => geoStore.weirLines.find(l => l.id === weir3DState.editingId));
const crestHc = ref(0);
const weirWidth = ref(1);
watch(editingWeir, (l) => {
  if (!l) return;
  crestHc.value = Math.round((l.hc ?? 0) * 100) / 100;
  weirWidth.value = Math.round((l.width ?? 1) * 100) / 100;
}, { immediate: true });
const editWeirLine = (id) => weir3d.startEdit(id);

// Anzeige-Rundung (Clamp-Rechnungen erzeugen sonst hässliche Fließkomma-Reste im Feld).
const r2 = (v) => Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
// Soffit relativ zum Gelände an der Öffnungsposition statt absoluter NHN-Höhe.
const soffitRel = (o) => o.soffit - weir3d.terrainZAt(o.x, o.y);
</script>

<style scoped>
/* Chrome (Position/Surface/Header/Hints/Buttons/Formulare) kommt GLOBAL aus
   styles/tool-panel.css — WeirTool ist die Vorlage. Hier nur Wehr-Spezifisches. */
.weir-item { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.weir-label { font-size: 0.85rem; font-weight: 600; flex: 1; }
.weir-meta { font-size: 0.75rem; color: #7f8c8d; }
.btn-remove { background: none; border: 1px solid #c0392b; color: #c0392b; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
.btn-remove:hover { background: #c0392b; color: white; }

.location-badge { font-size: 0.78rem; color: #a3e635; background: rgba(139,92,246,0.18); border-radius: 4px; padding: 4px 8px; text-align: center; }

/* Buttons */
.btn-edit { background: none; border: 1px solid #8b5cf6; color: #a3e635; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; }
.btn-edit:hover { background: #8b5cf6; color: white; }
.btn-remove-wide { flex: 0 0 auto; padding: 8px 10px; border: 1px solid #c0392b; border-radius: 5px; background: none; color: #c0392b; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.2s; }
.btn-remove-wide:hover { background: #c0392b; color: white; }
.btn-slim { flex: 0 0 auto; padding: 6px 10px; font-size: 0.8rem; border: none; border-radius: 5px; font-weight: 600; cursor: pointer; }
.op-soffit { font-size: 0.72rem; color: #95a5a6; display: flex; align-items: center; gap: 4px; }
.op-soffit input { width: 58px; padding: 3px 6px; border-radius: 4px; border: 1px solid #3a2f5c; background: #12121a; color: white; font-size: 0.8rem; outline: none; }
.op-row { padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.op-head { display: flex; align-items: center; justify-content: space-between; }
.op-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
</style>
