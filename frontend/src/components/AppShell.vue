<script setup>
/**
 * Armazon de la aplicacion.
 *
 * Sidebar con el selector de proyecto y el menu por grupos, cabecera con las
 * migas de pan y las acciones rapidas, y el area de contenido con scroll
 * propio.
 *
 * El proyecto abierto sale siempre de la URL: al recargar la pagina se vuelve
 * al mismo, y al cambiarlo en el desplegable se navega a la vista actual con
 * el identificador nuevo.
 */
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { tasksApi } from '../api/client'
import AppIcon from './AppIcon.vue'
import ProjectPicker from './ProjectPicker.vue'
import TaskForm from './TaskForm.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import {
  PROJECT_SECTIONS,
  projectRoute,
  projectStatus,
  viewLabel,
  viewName,
} from '../utils/navigation'

const auth = useAuthStore()
const store = useProjectsStore()
const route = useRoute()
const router = useRouter()

const SIDEBAR_KEY = 'coreplanner_sidebar'

const collapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1')
const showNewTask = ref(false)
const saving = ref(false)
const error = ref(null)
const notice = ref(null)

let noticeTimer = null

/** Identificador del proyecto abierto, tomado de la URL. */
const projectId = computed(() => route.params.id ?? store.currentProjectId ?? null)

const currentProject = computed(
  () => store.projects.find((project) => String(project.id) === String(projectId.value)) ?? null,
)

const department = computed(
  () =>
    store.departments.find((item) => item.id === currentProject.value?.department_id) ?? null,
)

const userDepartment = computed(
  () => store.departments.find((item) => item.id === auth.user?.department_id) ?? null,
)

const status = computed(() => projectStatus(currentProject.value?.status))

/** Vista abierta, para las migas de pan y al cambiar de proyecto. */
const currentView = computed(() => viewName(route.name))

/** Iniciales de la persona con la sesion iniciada. */
const initials = computed(() => {
  const name = auth.user?.name ?? ''
  const words = name.split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
})

function toggleSidebar() {
  collapsed.value = !collapsed.value
  localStorage.setItem(SIDEBAR_KEY, collapsed.value ? '1' : '0')
}

/** Cambia de proyecto manteniendo la vista en la que se esta. */
function selectProject(id) {
  store.select(id)
  router.push(projectRoute(currentView.value, id))
}

function logout() {
  auth.signOut()
  router.push({ name: 'login' })
}

/** Abre el alta de tarea con la lista de miembros del proyecto. */
async function openNewTask() {
  error.value = null
  const token = await auth.ensureSession()
  await store.ensureMembers(token, projectId.value)
  showNewTask.value = true
}

function flash(message) {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = null
  }, 6000)
}

