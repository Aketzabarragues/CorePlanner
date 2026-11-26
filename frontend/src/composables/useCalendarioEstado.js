import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { currentMonthKey, localDateKey, shiftDay, shiftMonth } from '../utils/month'
import { currentWeekKey, isoWeekKey, shiftWeek, weekDays } from '../utils/weeks'

/**
 * Estado del calendario y su ida y vuelta con la URL.
 *
 * La vista y la fecha en pantalla viajan en la URL, como en el resto de
 * vistas: `?view=` dice si se ve el mes, la semana o el dia; `?month=` es el
 * mes abierto (YYYY-MM) y `?day=` el dia abierto (YYYY-MM-DD), que en la vista
 * de semana es el lunes de la semana en pantalla. Los valores por defecto no
 * se escriben: el mes en curso, el dia de hoy y la vista de mes son lo que se
 * ve sin nada en la URL.
 *
 * El composable solo toca estado y URL: no pide datos ni toca el DOM. El
 * desplazamiento de la tabla del mes es responsabilidad de la vista, que
 * reacciona al mes que el composable cambia.
 */
export function useCalendarioEstado() {
  const route = useRoute()
  const router = useRouter()

  const view = ref('month')
  const month = ref(currentMonthKey())
  const week = ref(currentWeekKey())
  const day = ref(localDateKey())

  const query = computed(() => route.query ?? {})

  /** Vistas del calendario, para el selector comun. */
  const VISTAS = [
    { value: 'month', label: 'Mes' },
    { value: 'week', label: 'Semana' },
    { value: 'day', label: 'Día' },
  ]

  // El mes lleva de 01 a 12: `2026-13` no es un mes y se ignora.
  const MES_EN_URL = /^\d{4}-(0[1-9]|1[0-2])$/
  const DIA_EN_URL = /^\d{4}-\d{2}-\d{2}$/

  /**
   * Si una cadena YYYY-MM-DD es una fecha real.
   *
   * El formato solo no basta: `2026-11-99` pasa la regular pero no existe.
   * Se compara el dia devuelto contra el texto, en UTC para no depender de la
   * zona horaria.
   */
  function diaValido(cadena) {
    if (typeof cadena !== 'string' || !DIA_EN_URL.test(cadena)) return false
    const [year, month, day] = cadena.split('-').map(Number)
    const fecha = new Date(Date.UTC(year, month - 1, day))
    return (
      fecha.getUTCFullYear() === year &&
      fecha.getUTCMonth() === month - 1 &&
      fecha.getUTCDate() === day
    )
  }

  /**
   * Escribe parte de la consulta sin pisar el resto.
   *
   * Los valores vacios se quitan: una URL con lo puesto es la que se copia
   * para compartir la vista. Los filtros de proyecto y departamento viajan
   * en la misma URL y no se tocan aqui.
   */
  async function updateQuery(patch) {
    const next = { ...query.value }
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === null || value === undefined) delete next[key]
      else next[key] = String(value)
    }
    await router.replace({ query: next })
  }

  /** Semana ISO a la que pertenece un dia. */
  function semanaDe(dia) {
    return isoWeekKey(new Date(`${dia}T00:00:00Z`))
  }

  /**
   * Aplica el estado de la URL a la vista.
   *
   * La URL manda: recargar o compartir el enlace reproduce la misma vista. Un
   * parametro que no vale se ignora, y lo que falta se queda en su defecto.
   */
  function aplicarEstadoDeLaUrl() {
    const q = query.value
    const vista = VISTAS.find((item) => item.value === q.view)?.value ?? 'month'
    const mes = MES_EN_URL.test(q.month) ? q.month : currentMonthKey()
    const dia = diaValido(q.day) ? q.day : localDateKey()
    view.value = vista
    month.value = mes
    day.value = dia
    // La semana se ancla en el dia: es la semana que lo contiene.
    if (vista === 'week') week.value = semanaDe(dia)
  }

  /**
   * Escribe la vista y la fecha en pantalla en la URL.
   *
   * Es lo que hace que el enlace se pueda compartir: al abrirlo, el
   * calendario se abre como estaba. Si la URL ya lo dice, no se escribe de
   * nuevo.
   */
  async function escribirEstado() {
    const patch = {}
    if (view.value !== 'month') patch.view = view.value
    if (view.value === 'month') {
      if (month.value !== currentMonthKey()) patch.month = month.value
    } else if (view.value === 'day') {
      if (day.value !== localDateKey()) patch.day = day.value
    } else {
      // En la vista de semana, el dia es el lunes de la semana en pantalla.
      const lunes = weekDays(week.value)[0].date
      if (lunes !== weekDays(currentWeekKey())[0].date) patch.day = lunes
    }
    const next = { ...query.value }
    for (const [key, value] of Object.entries({ view: null, month: null, day: null, ...patch })) {
      if (value === null || value === undefined || value === '') delete next[key]
      else next[key] = String(value)
    }
    const mismo = JSON.stringify(next) === JSON.stringify(route.query ?? {})
    if (mismo) return
    await router.replace({ query: next })
  }

  /**
   * Avanza o retrocede en la unidad de la vista: un dia, una semana o un
   * mes. El desplazamiento de la tabla del mes lo hace la vista al cambiar
   * el mes.
   */
  async function step(delta) {
    if (view.value === 'day') {
      day.value = shiftDay(day.value, delta)
    } else if (view.value === 'week') {
      week.value = shiftWeek(week.value, delta)
    } else {
      month.value = shiftMonth(month.value, delta)
    }
    await escribirEstado()
  }

  /**
   * Cambia entre las vistas de mes, semana y dia.
   *
   * Al cambiar de vista cada una se coloca donde le toca: si el mes que se
   * estaba viendo es el mes en curso, la semana es la de hoy; si no, la del
   * primer dia de ese mes. Al volver al mes, el mes es el de la semana en
   * pantalla. Desde el dia se sale a su semana y a su mes, que es donde
   * estaba el usuario.
   */
  async function setView(next) {
    if (next === view.value) return
    if (next === 'day') {
      day.value = localDateKey()
    } else if (next === 'week') {
      if (view.value === 'day') {
        week.value = semanaDe(day.value)
      } else {
        const [year, monthNumber] = month.value.split('-').map(Number)
        const now = new Date()
        const sameMonth = now.getFullYear() === year && now.getMonth() === monthNumber - 1
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
        const first = new Date(Date.UTC(year, monthNumber - 1, 1))
        week.value = isoWeekKey(sameMonth ? today : first)
      }
    } else if (view.value === 'day') {
      month.value = day.value.slice(0, 7)
    } else {
      month.value = weekDays(week.value)[0].date.slice(0, 7)
    }
    view.value = next
    await escribirEstado()
  }

  /** Abre el detalle de un dia: la vista de dia con esa fecha. */
  async function openDay(date) {
    day.value = date
    view.value = 'day'
    await escribirEstado()
  }

  /**
   * Vuelve a hoy: mes en curso, semana en curso y dia de hoy.
   */
  async function goToday() {
    month.value = currentMonthKey()
    week.value = currentWeekKey()
    day.value = localDateKey()
    await escribirEstado()
  }

  return {
    view,
    month,
    week,
    day,
    query,
    VISTAS,
    updateQuery,
    semanaDe,
    aplicarEstadoDeLaUrl,
    escribirEstado,
    step,
    setView,
    openDay,
    goToday,
  }
}
