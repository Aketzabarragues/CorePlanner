<script setup>
/**
 * Armazon de la aplicacion.
 *
 * Hay dos menus. El global agrupa las vistas de toda la organizacion; el del
 * proyecto, las suyas. El proyecto sale de la URL de la pagina del proyecto,
 * en la ruta. Al recargar se vuelve al mismo, y con el el menu que le
 * corresponde.
 */
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { meApi, tasksApi } from '../api/client'
import AppIcon from './AppIcon.vue'
import ModalDialog from './ModalDialog.vue'
import TaskForm from './TaskForm.vue'
import AlertBanner from './common/AlertBanner.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useToastStore } from '../stores/toast'
import { GLOBAL_SECTIONS, PROJECT_SECTIONS, projectStatus } from '../utils/navigation'

const auth = useAuthStore()
const store = useProjectsStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const SIDEBAR_KEY = 'coreplanner_sidebar'

const collapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1')
const showNewTask = ref(false)
const saving = ref(false)
/**
 * Error de una accion del armazon, como el alta de tarea.
 *
 * La carga del contexto no avisa aqui: lo avisa la vista abierta.
 */
const error = ref(null)
/** Cajon del menu en movil: por debajo de 640 px el menu lateral se esconde. */
const menuAbierto = ref(false)
/** Ambito de la persona que entra: rol, departamento y proyectos editables. */
const scope = ref(null)

/** Identificador del proyecto abierto: solo la ruta del proyecto lo da. */
const projectId = computed(() => route.params.id ?? null)

/**
 * Hay un proyecto abierto.
 *
 * Es la unica fuente de verdad de en que espacio se esta: el menu lateral y
 * las migas de pan dependen de ella.
 */
const enProyecto = computed(() => projectId.value !== null)

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

/**
 * Entrada del menu que esta abierta.
 *
 * El calendario laboral es una pestana de la configuracion, de modo que la
 * entrada marcada es la de configuracion.
 */
const activeView = computed(() => route.name)

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

/** Homologa global de cada vista de proyecto, sin filtro. */
const GLOBAL_BY_PROJECT_VIEW = {
  'project-capacity': 'capacity',
  'project-gantt': 'gantt',
  'project-calendar': 'calendar',
  'project-activity': 'activity',
}

/**
 * Destino del boton que devuelve al espacio global.
 *
 * Desde una vista de proyecto se vuelve a su homologa global sin filtro;
 * desde las demas, al panel.
 */
