<script setup lang="ts">
import type { Notification } from '@/store'
defineProps<{ notification: Notification }>()
</script>

<template>
  <div class="notification" :class="{ [notification.type]: true, 'persistent': notification.persistent }">
    <img v-if="notification.type === 'error'" src="@/assets/error-white.svg" alt="">
    <img v-if="notification.type === 'success'" src="@/assets/success-white.svg" alt="">
    <img v-if="notification.type === 'info'" src="@/assets/info-white.svg" alt="">
    <div>
      {{ notification.message }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.notification {
  width: fit-content;
  padding: 0.75rem 1rem;
  background: #fff;
  border-radius: 10px;

  color: var(--color-white);
  font-weight: bold;
  display: flex;
  gap: 0.5rem;
  align-items: center;

  &:not(.persistent) {
    animation:
      0.25s ease-in 0s forwards fadeIn,
      0.5s ease-in 7.5s forwards fadeOut;
  }

  &.persistent {
    animation:
      0.25s ease-in 0s forwards fadeIn;
  }

  img {
    width: 1.2rem;
    height: 1.2rem;
  }

  &.error {
    background-color: var(--color-primary);
  }

  &.success {
    background-color: var(--color-green);
  }

  &.info {
    background-color: var(--color-gray);
  }
}

@keyframes fadeInMoveUpFadeOut {
  0% {
    opacity: 0;
    transform: translateY(100%);
  }

  5% {
    opacity: 1;
    transform: translateY(0);
  }

  95% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  0% {
    opacity: 0;
    transform: translateY(100%);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeOut {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  100% {
    opacity: 0;
    transform: scale(0);
  }
}
</style>
