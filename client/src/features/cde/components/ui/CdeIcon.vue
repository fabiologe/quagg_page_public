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
  Mountain, Waypoints, TrendingDown, Spline, Compass, Route, Slash,
  // Dateien / Export
  FileText, FileCode2, FileSpreadsheet, Download, Upload, Camera, Save,
  // Projekt / CDE
  Boxes, FolderOpen, Building2, UserRound, ClipboardList, Settings2,
  // Allgemein
  Plus, X, Check, Trash2, RotateCw, Copy, Share2, Info, TriangleAlert,
  ChevronRight, ChevronDown, ChevronUp, PanelLeft, PanelRight, ListTree, Filter,
  Undo2, Redo2, CircleHelp, Pencil, SendHorizontal, LoaderCircle, Play, History,
  Eraser, Type, PencilRuler, Waves, LandPlot, Shapes, Shovel, Layers2,
  MousePointer2, Image, Zap, CircleX, CircleAlert, Map, PenTool, HardHat,
  // Bauwerksstruktur (Raumhierarchie)
  Globe, SquareStack, SquareDashed, Box,
  // IFC-Kategorien (Ebenen-Liste)
  BrickWall, Square, Columns3, Minus, Frame, DoorOpen, Cylinder, Wind,
  House, ChevronsUp, Anchor, Sofa, Fence, Grid2x2, Cog, Droplets,
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
  'chevron-up':   ChevronUp,
  'panel-left':   PanelLeft,
  'panel-right':  PanelRight,
  'tree':         ListTree,
  'filter':       Filter,
  'undo':         Undo2,
  'redo':         Redo2,
  // Teil XII: der Versionsverlauf — Commits, wie git es zeigt.
  'verlauf':      History,
  // X4 — ein Icon, eine Bedeutung: die Kollisionen der Inventur bekommen
  // eigene Zeichen (Ruler bleibt der Familie „Maß/Messen" vorbehalten,
  // X nur dem Schliessen, Trash2 dem Entfernen).
  'radierer':     Eraser,
  'text':         Type,
  'karte':        Map,
  'bemassen':     PencilRuler,
  'route':        Route,
  'gerinne':      Waves,
  'planum':       LandPlot,
  // Erdbau (E1): die drei Handlungen tragen eigene Zeichen — „ausheben" und
  // „auffüllen" sind entgegengesetzt und dürfen nicht dasselbe Bild haben.
  'ausheben':     Shovel,
  'auffuellen':   Layers2,
  // Teil XX: die Böschung an einer Kante — ein schräger Strich, keine Fläche.
  'boeschung':    Slash,
  'schacht':      Cylinder,
  // Bauform-Auslegung: „als welche FORM lese ich dieses Bauteil?"
  'bauform':      Shapes,
  'edit':         Pencil,
  'send':         SendHorizontal,
  'busy':         LoaderCircle,
  'open':         Play,
  'pointer':      MousePointer2,
  'image':        Image,
  'billed':       Zap,
  'overview':     Map,
  'vector':       PenTool,
  'bim':          HardHat,

  // ── Ampel (IDS-Prüfung, Statuszeilen) ──
  // Eigene Namen statt farbiger Kreis-Emoji: die Farbe kommt aus der CSS-Klasse,
  // die FORM trägt die Bedeutung auch ohne Farbe (Barrierefreiheit).
  'status-error': CircleX,
  'status-warn':  CircleAlert,
  'status-ok':    CircleCheck,

  // ── Bauwerksstruktur (IfcSpatialTree) ──
  'site':         Globe,
  'building':     Building2,
  'storey':       SquareStack,
  'space':        SquareDashed,
  'element':      Box,

  // ── IFC-Kategorien (IfcLayerPanel) ──
  // Bewusst grob: eine Handvoll erkennbarer Silhouetten schlägt 40 kaum
  // unterscheidbare Piktogramme. Unbekanntes fällt auf 'element'.
  'cat-wall':        BrickWall,
  'cat-slab':        Square,
  'cat-column':      Columns3,
  'cat-beam':        Minus,
  'cat-window':      Frame,
  'cat-door':        DoorOpen,
  'cat-pipe':        Cylinder,
  'cat-duct':        Wind,
  'cat-roof':        House,
  'cat-stair':       ChevronsUp,
  'cat-footing':     Anchor,
  'cat-furniture':   Sofa,
  'cat-railing':     Fence,
  'cat-curtainwall': Grid2x2,
  'cat-equipment':   Cog,
  'cat-flow':        Droplets,
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
  'chevron-right', 'chevron-down', 'chevron-up', 'panel-left', 'panel-right', 'tree', 'filter',
  'undo', 'redo', 'verlauf', 'edit', 'send', 'busy', 'open', 'pointer', 'image', 'billed',
  'radierer', 'text', 'karte', 'bemassen', 'route', 'gerinne', 'planum', 'schacht', 'bauform',
  'ausheben', 'auffuellen', 'boeschung',
  'overview', 'vector', 'bim',
  'status-error', 'status-warn', 'status-ok',
  'site', 'building', 'storey', 'space', 'element',
  'cat-wall', 'cat-slab', 'cat-column', 'cat-beam', 'cat-window', 'cat-door',
  'cat-pipe', 'cat-duct', 'cat-roof', 'cat-stair', 'cat-footing',
  'cat-furniture', 'cat-railing', 'cat-curtainwall', 'cat-equipment', 'cat-flow',
];
</script>

<style scoped>
.cde-icon {
  display: block;
  flex-shrink: 0;
}
</style>
