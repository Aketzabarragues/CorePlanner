<script setup>
/**
 * Politicas de capacidad de la empresa.
 *
 * Cada politica fija dos umbrales en porcentaje sobre la capacidad de la
 * persona: a partir del umbral de aviso la celda sale en aviso, y a partir
 * del de aprobacion, en aprobacion. El ambito es una persona o un
 * departamento, nunca un proyecto.
 *
 * La accion primaria ("Nueva politica") no vive en el panel: la expone a la
 * vista, que la pinta en la cabecera compartida.
 */
import { computed, ref } from 'vue'

import { capacityPoliciesApi } from '../../api/client'
import { useConfigAccion } from '../../composables/useConfigAccion'
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

/** La accion primaria de la pestana: la pinta la vista en la cabecera. */
useConfigAccion({ etiqueta: '+ Nueva política', onClick: openCreate })
</script>

<template>
  <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
    <table class="w-full text-cp-sm" data-testid="capacity-policies-table">
      <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
        <tr>
          <th class="px-3 py-2.5 font-semibold">Ambito</th>
          <th class="px-3 py-2.5 font-semibold">Aplica a</th>
          <th class="px-3 py-2.5 font-semibold">Aviso</th>
          <th class="px-3 py-2.5 font-semibold">Aprobacion</th>
          <th class="px-3 py-2.5 font-semibold">Activa</th>
          <th />
        </tr>
      </thead>
      <tbody class="divide-y divide-borde-suave">
        <tr
          v-for="policy in props.policies"
          :key="policy.id"
          :data-testid="`policy-row-${policy.id}`"
        >
          <td class="px-3 py-2 font-medium text-primario-fuerte">
            {{ policy.scope_type === 'persona' ? 'Persona' : 'Departamento' }}
          </td>
          <td class="px-3 py-2 text-texto-suave">{{ scopeName(policy) }}</td>
          <td class="px-3 py-2 text-texto-suave">{{ policy.warn_percent }} %</td>
          <td class="px-3 py-2 text-texto-suave">{{ policy.requires_approval_percent }} %</td>
          <td class="px-3 py-2">
            <span
              :data-testid="`policy-active-${policy.id}`"
              class="inline-block rounded-pastilla px-2 py-0.5 text-cp-xs font-medium"
              :class="
                policy.active
                  ? 'border border-ok-borde bg-ok-fondo text-ok-texto'
                  : 'border border-borde-fuerte bg-tarjeta-suave text-texto-tenue'
              "
            >
              {{ policy.active ? 'Activa' : 'Inactiva' }}
            </span>
          </td>
          <td class="px-3 py-2 text-right">
            <button
              type="button"
              class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              :data-testid="`edit-policy-${policy.id}`"
              @click="edit(policy)"
            >
              Editar
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p
      v-if="props.policies.length === 0"
      class="px-3 py-4 text-center text-cp-sm text-texto-tenue"
    >
      Sin politicas de capacidad: las celdas no llevan veredicto.
    </p>

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar política' : 'Nueva política'"
      @close="closeForm"
    >
      <form id="form-politica-capacidad" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-cp-sm font-medium text-texto">
            Ambito
            <select
              v-model="form.scope_type"
              data-testid="policy-scope-type"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option value="persona">Persona</option>
              <option value="departamento">Departamento</option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            {{ form.scope_type === 'persona' ? 'Persona' : 'Departamento' }}
            <select
              v-model="form.scope_id"
              data-testid="policy-scope"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
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
          <label class="block text-cp-sm font-medium text-texto">
            Umbral de aviso (%)
            <input
              v-model="form.warn_percent"
              type="number"
              min="1"
              max="100"
              data-testid="policy-warn-percent"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Umbral de aprobacion (%)
            <input
              v-model="form.requires_approval_percent"
              type="number"
              min="1"
              max="100"
              data-testid="policy-approval-percent"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
        </div>

        <label class="mt-3 inline-flex items-center gap-2 text-cp-xs font-medium text-texto-suave">
          <span>Activa</span>
          <button
            type="button"
            role="switch"
            :aria-checked="form.active"
            data-testid="policy-active-switch"
            class="relative h-5 w-9 rounded-pastilla transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            :class="form.active ? 'bg-primario-fuerte' : 'bg-borde-fuerte'"
            @click="form.active = !form.active"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-pastilla bg-tarjeta transition-all"
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
          class="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          @click="closeForm"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
        >
          {{ editing ? 'Guardar cambios' : 'Crear' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
