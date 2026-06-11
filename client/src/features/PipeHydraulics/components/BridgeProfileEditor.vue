<template>
  <div
    :class="['bridge-profile-editor', { 'bpe-windowed': isExpanded }]"
    :style="windowStyle"
  >
    <!-- Titelzeile im Fenstermodus -->
    <div v-if="isExpanded" class="bpe-titlebar" @mousedown="startWinDrag">
      <span class="bpe-title">⊞ Profilzeichner</span>
      <button class="bpe-close" @click.stop="collapseWindow" title="Fenster schließen (Esc)">✕</button>
    </div>

    <!-- Resize-Handles (8 Richtungen) -->
    <template v-if="isExpanded">
      <div class="bpe-resize n"  @mousedown.prevent="startWinResize($event,'n')"></div>
      <div class="bpe-resize ne" @mousedown.prevent="startWinResize($event,'ne')"></div>
      <div class="bpe-resize e"  @mousedown.prevent="startWinResize($event,'e')"></div>
      <div class="bpe-resize se" @mousedown.prevent="startWinResize($event,'se')"></div>
      <div class="bpe-resize s"  @mousedown.prevent="startWinResize($event,'s')"></div>
      <div class="bpe-resize sw" @mousedown.prevent="startWinResize($event,'sw')"></div>
      <div class="bpe-resize w"  @mousedown.prevent="startWinResize($event,'w')"></div>
      <div class="bpe-resize nw" @mousedown.prevent="startWinResize($event,'nw')"></div>
    </template>

    <!-- Layer-Auswahl + Toolbar -->
    <div class="editor-toolbar">
      <div class="layer-tabs">
        <button v-for="layer in LAYERS" :key="layer.id"
          :class="['layer-tab', { active: activeLayer === layer.id }]"
          :style="activeLayer === layer.id ? { borderColor: layer.color, color: layer.color } : {}"
          @click="activeLayer = layer.id"
          :title="layer.hint">
          <span class="layer-dot" :style="{ background: layer.color }"></span>
          {{ layer.label }}
          <span class="layer-count" v-if="getLayerPoints(layer.id).length">
            ({{ getLayerPoints(layer.id).length }})
          </span>
        </button>
      </div>
      <div class="toolbar-actions">
        <button class="tool-btn undo-btn" @click="store.undo()" :disabled="!store.canUndo"
          title="Rückgängig (Strg+Z)">&#x21A9;</button>
        <button class="tool-btn undo-btn" @click="store.redo()" :disabled="!store.canRedo"
          title="Wiederholen (Strg+Y)">&#x21AA;</button>
        <div class="toolbar-sep"></div>
        <button class="tool-btn" @click="clearActiveLayer" title="Aktiven Layer leeren">
          Leeren
        </button>
        <button v-if="activeLayer !== 'terrain'" class="tool-btn danger"
          @click="clearActiveLayer" :title="`${activeLayerMeta.label} komplett entfernen`">
          Entfernen
        </button>
        <div class="toolbar-sep"></div>
        <div class="view-controls">
          <button class="tool-btn" @click="resetView" title="Ansicht zurücksetzen (Fit All)">Fit</button>
          <span class="zoom-indicator">{{ zoomLevel.toFixed(1) }}×</span>
        </div>
        <div class="toolbar-sep"></div>
        <button class="tool-btn expand-btn" @click="toggleExpand"
          :title="isExpanded ? 'Fenster schließen (Esc)' : 'Als Fenster öffnen'">
          {{ isExpanded ? '⊟' : '⊞' }}
        </button>
        <button class="tool-btn print-btn" @click="showPrintModal = true" title="Ausdruck / Export">Drucken</button>
        <button class="tool-btn info-btn" @click="showInfoModal = true" title="Hydraulische Erklärung & Berechnungsprotokoll">Info</button>
      </div>
    </div>
    <BridgePrintModal v-if="showPrintModal" @close="showPrintModal = false" />
    <BridgeHydraulicsInfoModal v-if="showInfoModal" @close="showInfoModal = false" />

    <!-- Validierungspanel -->
    <BridgeValidationPanel />

    <!-- SVG Zeichenbereich -->
    <div ref="svgContainerEl" class="bpe-svg-wrap">
    <svg
      ref="svgEl"
      :viewBox="`0 0 ${svgW} ${svgH}`"
      class="profile-svg"
      :class="[`mode-${activeLayer}`, { 'mode-pan': dragState?.type === 'pan', 'mode-kst': dragState?.type === 'kst-bound' }]"
      @click="onSvgClick"
      @mousedown="onSvgMouseDown"
      @mousemove="onSvgMouseMove"
      @mouseup="endDrag"
      @mouseleave="endDrag"
      @wheel.prevent="onWheel"
      @contextmenu.prevent="onSvgRightClick"
    >
      <defs>
        <clipPath id="plot-area-clip">
          <rect :x="PAD.left" :y="PAD.top" :width="plotW" :height="plotH" />
        </clipPath>
        <pattern id="bridge-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#4a5568" stroke-width="3.5" opacity="0.3" />
        </pattern>
        <pattern id="ground-dots" patternUnits="userSpaceOnUse" width="6" height="6">
          <circle cx="3" cy="3" r="1" fill="#9ca3af" opacity="0.4" />
        </pattern>
        <pattern id="inactive-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" stroke-width="1.5" opacity="0.5" />
        </pattern>
      </defs>

      <!-- Plot-Hintergrund -->
      <rect :x="PAD.left" :y="PAD.top" :width="plotW" :height="plotH" fill="#f8fafc" />

      <!-- kSt-Zonen Visualisierung (gefärbte Streifenboden) -->
      <g clip-path="url(#plot-area-clip)">
        <g v-for="zone in kstBands" :key="zone.id">
          <!-- Flächenfüllung (Totwasser: graue Schraffur statt Zonenfarbe) -->
          <rect :x="zone.svgX1" :y="PAD.top" :width="zone.svgX2 - zone.svgX1" :height="plotH"
            :fill="zone.inactive ? 'url(#inactive-hatch)' : zone.color"
            :opacity="zone.inactive ? 0.5 : 0.07" />
          <!-- Linke Grenzlinie (immer angezeigt, aber nur für explizite Grenzen draggable) -->
          <line :x1="zone.svgX1" :y1="PAD.top" :x2="zone.svgX1" :y2="PAD.top + plotH"
            :stroke="zone.color" stroke-width="1" stroke-dasharray="5,4" opacity="0.5" />
        </g>
      </g>

      <!-- kSt-Zonen Drag-Handles (nur für explizit gesetzte Grenzen) -->
      <g clip-path="url(#plot-area-clip)">
        <g v-for="zone in kstBands" :key="'kh-'+zone.id">
          <!-- Linke Grenze -->
          <g v-if="zone.hasLeft" style="cursor: col-resize"
            @mousedown.stop="startDragKstBound($event, zone.id, 'left')">
            <rect :x="zone.svgX1 - 7" :y="PAD.top" width="14" :height="plotH" fill="transparent" />
            <line :x1="zone.svgX1" :y1="PAD.top" :x2="zone.svgX1" :y2="PAD.top + plotH"
              :stroke="zone.color" stroke-width="2.5" opacity="0.75" />
            <rect :x="zone.svgX1 - 5" :y="PAD.top + plotH / 2 - 16" width="10" height="32"
              rx="5" :fill="zone.color" opacity="0.9" />
            <line :x1="zone.svgX1 - 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX1 - 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
            <line :x1="zone.svgX1 + 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX1 + 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
          </g>
          <!-- Rechte Grenze -->
          <g v-if="zone.hasRight" style="cursor: col-resize"
            @mousedown.stop="startDragKstBound($event, zone.id, 'right')">
            <rect :x="zone.svgX2 - 7" :y="PAD.top" width="14" :height="plotH" fill="transparent" />
            <line :x1="zone.svgX2" :y1="PAD.top" :x2="zone.svgX2" :y2="PAD.top + plotH"
              :stroke="zone.color" stroke-width="2.5" opacity="0.75" />
            <rect :x="zone.svgX2 - 5" :y="PAD.top + plotH / 2 - 16" width="10" height="32"
              rx="5" :fill="zone.color" opacity="0.9" />
            <line :x1="zone.svgX2 - 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX2 - 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
            <line :x1="zone.svgX2 + 2" :y1="PAD.top + plotH / 2 - 8" :x2="zone.svgX2 + 2" :y2="PAD.top + plotH / 2 + 8"
              stroke="white" stroke-width="1" opacity="0.7" />
          </g>
        </g>
      </g>

      <!-- Horizontale Gitterlinien -->
      <g clip-path="url(#plot-area-clip)">
        <line v-for="gl in gridH" :key="gl.z"
          :x1="PAD.left" :y1="gl.sy" :x2="PAD.left + plotW" :y2="gl.sy"
          stroke="#dde3ec" stroke-width="1" />
      </g>

      <!-- Geländeprofil (Terrain) – vor Brücke gezeichnet, damit Brücke es überdeckt -->
      <path v-if="terrainPathSvg" :d="terrainPathSvg"
        fill="none" stroke="#374151" stroke-width="2.5" stroke-linejoin="round"
        clip-path="url(#plot-area-clip)" />

      <!-- Wasser Zone 1 (Durchströmung) — per-Segment gefärbt -->
      <g clip-path="url(#plot-area-clip)">
        <path v-for="seg in z1SegmentPaths" :key="'z1s-'+seg.segIdx"
          :d="seg.path"
          :fill="seg.fill"
          :fill-opacity="hoverSegIdx === seg.segIdx ? Math.min(0.85, seg.fillOpacity * 1.7) : seg.fillOpacity"
          :stroke="seg.stroke" stroke-width="0.8"
          style="cursor: pointer; transition: fill-opacity 0.1s"
        />
      </g>

      <!-- Wasser Zone 2 (Überströmung) -->
      <path v-if="waterZ2Path" :d="waterZ2Path"
        fill="#14b8a6" fill-opacity="0.36" stroke="#0d9488" stroke-width="0.6"
        clip-path="url(#plot-area-clip)" />

      <!-- Brückenbauwerk (zwischen BUK und BOK) – überdeckt Gelände und Wasser darunter -->
      <path v-if="bridgeFillPath" :d="bridgeFillPath"
        fill="#64748b" fill-opacity="1" clip-path="url(#plot-area-clip)" />
      <path v-if="bridgeFillPath" :d="bridgeFillPath"
        fill="url(#bridge-hatch)" clip-path="url(#plot-area-clip)" />

      <!-- Brückendecke (BOK-Linie, dicker) -->
      <path v-if="bokPathSvg" :d="bokPathSvg"
        fill="none" stroke="#475569" stroke-width="4"
        clip-path="url(#plot-area-clip)" />

      <!-- BUK-Linie -->
      <path v-if="bukPathSvg" :d="bukPathSvg"
        fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="8,5"
        clip-path="url(#plot-area-clip)" />

      <!-- BOK-Linie (Umriss) -->
      <path v-if="bokPathSvg" :d="bokPathSvg"
        fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="8,5"
        clip-path="url(#plot-area-clip)" />

      <!-- WSP Drag-Linie -->
      <g clip-path="url(#plot-area-clip)">
        <rect :x="PAD.left" :y="wy(store.wsp) - 10" :width="plotW" height="20"
          fill="transparent" style="cursor: row-resize"
          @mousedown.stop="startDragWSP" />
        <line :x1="PAD.left" :y1="wy(store.wsp)" :x2="PAD.left + plotW" :y2="wy(store.wsp)"
          stroke="#1d4ed8" stroke-width="2.5" pointer-events="none" />
      </g>
      <!-- WSP Griff -->
      <g :transform="`translate(${PAD.left + plotW * 0.5}, ${wy(store.wsp)})`"
        style="cursor: row-resize" @mousedown.stop="startDragWSP">
        <rect x="-32" y="-10" width="64" height="20" rx="10"
          fill="#1d4ed8" stroke="white" stroke-width="1.5" />
        <text x="0" y="4" text-anchor="middle" font-size="11" fill="white" font-weight="700">
          WSP {{ store.wsp.toFixed(2) }} m
        </text>
      </g>

      <!-- Achsen -->
      <line :x1="PAD.left" :y1="PAD.top" :x2="PAD.left" :y2="PAD.top + plotH"
        stroke="#94a3b8" stroke-width="1.5" />
      <line :x1="PAD.left" :y1="wy(0)" :x2="PAD.left + plotW" :y2="wy(0)"
        stroke="#94a3b8" stroke-width="1.5" />

      <!-- Y-Achsen Labels -->
      <text v-for="gl in gridH" :key="'yl'+gl.z"
        :x="PAD.left - 7" :y="gl.sy + 4"
        text-anchor="end" font-size="10.5" fill="#64748b">{{ gl.label }}</text>

      <!-- X-Achsen Labels -->
      <text v-for="gl in gridV" :key="'xl'+gl.x"
        :x="gl.sx" :y="svgH - PAD.bottom + 16"
        text-anchor="middle" font-size="10.5" fill="#64748b">{{ gl.label }}</text>

      <!-- Achsentitel -->
      <text :x="13" :y="PAD.top + plotH / 2" text-anchor="middle" font-size="11" fill="#94a3b8"
        :transform="`rotate(-90, 13, ${PAD.top + plotH / 2})`">Höhe (m)</text>
      <text :x="PAD.left + plotW / 2" :y="svgH - 4" text-anchor="middle" font-size="11" fill="#94a3b8">
        Abstand (m)
      </text>

      <!-- BUK/BOK/WSP Beschriftungen rechts -->
      <g v-if="store.bukProfile.length >= 2" font-size="11" fill="#d97706">
        <text :x="PAD.left + plotW + 5" :y="wy(bukMinZ) + 4">BUK {{ bukMinZ.toFixed(2) }}m</text>
      </g>
      <g v-if="store.bokProfile.length >= 2" font-size="11" fill="#7c3aed">
        <text :x="PAD.left + plotW + 5" :y="wy(bokMaxZ) - 2">BOK {{ bokMaxZ.toFixed(2) }}m</text>
      </g>

      <!-- kSt-Zonen Labels -->
      <g v-for="zone in kstBands" :key="'kl'+zone.id">
        <text :x="(zone.svgX1 + zone.svgX2) / 2" :y="PAD.top + plotH - 5"
          text-anchor="middle" font-size="10" :fill="zone.inactive ? '#94a3b8' : zone.color" font-weight="600">
          {{ zone.label }} {{ zone.inactive ? '· Totwasser' : 'kSt=' + zone.kst }}
        </text>
      </g>

      <!-- Zonen-Labels im Profil -->
      <g v-if="z1LabelPos" text-anchor="middle" font-weight="600" clip-path="url(#plot-area-clip)">
        <text :x="z1LabelPos.x" :y="z1LabelPos.y" font-size="12" fill="#1e3a5f">
          Zone 1 · {{ store.currentResult.isSubmerged ? 'Orifice' : 'Manning' }}
        </text>
        <text :x="z1LabelPos.x" :y="z1LabelPos.y + 16" font-size="11" fill="#1e3a5f">
          {{ store.currentResult.Q1_total.toFixed(2) }} m³/s
        </text>
      </g>
      <g v-if="z2LabelPos" text-anchor="middle" font-weight="600" clip-path="url(#plot-area-clip)">
        <text :x="z2LabelPos.x" :y="z2LabelPos.y" font-size="12" fill="#064e3b">Zone 2 · Poleni</text>
        <text :x="z2LabelPos.x" :y="z2LabelPos.y + 16" font-size="11" fill="#064e3b">
          {{ store.currentResult.Q2_total.toFixed(2) }} m³/s
        </text>
      </g>

      <!-- Validierungs-Marker (Kreuzpunkte) -->
      <g clip-path="url(#plot-area-clip)">
        <!-- Fehler-Kreuzpunkte: rote senkrechte Linie + Raute oben -->
        <g v-for="(m, i) in allErrorMarkers" :key="'em'+i">
          <line
            :x1="wx(m.x)" :y1="PAD.top"
            :x2="wx(m.x)" :y2="PAD.top + plotH"
            stroke="#ef4444" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.85" />
          <polygon
            :points="`${wx(m.x)},${PAD.top + 2} ${wx(m.x)-7},${PAD.top + 14} ${wx(m.x)+7},${PAD.top + 14}`"
            fill="#ef4444" opacity="0.9" />
          <text :x="wx(m.x)" :y="PAD.top + 27"
            text-anchor="middle" font-size="9.5" fill="#b91c1c" font-weight="700">
            ✕ x={{ m.x.toFixed(2) }}
          </text>
        </g>
        <!-- Warn-Kreuzpunkte: orange gestrichelt + Dreieck -->
        <g v-for="(m, i) in allWarningMarkers" :key="'wm'+i">
          <line
            :x1="wx(m.x)" :y1="PAD.top"
            :x2="wx(m.x)" :y2="PAD.top + plotH"
            stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.7" />
          <polygon
            :points="`${wx(m.x)},${PAD.top + 4} ${wx(m.x)-6},${PAD.top + 14} ${wx(m.x)+6},${PAD.top + 14}`"
            fill="#f59e0b" opacity="0.85" />
        </g>
      </g>

      <!-- Profil-Punkte (alle Layer) -->
      <g clip-path="url(#plot-area-clip)">
        <g v-for="layer in LAYERS" :key="'pts-'+layer.id">
          <circle v-for="(pt, i) in getLayerPoints(layer.id)" :key="i"
            :cx="wx(pt.x)" :cy="wy(pt.z)" :r="activeLayer === layer.id ? 7 : 5"
            :fill="layer.color" :stroke="activeLayer === layer.id ? 'white' : 'rgba(255,255,255,0.6)'"
            :stroke-width="activeLayer === layer.id ? 2 : 1.5"
            :opacity="activeLayer === layer.id ? 1 : 0.4"
            :style="{ cursor: activeLayer === layer.id ? 'grab' : 'default', pointerEvents: activeLayer === layer.id ? 'all' : 'none' }"
            @mousedown.stop="startDragPoint($event, layer.id, i)" />
        </g>
      </g>

      <!-- Segment Hover-Tooltip -->
      <g v-if="hoverSegmentInfo && !dragState" pointer-events="none"
         :transform="`translate(${tooltipPos.x}, ${tooltipPos.y})`">
        <rect x="0" y="0" :width="TOOLTIP_W" height="72" rx="5"
          fill="white" stroke="#e2e8f0" stroke-width="1"
          style="filter: drop-shadow(0 1px 4px rgba(0,0,0,0.13))" />
        <rect x="0" y="0" :width="TOOLTIP_W" height="20" rx="5"
          :fill="hoverSegmentInfo.headerColor" />
        <rect x="0" y="15" :width="TOOLTIP_W" height="5"
          :fill="hoverSegmentInfo.headerColor" />
        <text x="7" y="13.5" font-size="9.5" font-weight="700" fill="white">
          {{ hoverSegmentInfo.typeLabel }}
        </text>
        <text x="7" y="30" font-size="9" fill="#374151">
          A = {{ hoverSegmentInfo.A }} m²
        </text>
        <text x="7" y="42" font-size="9" fill="#374151">
          P = {{ hoverSegmentInfo.P }} m (benetzt)
        </text>
        <text x="7" y="54" font-size="9" fill="#374151">
          h_max = {{ hoverSegmentInfo.maxH }} m
        </text>
        <text x="7" y="66" font-size="9"
          :fill="hoverSegmentInfo.isClosed ? '#059669' : '#64748b'">
          {{ hoverSegmentInfo.isClosed ? '⊠ geschlossen · BUK' : '〜 offen · Freispiegel' }}
        </text>
      </g>
    </svg>
    </div><!-- /bpe-svg-wrap -->

    <!-- Klick-Info: Flächen-Details -->
    <div v-if="clickedSeg" class="seg-info-card" :class="`seg-type-${clickedSeg.type}`">
      <div class="seg-info-header">
        <span class="seg-info-badge" :style="{ background: SEG_HEADER_COLORS[clickedSeg.type] }"></span>
        <span class="seg-info-type">{{ SEG_TYPE_LABELS[clickedSeg.type] }}</span>
        <button class="seg-info-close" @click="clickedSeg = null">✕</button>
      </div>
      <div class="seg-info-body">
        <div class="seg-info-row"><span>x-Bereich</span><strong>{{ clickedSeg.xLeft.toFixed(2) }} … {{ clickedSeg.xRight.toFixed(2) }} m</strong></div>
        <div class="seg-info-row"><span>Fläche A</span><strong>{{ clickedSeg.A.toFixed(3) }} m²</strong></div>
        <div class="seg-info-row"><span>Ben. Umfang P</span><strong>{{ clickedSeg.P.toFixed(3) }} m</strong></div>
        <div class="seg-info-row"><span>max. Tiefe</span><strong>{{ clickedSeg.maxH.toFixed(3) }} m</strong></div>
        <div class="seg-info-row"><span>Geometrie</span><strong>{{ clickedSeg.isClosed ? 'geschlossen (BUK-Deckel)' : 'offen (Freispiegel)' }}</strong></div>
        <div class="seg-info-row"><span>Hydraulik</span><strong>{{ clickedSeg.type === 'floodplain' ? 'Manning-Strickler' : 'Orifice-Öffnungsanteil' }}</strong></div>
      </div>
      <div v-if="clickedSeg.type === 'island'" class="seg-info-warning">
        ⚠ Inselpolygon: Diese Fläche grenzt nicht an die Einlauf- oder Auslaufkante der Brücke und kann hydraulisch nicht durchströmt werden — wird dennoch zur Orifice-Öffnungsfläche A gerechnet. Geländeprofil im Brückenbereich prüfen.
      </div>
    </div>

    <!-- Interaktionshinweis + Legende -->
    <div class="profile-footer">
      <div class="profile-legend">
        <span class="leg-item"><span class="leg-sw" style="background:#3b82f6;opacity:0.55"></span>Hauptöffnung</span>
        <span class="leg-item"><span class="leg-sw" style="background:#60a5fa;opacity:0.55"></span>Seitenöffnung</span>
        <span class="leg-item"><span class="leg-sw" style="background:#f59e0b;opacity:0.65"></span>Inselpolygon</span>
        <span class="leg-item"><span class="leg-sw" style="background:#93c5fd;opacity:0.55"></span>Vorland</span>
        <span class="leg-item"><span class="leg-sw" style="background:#14b8a6;opacity:0.55"></span>Zone 2</span>
        <span class="leg-item"><span class="leg-sw" style="background:#64748b"></span>Brücke</span>
        <span class="leg-item" v-for="l in LAYERS" :key="l.id">
          <span class="leg-dot" :style="{ background: l.color }"></span>{{ l.label }}
        </span>
      </div>
      <span class="interact-hint">Scroll: Zoom · Mitte/Ctrl+Klick: Pan · Klick auf Wasser: Flächen-Info · Rechtsklick: Punkt löschen</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBridgeStore } from '../stores/useBridgeStore.js'
