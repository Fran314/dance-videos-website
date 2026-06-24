<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore, useStateStore } from '@/store'
import { computed } from 'vue';
import { courseLabel, courseImage, sortCourses,  } from '@/utils';
import { getCurrYearStr, listWithId } from '@dance-videos/shared';

const authStore = useAuthStore()
const stateStore = useStateStore()

const currentCourses = computed(() => {
  if (authStore.courses === null) return []
  return listWithId(authStore.courses).sort(sortCourses).filter(c => c.year === getCurrYearStr())
})
const otherCourses = computed(() => {
  if (authStore.courses === null) return []
  return listWithId(authStore.courses).sort(sortCourses).filter(c => c.year !== getCurrYearStr())
})
</script>

<template>
  <div class="home-view view">
    <template v-if="authStore.courses">
      <h1>I miei corsi</h1>
      <div class="courses grid">
        <template v-for="(course, i) in currentCourses" :key="course.id">
          <RouterLink :to="`/course/${course.id}`">
            <div class="card">
              <img :src="courseImage(i)" class="darken" />
              <div class="text-overlay"> {{ courseLabel(course) }}</div>
            </div>
          </RouterLink>
        </template>
      </div>

      <template v-if="otherCourses.length !== 0">
        <div></div>
        <h1>Corsi precedenti</h1>
        <div class="courses grid">
          <template v-for="(course, i) in otherCourses" :key="course.id">
            <RouterLink :to="`/course/${course.id}`">
              <div class="card">
                <img :src="courseImage(currentCourses.length + i)" class="darken" />
                <div class="text-overlay"> {{ courseLabel(course) }}</div>
              </div>
            </RouterLink>
          </template>
        </div>
      </template>
    </template>

    <template v-else-if="!stateStore.error">
      <h1 class="skeleton">I miei corsi</h1>
      <div class="courses grid">
        <div class="card" />
        <div class="card" />
        <div class="card" />
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped></style>
