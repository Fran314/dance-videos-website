<script setup lang="ts">
import { ref } from 'vue';
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import { getCurrYearStr, isNonEmptySafeStr, isYearStr } from '@dance-videos/shared';
import * as api from '@/services/api'

const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const error = ref('')

const addCourse = async (event: Event) => {
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

  const result = await api.addCourse({ displayName, year })
  if (result.isOk()) {
    stateStore.pushSuccess("corso creato!")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Aggiungi corso</h1>
    <form @submit.prevent="addCourse">
      <div class="edit-form">
        <span>nome:</span>
        <input type="text" name="displayName" placeholder="nome del corso...">

        <span>anno:</span>
        <select name="year" :value="getCurrYearStr()">
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
