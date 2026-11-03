<script setup>
/**
 * Miembros del proyecto.
 *
 * Lista las personas asignadas con el rol que ejercen y sus horas base, que
 * son las que se toman como referencia para marcar la sobrecarga en la
 * matriz.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()

const error = ref(null)
const loading = ref(true)

const members = computed(() => store.members)
const totalHours = computed(() =>
  members.value.reduce((sum, member) => sum + Number(member.weekly_base_hours ?? 0), 0),
)

async function loadMembers() {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    await store.ensureMembers(token, props.id)
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(loadMembers)
watch(() => props.id, loadMembers)
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">Miembros y Asignaciones</h1>
        <p class="mt-1 text-sm text-slate-500">
          Personas asignadas al proyecto, con su rol y sus horas base.
        </p>
      </div>
      <p v-if="!loading && members.length" class="text-sm text-slate-500">
        {{ members.length }} persona(s) · {{ totalHours }} h base en total
      </p>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <p
      v-else-if="error"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <div v-else class="overflow-x-auto rounded border border-slate-200 bg-white">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-slate-100">
            <th class="border border-slate-200 px-3 py-2 text-left">Persona</th>
            <th class="border border-slate-200 px-3 py-2 text-left">Correo</th>
            <th class="border border-slate-200 px-3 py-2 text-left">Rol</th>
            <th class="border border-slate-200 px-3 py-2 text-right">Horas base</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in members" :key="member.user_id">
            <th class="border border-slate-200 bg-white px-3 py-2 text-left font-medium">
              {{ member.name }}
            </th>
            <td class="border border-slate-200 px-3 py-2 text-slate-600">{{ member.email }}</td>
            <td class="border border-slate-200 px-3 py-2 text-slate-600">{{ member.role_name }}</td>
            <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
              {{ member.weekly_base_hours }} h/semana
            </td>
          </tr>
          <tr v-if="!members.length">
            <td colspan="4" class="px-3 py-4 text-center text-sm text-slate-500">
              No hay personas asignadas al proyecto.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
