<script setup>
/**
 * Detalle de una celda: que tareas componen ese total.
 *
 * Desde aqui se puede reasignar una tarea a otra persona o cambiarle las
 * fechas y las horas. Cada cambio se guarda y la matriz se recalcula. La
 * cabecera con el nombre y la semana la pone el panel que lo contiene.
 *
 * Una tarea se puede arrastrar a la fila de otra persona para reasignarla, o
 * moverla con el teclado: "Mayus" y las flechas arriba o abajo.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { loadAspect, loadLabel, loadRatio, loadState } from '../utils/load'
import { weekRangeLabel, weekWorkdays } from '../utils/weeks'
import TaskForm from './TaskForm.vue'

const props = defineProps({
  cell: { type: Object, required: true },
  tasks: { type: Array, required: true },
  members: { type: Array, required: true },
  projects: { type: Array, default: () => [] },
  holidays: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: false },
  ganttLink: { type: String, default: '/gantt' },
})

const emit = defineEmits(['save', 'delete', 'reassign', 'create', 'move', 'dragstart', 'dragend'])

const editing = ref(null)
const reassigning = ref(null)
const creating = ref(false)
const seed = ref(null)

const memberName = computed(() => {
  const names = {}
  for (const member of props.members) names[member.user_id] = member.name
  return names
})

/** Nombre del proyecto de una tarea, si se ha dado la lista de proyectos. */
const projectName = computed(() => {
  const names = {}
  for (const project of props.projects) names[project.id] = project.name
  return (task) => names[task.project_id] ?? ''
})

/**
 * A quien se puede reasignar la tarea.
 *
 * Solo los miembros del proyecto de la tarea: el backend rechaza con un 422
 * cualquier otra persona, asi que no tiene sentido offererla.
 */
function candidatesFor(task) {
  if (!task) return []
  return props.members.filter(
    (member) =>
      member.user_id !== props.cell.user_id &&
      (member.project_ids ?? []).includes(task.project_id),
  )
}

const otherMembers = computed(() => candidatesFor(reassigning.value?.task))

/** Estado de carga de la celda, con su color y su etiqueta. */
const state = computed(() => loadState(props.cell.hours, props.cell.capacity))
const aspect = computed(() => loadAspect(state.value))
const ratio = computed(() => loadRatio(props.cell.hours, props.cell.capacity))
const percentage = computed(() => (ratio.value === null ? '—' : `${ratio.value} %`))

/**
 * Horas que le quedan a la persona antes de pasarse de su capacidad.
 *
 * Se redondea a centimas porque el motor cuenta en centimas: sin redondear,
 * 32 - 16.4 sale 15.600000000000001.
 */
const free = computed(() => {
  const capacidad = Number(props.cell.capacity ?? 0)
  const usadas = Number(props.cell.hours ?? 0)
  return Math.max(0, Math.round((capacidad - usadas) * 100) / 100)
})

/**
 * Notas de la celda: la jornada reducida y los dias no laborables.
 *
 * Son las dos cosas que hacen que una semana tenga menos horas de las que
 * dice el horario, y el operario tiene que poder verlas sin consultar.
 */
const notes = computed(() => {
  const partes = []
  const base = Number(props.cell.weekly_base_hours ?? 0)
  const capacidad = Number(props.cell.capacity ?? 0)
  if (base > 0 && capacidad > 0 && capacidad < base) {
    partes.push(`Jornada reducida: ${capacidad} h de ${base} h`)
  }
  const holidays = props.holidays ?? []
  if (holidays.length) {
    const nombres = holidays.map((festivo) =>
      festivo.half_day ? `½ ${festivo.name}` : festivo.name,
    )
    partes.push(`Festivo: ${nombres.join(', ')}`)
  }
  return partes
})

/**
 * Horas de la tarea.
 *
 * Son las que aporta en esta semana, que no son las estimadas si la tarea
 * cruza varias. Son las que cuenta la celda.
 */
function taskHours(task) {
  const horas = task.week_hours ?? task.estimated_hours
  return Number(horas).toFixed(2)
}

/** Rango de fechas de la tarea, en el formato del prototipo. */
function taskRange(task) {
  if (!task.start_date || !task.end_date) return 'sin fechas'
  return `${task.start_date} -> ${task.end_date}`
}

/** Rango de la semana abierta. */
const weekRange = computed(() => weekRangeLabel(props.cell.week ?? ''))

/**
 * Prepara el alta de una tarea en la semana abierta.
 *
 * El objeto se guarda para que el formulario no se reinicie en cada cambio.
 */
function startCreate() {
  const dias = weekWorkdays(props.cell.week ?? '')
  seed.value = {
    title: '',
    assigned_to: props.cell.user_id,
    start_date: dias[0]?.date ?? '',
    end_date: dias[dias.length - 1]?.date ?? '',
    estimated_hours: '',
  }
  creating.value = true
}

/** Guarda la tarea nueva y cierra el formulario. */
function saveNew(payload) {
  emit('create', payload)
  creating.value = false
}

