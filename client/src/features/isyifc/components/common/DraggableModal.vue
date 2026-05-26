<template>
  <Teleport to="body">
    <div v-if="isOpen" class="draggable-modal-overlay">
      <div 
        ref="modalRef"
        class="draggable-modal"
        :style="modalStyle"
        @mousedown="startDrag"
      >
        <!-- Resizer Handles -->
        <div class="resizer top-left" @mousedown.stop.prevent="startResize('nw', $event)"></div>
        <div class="resizer top-right" @mousedown.stop.prevent="startResize('ne', $event)"></div>
        <div class="resizer bottom-left" @mousedown.stop.prevent="startResize('sw', $event)"></div>
        <div class="resizer bottom-right" @mousedown.stop.prevent="startResize('se', $event)"></div>
        <div class="resizer right" @mousedown.stop.prevent="startResize('e', $event)"></div>
        <div class="resizer bottom" @mousedown.stop.prevent="startResize('s', $event)"></div>

        <div class="modal-content-wrapper">
             <slot></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  initialWidth: { type: String, default: '800px' },
  initialHeight: { type: String, default: '600px' },
  initialTop: { type: String, default: '100px' },
  initialLeft: { type: String, default: 'center' } // 'center' or value
});

const emit = defineEmits(['close']);

const modalRef = ref(null);

// State
const x = ref(0);
const y = ref(0);
const width = ref(parseInt(props.initialWidth));
const height = ref(parseInt(props.initialHeight));

const isMinimized = ref(false);
const isMaximized = ref(false);

let preMaxX = 0;
let preMaxY = 0;
let preMaxWidth = 0;
let preMaxHeight = 0;

const toggleMaximize = () => {
    if (!isMaximized.value) {
        preMaxX = x.value;
        preMaxY = y.value;
        preMaxWidth = width.value;
        preMaxHeight = height.value;
        isMaximized.value = true;
        isMinimized.value = false;
    } else {
        isMaximized.value = false;
        x.value = preMaxX;
        y.value = preMaxY;
        width.value = preMaxWidth;
        height.value = preMaxHeight;
    }
};

const toggleMinimize = () => {
    isMinimized.value = !isMinimized.value;
    if (isMinimized.value) isMaximized.value = false;
};

defineExpose({
    toggleMaximize,
    toggleMinimize,
    isMinimized,
    isMaximized
});

// Initialize position
watch(() => props.isOpen, (val) => {
    if (val) {
        // Simple centering logic if 'center'
        if (props.initialLeft === 'center') {
            x.value = window.innerWidth / 2 - width.value / 2;
        } else {
            x.value = parseInt(props.initialLeft);
        }
        y.value = parseInt(props.initialTop);
    }
}, { immediate: true });

const modalStyle = computed(() => {
    if (isMinimized.value) {
        return {
            bottom: '0px',
            left: `${x.value}px`,
            width: '350px',
            height: '50px',
            position: 'fixed'
        };
    }
    if (isMaximized.value) {
        return {
            top: '0px',
            left: '0px',
            width: '100vw',
            height: '100vh',
            position: 'fixed'
        };
    }
    return {
        top: `${y.value}px`,
        left: `${x.value}px`,
        width: `${width.value}px`,
        height: `${height.value}px`,
        position: 'fixed'
    };
});


// Dragging
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;

const startDrag = (e) => {
    // Drag ONLY from designated header/handle elements.
    // This prevents orbit controls inside 3D canvases from moving the window.
    const dragHandle = e.target.closest('.modal-header, .viewer-header, .drag-handle');
    if (!dragHandle) return;

    // Don't drag when clicking interactive elements inside the header
    if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LABEL', 'A'].includes(e.target.tagName)) return;

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialX = x.value;
    initialY = y.value;
    
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    x.value = initialX + dx;
    y.value = initialY + dy;
};

const stopDrag = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
};


// Resizing
let isResizing = false;
let resizeDir = '';
let initialWidth = 0;
let initialHeight = 0;

const startResize = (dir, e) => {
    isResizing = true;
    resizeDir = dir;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialWidth = width.value;
    initialHeight = height.value;
    initialX = x.value;
    initialY = y.value;
    
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
};

const onResize = (e) => {
    if (!isResizing) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    
    if (resizeDir.includes('e')) {
        width.value = Math.max(300, initialWidth + dx);
    }
    if (resizeDir.includes('s')) {
        height.value = Math.max(200, initialHeight + dy);
    }
     // Optional: West/North resizing (moves X/Y)
    if (resizeDir.includes('w')) {
        const newWidth = Math.max(300, initialWidth - dx);
        x.value = initialX + (initialWidth - newWidth);
        width.value = newWidth;
    }
    if (resizeDir.includes('n')) {
        const newHeight = Math.max(200, initialHeight - dy);
        y.value = initialY + (initialHeight - newHeight);
        height.value = newHeight;
    }
};

const stopResize = () => {
    isResizing = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
};

onUnmounted(() => {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
});

</script>

<style scoped>
.draggable-modal-overlay {
    position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2000;
}
.draggable-modal {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 25px rgba(0,0,0,0.3);
    border: 1px solid rgba(0,0,0,0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Content clip */
    /* Drag cursor context */
}

/* Resizers */
.resizer { position: absolute; z-index: 100; }
.resizer.right { top: 0; right: 0; width: 5px; height: 100%; cursor: ew-resize; }
.resizer.bottom { bottom: 0; left: 0; width: 100%; height: 5px; cursor: ns-resize; }
.resizer.bottom-right { bottom: 0; right: 0; width: 15px; height: 15px; cursor: se-resize; }
/* Adding others for completeness */
.resizer.top-left { top: 0; left: 0; width: 10px; height: 10px; cursor: nw-resize; }
.resizer.top-right { top: 0; right: 0; width: 10px; height: 10px; cursor: ne-resize; }
.resizer.bottom-left { bottom: 0; left: 0; width: 10px; height: 10px; cursor: sw-resize; }


.modal-content-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    /* Ensure content grows */
}
</style>
