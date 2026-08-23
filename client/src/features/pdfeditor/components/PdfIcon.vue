<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="strokeWidth"
    :absolute-stroke-width="true"
    class="pdfed-icon"
    aria-hidden="true"
  />
</template>

<script setup>
/**
 * PdfIcon — das einzige Icon-Tor des PDF-Editors (Muster CdeIcon).
 *
 * Aufrufer nennen die BEDEUTUNG (`name="stift"`), nicht das Bild. Der Editor
 * ist strikt emoji-frei: unbekannte Namen fallen sichtbar auf ein Fragezeichen
 * zurück (CircleHelp) — nie auf ein Emoji, nie auf Unsichtbarkeit.
 */
import { computed } from 'vue';
import {
  // Dokumente / Dateien
  FileText, FolderOpen, Upload, Download, Printer, Share2, Save,
  // Navigation / Ansicht
  ZoomIn, ZoomOut, MoveHorizontal, Maximize, ArrowLeft, Hand,
  SunMoon, X, Check, Plus, Minus, ChevronRight, ChevronDown, MoreHorizontal, AppWindow,
  // Werkzeuge (Stufe 2+)
  Pen, Pencil, PenLine, Highlighter, Eraser, Lasso, MousePointer2, Type,
  TextCursor, MessageSquare, Signature, Ruler, PencilRuler, PenTool, Shapes, Palette, Stamp,
  RectangleVertical, RectangleHorizontal, Layers, Eye, EyeOff,
  // Messen / Kalibrieren
  Scaling, Pentagon,
  // Verlauf / Aktionen
  Undo2, Redo2, Trash2, Copy, Settings2, Pointer, Fingerprint,
  // Status
  Info, TriangleAlert, CircleHelp, Clock, Loader2,
} from 'lucide-vue-next';

const ICONS = {
  // ── Dokumente ──
  'dokument':      FileText,
  'oeffnen':       FolderOpen,
  'hochladen':     Upload,
  'herunterladen': Download,
  'drucken':       Printer,
  'teilen':        Share2,
  'speichern':     Save,

  // ── Navigation / Ansicht ──
  'zoom-plus':     ZoomIn,
  'zoom-minus':    ZoomOut,
  'breite':        MoveHorizontal,
  'vollbild':      Maximize,
  'zurueck':       ArrowLeft,
  'hand':          Hand,
  'thema':         SunMoon,
  'schliessen':    X,
  'ok':            Check,
  'plus':          Plus,
  'minus':         Minus,
  'chevron-rechts': ChevronRight,
  'chevron-unten': ChevronDown,
  'mehr':          MoreHorizontal,
  'neues-fenster': AppWindow,

  // ── Werkzeuge ──
  'stift':         Pen,
  'bleistift':     Pencil,
  'filzstift':     PenLine,
  'textmarker':    Highlighter,
  'radierer':      Eraser,
  'lasso':         Lasso,
  'auswahl':       MousePointer2,
  'text':          Type,
  'textfeld':      Type,
  // I-Beam statt TextSelect: das gestrichelte Kästchen wurde als
  // „Textfeld einfügen" gelesen (Office-Konvention) — genau die
  // Verwechslung, die das Textfeld-Werkzeug „kaputt" erscheinen ließ.
  'text-markieren': TextCursor,
  'kommentar':     MessageSquare,
  'signatur':      Signature,
  'stempel':       Stamp,
  'messen':        Ruler,
  'lineal':        PencilRuler,
  'flaeche':       Pentagon,
  'kalibrieren':   Scaling,
  'stift-werkzeug': PenTool,
  'formen':        Shapes,
  'farbe':         Palette,
  'hochformat':    RectangleVertical,
  'querformat':    RectangleHorizontal,
  'ebenen':        Layers,
  'visible':       Eye,
  'hidden':        EyeOff,

  // ── Eingabe ──
  'finger':        Pointer,
  'nur-stift':     Fingerprint,

  // ── Aktionen ──
  'undo':          Undo2,
  'redo':          Redo2,
  'loeschen':      Trash2,
  'kopieren':      Copy,
  'einstellungen': Settings2,

  // ── Status ──
  'info':          Info,
  'warnung':       TriangleAlert,
  'zuletzt':       Clock,
  'laedt':         Loader2,
};

const props = defineProps({
  name:        { type: String,  required: true },
  size:        { type: [Number, String], default: 18 },
  strokeWidth: { type: [Number, String], default: 1.75 },
});

const icon = computed(() => ICONS[props.name] ?? CircleHelp);

/** Für Tests/Registry: gibt es dieses Icon? */
defineExpose({ has: (n) => n in ICONS });
</script>

<style scoped>
.pdfed-icon {
  display: block;
  flex-shrink: 0;
}
</style>
