<script setup>
/**
 * Armazon de la aplicacion.
 *
 * Hay dos menus. El global agrupa las vistas de toda la organizacion; el del
 * proyecto, las suyas. El proyecto sale siempre de la URL: el de la pagina
 * del proyecto, en la ruta, o el del filtro, en la consulta. Al recargar se
 * vuelve al mismo, y con el el menu que le corresponde.
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
  FILTERED_VIEWS,
  GLOBAL_SECTIONS,
  PROJECT_SECTIONS,
  projectStatus,
  viewLabel,
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
/** Cajon del menu en movil: por debajo de 640 px el menu lateral se esconde. */
const menuAbierto = ref(false)
/** Ambito de la persona que entra: rol, departamento y proyectos editables. */
const scope = ref(null)

let noticeTimer = null

/** Identificador del proyecto abierto: el de la ruta o el del filtro. */
const projectId = computed(() => route.params.id ?? route.query.project ?? null)

/**
 * Hay un proyecto abierto.
 *
 * Es la unica fuente de verdad de en que espacio se esta: el menu lateral y
 * las migas de pan dependen de ella.
 */
const enProyecto = computed(() => projectId.value !== null)

/** Proyecto que filtra la vista, cuando la vista admite filtro. */
const filtroProyecto = computed(() => route.query.project ?? null)

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
  if (projectId.value === null) return false
  const editable = scope.value?.editable_project_ids
  if (!editable) return true
  return editable.includes(Number(projectId.value))
})

const status = computed(() => projectStatus(currentProject.value?.status))

/** Vista abierta, para las migas de pan. */
const currentView = computed(() => route.name)

/**
 * Entrada del menu que esta abierta.
 *
 * El calendario laboral es una pestana de la configuracion, de modo que la
 * entrada marcada es la de configuracion.
 */
const activeView = computed(() => route.name)

/** Etiqueta de la vista abierta, para las migas de pan. */
const currentViewLabel = computed(() => viewLabel(currentView.value))

/** Nombre del proyecto abierto, para las migas de pan. */
const currentProjectName = computed(
  () => currentProject.value?.name ?? `Proyecto ${projectId.value}`,
)

/** Las vistas de planificacion son las que aceptan el filtro de proyecto. */
const muestraFiltro = computed(() => FILTERED_VIEWS.includes(route.name))

/**
 * Secciones del menu lateral.
 *
 * Con un proyecto abierto se ve el menu del proyecto; sin el, el global. La
 * seccion de administracion es solo del gerente.
 */
const sections = computed(() => {
  const lista = enProyecto.value ? PROJECT_SECTIONS : GLOBAL_SECTIONS
  if (isManager.value) return lista
  return lista.filter((section) => !section.managerOnly)
})

/**
 * Destino del boton que devuelve al espacio global.
 *
 * Desde una vista de planificacion se vuelve a la misma vista sin filtro;
 * desde las demas, al panel.
 */
const globalTarget = computed(() => {
  if (FILTERED_VIEWS.includes(route.name)) return { name: route.name }
  return { name: 'panel' }
})

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

/**
 * Como se pinta el menu lateral.
 *
 * En pantallas anchas es una columna que se puede colapsar. En las estrechas
 * se esconde y, cuando el menu esta abierto, sale como un cajon encima de la
 * pagina.
 */
const sideClasses = computed(() => {
  if (menuAbierto.value) return 'fixed inset-y-0 left-0 z-50 w-64 shadow-xl'
  return collapsed.value ? 'max-sm:hidden sm:w-16' : 'max-sm:hidden sm:w-64'
})

/**
 * El menu se colapsa solo en pantallas anchas.
 *
 * El cajon del movil va siempre desplegado: ocultar sus entradas dejaria el
 * menu sin contenidos.
 */
const menuCompacto = computed(() => collapsed.value && !menuAbierto.value)

/**
 * Destino de un enlace del menu.
 *
 * El menu del proyecto lleva su identificador en cada enlace: en los
 * parametros de la ruta para sus vistas propias y en el filtro para las de
 * planificacion. En la vista que ya esta abierta se conserva su estado
 * entero, para que el rango, el modo o la celda abierta no se pierdan.
 */
function linkFor(item) {
  const destino = { name: item.name }
  if (item.projectIn === 'params') destino.params = { id: String(projectId.value) }
  if (item.projectIn === 'query') destino.query = { project: String(projectId.value) }
  if (item.name === route.name) {
    destino.query = { ...route.query }
    if (item.projectIn === 'params') {
      destino.params = { ...route.params, id: String(projectId.value) }
    }
  }
  return destino
}

/**
 * Elige el proyecto que filtra la vista.
 *
 * El filtro vive en la URL (`?project=`), de modo que el enlace se puede
 * compartir y recargar la pagina no lo pierde. Sin proyecto, el filtro se
 * quita y la vista sale con todos los que se ven.
 */
async function selectProject(id) {
  const query = { ...route.query }
  if (id === null || id === undefined) delete query.project
  else query.project = String(id)
  await router.replace({ query })
  store.select(id)
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
  () => projectId.value,
  (id) => {
    store.select(id)
    loadContext(id)
  },
  { immediate: true },
)

