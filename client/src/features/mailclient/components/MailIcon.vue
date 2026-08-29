<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="strokeWidth"
    :absolute-stroke-width="true"
    class="mail-icon"
    aria-hidden="true"
  />
</template>

<script setup>
/**
 * MailIcon — das einzige Icon-Tor des Mail-Clients (Muster PdfIcon).
 * Aufrufer nennen die BEDEUTUNG, nicht das Bild. Emoji-frei; unbekannte Namen
 * fallen sichtbar auf ein Fragezeichen zurück.
 */
import { computed } from 'vue'
import {
  Inbox, Send, ShieldAlert, FolderInput, Mail, MailOpen, Paperclip, Reply, ReplyAll,
  Pencil, Settings2, RefreshCw, Search, X, Check, Plus, Trash2, Download, FileText,
  File, FileArchive, FileImage, FileSpreadsheet, ChevronDown, Loader2, TriangleAlert,
  Info, Sun, Moon, ArrowLeft, Image, CircleHelp, ExternalLink, FolderOpen, Users,
  Clock, LayoutDashboard, Building2, Ban,
} from 'lucide-vue-next'

const ICONS = {
  // Ordner
  'posteingang':   Inbox,
  'gesendet':      Send,
  'quarantaene':   ShieldAlert,
  'zuweisen':      FolderInput,
  // Mail-Zustände
  'ungelesen':     Mail,
  'gelesen':       MailOpen,
  'anhang':        Paperclip,
  // Aktionen
  'antworten':     Reply,
  'allen':         ReplyAll,
  'verfassen':     Pencil,
  'senden':        Send,
  'einstellungen': Settings2,
  'aktualisieren': RefreshCw,
  'suche':         Search,
  'schliessen':    X,
  'ok':            Check,
  'plus':          Plus,
  'loeschen':      Trash2,
  'herunterladen': Download,
  'extern':        ExternalLink,
  'zurueck':       ArrowLeft,
  'bilder':        Image,
  'projekt':       FolderOpen,
  'personen':      Users,
  'zeit':          Clock,
  'dashboard':     LayoutDashboard,
  'firma':         Building2,
  'gesperrt':      Ban,
  // Dateitypen
  'datei':         File,
  'datei-text':    FileText,
  'datei-archiv':  FileArchive,
  'datei-bild':    FileImage,
  'datei-tabelle': FileSpreadsheet,
  // Status
  'mehr':          ChevronDown,
  'laedt':         Loader2,
  'warnung':       TriangleAlert,
  'info':          Info,
  'hell':          Sun,
  'dunkel':        Moon,
}

const props = defineProps({
  name:        { type: String, required: true },
  size:        { type: [Number, String], default: 18 },
  strokeWidth: { type: [Number, String], default: 1.75 },
})

const icon = computed(() => ICONS[props.name] ?? CircleHelp)

defineExpose({ has: (n) => n in ICONS })
</script>

<style scoped>
.mail-icon {
  display: block;
  flex-shrink: 0;
}
</style>
