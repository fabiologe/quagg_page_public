<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="strokeWidth"
    :absolute-stroke-width="true"
    class="prj-icon"
    aria-hidden="true"
  />
</template>

<script setup>
/**
 * ProjektIcon — das einzige Icon-Tor des Cockpits (Muster PedantIcon).
 * Aufrufer nennen die BEDEUTUNG; unbekannte Namen fallen sichtbar auf ein
 * Fragezeichen zurück — nie auf ein Emoji.
 */
import { computed } from 'vue';
import {
  FolderKanban, Folder, FolderOpen, Plus, X, Check, CircleHelp, Loader2, RefreshCw,
  TriangleAlert, CircleX, Calendar, CalendarClock, Users, Building2, Landmark,
  FileText, File, ArrowRightLeft, Pencil, Trash2, Search, ClipboardList, Inbox,
  ChevronRight, Home, Layers, Coins, Clock, ListChecks, Box, Mail, BookOpen,
  Download, ExternalLink, Save, ScrollText, Receipt, Send, BarChart3, Table2, Upload,
} from 'lucide-vue-next';

const ICONS = {
  'projekte':      FolderKanban,
  'ordner':        Folder,
  'ordner-offen':  FolderOpen,
  'plus':          Plus,
  'schliessen':    X,
  'ok':            Check,
  'laden':         Loader2,
  'aktualisieren': RefreshCw,
  'warnung':       TriangleAlert,
  'fehler':        CircleX,
  'datum':         Calendar,
  'termin':        CalendarClock,
  'beteiligte':    Users,
  'firma':         Building2,
  'behoerde':      Landmark,
  'pdf':           FileText,
  'datei':         File,
  'verschieben':   ArrowRightLeft,
  'bearbeiten':    Pencil,
  'loeschen':      Trash2,
  'suche':         Search,
  'akte':          ClipboardList,
  'leer':          Inbox,
  'weiter':        ChevronRight,
  'start':         Home,
  'leistung':      Layers,
  'geld':          Coins,
  'zeit':          Clock,
  'aufgaben':      ListChecks,
  'modelle':       Box,
  'mail':          Mail,
  'dossier':       BookOpen,
  'herunterladen': Download,
  'extern':        ExternalLink,
  'speichern':     Save,
  'rechnung':      ScrollText,
  'beleg':         Receipt,
  'stellen':       Send,
  'diagramm':      BarChart3,
  'tabelle':       Table2,
  'hochladen':     Upload,
};

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 1.75 },
});

const icon = computed(() => ICONS[props.name] || CircleHelp);
</script>

<style scoped>
.prj-icon {
  flex-shrink: 0;
  vertical-align: -0.125em;
}
</style>
