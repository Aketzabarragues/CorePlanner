<script setup>
/**
 * Politicas de capacidad de la empresa.
 *
 * Cada politica fija dos umbrales en porcentaje sobre la capacidad de la
 * persona: a partir del umbral de aviso la celda sale en aviso, y a partir
 * del de aprobacion, en aprobacion. El ambito es una persona o un
 * departamento, nunca un proyecto.
 */
import { computed, ref } from 'vue'

import { capacityPoliciesApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import ModalDialog from '../ModalDialog.vue'
import AlertBanner from '../common/AlertBanner.vue'

const props = defineProps({
  policies: { type: Array, required: true },
  departments: { type: Array, required: true },
  people: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const saving = ref(false)

const empty = () => ({
  id: null,
  scope_type: 'persona',
  scope_id: '',
  warn_percent: 80,
  requires_approval_percent: 100,
  active: true,
})
const form = ref(empty())
const editing = computed(() => form.value.id !== null)
const formOpen = ref(false)

const scopeOptions = computed(() =>
  form.value.scope_type === 'persona'
    ? props.people
    : props.departments,
)

function scopeName(policy) {
  const lista = policy.scope_type === 'persona' ? props.people : props.departments
  return (
    lista.find((item) => String(item.id) === String(policy.scope_id))?.name ??
    'Sin nombre'
  )
}

function reset() {
  form.value = empty()
  error.value = null
  formOpen.value = false
}

/** Abre el formulario vacio para dar de alta una politica. */
function openCreate() {
  form.value = empty()
  error.value = null
  formOpen.value = true
}

/** Cierra el formulario sin guardar. */
function closeForm() {
  error.value = null
  formOpen.value = false
}

function edit(policy) {
  form.value = {
    id: policy.id,
    scope_type: policy.scope_type,
    scope_id: String(policy.scope_id),
    warn_percent: policy.warn_percent,
    requires_approval_percent: policy.requires_approval_percent,
    active: policy.active === true,
  }
  error.value = null
  formOpen.value = true
}

async function save() {
  error.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    const payload = {
      scope_type: form.value.scope_type,
      scope_id: Number(form.value.scope_id),
      warn_percent: Number(form.value.warn_percent),
      requires_approval_percent: Number(form.value.requires_approval_percent),
      active: form.value.active === true,
    }
    if (editing.value) {
      await capacityPoliciesApi.update(token, form.value.id, payload)
    } else {
      await capacityPoliciesApi.create(token, payload)
    }
    reset()
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex justify-end">
      <button
        type="button"
        class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        data-testid="new-capacity-policy"
        @click="openCreate"
      >
        Nueva politica
      </button>
    </div>

    <table class="w-full text-sm" data-testid="capacity-policies-table">
      <thead>
        <tr class="border-b border-slate-200 text-left">
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ambito
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aplica a
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aviso
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aprobacion
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Activa
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="policy in props.policies"
          :key="policy.id"
          class="border-b border-slate-100"
          :data-testid="`policy-row-${policy.id}`"
        >
          <td class="px-2 py-2 font-medium text-siemens-900">
            {{ policy.scope_type === 'persona' ? 'Persona' : 'Departamento' }}
          </td>
          <td class="px-2 py-2 text-slate-600">{{ scopeName(policy) }}</td>
          <td class="px-2 py-2 text-slate-600">{{ policy.warn_percent }} %</td>
          <td class="px-2 py-2 text-slate-600">{{ policy.requires_approval_percent }} %</td>
          <td class="px-2 py-2 text-slate-600">
            <span
              :data-testid="`policy-active-${policy.id}`"
              class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              :class="
                policy.active
                  ? 'border border-green-600 bg-green-200 text-green-900'
                  : 'border border-slate-300 bg-slate-100 text-slate-500'
              "
            >
              {{ policy.active ? 'Activa' : 'Inactiva' }}
            </span>
          </td>
          <td class="px-2 py-2 text-right">
            <button
              type="button"
              class="rounded border border-slate-300 px-3 py-1.5 text-slate-600"
              :data-testid="`edit-policy-${policy.id}`"
              @click="edit(policy)"
            >
              Editar
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="props.policies.length === 0" class="text-sm text-slate-500">
      Sin politicas de capacidad: las celdas no llevan veredicto.
    </p>

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar politica' : 'Nueva politica'"
      @close="closeForm"
    >
      <form id="form-politica-capacidad" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm font-medium">
            Ambito
            <select
              v-model="form.scope_type"
              data-testid="policy-scope-type"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="persona">Persona</option>
              <option value="departamento">Departamento</option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            {{ form.scope_type === 'persona' ? 'Persona' : 'Departamento' }}
            <select
              v-model="form.scope_id"
              data-testid="policy-scope"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                {{
                  form.scope_type === 'persona' ? 'Elegir persona' : 'Elegir departamento'
                }}
              </option>
              <option
                v-for="item in scopeOptions"
                :key="item.id"
                :value="String(item.id)"
              >
                {{ item.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Umbral de aviso (%)
            <input
              v-model="form.warn_percent"
              type="number"
              min="1"
              max="100"
              data-testid="policy-warn-percent"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label class="block text-sm font-medium">
            Umbral de aprobacion (%)
            <input
              v-model="form.requires_approval_percent"
              type="number"
              min="1"
              max="100"
              data-testid="policy-approval-percent"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label class="mt-3 flex items-center gap-2 text-sm font-medium text-slate-600">
          <span>Activa</span>
          <button
            type="button"
            role="switch"
            :aria-checked="form.active"
            data-testid="policy-active-switch"
            class="relative h-5 w-9 rounded-full transition-colors"
            :class="form.active ? 'bg-siemens-900' : 'bg-slate-300'"
            @click="form.active = !form.active"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              :class="form.active ? 'left-[18px]' : 'left-0.5'"
            ></span>
          </button>
        </label>

        <AlertBanner v-if="error" variant="error" class="mt-3">
          {{ error }}
        </AlertBanner>
      </form>

      <template #footer="{ submit }">
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
          @click="closeForm"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        >
          {{ editing ? 'Guardar cambios' : 'Crear' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
