<script setup>
/**
 * Cabecera de una pantalla.
 *
 * El contenido de la cabecera (titulo, insignia, ayuda, filtros y acciones) se
 * publica en la barra superior del shell con un Teleport: asi la vista y la
 * barra son la misma cosa y no hay dos cabeceras.
 *
 * Si no hay destino (una vista montada fuera del shell, o un test que monta
 * el componente suelto), el Teleport se desactiva y el contenido se dibuja
 * donde esta: la vista no se rompe, se ve como antes.
 *
 * `en-barra` es la via explicita para lo mismo: en false el Teleport se
 * desactiva aunque haya barra. Lo usa la vista ampliada del Gantt y del
 * calendario, que se sale del armazon con `fixed inset-0`: su cabecera tiene
 * que seguir viendose dentro de la ventana ampliada, no detras de ella.
 *
 * Los slots `filters` y `actions` son aditivos.
 */
import { computed, onMounted, ref } from 'vue'

import HelpTip from './HelpTip.vue'

const props = defineProps({
  title: { type: String, required: true },
  /** Insignia de contexto: { texto: String, tono: 'ok' | 'aviso' | 'peligro' | 'info' | 'neutro', punto: Boolean }. */
  contexto: { type: Object, default: null },
  /** Texto del boton de ayuda; sin el, no se pinta el boton. */
  ayuda: { type: String, default: '' },
  /** `data-testid` del contenedor de filtros. */
  filtersTestid: { type: String, default: '' },
  /** En false no se publica en la barra: el contenido se dibuja en su sitio. */
  enBarra: { type: Boolean, default: true },
})

/**
 * Aspecto de la insignia de contexto por tono: fondo, borde y texto.
 * Misma convencion que los `TONOS` de KpiCard, con el borde de tono que
 * lleva la insignia de la cabecera.
 */
const TONOS = {
  ok: 'border-ok-borde bg-ok-fondo text-ok-texto',
  aviso: 'border-aviso-borde bg-aviso-fondo text-aviso-texto',
  peligro: 'border-peligro-borde bg-peligro-fondo text-peligro-texto',
  info: 'border-info-borde bg-info-fondo text-info-texto',
  neutro: 'border-neutro-borde bg-neutro-fondo text-neutro-texto',
}
const PUNTOS = {
  ok: 'bg-ok-punto',
  aviso: 'bg-aviso-punto',
  peligro: 'bg-peligro-punto',
  info: 'bg-info-punto',
  neutro: 'bg-neutro-punto',
}

/** Sin tono la insignia se queda con su aspecto neutro por defecto. */
const claseInsignia = computed(
  () =>
    TONOS[props.contexto?.tono] ??
    'border-borde bg-tarjeta-suave text-texto-suave',
)
const puntoClase = computed(
  () => (props.contexto?.punto ? PUNTOS[props.contexto.tono] ?? PUNTOS.neutro : ''),
)

/**
 * Destino del Teleport.
 *
 * Se busca al montar: el shell ya esta en el DOM cuando la vista se pinta.
 * Si no aparece (vista suelta en un test), `destino` queda sin valor y el
 * Teleport se desactiva. `null` y no cadena vacia: un selector vacio en el
 * atributo `to` hace que el Teleport falle al montar.
 */
const DESTINO = '#cp-barra-vista'
const destino = ref(null)

onMounted(() => {
  if (document.querySelector(DESTINO)) destino.value = DESTINO
})
</script>

<template>
  <Teleport :to="destino" :disabled="!props.enBarra || !destino">
    <div
      class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-2"
      :data-testid="'vista-cabecera'"
    >
      <!--
        Grupo izquierdo: titulo, insignia, ayuda, separador y filtros. Es un
        solo elemento flex con `flex-wrap`: cuando no cabe, los filtros bajan
        de linea dentro del grupo, no se encogen.

        El grupo no lleva `flex-1`: si se estirara, las acciones nunca bajarian
        de linea. El salto lo decide el ancho natural frente al hueco, y
        `justify-between` en la raiz es lo que pega las acciones al borde
        derecho cuando los dos grupos caben en la linea.
      -->
      <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <!-- Titulo + insignia + ayuda -->
        <div class="flex min-w-0 shrink items-center gap-2">
          <h1 class="truncate font-titulo text-cp-titulo font-bold tracking-tight text-texto-marca">
            {{ title }}
          </h1>

          <!--
            El slot sustituye el texto pero no el aspecto: el fondo, el borde
            y el texto salen del tono del prop `contexto`. El texto se corta
            por el final con puntos suspensivos (`truncate` en el span de
            dentro), nunca por el medio.
          -->
          <span
            v-if="contexto || $slots.contexto"
            class="inline-flex min-w-0 max-w-[280px] flex-none items-center gap-1.5 rounded-pastilla border px-2.5 py-1 text-cp-xs font-medium"
            :class="claseInsignia"
          >
            <span
              v-if="puntoClase"
              class="h-1.5 w-1.5 flex-none rounded-full"
              :class="puntoClase"
              aria-hidden="true"
            ></span>
            <span class="truncate"><slot name="contexto">{{ contexto?.texto }}</slot></span>
          </span>

          <HelpTip v-if="ayuda" :texto="ayuda" />
        </div>

        <!-- Separador vertical: solo cuando los filtros van en linea -->
        <span
          v-if="$slots.filters"
          class="hidden h-6 w-px flex-none bg-borde xl:block"
          aria-hidden="true"
        ></span>

        <!-- Filtros -->
        <div
          v-if="$slots.filters"
          class="flex min-w-0 flex-wrap items-center gap-2"
          :data-testid="filtersTestid || undefined"
        >
          <slot name="filters" />
        </div>
      </div>

      <!-- Grupo derecho: las acciones. A la izquierda si baja de linea. -->
      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center justify-end gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
  </Teleport>
</template>