import { useBridgeHydraulics } from '../composables/useBridgeHydraulics.js'
import { useBridgeRenderer } from '../composables/useBridgeRenderer.js'
import { useBridgeValidation } from '../composables/useBridgeValidation.js'
import { useProfileInteraction } from '../composables/useProfileInteraction.js'
import BridgePrintModal from './BridgePrintModal.vue'
import BridgeValidationPanel from './BridgeValidationPanel.vue'
import BridgeHydraulicsInfoModal from './BridgeHydraulicsInfoModal.vue'

const store = useBridgeStore()
const { interpZ, interpBridgeZ } = useBridgeHydraulics()
const { buildZ2Vertices } = useBridgeRenderer()
const { allErrorMarkers, allWarningMarkers } = useBridgeValidation()

const {
  svgEl, svgContainerEl, svgW, svgH, PAD, plotW, plotH,
  vX0, vW, vZ0, vH, zoomLevel, worldHalfW, resetView,
  wx, wy,
  gridH, gridV,
  LAYERS, activeLayer, activeLayerMeta, getLayerPoints,
  bukDrawPts, bokDrawPts, z1Segments,
  dragState, hoverSegIdx, mouseSvgPos, clickedSeg,
  onWheel, onSvgMouseDown, onSvgMouseMove, endDrag, onSvgClick, onSvgRightClick,
  startDragWSP, startDragPoint, startDragKstBound,
  isExpanded, windowStyle, toggleExpand, collapseWindow, startWinDrag, startWinResize,
} = useProfileInteraction()

