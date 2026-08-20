<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
</script>

<template>
  <image class="ui-icon" :src="`/static/icons/${name}.svg`" :style="{ width: `${size}px`, height: `${size}px` }" mode="aspectFit" />
</template>

<style scoped>
.ui-icon { display: block; flex: none; }
</style>