/** Mayus y las flechas mueven la tarea a la persona de al lado. */
function onKeydown(task, event) {
  if (!event.shiftKey) return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  emit('move', task, event.key === 'ArrowUp' ? -1 : 1)
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-2">
      <div class="flex items-baseline justify-between gap-2">
        <p class="flex items-baseline gap-2">
          <span class="text-3xl font-semibold tabular-nums">{{ cell.hours }} h</span>
          <span class="text-sm text-slate-500">de {{ cell.capacity ?? '—' }} h</span>
        </p>
        <span
          class="rounded-full px-3 py-1 text-xs font-semibold"
          :class="[aspect.cell, aspect.text]"
          data-testid="cell-state"
        >
          {{ loadLabel(state) }} · {{ percentage }}
        </span>
      </div>
      <span class="block h-2 w-full rounded bg-slate-200">
        <span
          class="block h-2 rounded"
          :class="aspect.bar"
          :style="{ width: `${Math.min(100, ratio ?? 0)}%` }"
        ></span>
      </span>
      <p v-if="notes.length" class="text-xs text-slate-500" data-testid="cell-notes">
        {{ notes.join(' · ') }}
      </p>
    </div>

    <div v-if="editing" class="rounded border border-slate-200 bg-slate-50 p-3">
      <TaskForm
        :task="editing"
        :members="members"
        :saving="saving"
        @save="(payload) => emit('save', editing.id, payload)"
        @cancel="editing = null"
      />
    </div>

    <div v-else-if="creating" class="rounded border border-slate-200 bg-slate-50 p-3">
      <TaskForm
        :task="seed"
        :members="members"
        :saving="saving"
        @save="saveNew"
        @cancel="creating = false"
      />
    </div>

    <div v-else-if="tasks.length === 0" class="rounded border border-dashed border-slate-300 p-3">
      <p class="text-sm font-semibold">Semana libre</p>
      <p class="mt-1 text-xs text-slate-500">
        Puedes asignar hasta {{ free }} h a esta persona sin sobrecargarla.
      </p>
      <button
        v-if="canCreate"
        type="button"
        class="mt-2 rounded bg-siemens-900 px-3 py-1.5 text-xs font-medium text-white"
        data-testid="cell-assign"
        @click="startCreate"
      >
        Asignar tarea
      </button>
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="rounded border border-slate-200 bg-white p-3"
        tabindex="0"
        draggable="true"
        data-testid="breakdown-task"
        @dragstart="emit('dragstart', task, $event)"
        @dragend="emit('dragend')"
        @keydown="onKeydown(task, $event)"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ task.title }}</p>
            <p class="text-xs text-slate-500">
              <span
                v-if="projectName(task)"
                class="rounded bg-slate-100 px-1 py-px text-[11px] font-medium text-slate-600"
              >
                {{ projectName(task) }}
              </span>
              {{ taskRange(task) }} ·
              {{ task.assigned_to ? memberName[task.assigned_to] ?? 'Desconocido' : 'Sin asignar' }}
            </p>
          </div>
          <span class="shrink-0 text-sm font-semibold tabular-nums">
            {{ taskHours(task) }} h
          </span>
        </div>

        <div
          v-if="reassigning && reassigning.task.id === task.id"
          class="rounded border border-slate-200 bg-slate-50 p-2"
        >
          <label class="block">
            <span class="text-xs font-medium">Reasignar a</span>
            <div class="mt-1 flex gap-2">
              <select
                v-model="reassigning.target"
                class="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                aria-label="Reasignar tarea"
              >
                <option v-for="member in otherMembers" :key="member.user_id" :value="member.user_id">
                  {{ member.name }}
                </option>
              </select>
              <button
                type="button"
                class="rounded bg-siemens-900 px-2 py-1 text-xs text-white"
                @click="emit('reassign', reassigning.task, reassigning.target); reassigning = null"
              >
                Mover
              </button>
              <button
                type="button"
                class="rounded border border-slate-300 px-2 py-1 text-xs"
                @click="reassigning = null"
              >
                Cancelar
              </button>
            </div>
          </label>
        </div>

        <div v-else class="mt-2 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            class="rounded border border-slate-300 px-2 py-1"
            @click="editing = task"
          >
            Editar
          </button>
          <button
            type="button"
            class="rounded border border-slate-300 px-2 py-1"
            :disabled="candidatesFor(task).length === 0"
            @click="reassigning = { task, target: candidatesFor(task)[0]?.user_id ?? null }"
          >
            Reasignar
          </button>
          <button
            type="button"
            class="rounded border border-red-300 px-2 py-1 text-red-700"
            @click="emit('delete', task)"
          >
            Eliminar
          </button>
        </div>
      </li>

      <li class="text-xs text-slate-500">
        Arrastra una tarea a otra fila para reasignarla. Con el teclado:
        Mayús y las flechas arriba o abajo.
      </li>
    </ul>

    <div class="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
      <button
        v-if="canCreate"
        type="button"
        class="rounded bg-siemens-900 px-3 py-2 text-xs font-medium text-white"
        data-testid="cell-new-task"
        @click="startCreate"
      >
        Nueva tarea esta semana
      </button>
      <RouterLink
        :to="ganttLink"
        class="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
        data-testid="cell-gantt"
      >
        Ver en el Gantt
      </RouterLink>
    </div>
  </div>
</template>
