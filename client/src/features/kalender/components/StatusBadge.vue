<template>
  <span class="kal-badge" :class="klasse" :title="titel">
    <KalenderIcon :name="iconName" :size="12" />
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup>
// StatusBadge — Antwortstatus eines Teilnehmers (PARTSTAT) als Badge.
import { computed } from 'vue'
import KalenderIcon from './KalenderIcon.vue'
import { STATUS_LABEL } from '../services/KalenderZeit'

const props = defineProps({ status: { type: String, default: 'NEEDS-ACTION' }, titel: { type: String, default: '' } })

const klasse = computed(() => ({
  ACCEPTED: 'ist-ok', DECLINED: 'ist-nein', TENTATIVE: 'ist-warn',
}[props.status] || ''))
const iconName = computed(() => ({ ACCEPTED: 'ok', DECLINED: 'nein', TENTATIVE: 'offen' }[props.status] || 'zeit'))
const label = computed(() => STATUS_LABEL[props.status] || props.status)
</script>
