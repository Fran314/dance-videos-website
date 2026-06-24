<script setup lang="ts">
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import type { Id, Video, WithId } from '@dance-videos/shared'
import * as api from '@/services/api'

const props = defineProps<{
    video: WithId<Video>
    courseId: Id
}>()
const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const deleteVideo = async () => {
  const result = await api.deleteVideo(props.courseId, props.video.id)
  if (result.isOk()) {
    stateStore.pushSuccess("video eliminato")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Elimina video</h1>
    <p v-if="video.label">Vuoi davvero eliminare il video '<b>{{ video.label }}</b>' del {{ video.date }}?</p>
    <p v-else>Vuoi davvero eliminare il video senza titolo del {{ video.date }}?</p>
    <p>Questa azione è irreversibile</p>
    <div class="button-footer">
      <button class="highlight" @click="deleteVideo">Elimina</button>
      <button @click="() => { emit('onClose') }">
        Annulla
      </button>
    </div>
  </Alert>
</template>

<style lang="scss" scoped></style>
