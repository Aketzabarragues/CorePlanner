<script setup>
import { onMounted, ref } from 'vue'

import { projectsApi } from '../api/client'
import { useAuthStore } from '../stores/auth'

const props = defineProps({ id: { type: [String, Number], required: true } })

const rows = ref([])
const error = ref(null)
const loading = ref(true)

const auth = useAuthStore()

onMounted(async () => {
  try {
    const data = await projectsApi.capacity(auth.token, props.id)
    rows.value = data.rows ?? []
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="mx-auto max-w-5xl p-6">
    <h1 class="mb-4 text-lg font-semibold text-siemens-900">Matriz de ocupacion</h1>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <table v-else class="w-full border-collapse text-sm">
      <thead>
        <tr class="bg-slate-100 text-left">
          <th class="border px-3 py-2">Persona</th>
          <th v-for="week in rows[0]?.weeks ?? []" :key="week" class="border px-3 py-2">
            {{ week }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.user_id">
          <td class="border px-3 py-2 font-medium">{{ row.name }}</td>
          <td
            v-for="cell in row.cells"
            :key="cell.week"
            class="border px-3 py-2 text-center"
            :class="cell.overloaded ? 'bg-red-100 font-semibold text-red-700' : ''"
          >
            {{ cell.hours }}
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
