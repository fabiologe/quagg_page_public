<template>
  <component
    :is="icon"
    :size="size"
    :stroke-width="strokeWidth"
    :absolute-stroke-width="true"
    class="ped-icon"
    aria-hidden="true"
  />
</template>

<script setup>
/**
 * PedantIcon — das einzige Icon-Tor des Pedanten (Muster PdfIcon/CdeIcon).
 * Aufrufer nennen die BEDEUTUNG, nicht das Bild; unbekannte Namen fallen
 * sichtbar auf ein Fragezeichen zurück — nie auf ein Emoji.
 */
import { computed } from 'vue';
import {
  BookOpen, Activity, Link2, Check, TriangleAlert, CircleX, CircleHelp,
  Plus, Undo2, Loader2, Wallet, Calendar, RefreshCw, X, ShieldCheck,
  Inbox, Landmark, Search, Receipt, Upload, CheckCheck, Camera, Trash2,
  FileText, Image, ScrollText, Send, Building2, Users, Download, ClipboardCheck,
  Coins, BarChart3, Table2, CalendarClock, CreditCard, Link as LinkIcon,
} from 'lucide-vue-next';

const ICONS = {
  'buchhaltung':   Landmark,
  'journal':       BookOpen,
  'status':        Activity,
  'kette':         Link2,
  'ok':            Check,
  'warnung':       TriangleAlert,
  'fehler':        CircleX,
  'plus':          Plus,
  'storno':        Undo2,
  'laden':         Loader2,
  'konto':         Wallet,
  'datum':         Calendar,
  'aktualisieren': RefreshCw,
  'schliessen':    X,
  'pruefen':       ShieldCheck,
  'leer':          Inbox,
  'suche':         Search,
  'beleg':         Receipt,
  'hochladen':     Upload,
  'freigeben':     CheckCheck,
  'kamera':        Camera,
  'verwerfen':     Trash2,
  'pdf':           FileText,
  'bild':          Image,
  'rechnung':      ScrollText,
  'stellen':       Send,
  'firma':         Building2,
  'auftraggeber':  Users,
  'herunterladen': Download,
  'checkliste':    ClipboardCheck,
  'geld':          Coins,
  'diagramm':      BarChart3,
  'tabelle':       Table2,
  'erwartet':      CalendarClock,
  'bank':          CreditCard,
  'zuordnen':      LinkIcon,
};

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 1.75 },
});

const icon = computed(() => ICONS[props.name] || CircleHelp);
</script>

<style scoped>
.ped-icon {
  flex-shrink: 0;
  vertical-align: -0.125em;
}
</style>
