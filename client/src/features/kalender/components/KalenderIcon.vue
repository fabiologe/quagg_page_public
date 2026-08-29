<template>
  <component :is="icon" :size="size" :stroke-width="1.75" :absolute-stroke-width="true" class="kal-icon" aria-hidden="true" />
</template>

<script setup>
// KalenderIcon — Icon-Tor des Kalenders (Muster PdfIcon/MailIcon), emoji-frei.
import { computed } from 'vue'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, X, Users, MapPin, Video, Send, RefreshCw,
  Link, Copy, Check, XCircle, CircleHelp, Clock, Trash2, Ban, Loader2, TriangleAlert, Info,
  Rss, FolderOpen, Mail, Pencil,
} from 'lucide-vue-next'

const ICONS = {
  kalender: CalendarDays, zurueck: ChevronLeft, weiter: ChevronRight, plus: Plus, schliessen: X,
  personen: Users, ort: MapPin, video: Video, senden: Send, aktualisieren: RefreshCw, link: Link,
  kopieren: Copy, ok: Check, nein: XCircle, offen: CircleHelp, zeit: Clock, loeschen: Trash2,
  absagen: Ban, laedt: Loader2, warnung: TriangleAlert, info: Info, feed: Rss, projekt: FolderOpen,
  mail: Mail, bearbeiten: Pencil,
}

const props = defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 16 } })
const icon = computed(() => ICONS[props.name] ?? CircleHelp)
</script>

<style scoped>
.kal-icon { display: block; flex-shrink: 0; }
</style>
