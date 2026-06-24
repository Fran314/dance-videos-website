<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore, useStateStore } from '@/store'

import DeleteUser from '@/components/alerts/DeleteUser.vue'
import EditUser from '@/components/alerts/EditUser.vue'
import AddUser from '@/components/alerts/AddUser.vue'
import { courseLabel, deepToRaw } from '@/utils'
import { entries, type NonEmptySafeStr, type Id, type Course, type User, type Users, type WithId } from '@dance-videos/shared'
import * as api from '@/services/api'

const authStore = useAuthStore()
const stateStore = useStateStore()

const init = ref(false)
const users = ref<Users | null>(null)
const originalUsers = ref<Users | null>(null)
const courses = ref<Record<Id, Course> | null>(null)

const search = ref("")

const usernameToDelete = ref<NonEmptySafeStr | null>(null)
const usernameToEdit = ref<NonEmptySafeStr | null>(null)
const userToEdit = ref<User | null>(null)
const editUser = (username: NonEmptySafeStr) => {
  if (users.value === null) return
  const u = users.value[username]
  if (u === undefined) return
  usernameToEdit.value = username
  userToEdit.value = structuredClone(deepToRaw(u))
}
const addUser = ref(false)

const usersToShow = computed((): [NonEmptySafeStr, User][] | null => {
  if (users.value === null)
    return null

  const pairs = entries(users.value)
  if (search.value === '')
    return pairs

  return pairs.filter(([username]) => username.toLowerCase().includes(search.value.toLowerCase()))
})

const userCoursesWithId = (courseIds: Id[]): WithId<Course>[] => {
  if (courses.value === null) return []
  const out: WithId<Course>[] = []
  for (const id of courseIds) {
    const c = courses.value[id]
    if (c !== undefined) out.push({ ...c, id })
  }
  return out
}

const loadUsers = async () => {
  const result = await api.getUsers()
  if (result.isErr()) {
    stateStore.pushFatalApiError(result.error)
    return
  }
  users.value = structuredClone(result.value)
  originalUsers.value = structuredClone(result.value)
}

const loadCourses = async () => {
  const result = await api.getCourses()
  if (result.isErr()) {
    stateStore.pushFatalApiError(result.error)
    return
  }
  courses.value = result.value
}

const initUsers = async () => {
  if (authStore.authenticated && init.value === false) {
    init.value = true
    await loadUsers()
    await loadCourses()
  }
}

onMounted(async () => {
  await initUsers()
})
authStore.$subscribe(() => {
  void initUsers()
})
</script>

<template>
  <div class="admin-view view">
    <template v-if="users && courses">
      <h1>Utenti</h1>
      <input class="search" type="text" v-model="search" placeholder="Cerca utenti...">
      <div class="list">
        <button class="highlight" @click="addUser = true">
          <img src="@/assets/add-white.svg" height="16px" />
          Aggiungi utente
        </button>
        <template v-for="[username, user] in usersToShow" :key="username">
          <div class="entry">
            <div class="block-header">
              <div class="left">
                <b>{{ username }}</b> <span v-if="user.admin">- admin</span>
              </div>
              <div class="right">
                <button @click="() => { editUser(username) }"> <img src="@/assets/edit-black.svg" /> </button>
                <button @click="() => { usernameToDelete = username }"><img src="@/assets/delete-black.svg" /></button>
              </div>
            </div>
            <template v-if="!user.admin">
              <div v-for="course in userCoursesWithId(user.courses)" class="row" :key="course.id">
                <p>- {{ courseLabel(course) }}</p>
              </div>
            </template>
          </div>
        </template>
      </div>
      <DeleteUser v-if="usernameToDelete" :username="usernameToDelete" @on-success="loadUsers"
        @on-close="() => { usernameToDelete = null }" />
      <EditUser v-if="usernameToEdit && userToEdit" :username="usernameToEdit" :user="userToEdit" :courses="courses"
        @on-success="loadUsers" @on-close="() => { usernameToEdit = null; userToEdit = null }" />
      <AddUser v-if="addUser" :courses="courses" @on-success="loadUsers" @on-close="() => { addUser = false }" />
    </template>

    <template v-else-if="!stateStore.error">
      <h1 class="skeleton">______</h1>
      <input class="search" type="text" placeholder="Cerca utenti..." disabled>
      <div class="list">
        <div class="entry skeleton" />
        <div class="entry skeleton" />
        <div class="entry skeleton" />
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.view {
  width: 20rem;
  max-width: 100%;
}

.block-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }

  .right {
    display: flex;
    gap: 1rem;
  }

  .left {
    width: 100%;
  }
}

.search {
  width: 100%;
}

.list {
  width: 100%;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;

  .entry {
    width: 100%;
    padding: 0.5rem 2rem;

    background-color: var(--color-white);
    border-radius: 20px;
    box-shadow: 0 0 5px #0002;

    display: flex;
    flex-direction: column;
    gap: 0.1rem;

    &.dashed {
      background-color: transparent;
      border: dashed 0.2rem #0002;
      box-shadow: none;
    }

    &.skeleton {
      background-color: #0002;
      height: 5rem;
    }
  }
}

.button {
  display: flex;
  gap: 0.5rem;
}

/* .block:not(.skeleton) { */
/*   border: 0.2rem solid; */
/*   border-color: var(--color-white); */
/**/
/*   &.modified { */
/*     border-color: var(--color-primary); */
/*   } */
/* } */
</style>