const showPrintModal = ref(false)
const showInfoModal  = ref(false)

// ─── Segment styles ────────────────────────────────────────────────────────────
const SEG_STYLES = {
  main:       { fill: '#3b82f6', fillOpacity: 0.38, stroke: '#2563eb' },
  side:       { fill: '#60a5fa', fillOpacity: 0.32, stroke: '#3b82f6' },
  island:     { fill: '#f59e0b', fillOpacity: 0.52, stroke: '#d97706' },
  floodplain: { fill: '#93c5fd', fillOpacity: 0.24, stroke: '#60a5fa' },
}
const SEG_TYPE_LABELS = {
  main:       'Hauptöffnung',
  side:       'Seitenöffnung',
  island:     'Inselpolygon ⚠',
  floodplain: 'Vorland',
}
const SEG_HEADER_COLORS = {
  main:       '#2563eb',
  side:       '#3b82f6',
  island:     '#d97706',
  floodplain: '#475569',
}
const TOOLTIP_W = 152

// ─── SVG-Pfade ─────────────────────────────────────────────────────────────────
const terrainPathSvg = computed(() => {
  const pts = store.terrainPoints
  if (pts.length < 2) return ''
  return 'M ' + pts.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
})

const bukPathSvg = computed(() => {
  const pts = bukDrawPts.value
  if (pts.length < 2) return ''
  return 'M ' + pts.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
})

