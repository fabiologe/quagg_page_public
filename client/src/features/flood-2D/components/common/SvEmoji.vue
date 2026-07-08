<template>
  <SvIcon
    v-if="iconName"
    :name="iconName"
    :size="size"
    :color="color"
    :label="emoji"
    class="sv-emoji"
  />
  <span v-else class="sv-emoji-fallback" :style="{ fontSize: fallbackSize }">{{ emoji }}</span>
</template>

<script setup>
import { computed } from 'vue';
import SvIcon from './SvIcon.vue';
import { emojiToIcon } from './svEmojiMap.js';

/**
 * SvEmoji — rendert für ein Emoji das zugehörige Lime-Pixel-Icon (svEmojiMap).
 * Ohne Mapping: zeigt das Original-Emoji unverändert (Fallback) → sicher & inkrementell.
 */
const props = defineProps({
  emoji: { type: String, required: true },
  size:  { type: [Number, String], default: 16 },
  color: { type: String, default: 'var(--sv-lime)' },
});

const iconName = computed(() => emojiToIcon(props.emoji));
const fallbackSize = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
);
</script>

<style scoped>
.sv-emoji-fallback { line-height: 1; }
</style>
