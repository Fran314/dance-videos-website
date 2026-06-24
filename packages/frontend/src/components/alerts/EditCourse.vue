<script setup lang="ts">
import { ref } from 'vue';
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import { isNonEmptySafeStr, isYearStr, type CourseSummary, type WithId } from '@dance-videos/shared';
import * as api from '@/services/api'

const props = defineProps<{ course: WithId<CourseSummary> }>()
const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const error = ref('')

const updateCourse = async (event: Event) => {
  error.value = ''

  const form = event.target as HTMLFormElement
  const displayNameInput = form.elements.namedItem('displayName') as HTMLInputElement
  const yearInput = form.elements.namedItem('year') as HTMLInputElement
  const displayName = displayNameInput.value
  const year = yearInput.value

  if (!isNonEmptySafeStr(displayName)) {
    error.value = 'nome del corso non valido'
    return
  }

  if (!isYearStr(year)) {
    error.value = 'anno non valido'
    return
  }

  const result = await api.updateCourse(props.course.id, { displayName, year })
  if (result.isOk()) {
    stateStore.pushSuccess("corso modificato!")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Modifica corso</h1>
    <form @submit.prevent="updateCourse">
      <div class="edit-form">
        <span>nome:</span>
        <input type="text" name="displayName" :value="course.displayName">

        <span>anno:</span>
        <select name="year" :value="course.year">
          <option value="29/30">29/30</option>
          <option value="28/29">28/29</option>
          <option value="27/28">27/28</option>
          <option value="26/27">26/27</option>
          <option value="25/26">25/26</option>
          <option value="24/25">24/25</option>
          <option value="23/24">23/24</option>
          <option value="22/23">22/23</option>
        </select>
      </div>
      <div v-if="error" class="error">{{ error }}</div>
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
