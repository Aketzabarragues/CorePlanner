<script setup>
import Gantt from 'frappe-gantt'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { projectsApi } from '../api/client'
import { useAuthStore } from '../stores/auth'

const props = defineProps({ id: { type: [String, Number], required: true } })

const container = ref(null)
const error = ref(null)
let gantt = null

const auth = useAuthStore()

function render(tasks) {
  if (!container.value) return
  container.value.innerHTML = ''
  gantt = new Gantt(container.value, tasks, {
    view_mode: 'Week',
    view_date_selectable: 'always',
    bar_height: 24,
    padding: 16,
    column_width: 40,
  })
}

onMounted(async () => {
  try {
    const data = await projectsApi.gantt(auth.token, props.id)
    render(data.tasks ?? [])
  } catch (err) {
    error.value = err.message
  }
})

watch(
  () => props.id,
  async () => {
    error.value = null
    const data = await projectsApi.gantt(auth.token, props.id)
    render(data.tasks ?? [])
  },
)

onBeforeUnmount(() => {
  gantt = null
})
</script>

<template>
  <main class="mx-auto max-w-6xl p-6">
    <h1 class="mb-4 text-lg font-semibold text-siemens-900">Diagrama de Gantt</h1>
    <p v-if="error" class="mb-2 text-sm text-red-600">{{ error }}</p>
    <div ref="container" class="overflow-x-auto rounded border border-slate-200 bg-white p-2" />
  </main>
</template>
