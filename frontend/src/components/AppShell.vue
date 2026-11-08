<script setup>
/**
 * Armazon de la aplicacion.
 *
 * La navegacion tiene dos contextos. En el global se ve la organizacion
 * entera y la URL no lleva proyecto; en el de proyecto la URL lleva el
 * identificador y el menu muestra las vistas de ese proyecto. El selector de
 * la cabecera salta de un contexto al otro.
 *
 * El proyecto abierto sale siempre de la URL: al recargar la pagina se vuelve
 * al mismo, y al cambiarlo en el desplegable se navega a la vista homologa con
 * el identificador nuevo.
 */
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { meApi, tasksApi } from '../api/client'
import AppIcon from './AppIcon.vue'
import ProjectPicker from './ProjectPicker.vue'
import TaskForm from './TaskForm.vue'
import AlertBanner from './common/AlertBanner.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import {
  GLOBAL_SECTIONS,
  PROJECT_SECTIONS,
  globalRoute,
  globalViewName,
  projectRoute,
  projectStatus,
  toGlobalView,
  toProjectView,
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
/** Ambito de la persona que entra: rol, departamento y proyectos editables. */
const scope = ref(null)

let noticeTimer = null

/** Identificador del proyecto abierto, tomado de la URL. */
const projectId = computed(() => route.params.id ?? null)

/** Sin identificador en la URL se esta en el espacio global. */
const isGlobal = computed(() => projectId.value === null)

const currentProject = computed(
  () =>
    store.projects.find((project) => String(project.id) === String(projectId.value)) ?? null,
)

const department = computed(
  () =>
    store.departments.find((item) => item.id === currentProject.value?.department_id) ?? null,
)

const userDepartment = computed(
  () => store.departments.find((item) => item.id === auth.user?.department_id) ?? null,
)

/** Rol de empresa con el que entra la persona. */
const roleLabel = computed(() => scope.value?.role_label ?? '')

/** El gerente es quien puede configurar la organizacion. */
const isManager = computed(() => scope.value?.is_manager === true)

/**
 * Indica si la persona puede escribir en el proyecto abierto.
 *
 * Un proyecto puede verse sin poder editarlo: es el caso de quien participa
 * con una tarea sin ser miembro.
 */
const canEdit = computed(() => {
  if (isGlobal.value || projectId.value === null) return false
  const editable = scope.value?.editable_project_ids
  if (!editable) return true
  return editable.includes(Number(projectId.value))
})

const status = computed(() => projectStatus(currentProject.value?.status))

/** Vista abierta, para las migas de pan y al cambiar de contexto. */
const currentView = computed(() =>
  isGlobal.value ? globalViewName(route.name) : viewName(route.name),
)

/** Secciones del menu, que dependen del contexto abierto. */
const sections = computed(() => {
  const base = isGlobal.value ? GLOBAL_SECTIONS : PROJECT_SECTIONS
  if (isManager.value) return base
  return base.filter((section) => !section.managerOnly)
})

/** Etiqueta de la vista abierta, para las migas de pan. */
const currentViewLabel = computed(() =>
  route.name === 'project' ? 'Resumen' : viewLabel(currentView.value),
)

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

/** Destino de un enlace del menu, segun el contexto abierto. */
function linkFor(item) {
  if (isGlobal.value) return globalRoute(item.name)
  return projectRoute(item.name, projectId.value)
}

/**
 * Cambia de contexto.
 *
 * De un proyecto a otro se mantiene la vista; del espacio global a un
 * proyecto se entra por la vista homologa y al revés.
 */
