<script setup>
/**
 * Detalle de un dia, agrupado por persona.
 *
 * Lo que ocupa un solo dia: que tareas hay, quien las lleva y en que estado.
 * Es la vista a la que se llega al pulsar un dia del mes o de la semana, donde
 * no cabria mostrarlo todo.
 *
 * Las tareas se agrupan bajo la persona que las lleva, en el mismo orden que
 * las demas vistas: por departamento y luego por nombre. Cada persona sale
 * aunque no tenga nada ese dia: saber que no esta ocupada tambien es
 * informacion.
 *
 * Al pulsar una tarea se emite su identificador con `open-task` para que la
 * vista que la contiene abra su detalle.
 *
 * Con permiso de escritura, la tarea se edita en su sitio, como en el Tablero:
 * las horas se editan con un doble clic y el responsable y el estado van en
 * desplegables. El componente no pide al servidor: cada cambio se emite con
 * `cambiar` y quien lo contiene lo guarda. Al pie va la puerta del alta del
 * dia, que se emite con `crear` junto a la fecha.
 */
import { computed, ref } from 'vue'

import { KANBAN_COLUMNS, columnLabel, formatHours } from '../utils/kanban'
import { longDateLabel, tasksOnDay } from '../utils/month'

const props = defineProps({
  /** Fecha del dia en formato ISO. */
  date: { type: String, required: true },
  /** Personas visibles, ordenadas por departamento y luego por nombre. */
  people: { type: Array, default: () => [] },
  /** Tareas ya filtradas. */
  tasks: { type: Array, default: () => [] },
  /** Dias no laborables. */
  nonWorkingDays: { type: Array, default: () => [] },
  /** Miembros del proyecto: las opciones del responsable. */
  members: { type: Array, default: () => [] },
  /** Si quien entra puede escribir: edicion inline y alta del dia. */
  canEdit: { type: Boolean, default: false },
})

const emit = defineEmits(['open-task', 'cambiar', 'crear'])

const label = computed(() => longDateLabel(props.date))

/** Tareas que ocupan el dia. */
const dayTasks = computed(() => tasksOnDay(props.tasks, props.date))

/** Dias no laborables de la fecha. */
const nonWorking = computed(() => props.nonWorkingDays.filter((day) => day.date === props.date))

/**
 * Secciones del dia: una por persona y, si hace falta, la de sin asignar.
 *
 * Las tareas de alguien que no esta en la lista de personas no salen: la
 * vista ya deja fuera a quien esta escondido.
 */
const secciones = computed(() => {
  const porPersona = new Map()
  for (const persona of props.people) porPersona.set(String(persona.id), [])
  const sueltas = []

  for (const tarea of dayTasks.value) {
    const asignado = tarea.assigned_to ?? null
    const destino = asignado === null ? sueltas : porPersona.get(String(asignado))
    if (destino) destino.push(tarea)
  }

  const lista = props.people.map((persona) => ({
    id: persona.id,
    name: persona.name,
    department_name: persona.department_name,
    tasks: porPersona.get(String(persona.id)) ?? [],
  }))

  if (sueltas.length) {
    lista.push({ id: null, name: 'Sin asignar', department_name: null, tasks: sueltas })
  }
  return lista
})

/**
 * Edicion inline en curso: una sola a la vez, por tarea y campo. El clic que
 * termina la edicion no abre el detalle, como el que sigue a un arrastre no
 * debe abrir nada.
 */
const editando = ref(null)

/** Empieza la edicion inline de las horas de una tarea. */
function abrirEdicion(task, campo) {
  if (!props.canEdit) return
  const valor = formatHours(task.estimated_hours).replace(' h', '')
  editando.value = { id: task.id, campo, valor: String(valor) }
}

/**
 * Guarda la edicion inline de las horas con un cambio parcial.
 *
 * `Intro` y `blur` guardan y `Escape` cancela: si el valor no se puede leer
 * como horas, la edicion se tumba sin guardar nada.
 */
function guardarEdicion(task) {
  const actual = editando.value
  editando.value = null
  if (!actual || actual.id !== task.id) return
  const horas = Number.parseFloat(actual.valor)
  if (!Number.isFinite(horas) || horas < 0) return
  emit('cambiar', { tarea: task, cambios: { estimated_hours: horas.toFixed(2) } })
}

/** Cambia el responsable desde el desplegable de la tarea. */
function asignar(task, event) {
  const valor = event.target.value
  // El null explicito es la desasignacion: el PATCH es parcial, asi que omitir
  // el campo no desasignaria, y aqui el campo siempre va presente.
  emit('cambiar', { tarea: task, cambios: { assigned_to: valor === '' ? null : Number(valor) } })
}

/** Cambia el estado desde el desplegable de la tarea. */
function cambiarEstado(task, event) {
  emit('cambiar', { tarea: task, cambios: { status: event.target.value } })
}

/**
 * Un clic en la tarea abre su detalle.
 *
 * Los controles de la tarea (desplegables e input de horas) se quedan donde
 * estan para la edicion rapida, asi que el clic que llega desde dentro de ellos
 * no cuenta. Lo mismo que el clic que termina una edicion inline.
 */
