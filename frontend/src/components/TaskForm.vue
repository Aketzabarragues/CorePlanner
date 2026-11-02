<script setup>
/**
 * Formulario de alta y edicion de una tarea.
 *
 * Se usa en dos sitios: el modal de nueva tarea y el desglose de una celda.
 * Las horas se manejan como texto para no perder decimales al escribir.
 */
import { computed, ref, watch } from 'vue'

const props = defineProps({
  task: { type: Object, default: null },
  members: { type: Array, required: true },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'cancel'])

const title = ref('')
const assignedTo = ref(null)
const startDate = ref('')
const endDate = ref('')
const estimatedHours = ref('')
const error = ref(null)

watch(
  () => props.task,
  (task) => {
    error.value = null
    if (task) {
      title.value = task.title ?? ''
      assignedTo.value = task.assigned_to ?? null
      startDate.value = task.start_date ?? ''
      endDate.value = task.end_date ?? ''
      estimatedHours.value = task.estimated_hours ?? ''
    } else {
      title.value = ''
      assignedTo.value = props.members[0]?.user_id ?? null
      startDate.value = ''
      endDate.value = ''
      estimatedHours.value = ''
    }
  },
  { immediate: true },
)

const isEditing = computed(() => props.task !== null)

const memberName = computed(() => {
  const member = props.members.find((m) => m.user_id === assignedTo.value)
  return member ? member.name : 'Sin asignar'
})

function submit() {
  error.value = null

  if (!title.value.trim()) {
    error.value = 'El titulo es obligatorio.'
    return
  }
  if (!startDate.value || !endDate.value) {
    error.value = 'Indica las fechas de inicio y fin.'
    return
  }
  if (endDate.value < startDate.value) {
    error.value = 'La fecha de fin no puede ser anterior a la de inicio.'
    return
  }
  const hours = Number.parseFloat(estimatedHours.value)
  if (!Number.isFinite(hours) || hours < 0) {
    error.value = 'Las horas estimadas deben ser un numero mayor o igual que 0.'
    return
  }

  emit('save', {
    title: title.value.trim(),
    assigned_to: assignedTo.value,
    start_date: startDate.value,
    end_date: endDate.value,
    estimated_hours: hours.toFixed(2),
  })
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="submit">
    <h3 class="text-base font-semibold text-siemens-900">
      {{ isEditing ? 'Editar tarea' : 'Nueva tarea' }}
    </h3>

    <label class="block">
      <span class="text-sm font-medium">Titulo</span>
      <input
        v-model="title"
        type="text"
        required
        placeholder="Programacion SCADA WinCC"
        class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium">Asignada a</span>
      <select
        v-model="assignedTo"
        class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option :value="null">Sin asignar</option>
        <option v-for="member in members" :key="member.user_id" :value="member.user_id">
          {{ member.name }} ({{ member.role_name }})
        </option>
      </select>
    </label>

    <div class="grid grid-cols-2 gap-3">
      <label class="block">
        <span class="text-sm font-medium">Inicio</span>
        <input
          v-model="startDate"
          type="date"
          required
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">Fin</span>
        <input
          v-model="endDate"
          type="date"
          required
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </div>

    <label class="block">
      <span class="text-sm font-medium">Horas estimadas</span>
      <input
        v-model="estimatedHours"
        type="number"
        min="0"
        step="0.25"
        required
        placeholder="40.00"
        class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <span class="mt-1 block text-xs text-slate-500">
        Asignada a {{ memberName }}
      </span>
    </label>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <div class="flex justify-end gap-2 pt-1">
      <button
        type="button"
        class="rounded border border-slate-300 px-3 py-2 text-sm"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
      <button
        type="submit"
        :disabled="saving"
        class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </div>
  </form>
</template>
