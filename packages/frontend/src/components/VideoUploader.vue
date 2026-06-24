<script setup lang="ts">
import type { Id, Hash, Token } from '@dance-videos/shared'

import { ref, onMounted } from 'vue'
import { useStateStore } from '@/store'

import { cyrb53Hash, formatBytes, getCurrDateStr, isDateStr, isSafeStr } from '@dance-videos/shared'
import { ok, err, ResultAsync } from 'neverthrow'
import * as api from '@/services/api'

const props = defineProps<{ course: Id }>()
const emit = defineEmits<{ onSuccess: [] }>()

const stateStore = useStateStore()

const uploading = ref(false)
const progressMessage = ref("")
const speedMessage = ref("")

const date = ref(getCurrDateStr())
const uploadBegin = ref(new Date().getMilliseconds())

const chunkUpload = (file: File): ResultAsync<Token, api.ApiError> => {
  async function execute() {
    uploadBegin.value = new Date().getMilliseconds()
    progressMessage.value = "file upload..."
    speedMessage.value = ""

    const size = Math.ceil(file.size / api.CHUNK_UPLOAD_SIZE)
    const hash: Hash = cyrb53Hash(`${file.name}-${size}`)

    const initResult = await api.initUpload(hash, { size })
    if (initResult.isErr()) return err(initResult.error)

    const chunksDone = initResult.value
    const chunks = Array.from({ length: size }, (_, i) => i).filter(i => !chunksDone.includes(i))
    const skipped = size - chunks.length

    for (const [i, idx] of chunks.entries()) {
      const onProgress = (chunkLoaded: number) => {
        const elapsTimeMs: number = new Date().getMilliseconds() - uploadBegin.value
        const totalBytes = file.size

        // uploadedBytes: bytes uploaded in this session
        const uploadedBytes = (i * api.CHUNK_UPLOAD_SIZE) + chunkLoaded
        // doneBytes: total bytes the server has
        const doneBytes = uploadedBytes + (skipped * api.CHUNK_UPLOAD_SIZE)

        const currSpeed = uploadedBytes / (elapsTimeMs / 1000) // in B/s

        progressMessage.value = `${formatBytes(Math.min(doneBytes, totalBytes))}/${formatBytes(totalBytes)}`

        if (elapsTimeMs > 1000)
          speedMessage.value = `${formatBytes(currSpeed)}/s`
        else
          speedMessage.value = ""
      }

      const chunk = file.slice(idx * api.CHUNK_UPLOAD_SIZE, (idx + 1) * api.CHUNK_UPLOAD_SIZE)
      const chunkResult = await api.uploadChunk(hash, idx, chunk, onProgress)
      if (chunkResult.isErr()) return err(chunkResult.error)
    }

    progressMessage.value = "rebuilding file..."
    speedMessage.value = ""

    const finalResult = await api.finalizeUpload(hash)
    if (finalResult.isErr()) return err(finalResult.error)

    return ok(finalResult.value.token)
  }

  return new ResultAsync(execute())
}

const addVideo = async (event: Event): Promise<void> => {
  if (uploading.value)
    return

  uploading.value = true
  progressMessage.value = ""
  speedMessage.value = ""

  const form = event.target as HTMLFormElement
  const fileInput = form.elements.namedItem('file') as HTMLInputElement
  const labelInput = form.elements.namedItem('label') as HTMLInputElement

  const file = fileInput.files?.[0]
  const label = labelInput.value

  if (file === undefined)
    return stateStore.pushError("nessun file selezionato")

  if (file.type !== 'video/mp4')
    return stateStore.pushError("sono ammessi solo file .mp4")

  if (!isSafeStr(label))
    return stateStore.pushError("label non valida")

  if (!isDateStr(date.value))
    return stateStore.pushError("data non valida")

  try {
    const uploadResult = await chunkUpload(file)
    if (uploadResult.isErr()) {
      stateStore.pushApiError(uploadResult.error)
      return
    }
    const token = uploadResult.value

    progressMessage.value = "almost done..."
    speedMessage.value = ""

    const addResult = await api.addVideo(
      props.course,
      { label, date: date.value, file: token },
    )
    if (addResult.isErr()) {
      stateStore.pushApiError(addResult.error)
      return
    }

    stateStore.pushSuccess("video correctly uploaded!")
    emit("onSuccess")

    fileInput.value = ''
    date.value = getCurrDateStr()
    labelInput.value = ''
  } finally {
    progressMessage.value = ""
    speedMessage.value = ""
    uploading.value = false
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', function (e) {
    if (uploading.value)
      e.preventDefault();
  });
})
</script>

<template>
  <div class="labeled-card">
    <div class="label">Aggiungi video</div>
    <div class="card transparent">
      <div class="wrapper">
        <form @submit.prevent="addVideo">
          <input type="file" accept="video/mp4" name="file">
          <input type="date" name="date" v-model="date">
          <input type="text" name="label">
          <div v-if="!uploading" class="button-footer">
            <input type="submit" class="highlight" value="Aggiungi">
          </div>
          <div v-else class="message">
            <div>{{ progressMessage }}</div>
            <div v-if="speedMessage">{{ speedMessage }}</div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.labeled-card {
  color: #888;

  .card {
    border: dashed 0.2rem #0002;
    padding: 0.5rem 2rem;

    justify-content: center;
    align-items: center;

    .wrapper {
      width: 100%;
      max-width: 20rem;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: stretch;

      form {
        gap: 0.5rem;
      }
    }
  }
}

.message {
  font-size: 0.95rem;
  display: flex;
  gap: 1.5rem;
  justify-content: center;
}
</style>