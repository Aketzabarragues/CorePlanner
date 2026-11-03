<script setup>
/**
 * Armazon de la aplicacion.
 *
 * Reune la barra superior con el selector de proyecto, el departamento del
 * proyecto abierto y el perfil de quien esta dentro, mas la barra de
 * pestanas con las tres vistas del proyecto.
 *
 * El proyecto abierto sale siempre de la URL: al recargar la pagina se abre
 * el mismo, y al cambiarlo en el desplegable se navega a la misma vista con
 * el identificador nuevo.
 */
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_VIEWS, projectRoute, viewName } from '../utils/navigation'

const auth = useAuthStore()
const store = useProjectsStore()
const route = useRoute()
const router = useRouter()

const loadError = ref(null)

/** Identificador del proyecto abierto, tomado de la URL. */
const projectId = computed(() => route.params.id ?? store.currentProjectId ?? null)

const currentView = computed(() => viewName(route.name))

const department = computed(() => store.currentDepartment)

const userDepartment = computed(
  () => store.departments.find((item) => item.id === auth.user?.department_id) ?? null,
)

const roleName = computed(() => {
  if (auth.user?.is_global_admin) return 'Administrador global'
  const member = store.members.find((item) => item.email === auth.user?.email)
  return member?.role_name ?? 'Invitado'
})

/** Cambia de proyecto manteniendo la vista en la que se esta. */
function switchProject(event) {
  const id = event.target.value
  if (!id) return
  store.select(id)
  router.push(projectRoute(currentView.value, id))
}

function logout() {
  auth.signOut()
  router.push({ name: 'login' })
}

/** Carga el proyecto abierto y los miembros que dan el rol de la persona. */
async function loadContext(id) {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    if (id && !auth.user?.is_global_admin) {
      await store.ensureMembers(token, id)
    }
    loadError.value = null
  } catch (err) {
    loadError.value = err.message
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
  <div class="min-h-screen bg-slate-50">
    <header class="sticky top-0 z-40 bg-siemens-900 text-white shadow">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5">
        <RouterLink to="/" class="flex items-center gap-2">
          <span
            class="flex h-8 w-8 items-center justify-center rounded bg-white text-sm font-bold text-siemens-900"
          >
            CP
          </span>
          <span class="text-base font-semibold">CorePlanner</span>
        </RouterLink>

        <select
          v-if="store.projects.length"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
          :value="projectId ?? ''"
          @change="switchProject"
        >
          <option v-if="!projectId" value="">Elegir proyecto</option>
          <option
            v-for="project in store.projects"
            :key="project.id"
            :value="String(project.id)"
          >
            {{ project.name }}
          </option>
        </select>

        <span
          v-if="department"
          class="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium"
          title="Departamento del proyecto"
        >
          {{ department.name }}
        </span>

        <div class="ml-auto flex items-center gap-2">
          <span class="text-sm">{{ auth.user?.name }}</span>
          <span class="rounded-full bg-siemens-500 px-2.5 py-1 text-xs">{{ roleName }}</span>
          <span
            v-if="userDepartment"
            class="rounded-full bg-white/15 px-2.5 py-1 text-xs"
            title="Departamento de la persona"
          >
            {{ userDepartment.name }}
          </span>
          <button
            type="button"
            class="rounded border border-white/40 px-2.5 py-1 text-xs hover:bg-white/10"
            @click="logout"
          >
            Cerrar sesion
          </button>
        </div>
      </div>

      <nav v-if="projectId" class="mx-auto flex max-w-7xl gap-1 px-4">
        <RouterLink
          v-for="view in PROJECT_VIEWS"
          :key="view.name"
          :to="projectRoute(view.name, projectId)"
          class="border-b-2 px-3 py-2 text-sm font-medium"
          :class="
            route.name === view.name
              ? 'border-siemens-500 text-white'
              : 'border-transparent text-slate-300 hover:text-white'
          "
          :title="view.hint"
        >
          <span aria-hidden="true">{{ view.icon }}</span>
          {{ view.label }}
        </RouterLink>
      </nav>
    </header>

    <p v-if="loadError" class="mx-auto max-w-7xl px-4 pt-4 text-sm text-red-600">
      {{ loadError }}
    </p>

    <RouterView />
  </div>
</template>