async function createTask(payload) {
  saving.value = true
  error.value = null
  try {
    await tasksApi.create(auth.token, projectId.value, payload)
    showNewTask.value = false
    store.notifyTasksChanged()
    flash(`Tarea "${payload.title}" creada.`)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Carga el proyecto abierto y los miembros que dan el rol de la persona. */
async function loadContext(id) {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    if (id) await store.ensureMembers(token, id)
    error.value = null
  } catch (err) {
    error.value = err.message
  }
}

watch(
  () => route.params.id,
  (id) => {
    store.select(id)
    loadContext(id)
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-slate-50">
    <aside
      class="flex flex-shrink-0 flex-col bg-slate-900 text-slate-300 transition-all duration-200"
      :class="collapsed ? 'w-16' : 'w-64'"
    >
      <div class="flex items-center gap-2 px-3 py-4" :class="collapsed ? 'flex-col gap-2 px-2' : ''">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-siemens-500 text-sm font-bold text-white"
        >
          CP
        </span>
        <span v-if="!collapsed" class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold text-white">CorePlanner</span>
          <span class="block text-[11px] leading-tight text-slate-400">v0.1</span>
        </span>
        <button
          type="button"
          class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          :title="collapsed ? 'Expandir el menu' : 'Colapsar el menu'"
          @click="toggleSidebar"
        >
          <span class="inline-flex h-4 w-4">
            <AppIcon :name="collapsed ? 'chevronRight' : 'chevronLeft'" />
          </span>
        </button>
      </div>

      <div class="px-3 pb-3">
        <ProjectPicker
          :projects="store.projects"
          :departments="store.departments"
          :current-id="projectId"
          :compact="collapsed"
          @select="selectProject"
        />
      </div>

      <nav class="flex-1 overflow-y-auto px-2 pb-3">
        <div v-for="section in PROJECT_SECTIONS" :key="section.title">
          <p
            v-if="!collapsed"
            class="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
          >
            {{ section.title }}
          </p>
          <hr v-else class="mx-2 my-3 border-slate-800" />

          <RouterLink
            v-for="item in section.items"
            :key="item.name"
            :to="projectRoute(item.name, projectId)"
            class="flex items-center gap-3 border-l-4 py-2 pr-3 text-sm"
            :class="
              route.name === item.name
                ? 'border-indigo-500 bg-slate-800 pl-3 font-medium text-white'
                : 'border-transparent pl-3 text-slate-400 hover:bg-slate-800 hover:text-white'
            "
            :title="item.hint"
          >
            <span class="inline-flex h-5 w-5 shrink-0">
              <AppIcon :name="item.icon" />
            </span>
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <div class="border-t border-slate-800 p-3">
        <div class="flex items-center gap-2">
          <span
            data-testid="user-avatar"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-siemens-500 text-xs font-semibold text-white"
          >
            {{ initials }}
          </span>
          <span v-if="!collapsed" class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-white" :title="auth.user?.name">
              {{ auth.user?.name }}
            </span>
            <span class="block truncate text-xs text-slate-400">
              {{ userDepartment?.name ?? 'Sin departamento' }}
            </span>
          </span>
          <button
            type="button"
            class="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Cerrar sesion"
            @click="logout"
          >
            <span class="inline-flex h-4 w-4">
              <AppIcon name="logout" />
            </span>
          </button>
        </div>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6"
      >
        <nav class="flex min-w-0 items-center gap-2 text-sm">
          <span class="truncate text-slate-500">{{ department?.name ?? 'Sin departamento' }}</span>
          <span class="text-slate-300">/</span>
          <span class="truncate font-medium text-slate-900">
            {{ currentProject?.name ?? 'Proyectos' }}
          </span>
          <span class="text-slate-300">/</span>
          <span class="truncate text-slate-500">{{ viewLabel(currentView) }}</span>
        </nav>

        <div class="flex items-center gap-3">
          <span
            v-if="status.tone === 'active'"
            class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700"
          >
            {{ status.label }}
          </span>
          <span
            v-else-if="status.tone === 'paused'"
            class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700"
          >
            {{ status.label }}
          </span>
          <span
            v-else
            class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
          >
            {{ status.label }}
          </span>
          <button
            v-if="projectId"
            type="button"
            class="flex items-center gap-1.5 whitespace-nowrap rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white hover:bg-siemens-700"
            @click="openNewTask"
          >
            <span class="inline-flex h-4 w-4">
              <AppIcon name="plus" />
            </span>
            Nueva Tarea
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-auto bg-slate-50 p-6">
        <p v-if="error" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {{ error }}
        </p>
        <router-view :key="store.tasksRevision" />
      </main>
    </div>

    <div
      v-if="showNewTask"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="showNewTask = false"
    >
      <div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <TaskForm
          :members="store.members"
          :saving="saving"
          @save="createTask"
          @cancel="showNewTask = false"
        />
      </div>
    </div>

    <div
      v-if="notice"
      class="fixed bottom-6 right-6 z-50 cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
      title="Cerrar aviso"
      @click="notice = null"
    >
      {{ notice }}
    </div>
  </div>
</template>