/** Al cambiar de vista, el cajon del menu se cierra. */
watch(() => route.fullPath, () => {
  menuAbierto.value = false
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-slate-50">
    <div
      v-if="menuAbierto"
      class="fixed inset-0 z-40 bg-slate-900/50 sm:hidden"
      data-testid="menu-overlay"
      @click="menuAbierto = false"
    ></div>
    <aside
      class="flex shrink-0 flex-col bg-slate-900 text-slate-300 transition-all duration-200"
      :class="sideClasses"
    >
      <div
        class="flex items-center gap-2 px-3 py-4"
        :class="menuCompacto ? 'flex-col gap-2 px-2' : ''"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-siemens-500 text-sm font-bold text-white"
        >
          CP
        </span>
        <span v-if="!menuCompacto" class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold text-white">CorePlanner</span>
          <span class="block text-[11px] leading-tight text-slate-400">v0.1</span>
        </span>
        <button
          type="button"
          class="hidden h-11 w-11 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white sm:flex"
          :title="collapsed ? 'Expandir el menú' : 'Colapsar el menú'"
          data-testid="sidebar-toggle"
          @click="toggleSidebar"
        >
          <span class="inline-flex h-4 w-4">
            <AppIcon :name="collapsed ? 'chevronRight' : 'chevronLeft'" />
          </span>
        </button>
      </div>

      <div class="border-b border-slate-800 px-3 pb-3" data-testid="sidebar-context">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {{ enProyecto ? 'Proyecto' : 'Espacio Global' }}
        </p>
        <p class="truncate text-sm text-white">
          {{ currentProject?.name ?? 'Toda la organización' }}
        </p>
        <p class="truncate text-xs text-slate-400">
          {{
            enProyecto
              ? (department?.name ?? 'Sin departamento')
              : 'Consolidado de todos los proyectos'
          }}
        </p>
      </div>

      <nav class="flex-1 overflow-y-auto px-2 py-2">
        <template v-for="section in sections" :key="section.title">
          <p
            v-if="!menuCompacto && sections.length > 1"
            class="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            {{ section.title }}
          </p>
          <RouterLink
            v-for="item in section.items"
            :key="item.name"
            :to="linkFor(item)"
            class="flex min-h-11 items-center gap-3 rounded-r-md border-l-4 px-3 py-2 text-sm transition-colors"
            :class="
              activeView === item.name
                ? 'border-indigo-500 bg-slate-800 pl-3 font-medium text-white'
                : 'border-transparent pl-3 text-slate-400 hover:bg-slate-800 hover:text-white'
            "
            :title="menuCompacto ? item.label : undefined"
          >
            <span class="inline-flex h-5 w-5 shrink-0">
              <AppIcon :name="item.icon" />
            </span>
            <span v-if="!menuCompacto" class="flex-1 truncate">{{ item.label }}</span>
          </RouterLink>
        </template>

        <RouterLink
          v-if="enProyecto"
          :to="globalTarget"
          class="flex min-h-11 items-center gap-3 rounded-r-md border-l-4 border-transparent px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          data-testid="volver-global"
        >
          <span class="inline-flex h-5 w-5 shrink-0">
            <AppIcon name="arrowLeft" />
          </span>
          <span v-if="!menuCompacto" class="flex-1 truncate">Volver a vista global</span>
        </RouterLink>
      </nav>

      <div class="flex items-center gap-2 border-t border-slate-800 p-3">
        <span
          data-testid="user-avatar"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-siemens-500 text-xs font-semibold text-white"
        >
          {{ initials }}
        </span>
        <span v-if="!menuCompacto" class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-white">{{ auth.user?.name }}</span>
          <span class="block truncate text-xs text-slate-400">
            {{ roleLabel || userDepartment?.name || 'Sin departamento' }}
          </span>
        </span>
        <button
          v-if="!menuCompacto"
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Cerrar sesión"
          data-testid="logout"
          @click="logout"
        >
          <span class="inline-flex h-4 w-4">
            <AppIcon name="logout" />
          </span>
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
        <button
          type="button"
          class="flex h-11 w-11 flex-none items-center justify-center rounded border border-slate-300 bg-white text-slate-700 sm:hidden"
          aria-label="Abrir el menú"
          :aria-expanded="menuAbierto"
          data-testid="menu-toggle"
          @click="menuAbierto = true"
        >
          <span class="inline-flex h-5 w-5">
            <AppIcon name="menu" />
          </span>
        </button>
        <nav class="flex min-w-0 items-center gap-2 text-sm" aria-label="Migas de pan">
          <template v-if="enProyecto">
            <span class="truncate text-slate-500">{{ department?.name ?? 'Sin departamento' }}</span>
            <span class="text-slate-300">/</span>
            <span class="truncate text-slate-500">{{ currentProjectName }}</span>
            <span class="text-slate-300">/</span>
            <span class="truncate font-medium text-slate-900">{{ currentViewLabel }}</span>
          </template>
          <span v-else class="truncate text-slate-500">{{ currentViewLabel }}</span>
        </nav>

        <div class="flex shrink-0 items-center gap-3">
          <div v-if="muestraFiltro" class="w-36 sm:w-64">
            <ProjectPicker
              :projects="store.projects"
              :departments="store.departments"
              :current-id="filtroProyecto"
              @select="selectProject"
            />
          </div>

          <template v-if="currentProject">
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
              class="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white hover:bg-siemens-700"
              data-testid="new-task"
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

      <main class="flex-1 overflow-auto bg-slate-50 p-3 sm:p-6">
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
