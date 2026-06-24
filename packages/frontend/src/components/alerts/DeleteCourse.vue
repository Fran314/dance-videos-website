<script setup lang="ts">
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import type { CourseSummary, WithId } from '@dance-videos/shared';
import * as api from '@/services/api';

const props = defineProps<{ course: WithId<CourseSummary> }>()
const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const deleteCourse = async () => {
  const result = await api.deleteCourse(props.course.id)
  if (result.isOk()) {
    stateStore.pushSuccess("corso eliminato")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Elimina corso</h1>
    <p>Vuoi davvero eliminare il corso '<b>{{ course.displayName }} ({{ course.year }})</b>'?</p>
    <p>Questa azione è irreversibile</p>
    <div class="button-footer">
      <button class="highlight" @click="deleteCourse">Elimina</button>
      <button @click="() => { emit('onClose') }">Annulla</button>
    </div>
  </Alert>
</template>

<style lang="scss" scoped></style>
