/**
 * Rejilla de una semana del calendario.
 *
 * Puro: recibe los dias de la semana ya generados (utils/month.js o
 * utils/weeks.js) y devuelve la rejilla de filas, sin tocar el DOM. La vista
 * decide que se ve; aqui solo se reparte.
 *
 * Una barra nunca ocupa el fin de semana: el motor de capacidad no reparte
 * horas ahi, de modo que las tareas se recortan a sus dias laborables.
 */

/**
 * Columna del primer dia laborable que no es anterior a la fecha.
 *
 * El fin de semana se salta: una barra nunca lo ocupa. Sirve para recortar por
 * la izquierda, de modo que una tarea que empieza un sabado entra el lunes.
 */
export function primeraColumnaLaborable(days, date) {
  for (let indice = 0; indice < days.length; indice += 1) {
    const dia = days[indice]
    if (dia.weekend) continue
    if (dia.date >= date) return indice
  }
  return -1
}

/** Columna del ultimo dia laborable que no es posterior a la fecha. */
export function ultimaColumnaLaborable(days, date) {
  for (let indice = days.length - 1; indice >= 0; indice -= 1) {
    const dia = days[indice]
    if (dia.weekend) continue
    if (dia.date <= date) return indice
  }
  return -1
}

/**
 * Columnas que ocupa una tarea dentro de la semana, recortadas a sus dias
 * laborables.
 *
 * `tarea` lleva `start` y `end` en ISO. Si la tarea no cae en la semana, o
 * solo cae en el fin de semana, no hay barra: null.
 */
export function barraDeTarea(days, tarea) {
  const inicio = primeraColumnaLaborable(days, tarea.start)
  const fin = ultimaColumnaLaborable(days, tarea.end)
  if (inicio === -1 || fin === -1 || fin < inicio) return null
  return { tarea, inicio, fin }
}

/**
 * Reparte las barras de una fila en carriles.
 *
 * Cada carril guarda el ultimo dia que ocupa. Una barra busca el primer
 * carril que ya ha quedado libre; si no hay ninguno, se abre uno nuevo. Asi
 * dos tareas que se pisan nunca se tapan. La orden de reparto es la de la
 * fila: la barra larga que empieza antes gana el carril 0.
 */
export function repartirEnCarriles(barras) {
  const ordenadas = [...barras].sort((a, b) => a.inicio - b.inicio || b.fin - a.fin)
  const carriles = []
  const resultado = []
  for (const barra of ordenadas) {
    let carril = carriles.findIndex((fin) => fin < barra.inicio)
    if (carril === -1) {
      carriles.push(barra.fin)
      carril = carriles.length - 1
    } else {
      carriles[carril] = barra.fin
    }
    resultado.push({ ...barra, carril })
  }
  return resultado
}

/**
 * Agrupa las barras de una persona en carriles: una lista por sub-fila.
 *
 * Una persona sin tareas tiene un carril vacio, para que su fila salga igual.
 */
export function carrilesDe(barras) {
  if (!barras.length) return [[]]
  const carriles = []
  for (const barra of repartirEnCarriles(barras)) {
    if (!carriles[barra.carril]) carriles[barra.carril] = []
    carriles[barra.carril].push(barra)
  }
  return carriles
}

/**
 * Rejilla de la semana: los dias tal y como se recibieron, y las filas.
 *
 * Una fila por persona en el orden de `people` (la ordenada ya la pone la
 * vista) y, al final, la fila "Sin asignar" solo si hay barras de una tarea
 * sin persona o de una persona que no esta en `people`. `days` vacio no
 * lanza: no hay semana que repartir.
 */
/**
 * Celdas de una sub-fila: las barras del carril y los huecos que dejan.
 *
 * `carril` son las barras `{tarea, inicio, fin}` de una sub-fila, ya
 * repartidas y ordenadas sin pises. El resultado cubre las siete columnas
 * exactas de la semana, sin huecos ni solapes: celdas de hueco
 * (`{tipo: 'hueco', inicio, span}`) entre barras y celdas de barra
 * (`{tipo: 'barra', inicio, span, barra}`) para cada barra. Una barra que
 * empezara antes de donde acaba la anterior no se pinta: no cabria en la
 * fila sin pisar.
 */
export function celdasDeCarril(days, carril) {
  const celdas = []
  let cursor = 0
  for (const barra of carril) {
    if (barra.inicio < cursor) continue
    if (barra.inicio > cursor) {
      celdas.push({ tipo: 'hueco', span: barra.inicio - cursor, inicio: cursor })
      cursor = barra.inicio
    }
    celdas.push({ tipo: 'barra', span: barra.fin - barra.inicio + 1, inicio: barra.inicio, barra })
    cursor = barra.fin + 1
  }
  for (let indice = cursor; indice < days.length; indice += 1) {
    celdas.push({ tipo: 'hueco', span: 1, inicio: indice })
  }
  return celdas
}

export function buildWeekLayout({ days, people = [], tasks = [] }) {
  if (!days.length) return { days: [], filas: [] }

  const porPersona = new Map()
  for (const persona of people) porPersona.set(String(persona.id), [])
  const sueltas = []

  for (const tarea of tasks) {
    const asignado = tarea.assigned_to ?? null
    const destino = asignado === null ? sueltas : porPersona.get(String(asignado))
    if (!destino) continue
    const barra = barraDeTarea(days, tarea)
    if (barra) destino.push(barra)
  }

  const filas = people.map((persona) => ({
    id: persona.id,
    name: persona.name,
    department_name: persona.department_name,
    carriles: carrilesDe(porPersona.get(String(persona.id)) ?? []),
  }))

  if (sueltas.length) {
    filas.push({
      id: null,
      name: 'Sin asignar',
      department_name: null,
      carriles: carrilesDe(sueltas),
    })
  }

  return { days, filas }
}
