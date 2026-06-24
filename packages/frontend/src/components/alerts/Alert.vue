<script setup lang="ts">
</script>

<template>
  <div class="dialog-overlay">
    <div class="block">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.dialog-overlay {
  position: fixed;
  top: 5rem;
  bottom: 0;
  left: 0;
  right: 0;

  background-color: #0009;

  display: flex;
  justify-content: center;
  align-items: center;

  padding: 0 2rem 5rem 2rem;

  .block {
    width: 25rem;
    max-width: 100%;
  }
}
</style>
