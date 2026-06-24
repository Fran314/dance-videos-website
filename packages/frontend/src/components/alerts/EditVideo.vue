<script setup lang="ts">
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import { isDateStr, isSafeStr, type Id, type Video, type WithId } from '@dance-videos/shared'
import * as api from '@/services/api'

const props = defineProps<{
    video: WithId<Video>
    courseId: Id
}>()
const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const updateVideo = async (event: Event) => {
  const form = event.target as HTMLFormElement
  const labelInput = form.elements.namedItem('label') as HTMLInputElement
  const dateInput = form.elements.namedItem('date') as HTMLInputElement
  const label = labelInput.value
  const date = dateInput.value

  if (!isSafeStr(label)) {
    stateStore.pushError("label non valida")
    return
  }
  if (!isDateStr(date)) {
    stateStore.pushError("data non valida")
    return
  }

  const result = await api.updateVideo(props.courseId, props.video.id, { date, label })
  if (result.isOk()) {
    stateStore.pushSuccess("video modificato!")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Modifica video</h1>
    <form @submit.prevent="updateVideo">
      <div class="edit-form">
        <span>label:</span>
        <input type="text" name="label" :value="video.label">

        <span>data:</span>
        <input type="date" name="date" :value="video.date">
      </div>
      <div class="button-footer">
        <input type="submit" class="highlight" value="Salva">
        <button @click="() => { emit('onClose') }">Annulla</button>
      </div>
    </form>
  </Alert>
</template>

<style lang="scss" scoped>
.edit-form {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;
}
</style>
