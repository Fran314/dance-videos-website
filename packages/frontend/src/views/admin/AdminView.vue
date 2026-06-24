<script setup lang="ts">
import { RouterLink } from 'vue-router'
// import { useStateStore } from '@/store'
// const stateStore = useStateStore()

// const rescanLibrary = async () => {
//   const press = confirm('Se non sai cosa fa questo pulsante, NON lo premere. Confermi di volerlo premere?')
//   if (!press) return
//
//   stateStore.pushInfo("rescan avviato, potrebbe richiedere del tempo...")
//   const res = await fetch('/api/rescan-library', { method: 'POST' })
//   if (res.status === 200) {
//     stateStore.pushSuccess("rescan avvenuto con successo")
//   } else {
//     const message = await res.text()
//     stateStore.pushError(message, res.status)
//   }
// }
</script>

<template>
  <div class="admin-view view">
    <h1>Pannello Admin</h1>
    <div class="admin grid">
      <RouterLink to="/admin/users">
        <div class="card">
          <img :src="`/images/users.webp`" class="darken" />
          <div class="text-overlay"> Utenti </div>
        </div>
      </RouterLink>
      <RouterLink to="/admin/courses">
        <div class="card">
          <img :src="`/images/courses.webp`" class="darken" />
          <div class="text-overlay"> Corsi </div>
        </div>
      </RouterLink>
    </div>
    <!-- <div class="left-aligned-footer"> -->
    <!--   <button class="highlight" @click="rescanLibrary"> -->
    <!--     Rescan Library -->
    <!--   </button> -->
    <!-- </div> -->
  </div>
</template>

<style lang="scss" scoped>
.left-aligned-footer {
  width: 100%;
}
</style>
