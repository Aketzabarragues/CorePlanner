<script setup>
/**
 * Configuracion del proyecto.
 *
 * Los datos del proyecto: como se llama, en que estado esta, que departamento
 * lo gestiona y quien lo lleva. Solo el gerente puede cambiarlos.
 *
 * Debajo, los estados de tarea del tablero (tambien solo el gerente): alta,
 * edicion, reordenado con botones y borrado con reasignacion. La lista sale
 * de la tienda `taskStatuses`, en el orden del servidor, y cada mutacion
 * termina en una recarga desde el servidor.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { configApi, meApi, taskStatusesApi } from '../api/client'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import ColorPicker from '../components/common/ColorPicker.vue'
import ModalDialog from '../components/ModalDialog.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { useToastStore } from '../stores/toast'
import { PALETTE } from '../utils/palette'
import { PROJECT_STATUSES, projectStatus } from '../utils/navigation'
import { barra, pildora } from '../utils/statusColor'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()
const toast = useToastStore()
const statusStore = useTaskStatusesStore()

const error = ref(null)
const loading = ref(true)
const saving = ref(false)
const isManager = ref(false)
const people = ref([])
const form = ref({ name: '', status: 'planning', department_id: '', owner_id: '' })

const project = computed(
  () => store.projects.find((item) => String(item.id) === String(props.id)) ?? null,
)

const departments = computed(() => store.departments)

/** Rellena el formulario con los datos del proyecto. */
function fillForm(current) {
  form.value = {
    name: current.name,
    status: current.status,
    department_id: current.department_id === null ? '' : String(current.department_id),
    owner_id: current.owner_id === null ? '' : String(current.owner_id),
  }
}