const bokPathSvg = computed(() => {
  const pts = bokDrawPts.value
  if (pts.length < 2) return ''
  return 'M ' + pts.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
})

const bridgeFillPath = computed(() => {
  const buk = bukDrawPts.value, bok = bokDrawPts.value
  if (buk.length < 2 || bok.length < 2) return ''
  const bokStr = bok.map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
  const bukRev = [...buk].reverse().map(p => `${wx(p.x).toFixed(1)},${wy(p.z).toFixed(1)}`).join(' L ')
  return `M ${bokStr} L ${bukRev} Z`
})

const waterZ2Path = computed(() => {
  const segs = buildZ2Vertices(
    store.terrainPoints,
    store.bokProfile.length >= 2 ? store.bokProfile : null,
    store.wsp,
  )
  if (segs.length < 2) return ''
  const bot = segs.map((s, i) => `${i === 0 ? 'M' : 'L'} ${wx(s.x).toFixed(1)},${wy(s.zBot).toFixed(1)}`).join(' ')
  const top = [...segs].reverse().map(s => `L ${wx(s.x).toFixed(1)},${wy(s.zTop).toFixed(1)}`).join(' ')
  return `${bot} ${top} Z`
})

// ─── Zone-1 per-segment paths + hover ─────────────────────────────────────────
function buildSegPath(seg) {
  const verts = seg.vertices
  if (verts.length < 2) return ''
  const bot = verts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${wx(v.x).toFixed(1)},${wy(v.zBot).toFixed(1)}`).join(' ')
  const top = [...verts].reverse().map(v => `L ${wx(v.x).toFixed(1)},${wy(v.zTop).toFixed(1)}`).join(' ')
  return `${bot} ${top} Z`
}

const z1SegmentPaths = computed(() =>
  z1Segments.value.map((seg, i) => ({
    path: buildSegPath(seg),
    segIdx: i,
    ...(SEG_STYLES[seg.type] || SEG_STYLES.floodplain),
    type: seg.type,
  })).filter(s => s.path)
)

const hoverSegmentInfo = computed(() => {
  if (hoverSegIdx.value === null) return null
  const seg = z1Segments.value[hoverSegIdx.value]
  if (!seg) return null
  return {
    typeLabel:   SEG_TYPE_LABELS[seg.type] || seg.type,
    headerColor: SEG_HEADER_COLORS[seg.type] || '#64748b',
    A:    seg.A.toFixed(3),
    P:    seg.P.toFixed(3),
    maxH: seg.maxH.toFixed(3),
    isClosed: seg.isClosed,
  }
})

const tooltipPos = computed(() => {
  if (!mouseSvgPos.value) return { x: 0, y: 0 }
  let tx = mouseSvgPos.value.x + 12
  let ty = mouseSvgPos.value.y - 34
  if (tx + TOOLTIP_W > svgW.value - 4) tx = mouseSvgPos.value.x - TOOLTIP_W - 8
  if (ty < PAD.top + 2) ty = PAD.top + 2
  if (ty + 72 > svgH.value - PAD.bottom) ty = svgH.value - PAD.bottom - 74
  return { x: tx, y: ty }
})

// ─── kSt-Zonen als farbige Bereiche ───────────────────────────────────────────
const kstBands = computed(() => {
  const hw = worldHalfW.value
  return store.kstZones.map(z => {
    const xL = z.xLeft  == null ? -hw : z.xLeft
    const xR = z.xRight == null ?  hw : z.xRight
    return {
      id: z.id, kst: z.kst, color: z.color, label: z.label,
      inactive: !!z.inactive,
      svgX1: Math.max(PAD.left, wx(xL)),
      svgX2: Math.min(PAD.left + plotW.value, wx(xR)),
      hasLeft:  z.xLeft  != null,
      hasRight: z.xRight != null,
    }
  }).filter(z => z.svgX2 > z.svgX1)
})

// ─── Labels ────────────────────────────────────────────────────────────────────
const bukMinZ = computed(() => store.bukProfile.length ? Math.min(...store.bukProfile.map(p => p.z)) : 0)
const bokMaxZ = computed(() => store.bokProfile.length ? Math.max(...store.bokProfile.map(p => p.z)) : 0)

const z1LabelPos = computed(() => {
  const terrain = store.terrainPoints
  if (!terrain.length) return null
  const h = Math.min(store.wsp, bukMinZ.value)
  if (h < 0.3) return null
  const xm  = (terrain[0].x + terrain[terrain.length - 1].x) / 2
  const gz  = interpZ(terrain, xm)
  const midZ = gz + (h - gz) * 0.45
  if (midZ >= h - 0.2) return null
  return { x: wx(xm), y: wy(midZ) }
})

const z2LabelPos = computed(() => {
  if (!store.currentResult.hasOverflow || store.bokProfile.length < 2) return null
  const boks = store.bokProfile
  const xm     = (boks[0].x + boks[boks.length - 1].x) / 2
  const bokMid = interpBridgeZ(boks, xm)
  if (bokMid >= store.wsp - 0.3) return null
  return { x: wx(xm), y: wy(bokMid + (store.wsp - bokMid) * 0.45) }
})

// ─── Toolbar ───────────────────────────────────────────────────────────────────
function clearActiveLayer() {
  store.clearLayer(activeLayer.value)
}
</script>

<style scoped>
.bridge-profile-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.layer-tabs {
  display: flex;
  gap: 0.3rem;
}

.layer-tab {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.7rem;
  border: 1.5px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 0.82rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}
.layer-tab:hover { background: #f1f5f9; }
.layer-tab.active { background: white; font-weight: 700; }

.layer-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.layer-count {
  font-size: 0.72rem;
  color: #94a3b8;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}

.toolbar-sep {
  width: 1px;
  height: 18px;
  background: #e2e8f0;
  flex-shrink: 0;
}

.tool-btn {
  padding: 0.28rem 0.65rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 0.8rem;
  color: #475569;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.tool-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
.tool-btn:disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }
.tool-btn.danger:hover { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
.tool-btn.info-btn { color: #1d4ed8; border-color: #bfdbfe; background: #eff6ff; }
.tool-btn.info-btn:hover { background: #dbeafe; border-color: #93c5fd; }
.tool-btn.print-btn { color: #475569; }
.tool-btn.undo-btn { font-size: 0.95rem; padding: 0.2rem 0.55rem; }

.view-controls {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.zoom-indicator {
  font-size: 0.72rem;
  color: #94a3b8;
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.profile-svg {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: white;
  user-select: none;
  display: block;
}
.profile-svg.mode-terrain { cursor: crosshair; }
.profile-svg.mode-buk { cursor: crosshair; }
.profile-svg.mode-bok { cursor: crosshair; }
.profile-svg.mode-pan { cursor: grabbing; }
.profile-svg.mode-kst { cursor: col-resize !important; }

.profile-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0 0.2rem;
}

.profile-legend {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: #64748b;
}

.interact-hint {
  font-size: 0.72rem;
  color: #b0bac6;
  font-style: italic;
  white-space: nowrap;
}

.leg-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.leg-sw {
  display: inline-block;
  width: 16px;
  height: 11px;
  border-radius: 3px;
}

.leg-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

/* ─── Fenstermodus ─────────────────────────────────────────────────────────── */
.bridge-profile-editor.bpe-windowed {
  position: fixed;
  z-index: 1000;
  background: white;
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.30), 0 4px 16px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Verhindert Flackern durch neue Stacking-Contexts */
  will-change: transform;
}

.bpe-titlebar {
  display: flex;
  align-items: center;
  padding: 0.4rem 0.6rem 0.4rem 0.9rem;
  background: #1e293b;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  gap: 0.5rem;
}
.bpe-titlebar:active { cursor: grabbing; }
.bpe-title {
  flex: 1;
  font-size: 0.81rem;
  font-weight: 600;
  color: #cbd5e1;
  letter-spacing: 0.01em;
}
.bpe-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.88rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.bpe-close:hover { background: #ef4444; color: white; }

.bpe-svg-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
/* Im Fenstermodus füllt das SVG den gesamten verfügbaren Platz */
.bpe-windowed .profile-svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* Resize-Handles */
.bpe-resize {
  position: absolute;
  z-index: 10;
}
.bpe-resize.n  { top: 0;    left: 10px; right: 10px; height: 5px;  cursor: n-resize; }
.bpe-resize.s  { bottom: 0; left: 10px; right: 10px; height: 5px;  cursor: s-resize; }
.bpe-resize.e  { right: 0;  top: 10px; bottom: 10px; width: 5px;   cursor: e-resize; }
.bpe-resize.w  { left: 0;   top: 10px; bottom: 10px; width: 5px;   cursor: w-resize; }
.bpe-resize.ne { top: 0;    right: 0;  width: 14px; height: 14px;  cursor: ne-resize; }
.bpe-resize.nw { top: 0;    left: 0;   width: 14px; height: 14px;  cursor: nw-resize; }
.bpe-resize.se { bottom: 0; right: 0;  width: 14px; height: 14px;  cursor: se-resize; }
.bpe-resize.sw { bottom: 0; left: 0;   width: 14px; height: 14px;  cursor: sw-resize; }

.tool-btn.expand-btn {
  font-size: 1rem;
  padding: 0.15rem 0.5rem;
}

/* ─── Segment Klick-Info-Karte ─────────────────────────────────────────────── */
.seg-info-card {
  padding: 0.55rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  font-size: 0.81rem;
}
.seg-info-card.seg-type-island {
  border-color: #fbbf24;
  background: #fffbeb;
}
.seg-info-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}
.seg-info-badge {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.seg-info-type {
  font-weight: 700;
  font-size: 0.84rem;
  color: #1e293b;
  flex: 1;
}
.seg-info-card.seg-type-island .seg-info-type { color: #b45309; }
.seg-info-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
  line-height: 1;
}
.seg-info-close:hover { color: #374151; }
.seg-info-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.18rem 0.9rem;
}
.seg-info-row {
  display: contents;
}
.seg-info-row span { color: #64748b; white-space: nowrap; }
.seg-info-row strong { color: #1e293b; text-align: right; font-weight: 600; }
.seg-info-warning {
  margin-top: 0.45rem;
  padding: 0.4rem 0.6rem;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 5px;
  color: #92400e;
  font-size: 0.77rem;
  line-height: 1.45;
}
</style>
