<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuthStore, useStateStore } from '@/store'
import { branding } from '@/branding'
import Notification from './components/Notification.vue'

const maintenanceMode = false;
const authStore = useAuthStore()
const stateStore = useStateStore()
const router = useRouter()

onMounted(async () => {
  if (maintenanceMode) {
    stateStore.pushNotification("info", "Sito in manutenzione. Ci scusiamo per il disagio", true)
    return
  }

  await authStore.loadUser()

  if (authStore.authenticated === false) {
    void router.push({ path: '/login' })
  }
})
</script>

<template>
  <header>
    <template v-if="authStore.authenticated">
      <div class="left">
        <RouterLink to="/">
          <div class="logo">
            <img alt="logo" class="logo-img" src="/branding/logo.svg" />
            {{ branding.logoText }}
          </div>
        </RouterLink>
      </div>
      <div class="right">
        <RouterLink to="/" class="button highlight">
          <div class="desktop"> Home </div>
          <img class="mobile" src="@/assets/home-white.svg">
        </RouterLink>

        <RouterLink v-if="authStore.admin" to="/admin" class="button">
          <div class="desktop"> Admin </div>
          <img class="mobile" src="@/assets/admin-black.svg">
        </RouterLink>

        <RouterLink to="/login" class="button">
          <div class="desktop"> Log out </div>
          <img class="mobile" src="@/assets/logout-black.svg">
        </RouterLink>
      </div>
    </template>
    <template v-else>
      <div class="left">
        <div class="logo">
          <img alt="logo" class="logo-img" src="/branding/logo.svg" />
          {{ branding.logoText }}
        </div>
      </div>
    </template>
  </header>

  <div class="content" id="content">
    <RouterView v-if="!maintenanceMode" />
    <!-- <div class="footer"> -->
    <!--   <RouterLink to="/gdpr"> -->
    <!--     Privacy & terms -->
    <!--   </RouterLink> -->
    <!-- </div> -->
  </div>
  <div class="notifications">
    <Notification v-for="not in [...stateStore.notifications].reverse().slice(0, 5)" :notification="not"
      :key="not.id" />
  </div>
</template>

<style lang="scss" scoped>
header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;

  height: 5rem;
  width: 100%;
  padding: 1rem 5rem;

  font-size: 18px;
  font-weight: 500;
  background-color: #fff;

  display: flex;
  justify-content: space-between;
  align-items: center;

  box-shadow: 0 0 20px #0002;

  .left {
    height: 100%;

    .logo {
      height: 100%;

      display: flex;
      align-items: center;

      color: var(--color-black);

      gap: 0.5rem;

      .logo-img {
        display: block;
        height: 80%;
      }
    }
  }

  .right {
    display: flex;
    align-items: center;

    gap: 1rem;
  }
}

.content {
  min-height: 100dvh;
  padding-top: 5rem;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;

  position: relative;

  .footer {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 2rem;
    /* color: #0004; */
    /* margin: auto; */
    /* margin-bottom: 0; */
    background-color: #d6c7ad;

    flex: 0;

    a {
      color: #0009;
      text-decoration: underline;
    }
  }
}



.notifications {
  position: fixed;
  bottom: 1rem;
  left: 0;
  right: 0;
  margin: auto;

  width: fit-content;
  max-width: calc(100% - 4rem);

  overflow-y: visible;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

@media (width <=38rem) {
  header {
    padding: 1rem;
  }
}
</style>
