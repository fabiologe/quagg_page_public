<template>
  <div v-if="errors.length || warnings.length" class="val-panel" :class="panelClass">

    <!-- Summary bar (always visible) -->
    <div class="val-summary" @click="expanded = !expanded">
      <div class="val-badges">
        <span v-if="errors.length" class="vbadge err">
          <span class="vbadge-icon">✕</span>
          {{ errors.length }} Fehler
        </span>
        <span v-if="warnings.length" class="vbadge warn">
          <span class="vbadge-icon">▲</span>
          {{ warnings.length }} Warnung{{ warnings.length > 1 ? 'en' : '' }}
        </span>
        <span class="val-hint">
          {{ topMessage }}
        </span>
      </div>
      <button class="expand-btn" :title="expanded ? 'Einklappen' : 'Details anzeigen'">
        {{ expanded ? '▲' : '▼' }}
      </button>
    </div>

    <!-- Detail list -->
    <transition name="val-slide">
      <div v-if="expanded" class="val-details">
        <!-- Errors -->
        <div v-for="item in errors" :key="item.code" class="val-item val-item-err">
          <div class="val-item-header">
            <span class="val-icon">✕</span>
            <span class="val-item-title">{{ item.title }}</span>
            <span v-if="item.layer" class="val-layer-badge">{{ layerLabel(item.layer) }}</span>
          </div>
          <div class="val-item-detail">{{ item.detail }}</div>
          <div v-if="item.xMarkers?.length" class="val-markers-hint">
            Markiert im Profil:
            <span v-for="m in item.xMarkers" :key="m.x" class="val-x-chip">x = {{ m.x.toFixed(2) }} m</span>
          </div>
        </div>

        <!-- Warnings -->
        <div v-for="item in warnings" :key="item.code" class="val-item val-item-warn">
          <div class="val-item-header">
            <span class="val-icon">▲</span>
            <span class="val-item-title">{{ item.title }}</span>
            <span v-if="item.layer" class="val-layer-badge">{{ layerLabel(item.layer) }}</span>
          </div>
          <div class="val-item-detail">{{ item.detail }}</div>
          <div v-if="item.xMarkers?.length" class="val-markers-hint">
            Markiert im Profil:
            <span v-for="m in item.xMarkers" :key="m.x" class="val-x-chip">x = {{ m.x.toFixed(2) }} m</span>
          </div>
        </div>
      </div>
    </transition>
  </div>

  <!-- All clear -->
  <div v-else class="val-ok">
    <span class="val-ok-icon">✓</span> Geometrie plausibel — keine Probleme gefunden
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBridgeValidation } from '../composables/useBridgeValidation.js'

const { errors, warnings } = useBridgeValidation()

const expanded = ref(false)

const panelClass = computed(() => errors.value.length ? 'panel-err' : 'panel-warn')

const topMessage = computed(() => {
  if (errors.value.length) return errors.value[0].title
  if (warnings.value.length) return warnings.value[0].title
  return ''
})

function layerLabel(layer) {
  return { terrain: 'Gelände', buk: 'BUK', bok: 'BOK', kst: 'kSt' }[layer] ?? layer
}
</script>

<style scoped>
/* ── All-clear bar ── */
.val-ok {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.8rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 7px;
  font-size: 0.78rem;
  color: #15803d;
  font-weight: 600;
}
.val-ok-icon { font-size: 0.9rem; }

/* ── Panel ── */
.val-panel {
  border-radius: 8px;
  overflow: hidden;
  font-size: 0.8rem;
  border: 1.5px solid;
}
.panel-err  { border-color: #fca5a5; background: #fff1f2; }
.panel-warn { border-color: #fde68a; background: #fffbeb; }

/* ── Summary bar ── */
.val-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.42rem 0.8rem;
  cursor: pointer;
  user-select: none;
  gap: 0.5rem;
}
.panel-err  .val-summary:hover { background: #ffe4e6; }
.panel-warn .val-summary:hover { background: #fef9c3; }

.val-badges {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.vbadge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.12rem 0.5rem;
  border-radius: 20px;
  white-space: nowrap;
  flex-shrink: 0;
}
.vbadge.err  { background: #fee2e2; color: #b91c1c; }
.vbadge.warn { background: #fef3c7; color: #92400e; }
.vbadge-icon { font-size: 0.68rem; }

.val-hint {
  font-size: 0.77rem;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-btn {
  border: none;
  background: none;
  font-size: 0.65rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.15rem 0.3rem;
  flex-shrink: 0;
}

/* ── Detail list ── */
.val-details {
  border-top: 1px solid rgba(0,0,0,0.07);
  padding: 0.5rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.val-item {
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  border-left: 3px solid;
}
.val-item-err  { background: #fff1f2; border-color: #ef4444; }
.val-item-warn { background: #fffbeb; border-color: #f59e0b; }

.val-item-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}
.val-icon {
  font-size: 0.75rem;
  font-weight: 800;
  flex-shrink: 0;
}
.val-item-err  .val-icon { color: #dc2626; }
.val-item-warn .val-icon { color: #d97706; }

.val-item-title {
  font-weight: 700;
  font-size: 0.8rem;
  color: #1e293b;
  flex: 1;
}

.val-layer-badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
}

.val-item-detail {
  font-size: 0.76rem;
  color: #475569;
  line-height: 1.45;
}

.val-markers-hint {
  margin-top: 0.3rem;
  font-size: 0.73rem;
  color: #64748b;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.val-x-chip {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 0.08rem 0.35rem;
  font-family: monospace;
  font-size: 0.71rem;
}

/* ── Transition ── */
.val-slide-enter-active,
.val-slide-leave-active { transition: max-height 0.22s ease, opacity 0.18s ease; max-height: 600px; }
.val-slide-enter-from,
.val-slide-leave-to    { max-height: 0; opacity: 0; overflow: hidden; }
</style>
