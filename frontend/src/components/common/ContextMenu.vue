<script setup>
/**
 * Menu contextual flotante.
 *
 * Es un menu, no un dialogo: no lleva velo ni trampa de foco y vive pegado
 * al puntero. Quien lo abre da el arbol de items y recibe la accion
 * elegida; este componente solo lo pinta y lo opera con el teclado.
 *
 * Contrato de un item: `{ label, accion, disabled?, submenu? }`. `accion` es
 * la clave que interpreta quien abre el menu y `dato` el payload que
 * necesita (la persona a la que se reasigna, el estado que se pone). Los
 * items que no se pueden usar llevan `disabled`: se anuncian con
 * `aria-disabled` y el teclado los salta.
 *
 * El arbol tiene un nivel de submenu: el item que lo lleva y sus hijos.
 *
 * Teclado: `ArrowUp` y `ArrowDown` mueven la seleccion, `Home` y `End` van
 * al primero y al ultimo, `Enter` y `Espacio` activan, `Escape` cierra,
 * `ArrowRight` abre el submenu y `ArrowLeft` lo cierra. El foco entra en el
 * menu al abrirlo y vuelve al elemento que lo abrio al cerrarlo: ese
 * elemento lo dice `abridor`, el menu no lo adivina.
 *
 * El menu se dibuja junto al puntero pero dentro de la ventana: si no cabe,
 * se voltea o se desplaza. Se cierra al pulsar fuera, al hacer scroll y con
 * `Escape`.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  /** Arbol de items: [{ label, accion, disabled?, submenu? }]. */
  items: { type: Array, required: true },
  /** Posicion del puntero en el viewport, en pixeles. */
  x: { type: Number, default: 0 },
  /** Posicion del puntero en el viewport, en pixeles. */
  y: { type: Number, default: 0 },
  /** Nombre accesible del menu. */
  label: { type: String, default: 'Menú contextual' },
  /** Elemento que lo abrio: a el vuelve el foco al cerrarse. */
  abridor: { type: Object, default: null },
})

const emit = defineEmits(['select', 'close'])

/** Margen minimo respecto al borde de la ventana. */
const MARGEN = 8
/** Separacion entre el puntero y el menu. */
const DESPLAZAMIENTO = 4

const raiz = ref(null)
const submenuEl = ref(null)
/** Item del nivel raiz cuyo submenu esta abierto, o null. */
const submenuAbierto = ref(null)
/** Item enfocado del nivel actual. */
const indice = ref(0)
/** Posicion del menu en el viewport, ya medida. */
const estilo = ref({ left: '0px', top: '0px' })
/** El menu solo se ve cuando ya esta medido: no parpadea fuera de sitio. */
const medido = ref(false)
/** Posicion del submenu abierto, en coordenadas del viewport. */
const estiloSubmenu = ref({ left: '0px', top: '0px' })

/** Items del nivel actual: los de la raiz o los del submenu abierto. */
const nivel = computed(() => {
  if (submenuAbierto.value === null) return props.items ?? []
  return props.items?.[submenuAbierto.value]?.submenu ?? []
})

/** Item cuyo submenu esta abierto, o null. */
const itemAbierto = computed(() => {
  if (submenuAbierto.value === null) return null
  return props.items?.[submenuAbierto.value] ?? null
})

/** Primer item que se puede usar: los desactivados se saltan. */
function primeroHabilitado(items) {
  const posicion = items.findIndex((item) => !item.disabled)
  return posicion === -1 ? 0 : posicion
}

/**
 * Items de un nivel, en el DOM.
 *
 * El menu y su submenu son dos listas `role="menu"`: el filtro deja solo los
 * items del nivel que se nombra.
 */
function itemsDe(contenedor) {
  if (!contenedor) return []
  return Array.from(contenedor.querySelectorAll('[role="menuitem"]')).filter(
    (elemento) => elemento.closest('[role="menu"]') === contenedor,
  )
}

/** Items del nivel por el que se esta navegando. */
function itemsDelNivel() {
  return itemsDe(submenuAbierto.value === null ? raiz.value : submenuEl.value)
}

/** Item de la raiz que tiene abierto el submenu, en el DOM. */
function itemPadreEl() {
  if (submenuAbierto.value === null) return null
  return itemsDe(raiz.value)[submenuAbierto.value] ?? null
}

