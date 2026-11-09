import { computed, ref } from 'vue'

/**
 * Esconder personas y departamentos en una vista.
 *
 * El estado vive en el componente: no va a la URL, no se pide al servidor y no
 * se guarda. Es una vista de lo que ya esta cargado, nunca un filtro de los
 * datos: acota lo que se ve, no lo que la persona puede ver.
 *
 * La lista es la de la vista: cada persona con su id, su nombre y su
 * departamento. El departamento es el suyo, no el del proyecto que gestiona.
 */
export function useVisibilidad(personas) {
  /** Ids de las personas escondidas una por una. */
  const personasOcultas = ref([])
  /** Claves de los departamentos escondidos enteros. */
  const departamentosOcultos = ref([])

  /** Personas de la vista, en el formato que usa el panel. */
  const lista = computed(() => {
    const valor = personas?.value ?? personas
    return Array.isArray(valor) ? valor : []
  })

  /** Clave del grupo de departamento: el id, o 'sin' si la persona no tiene. */
  function claveDepartamento(persona) {
    const id = persona?.department_id
    return id === null || id === undefined ? 'sin' : String(id)
  }

  /** Si la persona esta escondida, ya sea por ella o por su departamento. */
  function personaOculta(persona) {
    if (!persona) return false
    if (departamentosOcultos.value.includes(claveDepartamento(persona))) return true
    return personasOcultas.value.includes(String(persona.id))
  }

  /**
   * Si la persona con ese id esta escondida.
   *
   * Se puede preguntar por alguien que ya no esta en la vista: si se escondio
   * antes, sigue escondida.
   */
  function ocultoPara(id) {
    if (id === null || id === undefined) return false
    const clave = String(id)
    if (personasOcultas.value.includes(clave)) return true
    const persona = lista.value.find((item) => String(item.id) === clave)
    if (!persona) return false
    return departamentosOcultos.value.includes(claveDepartamento(persona))
  }

  /** Ids de las personas escondidas de la vista. */
  const idsOcultos = computed(() =>
    lista.value.filter((persona) => personaOculta(persona)).map((persona) => String(persona.id)),
  )

  /** Cuantas personas quedan fuera de la vista. */
  const ocultosCount = computed(() => idsOcultos.value.length)

  /** Esconde o muestra una persona. */
  function alternarPersona(id) {
    const persona = lista.value.find((item) => String(item.id) === String(id))
    if (!persona) return
    const clave = String(id)
    if (!personaOculta(persona)) {
      personasOcultas.value = [...personasOcultas.value, clave]
      return
    }
    personasOcultas.value = personasOcultas.value.filter((item) => item !== clave)
    // Si el departamento estaba escondido, se muestra y se esconden sus
    // companeros: las personas visibles no cambian.
    const departamento = claveDepartamento(persona)
    if (!departamentosOcultos.value.includes(departamento)) return
    departamentosOcultos.value = departamentosOcultos.value.filter(
      (item) => item !== departamento,
    )
    const acompanantes = lista.value
      .filter((item) => claveDepartamento(item) === departamento && String(item.id) !== clave)
      .map((item) => String(item.id))
    personasOcultas.value = [...personasOcultas.value, ...acompanantes]
  }

  /** Esconde o muestra un departamento entero. */
  function alternarDepartamento(clave) {
    if (departamentosOcultos.value.includes(clave)) {
      departamentosOcultos.value = departamentosOcultos.value.filter((item) => item !== clave)
      return
    }
    departamentosOcultos.value = [...departamentosOcultos.value, clave]
  }

  /** Muestra a todo el mundo otra vez. */
  function mostrarTodos() {
    personasOcultas.value = []
    departamentosOcultos.value = []
  }

  return {
    personasOcultas,
    departamentosOcultos,
    idsOcultos,
    ocultosCount,
    personaOculta,
    ocultoPara,
    alternarPersona,
    alternarDepartamento,
    mostrarTodos,
  }
}
