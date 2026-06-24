<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore, useStateStore } from '@/store'
import { searchCourses, sortCourses, deepToRaw } from '@/utils'
import { listWithId, type Id, type Course, type CourseSummary, type WithId } from '@dance-videos/shared'
import * as api from '@/services/api'

import DeleteCourse from '@/components/alerts/DeleteCourse.vue'
import EditCourse from '@/components/alerts/EditCourse.vue'
import AddCourse from '@/components/alerts/AddCourse.vue'

const authStore = useAuthStore()
const stateStore = useStateStore()

const init = ref(false)
const courses = ref<Record<Id, Course> | null>(null)

const search = ref("")

const courseToDelete = ref<WithId<CourseSummary> | null>(null)
const courseToEdit = ref<WithId<CourseSummary> | null>(null)
const addCourse = ref(false)
const editCourse = (course: WithId<CourseSummary>) => {
  courseToEdit.value = structuredClone(deepToRaw(course))
}

const coursesToShow = computed((): WithId<CourseSummary>[] | null => {
  if (courses.value === null)
    return null

  const courseList: WithId<CourseSummary>[] = listWithId(courses.value)
  if (search.value === '')
    return courseList.sort(sortCourses)

  return searchCourses(courseList, search.value)
})

const loadCourses = async () => {
  const result = await api.getCourses()
  if (result.isOk()) {
    courses.value = result.value
  } else {
    stateStore.pushFatalApiError(result.error)
  }
}

const initCourses = async () => {
  if (authStore.authenticated && init.value === false) {
    init.value = true
    await loadCourses()
  }
}

onMounted(async () => {
  await initCourses()
})
authStore.$subscribe(() => {
  void initCourses()
})
</script>

<template>
  <div class="admin-view view">
    <template v-if="courses">
      <h1>Corsi</h1>
      <input class="search" type="text" v-model="search" placeholder="Cerca corsi...">
      <div class="list">
        <button class="highlight" @click="addCourse = true">
          <img src="@/assets/add-white.svg" height="16px" />
          Aggiungi corso
        </button>
        <template v-for="course in coursesToShow" :key="course.id">
          <div class="entry">
            <div class="block-header">
              <div class="left">
                <b>{{ course.displayName }} ({{ course.year }})</b>
              </div>
              <div class="right">
                <button @click="() => { editCourse(course) }"> <img src="@/assets/edit-black.svg" /> </button>
                <button @click="() => { courseToDelete = course }"> <img src="@/assets/delete-black.svg" /> </button>
              </div>
            </div>
          </div>
        </template>
      </div>
      <DeleteCourse v-if="courseToDelete" :course="courseToDelete" @on-success="loadCourses(); authStore.loadUser()"
        @on-close="() => { courseToDelete = null }" />
      <EditCourse v-if="courseToEdit" :course="courseToEdit" @on-success="loadCourses(); authStore.loadUser()"
        @on-close="() => { courseToEdit = null }" />
      <AddCourse v-if="addCourse" @on-success="loadCourses(); authStore.loadUser()"
        @on-close="() => { addCourse = false }" />
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
</style>
