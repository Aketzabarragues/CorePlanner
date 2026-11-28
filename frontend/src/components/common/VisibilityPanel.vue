<script setup>
/**
 * Panel de visibilidad: esconde personas y departamentos.
 *
 * Es un control de presentacion: acota lo que ya esta cargado en la vista, sin
 * tocar la URL ni pedir nada al servidor. El estado lo lleva la vista, que es la
 * que decide a quien esconde; el panel solo lo dibuja y devuelve lo que se
 * pulsa.
 *
 * Las casillas estan marcadas cuando la persona o el departamento se ve: al
 * desmarcarla se esconde. El contador y "Mostrar todos" cuentan y restauran a
 * quien esta escondido.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'

import AppIcon from '../AppIcon.vue'

const props = defineProps({
  /** Personas que se pueden esconder, con su departamento. */
  personas: { type: Array, required: true },
  /** Ids de las personas escondidas. */
  idsOcultos: { type: Array, required: true },
  /** Claves de los departamentos escondidos. */
  departamentosOcultos: { type: Array, required: true },
  /** Cuantas personas hay escondidas. */
  ocultosCount: { type: Number, default: 0 },
  /** Etiqueta del boton; sin ella, el texto se esconde hasta 2xl como antes. */
  etiqueta: { type: String, default: '' },
})

const emit = defineEmits(['alternar-persona', 'alternar-departamento', 'mostrar-todos'])

const abierto = ref(false)
const root = ref(null)

/** Clave del grupo de departamento: el id, o 'sin' si la persona no tiene. */
function clave(persona) {
  const id = persona?.department_id
  return id === null || id === undefined ? 'sin' : String(id)
}

/** Departamentos de las personas de la vista, con sus miembros. */
const grupos = computed(() => {
  const mapa = new Map()
  for (const persona of props.personas) {
    const id = clave(persona)
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        name: persona.department_name ?? 'Sin departamento',
        personas: [],
      })
    }
    mapa.get(id).personas.push(persona)
  }
  return [...mapa.values()]
})

/** Si la persona esta escondida. */
function oculta(persona) {
  return props.idsOcultos.includes(String(persona.id))
}

/** Cierra el panel de visibilidad cuando se pulsa fuera. */
function onDocumentClick(event) {
  if (!root.value?.contains(event.target)) abierto.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="relative inline-flex items-center justify-center rounded-control border bg-tarjeta p-1.5 text-texto-suave transition-colors after:absolute after:-inset-y-2.5 after:left-0 after:right-0 after:content-[''] hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco 2xl:w-auto 2xl:gap-2 2xl:px-3"
      :class="[
        ocultosCount
          ? 'border-primario-fuerte text-primario-fuerte'
          : 'border-borde-fuerte',
        etiqueta ? 'gap-2 px-3' : '',
      ]"
      :aria-expanded="abierto"
      :aria-pressed="ocultosCount > 0"
      data-testid="toggle-visibility"
      @click="abierto = !abierto"
    >
      <span class="inline-flex h-4 w-4" :class="etiqueta ? '' : '2xl:hidden'">
        <AppIcon name="users" />
      </span>
      <span
        class="text-cp-sm font-medium"
        :class="etiqueta ? '' : 'hidden 2xl:inline'"
      >
        {{ etiqueta || 'Mostrar/ocultar' }}
      </span>
      <span
        v-if="ocultosCount"
        class="rounded-pastilla bg-primario-fuerte px-1.5 text-[10px] font-semibold text-texto-inverso"
        data-testid="hidden-count"
      >
        {{ ocultosCount }} {{ ocultosCount === 1 ? 'oculto' : 'ocultos' }}
      </span>
    </button>

    <div
      v-if="abierto"
      class="absolute left-0 z-30 mt-1 w-72 rounded-control bg-tarjeta p-3 shadow-flotante ring-1 ring-borde"
      data-testid="visibility-panel"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-texto-tenue">
          Visibilidad
        </span>
        <button
          v-if="ocultosCount"
          type="button"
          class="text-xs font-medium text-primario-medio underline"
          data-testid="show-all"
          @click="emit('mostrar-todos')"
        >
          Mostrar todos
        </button>
      </div>

      <div v-for="grupo in grupos" :key="grupo.id" class="mt-2">
        <label class="flex items-center gap-2 text-sm font-medium text-texto-suave">
          <input
            type="checkbox"
            class="h-4 w-4"
            :checked="!departamentosOcultos.includes(grupo.id)"
            :data-testid="`hide-department-${grupo.id}`"
            @change="emit('alternar-departamento', grupo.id)"
          />
          {{ grupo.name }}
        </label>
        <label
          v-for="persona in grupo.personas"
          :key="persona.id"
          class="ml-5 mt-1 flex items-center gap-2 text-sm text-texto-suave"
        >
          <input
            type="checkbox"
            class="h-4 w-4"
            :checked="!oculta(persona)"
            :data-testid="`hide-person-${persona.id}`"
            @change="emit('alternar-persona', persona.id)"
          />
          {{ persona.name }}
        </label>
      </div>
    </div>
  </div>
</template>
