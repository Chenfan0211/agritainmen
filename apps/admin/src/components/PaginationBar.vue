<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  page: number
  total: number
  pageSize?: number
}>(), { pageSize: 20 })

const emit = defineEmits<{ (e: 'change', page: number): void }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const pages = computed<(number | '…')[]>(() => {
  const t = totalPages.value
  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1)
  const set = new Set<number>([1, t, props.page - 1, props.page, props.page + 1].filter((n) => n >= 1 && n <= t))
  const sorted = [...set].sort((a, b) => a - b)
  const result: (number | '…')[] = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) result.push('…')
    result.push(n)
    prev = n
  }
  return result
})

function go(n: number) {
  if (n < 1 || n > totalPages.value || n === props.page) return
  emit('change', n)
}
</script>

<template>
  <view class="pagination-bar">
    <text class="pg-total">共 {{ total }} 条</text>
    <view class="pg-btns">
      <button class="pg-btn pg-nav" :disabled="page <= 1" @click="go(page - 1)">‹ 上一页</button>
      <template v-for="(p, i) in pages" :key="`${i}-${p}`">
        <button v-if="p !== '…'" class="pg-btn" :class="{ cur: p === page }" @click="go(p)">{{ p }}</button>
        <text v-else class="pg-ellipsis">…</text>
      </template>
      <button class="pg-btn pg-nav" :disabled="page >= totalPages" @click="go(page + 1)">下一页 ›</button>
    </view>
  </view>
</template>

<style scoped>
.pagination-bar {
  min-height: 52px;
  padding: 0 17px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fafbf8;
  font-size: 13px;
}
.pg-total { color: var(--admin-muted); white-space: nowrap; }
.pg-btns { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pg-btn {
  margin: 0;
  min-width: 30px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--admin-line);
  border-radius: 6px;
  background: #fff;
  color: var(--admin-ink);
  font-size: 13px;
  line-height: 1.35;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pg-btn::after { border: none; }
.pg-btn:hover:not([disabled]):not(.cur) { background: var(--admin-green-soft); border-color: #c8d8cb; }
.pg-btn.cur { background: var(--admin-green-2); border-color: var(--admin-green-2); color: #fff; font-weight: 600; cursor: default; }
.pg-btn[disabled] { opacity: .45; cursor: not-allowed; }
.pg-btn:focus-visible { outline: 2px solid rgba(29, 107, 68, .34); outline-offset: 2px; }
.pg-ellipsis { min-width: 20px; text-align: center; color: var(--admin-muted); user-select: none; }
</style>
