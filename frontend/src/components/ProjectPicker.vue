<script setup>
/**
 * Selector de contexto.
 *
 * La primera opcion es el espacio global, que no pertenece a ningun
 * proyecto. Debajo van los proyectos agrupados por el departamento que los
 * gestiona, que es como se reparten en la organizacion.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { projectStatus } from '../utils/navigation'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  projects: { type: Array, default: () => [] },
  departments: { type: Array, default: () => [] },
  currentId: { type: [String, Number], default: null },
})

const emit = defineEmits(['select'])

const open = ref(false)
const root = ref(null)

const current = computed(
  () => props.projects.find((project) => String(project.id) === String(props.currentId)) ?? null,
)

const currentDepartment = computed(() => {
  if (!current.value) return null
  return (
    props.departments.find(
      (department) => String(department.id) === String(current.value.department_id),
    )?.name ?? null
  )
})

const groups = computed(() => {
  const byDepartment = new Map()
  for (const department of props.departments) {
    byDepartment.set(String(department.id), { name: department.name, items: [] })
  }

  const loose = []
  for (const project of props.projects) {
    const key =
      project.department_id === null || project.department_id === undefined
        ? null
        : String(project.department_id)
    const group = key === null ? null : byDepartment.get(key)
    if (group) group.items.push(project)
    else loose.push(project)
  }

  const result = [...byDepartment.values()].filter((group) => group.items.length)
  if (loose.length) result.push({ name: 'Sin departamento', items: loose })
  return result
})

function onDocumentClick(event) {
  if (!root.value?.contains(event.target)) open.value = false
}

function choose(projectId) {
  open.value = false
  emit('select', projectId)
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left hover:bg-slate-50"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span class="inline-flex h-5 w-5 shrink-0 text-slate-500">
        <AppIcon :name="current ? 'folder' : 'globe'" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-slate-900">
          {{ current ? current.name : projects.length ? 'Todos los proyectos' : 'Sin proyectos' }}
        </span>
        <span class="block truncate text-xs text-slate-500">
          {{ current ? (currentDepartment ?? 'Sin departamento') : 'Vista global' }}
        </span>
      </span>
      <span class="inline-flex h-4 w-4 shrink-0 text-slate-400">
        <AppIcon name="chevronUpDown" />
      </span>
    </button>

    <ul
      v-if="open"
      class="absolute left-0 right-0 top-full z-50 mt-1 min-w-64 max-h-80 overflow-y-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200"
      role="listbox"
    >
      <li role="presentation">
        <button
          type="button"
          role="option"
          :aria-selected="currentId === null"
          class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
          @click="choose(null)"
        >
          <span class="inline-flex mt-0.5 h-4 w-4 shrink-0 text-slate-500">
            <AppIcon name="globe" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium text-slate-900">Todos los proyectos</span>
            <span class="block text-xs text-slate-500">Vista global de la organizacion</span>
          </span>
        </button>
      </li>

      <li v-for="group in groups" :key="group.name" role="presentation">
        <p class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {{ group.name }}
        </p>
        <button
          v-for="project in group.items"
          :key="project.id"
          type="button"
          role="option"
          :aria-selected="String(project.id) === String(currentId)"
          class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
          @click="choose(project.id)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-slate-800">{{ project.name }}</span>
            <span class="block truncate text-xs text-slate-500">
              {{ projectStatus(project.status).label }}
            </span>
          </span>
        </button>
      </li>

      <li v-if="!projects.length" class="px-3 py-2 text-sm text-slate-500" role="presentation">
        No hay proyectos visibles
      </li>
    </ul>
  </div>
</template>