function selectProject(id) {
  if (id === null || id === undefined) {
    router.push(globalRoute(toGlobalView(currentView.value)))
    return
  }
  const view = isGlobal.value ? toProjectView(currentView.value) : currentView.value
  store.select(id)
  router.push(projectRoute(view, id))
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
    scope.value = await meApi.get(token)
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
      <div
        class="flex items-center gap-2 px-3 py-4"
        :class="collapsed ? 'flex-col gap-2 px-2' : ''"
      >
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

      <div class="border-b border-slate-800 px-3 pb-3">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {{ isGlobal ? 'Espacio Global' : 'Proyecto' }}
        </p>
        <p class="truncate text-sm text-white">
          {{ isGlobal ? 'Toda la organizacion' : (currentProject?.name ?? 'Proyecto') }}
        </p>
        <p v-if="!isGlobal" class="truncate text-xs text-slate-400">
          {{ department?.name ?? 'Sin departamento' }}
        </p>
      </div>

      <nav class="flex-1 overflow-y-auto px-2 py-2">
        <template v-for="section in sections" :key="section.title">
          <p
            v-if="!collapsed && sections.length > 1"
            class="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            {{ section.title }}
          </p>
          <RouterLink
            v-for="item in section.items"
            :key="item.name"
            :to="linkFor(item)"
            class="flex items-center gap-3 rounded-r-md border-l-4 px-3 py-2 text-sm transition-colors"
            :class="
              route.name === item.name
                ? 'border-indigo-500 bg-slate-800 pl-3 font-medium text-white'
                : 'border-transparent pl-3 text-slate-400 hover:bg-slate-800 hover:text-white'
            "
            :title="collapsed ? item.label : undefined"
          >
            <span class="inline-flex h-5 w-5 shrink-0">
              <AppIcon :name="item.icon" />
            </span>
            <span v-if="!collapsed" class="flex-1 truncate">{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>

      <RouterLink
        v-if="!isGlobal"
        :to="globalRoute('projects')"
        class="flex items-center gap-3 border-t border-slate-800 px-5 py-3 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
        title="Volver a la vista global"
      >
        <span class="inline-flex h-5 w-5 shrink-0">
          <AppIcon name="arrowLeft" />
        </span>
        <span v-if="!collapsed" class="flex-1 truncate">Volver a vista global</span>
      </RouterLink>

      <div class="flex items-center gap-2 border-t border-slate-800 p-3">
        <span
          data-testid="user-avatar"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-siemens-500 text-xs font-semibold text-white"
        >
          {{ initials }}
        </span>
        <span v-if="!collapsed" class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-white">{{ auth.user?.name }}</span>
          <span class="block truncate text-xs text-slate-400">
            {{ roleLabel || userDepartment?.name || 'Sin departamento' }}
          </span>
        </span>
        <button
          v-if="!collapsed"
          type="button"
          class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Cerrar sesion"
          @click="logout"
        >
          <span class="inline-flex h-4 w-4">
            <AppIcon name="logout" />
          </span>
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6">
        <nav class="flex min-w-0 items-center gap-2 text-sm" aria-label="Migas de pan">
          <template v-if="isGlobal">
            <span class="text-slate-500">Espacio Global</span>
            <span class="text-slate-300">/</span>
            <span class="font-medium text-slate-900">{{ currentViewLabel }}</span>
          </template>
          <template v-else>
            <span class="truncate text-slate-500">{{ department?.name ?? 'Sin departamento' }}</span>
            <span class="text-slate-300">/</span>
            <span class="truncate font-medium text-slate-900">{{ currentProject?.name }}</span>
            <span class="text-slate-300">/</span>
            <span class="truncate text-slate-500">{{ currentViewLabel }}</span>
          </template>
        </nav>

        <div class="flex shrink-0 items-center gap-3">
          <div class="w-64">
            <ProjectPicker
              :projects="store.projects"
              :departments="store.departments"
              :current-id="projectId"
              @select="selectProject"
            />
          </div>

          <template v-if="!isGlobal">
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
              <span
                v-if="!canEdit"
                class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                title="No tienes permiso de escritura en este proyecto"
              >
                Solo lectura
              </span>
            </div>

            <button
              v-if="canEdit"
              type="button"
              class="flex items-center gap-1.5 whitespace-nowrap rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white hover:bg-siemens-700"
              @click="openNewTask"
            >
              <span class="inline-flex h-4 w-4">
                <AppIcon name="plus" />
              </span>
              Nueva Tarea
            </button>
          </template>
        </div>
      </header>

      <main class="flex-1 overflow-auto bg-slate-50 p-6">
        <AlertBanner v-if="error" variant="error" class="mb-3">
          {{ error }}
        </AlertBanner>
        <AlertBanner
          v-else-if="notice"
          variant="success"
          class="mb-3"
          dismissible
          @dismiss="notice = null"
        >
          {{ notice }}
        </AlertBanner>
        <router-view />
      </main>
    </div>

    <TaskForm
      v-if="showNewTask && projectId"
      :members="store.members"
      :saving="saving"
      @cancel="showNewTask = false"
      @save="createTask"
    />
  </div>
</template>
