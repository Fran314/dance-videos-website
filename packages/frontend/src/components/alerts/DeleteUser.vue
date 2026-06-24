<script setup lang="ts">
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import type { NonEmptySafeStr } from '@dance-videos/shared'
import * as api from '@/services/api'

const props = defineProps<{ username: NonEmptySafeStr }>()
const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const deleteUser = async () => {
  const result = await api.deleteUser(props.username)
  if (result.isOk()) {
    stateStore.pushSuccess("utente eliminato")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Elimina utente</h1>
    <p>Vuoi davvero eliminare l'utente '<b>{{ username }}</b>'?</p>
    <p>Questa azione è irreversibile</p>
    <div class="button-footer">
      <button class="highlight" @click="deleteUser">Elimina</button>
      <button @click="() => { emit('onClose') }">Annulla</button>
    </div>
  </Alert>
</template>

<style lang="scss" scoped></style>
