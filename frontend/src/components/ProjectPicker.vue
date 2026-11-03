<script setup>
/**
 * Selector de proyecto.
 *
 * Muestra el proyecto abierto con su departamento y permite cambiar a otro
 * sin recargar la pagina. Es un desplegable propio, y no un select nativo,
 * porque cada proyecto muestra tambien su departamento.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppIcon from './AppIcon.vue'

const props = defineProps({
  projects: { type: Array, required: true },
  departments: { type: Array, default: () => [] },
  currentId: { type: [String, Number], default: null },
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])

const open = ref(false)
const root = ref(null)

const current = computed(
  () => props.projects.find((project) => String(project.id) === String(props.currentId)) ?? null,
)

/** Nombre del departamento al que pertenece un proyecto. */
function departmentOf(project) {
  if (!project) return null
  return props.departments.find((item) => item.id === project.department_id)?.name ?? null
}

const currentDepartment = computed(() => departmentOf(current.value))

function choose(project) {
  open.value = false
  emit('select', project.id)
}

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-left hover:bg-slate-700"
      :class="compact ? 'justify-center' : ''"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <span class="inline-flex h-5 w-5 shrink-0 text-slate-400">
        <AppIcon name="folder" />
      </span>
      <span v-if="!compact" class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-white">
          {{ current ? current.name : 'Sin proyecto' }}
        </span>
        <span class="block truncate text-xs text-slate-400">
          {{ currentDepartment ?? 'Sin departamento' }}
        </span>
      </span>
      <span v-if="!compact" class="inline-flex h-4 w-4 shrink-0 text-slate-400">
        <AppIcon name="chevronUpDown" />
      </span>
    </button>

    <ul
      v-if="open"
      class="absolute left-0 right-0 top-full z-50 mt-1 min-w-56 max-h-72 overflow-y-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200"
      role="listbox"
    >
      <li v-if="!projects.length" class="px-3 py-2 text-sm text-slate-500">
        No hay proyectos visibles.
      </li>
      <li v-for="project in projects" :key="project.id">
        <button
          type="button"
          class="flex w-full flex-col px-3 py-2 text-left hover:bg-slate-50"
          :class="String(project.id) === String(currentId) ? 'bg-slate-50' : ''"
          role="option"
          :aria-selected="String(project.id) === String(currentId)"
          @click="choose(project)"
        >
          <span class="truncate text-sm font-medium text-slate-900">{{ project.name }}</span>
          <span class="truncate text-xs text-slate-500">
            {{ departmentOf(project) ?? 'Sin departamento' }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