/** Mueve el foco al item del nivel actual. */
function enfocar(posicion) {
  indice.value = posicion
  nextTick(() => {
    itemsDelNivel()[indice.value]?.focus()
  })
}

/** Mueve la seleccion, saltando los items desactivados. */
function mover(delta) {
  const items = nivel.value
  if (!items.length) return
  let destino = indice.value
  for (let paso = 0; paso < items.length; paso += 1) {
    destino = (destino + delta + items.length) % items.length
    if (!items[destino].disabled) break
  }
  enfocar(destino)
}

/** Va al primer item o al ultimo, saltando los desactivados. */
function irA(posicion) {
  const items = nivel.value
  if (!items.length) return
  if (posicion === 'inicio') {
    enfocar(primeroHabilitado(items))
    return
  }
  for (let indiceItem = items.length - 1; indiceItem >= 0; indiceItem -= 1) {
    if (!items[indiceItem].disabled) {
      enfocar(indiceItem)
      return
    }
  }
}

/**
 * Abre el submenu de un item de la raiz.
 *
 * El submenu se dibuja pegado al item que lo abre y dentro de la ventana:
 * si no cabe a la derecha, sale a la izquierda.
 */
function abrirSubmenu(indiceItem) {
  const item = props.items?.[indiceItem]
  if (!item?.submenu?.length) return
  submenuAbierto.value = indiceItem
  indice.value = primeroHabilitado(item.submenu)
  nextTick(() => {
    colocarSubmenu()
    itemsDelNivel()[indice.value]?.focus()
  })
}

/** Cierra el submenu abierto y devuelve el foco a su item padre. */
function cerrarSubmenu() {
  if (submenuAbierto.value === null) return
  const padre = submenuAbierto.value
  submenuAbierto.value = null
  enfocar(padre)
}

/** Coloca el submenu junto a su item, dentro de la ventana. */
function colocarSubmenu() {
  const submenu = submenuEl.value
  const padre = itemPadreEl()
  if (!submenu || !padre) return
  const cajaPadre = padre.getBoundingClientRect()
  const ancho = submenu.offsetWidth
  const alto = submenu.offsetHeight
  let left = cajaPadre.right
  if (left + ancho > window.innerWidth - MARGEN) left = cajaPadre.left - ancho
  left = Math.max(MARGEN, Math.min(left, window.innerWidth - ancho - MARGEN))
  const top = Math.max(
    MARGEN,
    Math.min(cajaPadre.top, window.innerHeight - alto - MARGEN),
  )
  estiloSubmenu.value = { left: `${left}px`, top: `${top}px` }
}

/**
 * Coloca el menu junto al puntero, dentro de la ventana.
 *
 * Si no cabe a la derecha o abajo, se voltea; si aun asi no cabe, se
 * desplaza hasta el borde.
 */
function colocar() {
  const caja = raiz.value?.getBoundingClientRect()
  if (!caja) return
  const ancho = caja.width
  const alto = caja.height
  let left = props.x + DESPLAZAMIENTO
  if (left + ancho > window.innerWidth - MARGEN) {
    left = props.x - ancho - DESPLAZAMIENTO
  }
  left = Math.max(MARGEN, Math.min(left, window.innerWidth - ancho - MARGEN))
  let top = props.y + DESPLAZAMIENTO
  if (top + alto > window.innerHeight - MARGEN) {
    top = props.y - alto - DESPLAZAMIENTO
  }
  top = Math.max(MARGEN, Math.min(top, window.innerHeight - alto - MARGEN))
  estilo.value = { left: `${left}px`, top: `${top}px` }
  medido.value = true
}

/**
 * Ejecuta la accion de un item y cierra el menu.
 *
 * El foco vuelve al elemento que lo abrio ANTES de avisar: asi el dialogo
 * que puede abrir la accion lo recoge como elemento anterior.
 */
function activar(item) {
  if (!item || item.disabled) return
  devolverFoco()
  emit('select', item)
  emit('close')
}

/** Item de la raiz: si tiene submenu, lo abre; si no, ejecuta la accion. */
function activarDeRaiz(item, indiceItem) {
  if (!item || item.disabled) return
  if (item.submenu?.length) {
    abrirSubmenu(indiceItem)
    return
  }
  activar(item)
}

