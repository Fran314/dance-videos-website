<script setup lang="ts">
import { computed, ref, toRaw } from 'vue';
import { useStateStore } from '@/store'
import Alert from './Alert.vue';
import { courseLabel, searchCourses } from '@/utils';
import { isNonEmptySafeStr, listWithId, type NonEmptySafeStr, type Id, type Course, type User, type WithId } from '@dance-videos/shared'
import * as api from '@/services/api'

const props = defineProps<{
    username: NonEmptySafeStr
    user: User
    courses: Record<Id, Course>
}>()
const emit = defineEmits<{ onSuccess: []; onClose: [] }>()

const stateStore = useStateStore()

const admin = ref<boolean>(props.user.admin)
const userCourses = ref<Id[]>([...props.user.courses])

const search = ref('')

const error = ref('')

const courseQuery = computed(() => {
  if (search.value.length === 0)
    return []

  const nonUserCourses = listWithId(props.courses).filter(c => !userCourses.value.includes(c.id))
  return searchCourses(nonUserCourses, search.value)
})

const addCourse = (courseId: Id) => {
  userCourses.value.push(courseId)
  search.value = ''
}

const removeCourse = (courseId: Id) => {
  userCourses.value = userCourses.value.filter(c => c !== courseId)
}

const selectedCourses = computed((): WithId<Course>[] => {
  const out: WithId<Course>[] = []
  for (const id of userCourses.value) {
    const c = props.courses[id]
    if (c !== undefined) out.push({ ...c, id })
  }
  return out
})

const updateUser = async (event: Event) => {
  error.value = ''

  const form = event.target as HTMLFormElement
  const passwordInput = form.elements.namedItem('password') as HTMLInputElement
  const password = passwordInput.value

  if (!isNonEmptySafeStr(password)) {
    error.value = 'password non valida'
    return
  }

  const result = await api.updateUser(props.username, {
    password,
    admin: admin.value,
    courses: toRaw(userCourses.value),
  })
  if (result.isOk()) {
    stateStore.pushSuccess("utente modificato!")
    emit("onSuccess")
  } else {
    stateStore.pushApiError(result.error)
  }
  emit("onClose")
}
</script>

<template>
  <Alert>
    <h1>Modifica utente</h1>
    <form @submit.prevent="updateUser">
      <div class="edit-form">
        <span>username: </span>
        <span><b>{{ username }}</b></span>

        <span>password:</span>
        <input type="text" name="password" :value="user.password">

        <span>admin:</span>
        <input class="pad-left" type="checkbox" v-model="admin">

        <template v-if="!admin">
          <span>corsi:</span>
          <div class="courses-list">
            <template v-for="course in selectedCourses" :key="course.id">
              <div class="course-entry">
                <img src="@/assets/delete-white.svg" height="16px" @click="removeCourse(course.id)" />
                <span>{{ courseLabel(course) }}</span>
              </div>
            </template>
          </div>
          <div class="search">
            <input type="text" v-model="search" placeholder="Aggiungi un corso...">
            <div class="results" v-if="courseQuery.length !== 0">
              <template v-for="course in courseQuery" :key="course.id">
                <div class="course-entry" @click.prevent="addCourse(course.id)">
                  <img src="@/assets/add-white.svg" height="16px" />
                  <span>{{ courseLabel(course) }}</span>
                </div>
              </template>

            </div>
          </div>
        </template>
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
.course-entry {
  width: fit-content;
  background-color: #0009;
  color: var(--color-white);

  padding: 0.25rem 1rem;
  border-radius: 20px;

  display: flex;
  align-items: center;
  gap: 1rem;

  img {
    cursor: pointer;
  }
}

.edit-form {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem 1rem;

  .pad-left {
    justify-self: start;
  }

  .courses-list {
    grid-column-start: 1;
    grid-column-end: 3;

    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    padding: 0 1rem;

  }

  .search {
    position: relative;

    grid-column-start: 1;
    grid-column-end: 3;

    display: flex;
    flex-direction: column;
    padding: 0 1rem;

    input {
      height: 2rem;
    }

    &:focus-within {
      .results {
        display: flex;
      }
    }

    .results {
      display: none;
      position: absolute;
      /* left: calc(1rem - 1px); */
      left: 1rem;
      /* right: calc(1rem - 1px); */
      right: 1rem;
      top: 100%;
      border-bottom-right-radius: 10px;
      border-bottom-left-radius: 10px;
      border: 1px solid #888;
      border-top: none;

      padding: 0.25rem;
      /* display: flex; */
      flex-direction: column;
      gap: 0.25rem;

      background-color: var(--color-white);

      &:hover {
        display: flex;
      }

      .course-entry {
        cursor: pointer;
      }
    }
  }
}
</style>
