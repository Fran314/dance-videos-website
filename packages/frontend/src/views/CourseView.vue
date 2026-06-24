<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore, useStateStore } from '@/store'
import VideoUploader from '@/components/VideoUploader.vue'
import DeleteVideo from '@/components/alerts/DeleteVideo.vue'
import EditVideo from '@/components/alerts/EditVideo.vue'
import { courseLabel, videoLabel, sortVideos, deepToRaw } from '@/utils'
import VideoCard from '@/components/VideoCard.vue'
import { type Course, isId, listWithId, type WithId, type Video } from '@dance-videos/shared'
import * as api from '@/services/api'

const authStore = useAuthStore()
const stateStore = useStateStore()
const route = useRoute()

const init = ref(false)
const course = ref<WithId<Course> | null>(null)

const videoToDelete = ref<WithId<Video> | null>(null)
const videoToEdit = ref<WithId<Video> | null>(null)
const editVideo = (video: WithId<Video>) => {
  videoToEdit.value = structuredClone(deepToRaw(video))
}

const sortedVideos = computed(() => {
  if (course.value === null)
    return null

  return listWithId(course.value.videos).sort(sortVideos)
})

const loadCourse = async () => {
  const courseId = route.params.courseId

  if (!isId(courseId)) {
    stateStore.pushFatalError("URL corso non valido")
    return
  }

  const result = await api.getCourse(courseId)
  if (result.isErr()) {
    stateStore.pushFatalApiError(result.error)
    return
  }
  course.value = { ...result.value, id: courseId }
}

const initCourse = async () => {
  if (authStore.authenticated && init.value === false) {
    init.value = true
    await loadCourse()
  }
}

onMounted(async () => {
  await initCourse()
})
authStore.$subscribe(() => {
  void initCourse()
})
</script>

<template>
  <div class="course-view view">
    <template v-if="course">
      <h1>{{ courseLabel(course) }}</h1>
      <div class="videos grid">
        <VideoUploader v-if="authStore.admin" :course="course.id" @on-success="loadCourse" />
        <template v-for="video in sortedVideos" :key="video.id">
          <div class="labeled-card">
            <div v-if="authStore.admin" class="label admin">
              <div class="left"></div>
              <div class="center">
                {{ videoLabel(video) }}
                <template v-if="video.status === 'queued'">(queued)</template>
                <template v-else-if="video.status === 'converting'">({{ video.conversionProgress }}%)</template>
              </div>
              <div class="right">
                <button @click="editVideo(video)"> <img src="@/assets/edit-black.svg" height="24px" /> </button>
                <button @click="videoToDelete = video"> <img src="@/assets/delete-black.svg" height="24px" /> </button>
              </div>
            </div>
            <div v-else class="label">
              {{ videoLabel(video) }}
            </div>
            <VideoCard :course-id="course.id" :video="video" />
          </div>
        </template>
      </div>
      <DeleteVideo v-if="videoToDelete" :video="videoToDelete" :course-id="course.id" @on-success="loadCourse"
        @on-close="videoToDelete = null" />
      <EditVideo v-if="videoToEdit" :video="videoToEdit" :course-id="course.id" @on-success="loadCourse"
        @on-close="videoToEdit = null" />
    </template>

    <template v-else-if="!stateStore.error">
      <h1 class="skeleton">______________ __________</h1>
      <div class="videos grid">
        <div class="labeled-card">
          <div class="label skeleton">_______ __________</div>
          <div class="card" />
        </div>
        <div class="labeled-card">
          <div class="label skeleton">_______ __________</div>
          <div class="card" />
        </div>
        <div class="labeled-card">
          <div class="label skeleton">_______ __________</div>
          <div class="card" />
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.label.admin {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1.5rem;

  .center {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .right {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;

    img {
      cursor: pointer;
    }
  }
}
</style>
