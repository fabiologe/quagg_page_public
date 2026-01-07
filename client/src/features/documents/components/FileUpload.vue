<template>
  <div class="file-upload">
    <input
      ref="fileInput"
      type="file"
      :multiple="multiple"
      :accept="accept"
      @change="handleFileSelect"
      style="display: none"
    />
    <div class="upload-area" @click="$refs.fileInput.click()" @dragover.prevent @drop.prevent="handleDrop">
      <p v-if="!files.length">Datei hier ablegen oder klicken zum Auswählen</p>
      <ul v-else class="file-list">
        <li v-for="(file, index) in files" :key="index" class="file-item">
          <span>{{ file.name }}</span>
          <button @click.stop="removeFile(index)">&times;</button>
        </li>
      </ul>
    </div>
    <BaseButton @click="handleUpload" :disabled="!files.length || uploading">
      {{ uploading ? 'Wird hochgeladen...' : 'Hochladen' }}
    </BaseButton>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

const props = defineProps({
  multiple: {
    type: Boolean,
    default: false
  },
  accept: {
    type: String,
    default: '*/*'
  }
})

const emit = defineEmits(['upload', 'uploaded'])

const fileInput = ref(null)
const files = ref([])
const uploading = ref(false)

function handleFileSelect(event) {
  const selectedFiles = Array.from(event.target.files)
  if (props.multiple) {
    files.value.push(...selectedFiles)
  } else {
    files.value = selectedFiles
  }
}

function handleDrop(event) {
  const droppedFiles = Array.from(event.dataTransfer.files)
  if (props.multiple) {
    files.value.push(...droppedFiles)
  } else {
    files.value = droppedFiles
  }
}

function removeFile(index) {
  files.value.splice(index, 1)
}

async function handleUpload() {
  uploading.value = true
  try {
    emit('upload', files.value)
    // Nach erfolgreichem Upload
    files.value = []
    emit('uploaded')
  } catch (error) {
    console.error('Upload error:', error)
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.file-upload {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.upload-area {
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.upload-area:hover {
  border-color: #3498db;
}

.file-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.file-item button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #e74c3c;
}
</style>

