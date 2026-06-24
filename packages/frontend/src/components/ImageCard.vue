<script setup lang="ts">
defineProps<{ label: string; src: string }>()
</script>

<template>
  <div class="card">
    <img v-if="src" :src="src" />
    <div class="label-overlay">
      <div class="label"> {{ label }} </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.card {
  position: relative;

  img {
    filter: brightness(30%);
  }

  .label-overlay {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;

    display: flex;
    justify-content: center;
    align-items: center;

    padding: 2rem;
    text-align: center;

    .label {
      color: var(--color-white);
      font-weight: 700;
      font-size: 2rem;
    }
  }
}
</style>