function onTaskClick(task, event) {
  if (event.target.closest('select, button, input, a')) return
  if (editando.value && editando.value.id === task.id) return
  emit('open-task', task.id)
}

/** Clase del distintivo de un dia no laborable, segun su alcance. */
function nonWorkingClass(scope) {
  return scope === 'global' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'
}
</script>

<template>
  <div class="rounded border border-slate-200 bg-white" data-testid="day-view">
    <div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h2 class="text-base font-semibold text-siemens-900" data-testid="day-view-title">
        {{ label }}
      </h2>
      <p v-if="nonWorking.length" class="mt-1 text-xs font-medium text-amber-700">
        <span
          v-for="day in nonWorking"
          :key="day.id"
          class="mr-2 rounded-full px-2 py-0.5"
          :class="nonWorkingClass(day.scope)"
        >
          {{ day.name }}
          <span v-if="day.department_name"> · {{ day.department_name }}</span>
        </span>
      </p>
    </div>

    <div
      v-for="seccion in secciones"
      :key="seccion.id ?? 'sin-asignar'"
      class="border-b border-slate-100 last:border-b-0"
      :data-testid="seccion.id === null ? 'day-section-sin-asignar' : `day-section-${seccion.id}`"
    >
      <div class="flex items-baseline justify-between gap-2 bg-slate-50 px-4 py-1.5">
        <h3
          class="truncate text-xs font-semibold uppercase tracking-wide text-slate-600"
          :data-testid="
            seccion.id === null ? 'day-person-sin-asignar' : `day-person-${seccion.id}`
          "
        >
          {{ seccion.name }}
        </h3>
        <span v-if="seccion.department_name" class="shrink-0 text-[10px] text-slate-400">
          {{ seccion.department_name }}
        </span>
      </div>

      <ul v-if="seccion.tasks.length" class="divide-y divide-slate-100">
        <li
          v-for="task in seccion.tasks"
          :key="task.id"
          class="cursor-pointer px-4 py-2"
          data-testid="day-task"
          @click="onTaskClick(task, $event)"
        >
          <div
            class="flex items-start gap-3 rounded px-2 py-1.5 text-white"
            :style="{ backgroundColor: task.project_color }"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" :title="task.title">{{ task.title }}</p>
              <p class="mt-0.5 truncate text-[11px] opacity-80">
                {{ columnLabel(task.status) }} · {{ task.project_name }}
              </p>
            </div>
            <span class="shrink-0 text-[11px] tabular-nums opacity-80">
              {{ task.start }} - {{ task.end }}
            </span>
          </div>

          <div
            v-if="canEdit"
            class="mt-1.5 flex flex-wrap items-center gap-2 px-2 text-xs"
          >
            <span
              v-if="!(editando && editando.id === task.id)"
              class="rounded bg-white/20 px-1.5 py-0.5 tabular-nums"
              data-testid="day-task-hours"
              :title="'Editar las horas'"
              @dblclick="abrirEdicion(task, 'estimated_hours')"
            >
              {{ formatHours(task.estimated_hours) }}
            </span>
            <input
              v-else
              :value="editando.valor"
              type="number"
              min="0"
              step="0.25"
              class="w-16 rounded border border-white/40 bg-white/10 px-1 py-0.5 text-white"
              data-testid="day-task-hours-input"
              @input="editando.valor = $event.target.value"
              @keyup.enter="guardarEdicion(task)"
              @keyup.esc="editando = null"
              @blur="guardarEdicion(task)"
              @dblclick.stop
            />
            <select
              :value="task.assigned_to ?? ''"
              class="rounded border border-white/40 bg-white/10 px-1.5 py-0.5 text-white"
              :data-testid="`day-task-person-${task.id}`"
              :title="'Cambiar el responsable de la tarea'"
              @change="asignar(task, $event)"
            >
              <option value="" class="text-slate-700">Sin asignar</option>
              <option
                v-for="member in members"
                :key="member.user_id"
                :value="member.user_id"
                class="text-slate-700"
              >
                {{ member.name }}
              </option>
            </select>
            <select
              :value="task.status"
              class="rounded border border-white/40 bg-white/10 px-1.5 py-0.5 text-white"
              :data-testid="`day-task-status-${task.id}`"
              :title="'Cambiar el estado de la tarea'"
              @change="cambiarEstado(task, $event)"
            >
              <option
                v-for="column in KANBAN_COLUMNS"
                :key="column.status"
                :value="column.status"
                class="text-slate-700"
              >
                {{ column.label }}
              </option>
            </select>
          </div>
        </li>
      </ul>

      <p v-else class="px-4 py-3 text-sm text-slate-400" data-testid="day-section-empty">
        Sin tareas
      </p>
    </div>

    <div class="border-t border-slate-200 bg-slate-50 px-4 py-2.5">
      <button
        v-if="canEdit"
        type="button"
        class="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        data-testid="day-new-task"
        @click="emit('crear', props.date)"
      >
        Nueva tarea
      </button>
      <p v-else class="text-xs text-slate-400" data-testid="day-readonly-note">
        Solo lectura: no se pueden crear tareas en este proyecto.
      </p>
    </div>
  </div>
</template>
