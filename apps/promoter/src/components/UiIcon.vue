<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
</script>

<template>
  <!-- #ifdef MP-WEIXIN -->
  <image class="ui-icon" :src="`/static/icons/${name}.png`" :style="{ width: `${size}px`, height: `${size}px` }" mode="aspectFit" />
  <!-- #endif -->
  <!-- #ifndef MP-WEIXIN -->
  <image class="ui-icon" :src="`/static/icons/${name}.svg`" :style="{ width: `${size}px`, height: `${size}px` }" mode="aspectFit" />
  <!-- #endif -->
</template>

<style scoped>
.ui-icon { display: block; flex: none; }
</style>