<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore, useStateStore } from '@/store'
import { useRouter } from 'vue-router'
import * as api from '@/services/api'
import { isNonEmptySafeStr } from '@dance-videos/shared'

const authStore = useAuthStore()
const stateStore = useStateStore()
const router = useRouter()

const error = ref('')

const login = async (event: Event) => {
  const form = event.target as HTMLFormElement
  const usernameInput = form.elements.namedItem('username') as HTMLInputElement
  const passwordInput = form.elements.namedItem('password') as HTMLInputElement

  const username = usernameInput.value
  const password = passwordInput.value

  if (!isNonEmptySafeStr(username)) {
    stateStore.pushError("Username non valido")
    return
  }
  if (!isNonEmptySafeStr(password)) {
    stateStore.pushError("Password non valida")
    return
  }

  const result = await api.login({ username, password })
  if (result.isErr()) {
    if (result.error instanceof api.HttpError && result.error.code === 401) {
      stateStore.pushError('Credenziali non valide. Assicurati che l\'username e la password siano corretti')
    } else if (result.error instanceof api.HttpError && result.error.code === 429) {
      stateStore.pushError('Troppi tentativi falliti. Riprova fra qualche minuto o contatta un admin')
    } else {
      stateStore.pushApiError(result.error)
    }
    return
  }
  await authStore.loadUser()
  void router.push({ path: '/' })
}

const logout = async () => {
  const result = await api.logout()
  if (result.isErr()) {
    stateStore.pushApiError(result.error)
    return
  }
  await authStore.loadUser()
}
</script>

<template>
  <div class="login-view view">
    <template v-if="authStore.authenticated === false">
      <h1>Login</h1>
      <div class="login block">
        <form @submit.prevent="login">
          <div class="wrapper">
            Username
            <input type="text" name="username">
          </div>
          <div class="wrapper">
            Password
            <input type="password" name="password">
          </div>

          <div class="button-footer">
            <input type="submit" class="highlight" value="Login">
          </div>
        </form>
      </div>

      <div v-if="error" class="error">{{ error }}</div>
    </template>

    <template v-else-if="authStore.authenticated === true">
      <h1>Logout</h1>
      <div class="login block">
        <p>
          Ciao <b>{{ authStore.username }}</b>!
        </p>
        <p>
          Se desideri fare login con un altro account, devi prima fare logout da quello corrente
        </p>
        <p>
          Se invece desideri accedere al resto del sito, premi il pulsante Home in alto a destra
        </p>
        <div class="button-footer">
          <button class="highlight" @click="logout">
            Log out
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="!stateStore.error">
      <h1 class="skeleton">Login</h1>
      <div class="login block skeleton" />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.block {
  padding-top: 2rem;

  .wrapper {
    width: 100%;

    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
}
</style>
