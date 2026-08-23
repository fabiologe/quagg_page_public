<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="strokeWidth"
    :absolute-stroke-width="true"
    class="cde-icon"
    aria-hidden="true"
  />
</template>

<script setup>
/**
 * CdeIcon — das einzige Icon-Tor der CDE (Sprint U, AP-U1).
 *
 * Aufrufer nennen die BEDEUTUNG (`name="section"`), nicht das Bild. Dadurch
 * bleibt der Icon-Satz austauschbar und die Sprache im Code fachlich:
 * `<CdeIcon name="laengsschnitt" />` statt eines Emoji-Zeichens, dessen
 * Darstellung je nach Betriebssystem variiert.
 *
 * Unbekannte Namen fallen sichtbar auf ein Fragezeichen zurück (statt still zu
 * verschwinden) — Tippfehler fallen so beim ersten Blick auf.
 */
import { computed } from 'vue';
import {
  // Kamera / Ansichten
  Maximize, ArrowDownToLine, RectangleHorizontal, RectangleVertical, Home,
  // Werkzeuge
  Layers, Scissors, MapPin, Ruler, Bookmark, MessageSquare, Keyboard,
  Search, Command, Crosshair, Focus, Eye, EyeOff, Locate,
  // Planung / Auswertung
  ChartColumn, LayoutGrid, Tag, Package, Hash, Euro, Wallet, CircleCheck,
  Palette, SlidersHorizontal, Table,
  // Tiefbau
  Mountain, Waypoints, TrendingDown, Spline, Compass, Route,
  // Dateien / Export
  FileText, FileCode2, FileSpreadsheet, Download, Upload, Camera, Save,
  // Projekt / CDE
  Boxes, FolderOpen, Building2, UserRound, ClipboardList, Settings2,
  // Allgemein
  Plus, X, Check, Trash2, RotateCw, Copy, Share2, Info, TriangleAlert,
  ChevronRight, ChevronDown, PanelLeft, PanelRight, ListTree, Filter,
  Undo2, Redo2, CircleHelp,
} from 'lucide-vue-next';

const ICONS = {
  // ── Kamera / Ansichten ──
  'fit':          Maximize,
  'view-top':     ArrowDownToLine,
  'view-front':   RectangleHorizontal,
  'view-side':    RectangleVertical,
  'view-reset':   Home,

  // ── Werkzeuge ──
  'layers':       Layers,
  'section':      Scissors,
  'coords':       MapPin,
  'measure':      Ruler,
  'views':        Bookmark,
  'issues':       MessageSquare,
  'help':         Keyboard,
  'search':       Search,
  'command':      Command,
  'zoom-to':      Crosshair,
  'isolate':      Focus,
  'visible':      Eye,
  'hidden':       EyeOff,
  'locate':       Locate,

  // ── Planung / Auswertung ──
  'cockpit':      ChartColumn,
  'areas':        LayoutGrid,
  'kg':           Tag,
  'volume':       Package,
  'count':        Hash,
  'kosten':       Euro,
  'pauschal':     Wallet,
  'quality':      CircleCheck,
  'style':        Palette,
  'settings':     SlidersHorizontal,
  'table':        Table,

  // ── Tiefbau ──
  'terrain':      Mountain,
  'haltung':      Waypoints,
  'laengsschnitt': TrendingDown,
  'querprofil':   Spline,
  'north':        Compass,
  'trasse':       Route,

  // ── Dateien / Export ──
  'export':       FileText,
  'dxf':          FileCode2,
  'excel':        FileSpreadsheet,
  'download':     Download,
  'upload':       Upload,
  'snapshot':     Camera,
  'save':         Save,

  // ── Projekt / CDE ──
  'cde':          Boxes,
  'documents':    FolderOpen,
  'project':      Building2,
  'user':         UserRound,
  'register':     ClipboardList,
  'stammdaten':   Settings2,

  // ── Allgemein ──
  'add':          Plus,
  'close':        X,
  'check':        Check,
  'delete':       Trash2,
  'refresh':      RotateCw,
  'copy':         Copy,
  'share':        Share2,
  'info':         Info,
  'warn':         TriangleAlert,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'panel-left':   PanelLeft,
  'panel-right':  PanelRight,
  'tree':         ListTree,
  'filter':       Filter,
  'undo':         Undo2,
  'redo':         Redo2,
};

const props = defineProps({
  name:        { type: String,  required: true },
  size:        { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 1.75 },
});

const icon = computed(() => ICONS[props.name] ?? CircleHelp);

/** Für Tests/Registry: gibt es dieses Icon? */
defineExpose({ has: (n) => n in ICONS });
</script>

<script>
export const ICON_NAMES = [
  'fit', 'view-top', 'view-front', 'view-side', 'view-reset',
  'layers', 'section', 'coords', 'measure', 'views', 'issues', 'help',
  'search', 'command', 'zoom-to', 'isolate', 'visible', 'hidden', 'locate',
  'cockpit', 'areas', 'kg', 'volume', 'count', 'kosten', 'pauschal', 'quality',
  'style', 'settings', 'table',
  'terrain', 'haltung', 'laengsschnitt', 'querprofil', 'north', 'trasse',
  'export', 'dxf', 'excel', 'download', 'upload', 'snapshot', 'save',
  'cde', 'documents', 'project', 'user', 'register', 'stammdaten',
  'add', 'close', 'check', 'delete', 'refresh', 'copy', 'share', 'info', 'warn',
  'chevron-right', 'chevron-down', 'panel-left', 'panel-right', 'tree', 'filter',
  'undo', 'redo',
];
</script>

<style scoped>
.cde-icon {
  display: block;
  flex-shrink: 0;
}
</style>