const globalTarget = computed(() => {
  const name = GLOBAL_BY_PROJECT_VIEW[route.name]
  return name ? { name } : { name: 'panel' }
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
  if (menuAbierto.value) return 'fixed inset-y-0 left-0 z-50 w-60 shadow-xl'
  return collapsed.value ? 'max-sm:hidden sm:w-16' : 'max-sm:hidden sm:w-60'
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
 * El menu del proyecto lleva su identificador en los parametros de la ruta.
 * En la vista que ya esta abierta se conserva su estado entero, para que el
 * rango, el modo o la celda abierta no se pierdan.
 */
function linkFor(item) {
  const destino = { name: item.name }
  if (item.projectIn === 'params') destino.params = { id: String(projectId.value) }
  if (item.name === route.name) {
    destino.query = { ...route.query }
    if (item.projectIn === 'params') {
      destino.params = { ...route.params, id: String(projectId.value) }
    }
  }
  return destino
}

function logout() {
  auth.signOut()
  router.push({ name: 'login' })
}

/** Abre el alta de tarea con la lista de miembros del proyecto. */
async function openNewTask() {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await store.ensureMembers(token, projectId.value)
    showNewTask.value = true
  } catch (err) {
    error.value = err.message
  }
}

async function createTask(payload) {
  saving.value = true
  error.value = null
  try {
    await tasksApi.create(auth.token, projectId.value, payload)
    showNewTask.value = false
    store.notifyTasksChanged()
    toast.success(`Tarea "${payload.title}" creada.`)
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/**
 * Carga el ambito de quien entra y el contexto del proyecto abierto.
 *
 * Ninguno de estos datos avisa por el armazon: el fallo de una peticion se
 * avisa donde se pide, y la vista abierta es la que dice si el proyecto
 * existe y si falta el permiso. Un 403 en los miembros significa que el
 * proyecto no es visible, y esa es la misma situacion que ya avisa la vista:
 * dos avisos para lo mismo. El aviso del armazon queda para sus propias
 * acciones, como el alta de tarea.
 */
async function loadContext(id) {
  error.value = null
  const token = await auth.ensureSession().catch(() => null)
  if (!token) return
  // El ambito anterior se conserva si la peticion falla: sin el, la cabecera
  // no sabria en que proyectos se puede escribir.
  const ambito = await meApi.get(token).catch(() => null)
  if (ambito) scope.value = ambito
  await store.ensureProjects(token).catch(() => null)
  // Los miembros adornan la cabecera y el alta de tarea: se siguen pidiendo
  // para los proyectos que se pueden ver.
  if (id) await store.ensureMembers(token, id).catch(() => null)
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
  <div class="flex h-screen overflow-hidden bg-lienzo">
    <div
      v-if="menuAbierto"
      class="fixed inset-0 z-40 bg-overlay/50 sm:hidden"
      data-testid="menu-overlay"
      @click="menuAbierto = false"
    ></div>
    <aside
      class="flex shrink-0 flex-col bg-lateral-fondo text-lateral-texto transition-all duration-200"
      :class="sideClasses"
    >
      <div
        class="flex items-center gap-2 px-4"
        :class="menuCompacto ? 'flex-col gap-2 px-2 h-auto' : 'h-14'"
      >
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primario text-cp-xs font-bold text-sobre-primario"
        >
          CP
        </span>
        <span v-if="!menuCompacto" class="min-w-0 flex-1">
          <span class="block truncate text-cp-base font-semibold tracking-tight text-texto-inverso">CorePlanner</span>
          <span class="block font-mono text-cp-xs leading-tight text-lateral-texto-tenue">v0.1</span>
        </span>
        <button
          type="button"
          class="hidden p-1.5 rounded-control text-lateral-texto-tenue transition-colors hover:bg-lateral-hover hover:text-texto-inverso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco sm:block"
          :title="collapsed ? 'Expandir el menú' : 'Colapsar el menú'"
          data-testid="sidebar-toggle"
          @click="toggleSidebar"
        >
          <span class="inline-flex h-4 w-4">
            <AppIcon :name="collapsed ? 'chevronRight' : 'chevronLeft'" />
          </span>
        </button>
      </div>

      <div class="px-3 py-3" data-testid="sidebar-context">
        <div class="rounded-xl border border-lateral-borde bg-lateral-hover/40 px-2.5 py-2">
          <p class="text-cp-micro font-semibold uppercase tracking-wider text-lateral-titulo-seccion">
            {{ enProyecto ? 'Proyecto' : 'Espacio Global' }}
          </p>
          <p class="mt-0.5 truncate text-cp-sm font-medium text-texto-inverso">
            {{ currentProject?.name ?? 'Toda la organización' }}
          </p>
          <p class="truncate text-cp-xs text-lateral-texto-tenue">
            {{
              enProyecto
                ? (department?.name ?? 'Sin departamento')
                : 'Consolidado de todos los proyectos'
            }}
          </p>
        </div>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 py-3">
        <div class="space-y-5">
          <div v-for="section in sections" :key="section.title">
            <p
              v-if="!menuCompacto && sections.length > 1"
              class="px-2.5 mb-1.5 text-cp-micro font-semibold uppercase tracking-wider text-lateral-titulo-seccion"
            >
              {{ section.title }}
            </p>
            <div class="space-y-0.5">
              <RouterLink
                v-for="item in section.items"
                :key="item.name"
                :to="linkFor(item)"
                class="flex w-full items-center gap-2.5 rounded-control border px-2.5 py-2 text-cp-sm leading-4 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                :class="
                  activeView === item.name
                    ? 'border-lateral-activo-borde/30 bg-lateral-activo-fondo/20 font-semibold text-lateral-activo-texto'
                    : 'border-transparent text-lateral-texto transition-colors hover:bg-lateral-hover/60 hover:text-texto-inverso'
                "
                :title="menuCompacto ? item.label : undefined"
              >
                <span
                  class="inline-flex h-4 w-4 shrink-0"
                  :class="
                    activeView === item.name
                      ? 'text-lateral-activo-icono'
                      : 'text-lateral-texto-tenue'
                  "
                >
                  <AppIcon :name="item.icon" />
                </span>
                <span v-if="!menuCompacto" class="flex-1 truncate">{{ item.label }}</span>
              </RouterLink>
            </div>
          </div>

          <RouterLink
            v-if="enProyecto"
            :to="globalTarget"
            class="flex w-full items-center gap-2.5 rounded-control border border-transparent px-2.5 py-2 text-cp-sm leading-4 font-medium text-lateral-texto transition-colors hover:bg-lateral-hover hover:text-texto-inverso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            data-testid="volver-global"
          >
            <span class="inline-flex h-4 w-4 shrink-0 text-lateral-texto-tenue">
              <AppIcon name="arrowLeft" />
            </span>
            <span v-if="!menuCompacto" class="flex-1 truncate">Volver a vista global</span>
          </RouterLink>
        </div>
      </nav>

      <div class="flex items-center gap-2 border-t border-lateral-borde p-3">
        <span
          data-testid="user-avatar"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-avatar bg-lateral-avatar text-cp-xs font-bold text-texto-inverso"
        >
          {{ initials }}
        </span>
        <span v-if="!menuCompacto" class="min-w-0 flex-1">
          <span class="block truncate text-cp-sm font-semibold text-texto-inverso">
            {{ auth.user?.name }}
          </span>
          <span class="block truncate text-cp-xs text-lateral-texto-tenue">
            {{ roleLabel || userDepartment?.name || 'Sin departamento' }}
          </span>
        </span>
        <button
          v-if="!menuCompacto"
          type="button"
          class="p-1.5 rounded-control text-lateral-texto-tenue transition-colors hover:bg-lateral-hover hover:text-texto-inverso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
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

    <!--
      La columna se puede encoger por debajo de su contenido (`min-h-0`). Sin
      esto, el alto minimo automatico de `main` seria el de su contenido: al
      aparecer un aviso la vista creceria, la columna se desbordaria y la
      pagina ganaria un scroll que no debe existir.
    -->
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!--
        La barra superior es la cabecera de la vista. La vista publica aqui su
        titulo, sus filtros y sus acciones con un Teleport; el shell solo pone
        el boton de menu (movil), el hueco donde entra lo publicado y sus
        acciones propias (estado del proyecto y "Nueva Tarea").

        `relative z-30`: el lateral no tiene z-index, asi que la barra se pinta
        encima de el; el cajon del movil (`z-50`) y el velo (`z-40`) siguen por
        encima. El tooltip de la ayuda va dentro de esta barra, asi que no puede
        salirse de su contexto de apilamiento.
      -->
      <header
        class="relative z-30 flex flex-wrap items-center gap-3 border-b border-borde bg-cabecera px-5 py-3"
      >
        <!-- Boton de menu: solo en movil, 44x44 -->
        <button
          type="button"
          class="flex h-11 w-11 flex-none items-center justify-center rounded-control border border-borde-fuerte bg-tarjeta text-texto-suave transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco sm:hidden"
          aria-label="Abrir el menú"
          :aria-expanded="menuAbierto"
          data-testid="menu-toggle"
          @click="menuAbierto = true"
        >
          <span class="inline-flex h-5 w-5">
            <AppIcon name="menu" />
          </span>
        </button>

        <!--
          Destino del Teleport de la cabecera de la vista. Es `flex-1 min-w-0`:
          crece con el contenido y deja que la barra crezca en alto cuando los
          filtros no caben en una linea.
        -->
        <div
          id="cp-barra-vista"
          class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2"
          data-testid="vista-barra"
        ></div>

        <!--
          Acciones propias del shell: estado del proyecto y nueva tarea. Solo
          en el espacio del proyecto: sin proyecto el grupo no existe, para que
          el hueco de la cabecera de la vista no lleve un espacio muerto de
          `gap-3` tras de si.
        -->
        <div v-if="currentProject" class="flex shrink-0 items-center gap-2">
          <span
            v-if="status.tone === 'active'"
            class="rounded-pastilla bg-ok-fondo px-2.5 py-1 text-cp-xs font-medium text-ok-texto"
          >
            {{ status.label }}
          </span>
          <span
            v-else-if="status.tone === 'paused'"
            class="rounded-pastilla bg-aviso-fondo px-2.5 py-1 text-cp-xs font-medium text-aviso-texto"
          >
            {{ status.label }}
          </span>
          <span
            v-else
            class="rounded-pastilla bg-neutro-fondo px-2.5 py-1 text-cp-xs font-medium text-neutro-texto"
          >
            {{ status.label }}
          </span>

          <span
            v-if="!canEdit"
            class="rounded-pastilla bg-neutro-fondo px-2.5 py-1 text-cp-xs font-medium text-neutro-texto"
            title="No tienes permiso de escritura en este proyecto"
          >
            Solo lectura
          </span>

          <button
            v-if="canEdit"
            type="button"
            class="relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-medium text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco after:absolute after:-inset-y-2.5 after:left-0 after:right-0 after:content-['']"
            data-testid="new-task"
            @click="openNewTask"
          >
            <span class="inline-flex h-4 w-4">
              <AppIcon name="plus" />
            </span>
            Nueva Tarea
          </button>
        </div>
      </header>

      <!--
        `min-h-0`: la vista se desplaza por dentro de `main` cuando su
        contenido no cabe; la pagina (`html`) nunca crece.
      -->
      <main class="flex-1 min-h-0 overflow-auto bg-lienzo p-3 sm:p-6">
        <AlertBanner v-if="error" variant="error" class="mb-3">
          {{ error }}
        </AlertBanner>
        <router-view />
      </main>
    </div>

    <ModalDialog
      :open="showNewTask && Boolean(projectId)"
      title="Nueva tarea"
      size="md"
      @close="showNewTask = false"
    >
      <TaskForm
        v-if="projectId"
        :members="store.members"
        form-id="task-form-nueva"
        @save="createTask"
      />
      <template #footer="{ submit }">
        <button
          type="button"
          class="rounded border border-borde-fuerte px-3 py-2 text-sm"
          @click="showNewTask = false"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="rounded bg-primario-fuerte px-3 py-2 text-sm font-medium text-sobre-primario disabled:opacity-60"
        >
          {{ saving ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
