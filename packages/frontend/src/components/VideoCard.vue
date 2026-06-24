<script setup lang="ts">
import type { Id, Video, WithId } from '@dance-videos/shared'
import { ref, computed } from 'vue'
import * as api from '@/services/api'
import { useStateStore } from '@/store'

const props = defineProps<{
  courseId: Id
  video: WithId<Video>
}>()

const stateStore = useStateStore()

const videoEl = ref<HTMLVideoElement | null>(null)
const activated = ref(false)
const ready = ref(false)

const canPlayOriginalCodec = computed(() => {
  const result = document.createElement('video').canPlayType(props.video.originalCodec)
  return result === 'probably' || result === 'maybe'
})

// run load() and play() synchronously inside the click handler so old iOS
// keeps the user-gesture context (otherwise loading is deprioritized and
// canplay never fires).
const activate = () => {
  if (videoEl.value === null) return
  activated.value = true
  videoEl.value.src = api.videoSrcUrl(
    props.courseId,
    props.video.id,
    props.video.status !== 'converted',
  )
  videoEl.value.load()
  void videoEl.value.play().catch(() => { /* canplay handler will retry */ })
}

const onCanPlay = () => {
  ready.value = true
  void videoEl.value?.play().catch(() => { /* already started from gesture */ })
}

const onError = () => {
  activated.value = false
  stateStore.pushError('impossibile riprodurre il video')
}
</script>

<template>
  <div class="card">
    <template v-if="video.status === 'error'">
      <div class="text-overlay"> Errore </div>
    </template>

    <template v-else-if="video.status === 'converted' || canPlayOriginalCodec">
      <video ref="videoEl" :class="{ hidden: !ready }" playsinline :controls="true" preload="none"
        @canplay.once="onCanPlay" @error="onError" />
      <div v-if="!activated" class="thumbnail" @click="activate">
        <img :src="api.videoThumbnailUrl(courseId, video.id)" />
        <img class="play-button" src="@/assets/play-circle.svg" alt="play button">
      </div>
      <div v-else-if="!ready" class="thumbnail">
        <img :src="api.videoThumbnailUrl(courseId, video.id)" />
        <div class="spinner" />
      </div>
    </template>

    <template v-else-if="video.status === 'queued' || video.status === 'converting'">
      <div class="text-overlay"> Disponibile a breve </div>
    </template>
    <template v-else>
      <div class="text-overlay"> Video non disponibile su questo dispositivo </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.card {
  position: relative;

  video.hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .thumbnail {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .play-button {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: transparent;
      width: 4rem;
      height: 4rem;
    }

    .spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 3rem;
      height: 3rem;
      margin: -1.5rem 0 0 -1.5rem;
      border: 0.3rem solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: video-card-spin 0.8s linear infinite;
    }
  }
}

@keyframes video-card-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
