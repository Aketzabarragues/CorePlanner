<script setup>
/**
 * Avatar de persona.
 *
 * Las iniciales salen de `initials` (utils/people.js) y el estilo de
 * `pildora` (utils/statusColor.js): fondo pastel del color del departamento
 * y texto del mismo color oscurecido hasta 4,5:1 de contraste; sin color,
 * el neutro por token.
 *
 * Es decorativo (`aria-hidden`): el nombre ya va al lado en texto. Raiz de un
 * solo elemento: hereda `class` desde fuera (por ejemplo el `ring` de los
 * apilados) y el resto de atributos (`title`, `data-testid`).
 */
import { computed } from 'vue'

import { initials } from '../../utils/people'
import { pildora } from '../../utils/statusColor'

const props = defineProps({
  nombre: { type: String, required: true },
  /** Hex del color del departamento; vacio, el neutro por token. */
  color: { type: String, default: '' },
  /** Tamano: 'sm' 24 px, 'md' 32 px, 'lg' 40 px. */
  tamano: { type: String, default: 'md' },
})

/** Clases de cada tamano: las literales, para que lleguen al bundle. */
const TAMANO_CLASSES = {
  sm: 'h-6 w-6 text-cp-micro',
  md: 'h-8 w-8 text-cp-sm',
  lg: 'h-10 w-10 text-cp-base',
}

const claseTamano = computed(() => TAMANO_CLASSES[props.tamano] ?? TAMANO_CLASSES.md)

const estilo = computed(() => pildora(props.color || null))
</script>

<template>
  <span
    class="flex shrink-0 items-center justify-center rounded-avatar font-semibold"
    :class="claseTamano"
    :style="estilo"
    aria-hidden="true"
  >
    {{ initials(nombre) }}
  </span>
</template>