/**
 * El raton entra en un item de la raiz.
 *
 * El que tiene submenu lo abre; el que no lo tiene recoge el submenu que
 * estuviera abierto, sin mover el foco: el foco esta donde esta.
 */
function alEntrarItem(indiceItem) {
  const item = props.items?.[indiceItem]
  if (item?.submenu?.length) {
    abrirSubmenu(indiceItem)
    return
  }
  submenuAbierto.value = null
}

/** El foco vuelve al elemento que abrio el menu, si sigue en la pagina. */
function devolverFoco() {
  const destino = props.abridor
  if (!destino || typeof destino.focus !== 'function') return
  if (!document.contains(destino)) return
  destino.focus()
}

/** Cierra el menu y devuelve el foco al elemento que lo abrio. */
function cerrar() {
  devolverFoco()
  emit('close')
}

/** Teclado del menu. */
function alTecla(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cerrar()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    mover(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    mover(-1)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    irA('inicio')
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    irA('fin')
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (submenuAbierto.value === null) abrirSubmenu(indice.value)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    cerrarSubmenu()
  }
}

/** Pulsar fuera del menu lo cierra. */
function alPulsarFuera(event) {
  if (raiz.value?.contains(event.target)) return
  cerrar()
}

/** El foco que se va del menu lo cierra: el Tab no deja un menu sin dueno. */
function alPerderFoco(event) {
  const siguiente = event.relatedTarget
  if (!siguiente) return
  if (raiz.value?.contains(siguiente)) return
  cerrar()
}

onMounted(async () => {
  await nextTick()
  colocar()
  indice.value = primeroHabilitado(nivel.value)
  await nextTick()
  itemsDelNivel()[indice.value]?.focus()
  // La captura deja que el `pointerdown` de fuera llegue antes que el clic:
  // el menu se cierra sin llegar a abrir nada.
  document.addEventListener('pointerdown', alPulsarFuera, true)
  document.addEventListener('scroll', cerrar, true)
  window.addEventListener('resize', cerrar)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', alPulsarFuera, true)
  document.removeEventListener('scroll', cerrar, true)
  window.removeEventListener('resize', cerrar)
})
</script>

<template>
  <div
    ref="raiz"
    class="fixed z-50 min-w-[13rem] rounded-md border border-slate-300 bg-white py-1 shadow-lg"
    :class="medido ? 'opacity-100' : 'opacity-0'"
    :style="estilo"
    role="menu"
    :aria-label="label"
    data-testid="context-menu"
    @keydown="alTecla"
    @contextmenu.prevent
    @focusout="alPerderFoco"
  >
    <button
      v-for="(item, i) in props.items"
      :key="`${item.label}-${i}`"
      type="button"
      role="menuitem"
      class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-siemens-500 aria-disabled:cursor-not-allowed aria-disabled:text-slate-400"
      :aria-disabled="item.disabled ? 'true' : undefined"
      :aria-haspopup="item.submenu?.length ? 'menu' : undefined"
      :aria-expanded="item.submenu?.length ? String(submenuAbierto === i) : undefined"
      data-testid="context-menu-item"
      @focus="indice = i"
      @mouseenter="alEntrarItem(i)"
      @click="activarDeRaiz(item, i)"
    >
      <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      <span
        v-if="item.submenu?.length"
        class="shrink-0 text-slate-400"
        aria-hidden="true"
      >›</span>
    </button>

    <!--
      Submenu: la lista del item abierto, pegada a el. Va en coordenadas del
      viewport (`fixed`), asi que se coloca al lado del item que lo abre y
      dentro de la ventana.
    -->
    <div
      v-if="itemAbierto"
      ref="submenuEl"
      class="fixed min-w-[12rem] rounded-md border border-slate-300 bg-white py-1 shadow-lg"
      :style="estiloSubmenu"
      role="menu"
      :aria-label="itemAbierto.label"
      data-testid="context-menu-submenu"
    >
      <button
        v-for="(item, i) in itemAbierto.submenu"
        :key="`${item.label}-${i}`"
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-siemens-500 aria-disabled:cursor-not-allowed aria-disabled:text-slate-400"
        :aria-disabled="item.disabled ? 'true' : undefined"
        data-testid="context-menu-item"
        @focus="indice = i"
        @click="activar(item)"
      >
        <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>