async function load() {
  loading.value = true
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    isManager.value = scope.is_manager === true
    await store.ensureProjects(token)
    const current = store.projects.find((item) => String(item.id) === String(props.id))
    if (current) fillForm(current)
    if (isManager.value) {
      people.value = await configApi.people(token).catch(() => [])
    }
    error.value = null
    if (isManager.value) await cargarEstados()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function save() {
  error.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await configApi.updateProject(token, props.id, {
      name: form.value.name,
      status: form.value.status,
      department_id: form.value.department_id === '' ? null : Number(form.value.department_id),
      owner_id: form.value.owner_id === '' ? null : Number(form.value.owner_id),
    })
    await store.load(token)
    toast.success('Proyecto guardado.')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

// ---- Estados de tarea del tablero (solo el gerente) -------------------------
//
// La lista sale de la tienda, en el orden del servidor; toda mutacion termina
// en `reload` y un toast. Los errores de mutacion se quedan en linea: en la
// seccion o en el dialogo donde ha ocurrido.

const estadosCargando = ref(false)
const estadosError = ref('')
const estadosErrorStatus = ref(null)
const errorAccion = ref('')
const moviendo = ref(false)

const formAbierto = ref(false)
const editando = ref(null)
const estadoForm = ref({ label: '', color: null, progress: 0 })
const errorFormulario = ref('')
const guardandoEstado = ref(false)

const borrando = ref(null)
const destino = ref('')
const errorBorrado = ref('')
const borrandoGuardando = ref(false)

/** Lista de estados del proyecto, en el orden que manda el servidor. */
const estados = computed(() => statusStore.statesOf(props.id))

/** Los estados del proyecto menos el que se borra: las opciones del destino. */
const otrosEstados = computed(() =>
  estados.value.filter((item) => item.id !== borrando.value?.id),
)

/** Nombre de la paleta de un hex; "Sin color" cuando el estado no tiene. */
function nombreColor(hex) {
  return PALETTE.find((item) => item.hex === hex)?.label ?? 'Sin color'
}

/** Carga los estados del proyecto para la seccion. */
async function cargarEstados() {
  estadosCargando.value = true
  estadosError.value = ''
  estadosErrorStatus.value = null
  try {
    const token = await auth.ensureSession()
    await statusStore.loadProject(token, props.id)
  } catch (err) {
    estadosError.value = err.message
    estadosErrorStatus.value = err.status ?? null
  } finally {
    estadosCargando.value = false
  }
}

/** Abre el formulario vacio para crear un estado nuevo. */
function abrirAlta() {
  editando.value = null
  estadoForm.value = { label: '', color: null, progress: 0 }
  errorFormulario.value = ''
  formAbierto.value = true
}

/** Abre el formulario con los datos del estado a editar. */
function editar(estado) {
  editando.value = estado
  estadoForm.value = { label: estado.label, color: estado.color, progress: estado.progress }
  errorFormulario.value = ''
  formAbierto.value = true
}

function cerrarFormulario() {
  formAbierto.value = false
  editando.value = null
  errorFormulario.value = ''
}

/** Crea o actualiza el estado y recarga la lista desde el servidor. */
async function guardarEstado() {
  const label = estadoForm.value.label.trim()
  const avance = Number(estadoForm.value.progress)
  if (label === '') {
    errorFormulario.value = 'La etiqueta no puede estar vacía.'
    return
  }
  if (!Number.isInteger(avance) || avance < 0 || avance > 100) {
    errorFormulario.value = 'El avance tiene que estar entre 0 y 100.'
    return
  }
  errorFormulario.value = ''
  guardandoEstado.value = true
  try {
    const token = await auth.ensureSession()
    const payload = { label, color: estadoForm.value.color, progress: avance }
    if (editando.value) {
      await taskStatusesApi.update(token, props.id, editando.value.id, payload)
      toast.success('Estado actualizado.')
    } else {
      await taskStatusesApi.create(token, props.id, payload)
      toast.success('Estado creado.')
    }
    await statusStore.reload(token, props.id)
    cerrarFormulario()
  } catch (err) {
    errorFormulario.value = err.message
  } finally {
    guardandoEstado.value = false
  }
}

/** Cambia el estado con su vecino y manda la lista completa de ids. */
async function mover(indice, arriba) {
  if (moviendo.value) return
  const lista = estados.value
  const destinoIndice = indice + (arriba ? -1 : 1)
  const ids = lista.map((item) => item.id)
  ;[ids[indice], ids[destinoIndice]] = [ids[destinoIndice], ids[indice]]
  const movido = lista[indice]
  let bien = false
  moviendo.value = true
  try {
    const token = await auth.ensureSession()
    await taskStatusesApi.order(token, props.id, ids)
    await statusStore.reload(token, props.id)
    bien = true
  } catch (err) {
    errorAccion.value = err.message
  } finally {
    moviendo.value = false
  }
  if (bien) {
    toast.success(arriba ? `«${movido.label}» sube una posición.` : `«${movido.label}» baja una posición.`)
    // Con `moviendo` a false ya: el destino del foco esta habilitado en ese momento.
    await nextTick()
    devolverFocoSiHaceFalta(movido.key, arriba)
  }
}

/**
 * Tras mover, si el boton pulsado queda deshabilitado por llegar al extremo,
 * el foco pasa al boton contrario de la fila: un `disabled` con foco regresa
 * el foco al body y la navegacion salta al principio de la pagina.
 */
function devolverFocoSiHaceFalta(clave, arriba) {
  const pulsado = arriba ? 'task-status-up' : 'task-status-down'
  const contrario = arriba ? 'task-status-down' : 'task-status-up'
  const boton = document.querySelector(`[data-testid="${pulsado}"][data-status-key="${clave}"]`)
  if (!boton?.disabled) return
  document.querySelector(`[data-testid="${contrario}"][data-status-key="${clave}"]`)?.focus()
}

/** Abre el dialogo de borrado del estado. */
function pedirBorrado(estado) {
  borrando.value = estado
  destino.value = ''
  errorBorrado.value = ''
}

function cerrarBorrado() {
  borrando.value = null
  destino.value = ''
  errorBorrado.value = ''
}

/** Borra el estado, reasignando sus tareas al destino elegido si las tiene. */
async function borrarEstado() {
  const estado = borrando.value
  if (!estado) return
  borrandoGuardando.value = true
  try {
    const token = await auth.ensureSession()
    const claveDestino = destino.value === '' ? undefined : destino.value
    await taskStatusesApi.remove(token, props.id, estado.id, claveDestino)
    const destinoEtiqueta = estados.value.find((item) => item.key === claveDestino)?.label
    toast.success(
      estado.task_count > 0
        ? `«${estado.label}» borrado. Las ${estado.task_count} tareas pasan a «${destinoEtiqueta}».`
        : 'Estado borrado.',
    )
    await statusStore.reload(token, props.id)
    cerrarBorrado()
  } catch (err) {
    errorBorrado.value = err.message
  } finally {
    borrandoGuardando.value = false
  }
}

onMounted(load)
watch(() => props.id, load)
</script>

<template>
  <div>
    <PageHeader
      title="Configuración del proyecto"
      :subtitle="`${project?.name ?? 'Proyecto'} · ${projectStatus(project?.status).label}`"
    />

    <AsyncState
      :loading="loading"
      :error="isManager ? '' : error"
      error-test-id="project-settings-error"
      loading-label="Cargando la configuración del proyecto"
      @retry="load"
    >
      <div class="rounded border border-slate-200 bg-white p-5">
        <AlertBanner
          v-if="error"
          variant="error"
          class="mb-3"
          data-testid="project-settings-error"
        >
          {{ error }}
        </AlertBanner>
        <form @submit.prevent="save">
          <div class="grid grid-cols-2 gap-3">
            <label class="block text-sm font-medium">
              Nombre
              <input
                v-model="form.name"
                :disabled="!isManager"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                data-testid="project-name"
              />
            </label>
            <label class="block text-sm font-medium">
              Estado
              <select
                v-model="form.status"
                :disabled="!isManager"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                data-testid="project-status"
              >
                <option v-for="status in PROJECT_STATUSES" :key="status.value" :value="status.value">
                  {{ status.label }}
                </option>
              </select>
            </label>
            <label class="block text-sm font-medium">
              Departamento que lo gestiona
              <select
                v-model="form.department_id"
                :disabled="!isManager"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                data-testid="project-department"
              >
                <option value="">Sin departamento</option>
                <option
                  v-for="department in departments"
                  :key="department.id"
                  :value="String(department.id)"
                >
                  {{ department.name }}
                </option>
              </select>
            </label>
            <label class="block text-sm font-medium">
              Responsable
              <select
                v-model="form.owner_id"
                :disabled="!isManager"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                data-testid="project-owner"
              >
                <option value="">Sin responsable</option>
                <option v-for="person in people" :key="person.id" :value="String(person.id)">
                  {{ person.name }}
                </option>
              </select>
            </label>
          </div>

          <div v-if="isManager" class="mt-4 flex gap-2">
            <button
              type="submit"
              :disabled="saving"
              class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
              data-testid="save-project"
            >
              Guardar cambios
            </button>
          </div>
          <p v-else class="mt-4 text-sm text-slate-500">
            Solo el gerente puede cambiar los datos del proyecto.
          </p>
        </form>
      </div>

      <!-- Sección de estados de tarea: solo el gerente la ve y la edita. -->
      <section
        v-if="isManager"
        class="mt-5 rounded border border-slate-200 bg-white p-5"
        aria-labelledby="estados-titulo"
        data-testid="task-statuses-section"
      >
        <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="estados-titulo" class="text-base font-semibold text-siemens-900">
              Estados de tarea
            </h2>
            <p class="mt-1 text-sm text-slate-500">
              Los estados del tablero de este proyecto. El primero es el estado en el que nacen las
              tareas nuevas y el orden es el de las columnas.
            </p>
          </div>
          <button
            type="button"
            class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
            data-testid="new-task-status"
            @click="abrirAlta"
          >
            Nuevo estado
          </button>
        </div>

        <AsyncState
          :loading="estadosCargando"
          :error="estadosError"
          :error-status="estadosErrorStatus"
          :empty="estados.length === 0"
          error-title="No se pudieron cargar los estados"
          error-test-id="task-statuses-error"
          loading-label="Cargando los estados de tarea del proyecto"
          empty-title="Este proyecto no tiene estados."
          empty-text="Crea el primero para que las tareas nuevas tengan dónde empezar."
          empty-action="Crear estado"
          @retry="cargarEstados"
          @empty-action="abrirAlta"
        >
          <template #loading>
            <div class="animate-pulse space-y-2 motion-reduce:animate-none" aria-hidden="true">
              <div class="h-12 rounded bg-slate-100"></div>
              <div class="h-12 rounded bg-slate-100"></div>
              <div class="h-12 rounded bg-slate-100"></div>
            </div>
          </template>

          <AlertBanner
            v-if="errorAccion"
            variant="error"
            class="mb-3"
            data-testid="task-statuses-action-error"
          >
            {{ errorAccion }}
          </AlertBanner>

          <div class="overflow-x-auto">
            <table class="w-full min-w-[680px] text-sm" data-testid="task-statuses-table">
              <caption class="sr-only">
                Estados de tarea del proyecto, en el orden en que aparecen en el tablero
              </caption>
              <thead>
                <tr class="border-b border-slate-200 text-left">
                  <th
                    scope="col"
                    class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Estado
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Avance
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Tareas
                  </th>
                  <th
                    scope="col"
                    class="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(estado, indice) in estados"
                  :key="estado.id"
                  class="border-b border-slate-100 last:border-0"
                  data-testid="task-status-row"
                  :data-status-key="estado.key"
                >
                  <!-- Etiqueta, color y clave -->
                  <td class="px-3 py-3">
                    <span
                      class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                      :style="pildora(estado.color)"
                      data-testid="task-status-label"
                    >{{ estado.label }}</span>
                    <span
                      class="mt-1 block text-xs text-slate-400"
                      data-testid="task-status-key"
                      :title="`Clave del estado (no se puede cambiar) y color: ${estado.key}`"
                    >{{ estado.key }} · {{ nombreColor(estado.color) }}</span>
                  </td>

                  <!-- Avance: barra + número -->
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-2">
                      <span
                        class="h-1.5 w-16 flex-none overflow-hidden rounded bg-slate-100"
                        aria-hidden="true"
                      >
                        <span
                          class="block h-full rounded"
                          :style="[barra(estado.color), { width: `${estado.progress}%` }]"
                          data-testid="task-status-progress-bar"
                        ></span>
                      </span>
                      <span
                        class="text-xs tabular-nums text-slate-600"
                        data-testid="task-status-progress"
                      >{{ estado.progress }} %</span>
                    </div>
                  </td>

                  <!-- Tareas que lo usan -->
                  <td
                    class="px-3 py-3 text-sm tabular-nums text-slate-600"
                    data-testid="task-status-count"
                  >{{ estado.task_count }}</td>

                  <!-- Acciones -->
                  <td class="px-3 py-3">
                    <div class="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        class="rounded border border-slate-300 px-3 py-2.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
                        :disabled="indice === 0 || moviendo"
                        :aria-label="`Subir ${estado.label}`"
                        data-testid="task-status-up"
                        :data-status-key="estado.key"
                        @click="mover(indice, true)"
                      >
                        Subir
                      </button>
                      <button
                        type="button"
                        class="rounded border border-slate-300 px-3 py-2.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
                        :disabled="indice === estados.length - 1 || moviendo"
                        :aria-label="`Bajar ${estado.label}`"
                        data-testid="task-status-down"
                        :data-status-key="estado.key"
                        @click="mover(indice, false)"
                      >
                        Bajar
                      </button>
                      <button
                        type="button"
                        class="rounded border border-slate-300 px-3 py-2.5 text-sm text-slate-600"
                        :aria-label="`Editar ${estado.label}`"
                        data-testid="task-status-edit"
                        :data-status-key="estado.key"
                        @click="editar(estado)"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        class="rounded border border-red-300 px-3 py-2.5 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        :disabled="estados.length === 1"
                        :title="estados.length === 1 ? 'El proyecto necesita al menos un estado' : ''"
                        :aria-label="
                          estados.length === 1
                            ? `Borrar ${estado.label}: el proyecto necesita al menos un estado`
                            : `Borrar ${estado.label}`
                        "
                        data-testid="task-status-delete"
                        :data-status-key="estado.key"
                        @click="pedirBorrado(estado)"
                      >
                        Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p
            v-if="estados.length === 1"
            class="mt-3 text-xs text-slate-500"
            data-testid="task-statuses-last-note"
          >
            El proyecto necesita al menos un estado: no se puede borrar el único que queda.
          </p>
        </AsyncState>

        <ModalDialog
          :open="formAbierto"
          :title="editando ? 'Editar estado' : 'Nuevo estado'"
          :subtitle="
            editando ? `Clave ${editando.key}: no se puede cambiar` : 'Se añade al final del tablero'
          "
          size="md"
          @close="cerrarFormulario"
        >
          <form id="form-estado-tarea" @submit.prevent="guardarEstado">
            <label class="block text-sm font-medium">
              Etiqueta
              <input
                v-model="estadoForm.label"
                maxlength="60"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                data-testid="task-status-label-input"
              />
            </label>

            <label class="mt-3 block text-sm font-medium">
              Avance (%)
              <input
                v-model.number="estadoForm.progress"
                type="number"
                min="0"
                max="100"
                step="1"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                data-testid="task-status-progress-input"
              />
            </label>
            <p class="mt-1 text-xs text-slate-500">
              De 0 a 100. El diagrama de Gantt lo usa para pintar la barra de la tarea.
            </p>

            <div class="mt-3 flex items-end justify-between gap-3">
              <ColorPicker v-model="estadoForm.color" label="Color" />
              <button
                v-if="estadoForm.color"
                type="button"
                class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
                data-testid="task-status-clear-color"
                @click="estadoForm.color = null"
              >
                Sin color
              </button>
              <span v-else class="pb-2 text-xs text-slate-500">Sin color</span>
            </div>

            <AlertBanner
              v-if="errorFormulario"
              variant="error"
              class="mt-3"
              data-testid="task-status-form-error"
            >
              {{ errorFormulario }}
            </AlertBanner>
          </form>

          <template #footer="{ submit }">
            <button
              type="button"
              class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
              data-testid="task-status-cancel"
              @click="cerrarFormulario"
            >
              Cancelar
            </button>
            <button
              type="button"
              :disabled="guardandoEstado"
              class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              data-testid="task-status-save"
              @click="submit"
            >
              {{ editando ? 'Guardar cambios' : 'Crear estado' }}
            </button>
          </template>
        </ModalDialog>

        <ModalDialog
          :open="borrando !== null"
          title="Borrar estado"
          :subtitle="borrando?.label ?? ''"
          size="sm"
          @close="cerrarBorrado"
        >
          <p class="text-sm text-slate-700">
            <template v-if="(borrando?.task_count ?? 0) > 0">
              «{{ borrando.label }}» tiene {{ borrando.task_count }}
              {{ borrando.task_count === 1 ? 'tarea' : 'tareas' }}. Al borrarlo, sus tareas pasan al
              estado que elijas.
            </template>
            <template v-else>
              «{{ borrando?.label }}» no tiene tareas. Se puede borrar sin reasignar.
            </template>
          </p>

          <label
            v-if="(borrando?.task_count ?? 0) > 0"
            class="mt-3 block text-sm font-medium"
          >
            Estado de destino
            <select
              v-model="destino"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="task-status-reassign-select"
            >
              <option value="">Elige un estado</option>
              <option v-for="otro in otrosEstados" :key="otro.key" :value="otro.key">
                {{ otro.label }}
              </option>
            </select>
          </label>
          <p
            v-if="(borrando?.task_count ?? 0) > 0"
            class="mt-1 text-xs text-slate-500"
          >
            Obligatorio: las {{ borrando.task_count }} tareas de «{{ borrando.label }}» pasan a este estado.
          </p>

          <AlertBanner
            v-if="errorBorrado"
            variant="error"
            class="mt-3"
            data-testid="task-status-delete-error"
          >
            {{ errorBorrado }}
          </AlertBanner>

          <template #footer>
            <button
              type="button"
              class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
              data-testid="task-status-delete-cancel"
              @click="cerrarBorrado"
            >
              Cancelar
            </button>
            <button
              type="button"
              :disabled="borrandoGuardando || ((borrando?.task_count ?? 0) > 0 && !destino)"
              class="rounded border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
              data-testid="task-status-delete-confirm"
              @click="borrarEstado"
            >
              {{ (borrando?.task_count ?? 0) > 0 ? 'Borrar y reasignar' : 'Borrar estado' }}
            </button>
          </template>
        </ModalDialog>
      </section>
    </AsyncState>
  </div>
</template>
