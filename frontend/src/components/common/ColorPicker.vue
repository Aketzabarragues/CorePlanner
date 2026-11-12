<script setup>
/**
 * Selector de color de la paleta.
 *
 * Los colores son los de `utils/palette.js`, la copia de `backend/palette.py`.
 * El color es un dato mas de la fila, asi que en el selector siempre hay uno
 * marcado.
 */
import { PALETTE } from '../../utils/palette'

defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Color' },
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <div class="text-sm font-medium">
    <span class="block">{{ label }}</span>
    <div class="mt-1 flex flex-wrap gap-1.5" role="radiogroup" data-testid="color-picker">
      <button
        v-for="item in PALETTE"
        :key="item.hex"
        type="button"
        role="radio"
        class="h-6 w-6 rounded-full border border-white shadow-sm"
        :class="item.hex === modelValue ? 'ring-2 ring-siemens-900' : ''"
        :style="{ backgroundColor: item.hex }"
        :title="item.label"
        :aria-label="item.label"
        :aria-checked="item.hex === modelValue"
        :data-testid="`color-swatch-${item.hex}`"
        @click="emit('update:modelValue', item.hex)"
      ></button>
    </div>
  </div>
</template>
