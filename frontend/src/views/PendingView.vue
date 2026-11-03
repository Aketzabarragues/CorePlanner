<script setup>
/**
 * Vista de una seccion todavia pendiente.
 *
 * Los enlaces del menu lateral llevan aqui para que no dejen un callejon
 * sin salida, y para dejar claro que queda por hacer.
 */
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_VIEWS } from '../utils/navigation'

const props = defineProps({
  section: { type: String, required: true },
})

const route = useRoute()
const store = useProjectsStore()

const view = computed(() => PROJECT_VIEWS.find((item) => item.name === props.section))

const pending = computed(() => {
  if (props.section === 'members') {
    return [
      'Anadir y quitar personas del proyecto',
      'Cambiar el rol de cada persona y sus permisos',
      'Dar de alta una persona con su correo y su base de horas',
    ]
  }
  return [
    'Renombrar el proyecto y cambiar su departamento gestor',
    'Ajustar las horas base de cada persona del proyecto',
    'Archivar el proyecto y su historial de tareas',
  ]
})
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="rounded-lg border border-slate-200 bg-white p-8">
      <div class="flex items-center gap-3">
        <span
          class="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-siemens-900"
        >
          <span class="inline-flex h-6 w-6">
            <AppIcon :name="view?.icon ?? 'sliders'" />
          </span>
        </span>
        <div>
          <h1 class="text-xl font-semibold text-siemens-900">{{ view?.label }}</h1>
          <p class="text-sm text-slate-500">{{ view?.hint }}</p>
        </div>
      </div>

      <p class="mt-6 text-sm text-slate-600">
        Esta seccion todavia no esta implementada. Lo pendiente es:
      </p>

      <ul class="mt-3 space-y-2">
        <li
          v-for="item in pending"
          :key="item"
          class="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        >
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          {{ item }}
        </li>
      </ul>

      <div class="mt-6 flex flex-wrap gap-2">
        <RouterLink
          :to="{ name: 'capacity', params: { id: String(route.params.id) } }"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        >
          Ir a la matriz
        </RouterLink>
        <RouterLink
          :to="{ name: 'kanban', params: { id: String(route.params.id) } }"
          class="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          Ir al tablero
        </RouterLink>
      </div>
    </div>
  </div>
</template>
