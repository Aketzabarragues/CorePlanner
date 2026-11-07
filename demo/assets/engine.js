/* ==========================================================================
   CorePlanner — demo visual: motor de capacidad (puro)
   Reproduce la logica real: reparto de horas entre dias laborables del
   calendario, imputacion por semana ISO y veredicto discreto.
   ========================================================================== */

var CoreEngine = (function () {
  'use strict'

  function pad(n) {
    return n < 10 ? '0' + n : '' + n
  }

  function dnum(s) {
    var p = s.split('-')
    return Date.UTC(+p[0], +p[1] - 1, +p[2])
  }

  function dstr(ms) {
    var d = new Date(ms)
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
  }

  function addDays(s, n) {
    return dstr(dnum(s) + n * 86400000)
  }

  function dayOfWeek(s) {
    return new Date(dnum(s)).getUTCDay()
  }

  /** Clave de semana ISO: "2026-W46". */
  function isoWeekKey(s) {
    var d = new Date(dnum(s))
    var dow = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - dow + 3)
    var isoYear = d.getUTCFullYear()
    var firstThursday = new Date(Date.UTC(isoYear, 0, 4))
    var fdow = (firstThursday.getUTCDay() + 6) % 7
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fdow + 3)
    var week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000))
    return isoYear + '-W' + pad(week)
  }

  /** Lunes de la semana ISO indicada. */
  function weekMonday(weekKey) {
    var parts = weekKey.split('-W')
    var year = +parts[0]
    var week = +parts[1]
    var jan4 = Date.UTC(year, 0, 4)
    var dow = (new Date(jan4).getUTCDay() + 6) % 7
    return dstr(jan4 - dow * 86400000 + (week - 1) * 7 * 86400000)
  }

  /**
   * Peso de festivo de un dia para un contexto dado.
   * Devuelve 0, 0.5 (medio dia) o 1 (jornada completa perdida).
   */
  function holidayWeight(date, ctx) {
    var holidays = DEMO.HOLIDAYS
    for (var i = 0; i < holidays.length; i++) {
      var h = holidays[i]
      if (h.date !== date) continue
      var applies = false
      if (h.scope === 'global') applies = true
      else if (h.scope === 'dept') applies = h.scope_label === ctx.dept
      else if (h.scope === 'person') applies = h.scope_label === ctx.personName
      if (!applies) continue
      return h.half_day ? 0.5 : 1
    }
    return 0
  }

  /** Dias laborables del rango con su peso, ya discounting festivos. */
  function workingDays(start, end, ctx) {
    var out = []
    var cur = start
    var guard = 0
    while (dnum(cur) <= dnum(end) && guard++ < 400) {
      var dow = dayOfWeek(cur)
      if (dow !== 0 && dow !== 6) {
        var weight = 1 - holidayWeight(cur, ctx)
        if (weight > 0) out.push({ date: cur, weight: weight })
      }
      cur = addDays(cur, 1)
    }
    return out
  }

  /** Capacidad semanal efectiva de una persona, segun su horario vigente. */
  function weeklyCapacity(person, weekKey) {
    var monday = weekMonday(weekKey)
    var ctx = { dept: person.dept, personName: person.name }
    var total = 0
    for (var i = 0; i < 7; i++) {
      var hours = person.schedule[i] || 0
      if (!hours) continue
      var day = addDays(monday, i)
      if (dayOfWeek(day) === 0 || dayOfWeek(day) === 6) continue
      total += hours * (1 - holidayWeight(day, ctx))
    }
    return total * (person.factor / 100)
  }

  /** Reparte las horas de una tarea entre sus dias laborables. */
  function distribute(task, person) {
    var ctx = { dept: person.dept, personName: person.name }
    var days = workingDays(task.start, task.end, ctx)
    var weight = 0
    var i
    for (i = 0; i < days.length; i++) weight += days[i].weight
    if (!weight) return []
    var parts = []
    for (i = 0; i < days.length; i++) {
      parts.push({
        date: days[i].date,
        week: isoWeekKey(days[i].date),
        hours: (task.hours * days[i].weight) / weight,
      })
    }
    return parts
  }

  /**
   * Matriz de capacidad de un conjunto de proyectos.
   * Devuelve filas por persona con las horas planificadas por semana.
   */
  function capacityFor(projectIds) {
    var rows = {}
    DEMO.TASKS.forEach(function (task) {
      if (projectIds.indexOf(task.project) < 0) return
      if (!task.user) return
      var person = personById(task.user)
      if (!person) return
      var parts = distribute(task, person)
      var row = rows[task.user]
      if (!row) {
        row = rows[task.user] = { user_id: task.user, plan: {} }
      }
      parts.forEach(function (part) {
        row.plan[part.week] = (row.plan[part.week] || 0) + part.hours
      })
    })
    return rows
  }

  /** Capacidad de una persona en una semana, como fraccion de su base. */
  function capacityOf(person, weekKey) {
    return weeklyCapacity(person, weekKey)
  }

  /**
   * Veredicto discreto de capacidad (Leantime): la celda roja pasa a ser
   * un estado ordenado por gravedad.
   */
  function verdictFor(hours, capacity) {
    if (capacity <= 0) return 'no_capacity'
    if (!hours) return 'no_work'
    var ratio = (hours / capacity) * 100
    if (ratio >= DEMO.THRESHOLDS.hard) return 'critical'
    if (ratio >= DEMO.THRESHOLDS.warn) return 'tight'
    if (ratio >= 50) return 'balanced'
    return 'buffer'
  }

  function ratioOf(hours, capacity) {
    if (!capacity) return null
    return Math.round((hours / capacity) * 1000) / 10
  }

  function personById(id) {
    var people = DEMO.PEOPLE
    for (var i = 0; i < people.length; i++) {
      if (people[i].id === id) return people[i]
    }
    return null
  }

  function projectById(id) {
    var projects = DEMO.PROJECTS
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].id === id) return projects[i]
    }
    return null
  }

  function taskById(id) {
    var tasks = DEMO.TASKS
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) return tasks[i]
    }
    return null
  }

  /** Tareas de un proyecto. */
  function tasksOf(projectId) {
    return DEMO.TASKS.filter(function (task) {
      return task.project === projectId
    })
  }

  /** Personas de un proyecto: miembros mas quienes tienen tareas asignadas. */
  function peopleOf(projectId) {
    var project = projectById(projectId)
    var ids = project ? project.members.slice() : []
    tasksOf(projectId).forEach(function (task) {
      if (task.user && ids.indexOf(task.user) < 0) ids.push(task.user)
    })
    return ids.map(personById).filter(Boolean)
  }

  /** Dependencias que affectan a un conjunto de tareas. */
  function dependenciesOf(projectId) {
    var ids = tasksOf(projectId).map(function (task) {
      return task.id
    })
    return DEMO.DEPENDENCIES.filter(function (dep) {
      return ids.indexOf(dep.from) >= 0 && ids.indexOf(dep.to) >= 0
    })
  }

  function fmtHours(value) {
    if (value === null || value === undefined) return '—'
    var rounded = Math.round(value * 100) / 100
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '')
  }

  return {
    pad: pad,
    dnum: dnum,
    dstr: dstr,
    addDays: addDays,
    dayOfWeek: dayOfWeek,
    isoWeekKey: isoWeekKey,
    weekMonday: weekMonday,
    holidayWeight: holidayWeight,
    workingDays: workingDays,
    weeklyCapacity: weeklyCapacity,
    distribute: distribute,
    capacityFor: capacityFor,
    capacityOf: capacityOf,
    verdictFor: verdictFor,
    ratioOf: ratioOf,
    personById: personById,
    projectById: projectById,
    taskById: taskById,
    tasksOf: tasksOf,
    peopleOf: peopleOf,
    dependenciesOf: dependenciesOf,
    fmtHours: fmtHours,
  }
})()
