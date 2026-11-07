/* ==========================================================================
   CorePlanner — demo visual: datos de demostracion
   El planificado NO se guarda aqui: se deriva de las tareas y del calendario
   laboral con el motor de capacity (engine.js). Solo las horas reales, que
   viven en su propia tabla de imputaciones, se guardan agregadas por semana.
   ========================================================================== */

var DEMO = (function () {
  'use strict'

  var WEEKS = [
    { key: '2026-W44', label: 'S44', start: '2026-10-26' },
    { key: '2026-W45', label: 'S45', start: '2026-11-02' },
    { key: '2026-W46', label: 'S46', start: '2026-11-09' },
    { key: '2026-W47', label: 'S47', start: '2026-11-16' },
    { key: '2026-W48', label: 'S48', start: '2026-11-23' },
    { key: '2026-W49', label: 'S49', start: '2026-11-30' },
    { key: '2026-W50', label: 'S50', start: '2026-12-07' },
    { key: '2026-W51', label: 'S51', start: '2026-12-14' },
    { key: '2026-W52', label: 'S52', start: '2026-12-21' },
  ]

  var CURRENT_WEEK = '2026-W47'

  var DEPARTMENTS = [
    { id: 'd1', name: 'Automatización & SCADA', manager_id: 'u1', code: 'AUT' },
    { id: 'd2', name: 'Oficina Técnica / EPLAN', manager_id: 'u4', code: 'OTE' },
    { id: 'd3', name: 'Mantenimiento', manager_id: 'u5', code: 'MAN' },
    { id: 'd4', name: 'Control de Calidad', manager_id: 'u8', code: 'CC' },
  ]

  var PEOPLE = [
    {
      id: 'u1',
      name: 'Ana Belén Ruiz',
      initials: 'AR',
      dept: 'Automatización & SCADA',
      role: 'Project Manager',
      level: 'Senior',
      employment: 'objetivo',
      base_hours: 40,
      factor: 100,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { 'TIA Portal': 3, SCADA: 3, 'Gestión de proyectos': 3, PLC: 2 },
      email: 'aruiz@coreplanner.local',
    },
    {
      id: 'u2',
      name: 'Sebastián Ortega',
      initials: 'SO',
      dept: 'Automatización & SCADA',
      role: 'Ingeniero PLC',
      level: 'Senior',
      employment: 'objetivo',
      base_hours: 40,
      factor: 100,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { 'TIA Portal': 3, PLC: 3, 'Redes industriales': 2, SCADA: 2 },
      email: 'sortega@coreplanner.local',
    },
    {
      id: 'u3',
      name: 'Marta Ruiz',
      initials: 'MR',
      dept: 'Automatización & SCADA',
      role: 'Ingeniero SCADA',
      level: 'Medio',
      employment: 'techo',
      base_hours: 40,
      factor: 80,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { SCADA: 3, HMI: 3, 'TIA Portal': 2 },
      email: 'mruiz@coreplanner.local',
    },
    {
      id: 'u4',
      name: 'Jorge Landa',
      initials: 'JL',
      dept: 'Oficina Técnica / EPLAN',
      role: 'Diseñador Eléctrico',
      level: 'Senior',
      employment: 'objetivo',
      base_hours: 40,
      factor: 100,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { EPLAN: 3, Mecánica: 2, Cableado: 2 },
      email: 'jlanda@coreplanner.local',
    },
    {
      id: 'u5',
      name: 'Iván Cortés',
      initials: 'IC',
      dept: 'Mantenimiento',
      role: 'Técnico Mecánico',
      level: 'Medio',
      employment: 'techo',
      base_hours: 40,
      factor: 100,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { Mecánica: 3, Soldadura: 3, Mantenimiento: 2 },
      email: 'icortes@coreplanner.local',
    },
    {
      id: 'u6',
      name: 'Lucía Ferrer',
      initials: 'LF',
      dept: 'Oficina Técnica / EPLAN',
      role: 'Ingeniero Eléctrico',
      level: 'Junior',
      employment: 'techo',
      base_hours: 18,
      factor: 100,
      schedule: [6, 6, 6, 0, 0, 0, 0],
      skills: { EPLAN: 2, Cableado: 3 },
      email: 'lferrer@coreplanner.local',
    },
    {
      id: 'u7',
      name: 'Diego Sanz',
      initials: 'DS',
      dept: 'Automatización & SCADA',
      role: 'Ingeniero PLC',
      level: 'Medio',
      employment: 'objetivo',
      base_hours: 40,
      factor: 100,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { PLC: 3, SCADA: 2, 'TIA Portal': 2 },
      email: 'dsanz@coreplanner.local',
    },
    {
      id: 'u8',
      name: 'Nuria Peña',
      initials: 'NP',
      dept: 'Control de Calidad',
      role: 'Técnico QC',
      level: 'Medio',
      employment: 'mejor_esfuerzo',
      base_hours: 40,
      factor: 100,
      schedule: [8, 8, 8, 8, 8, 0, 0],
      skills: { Análisis: 3, Metrología: 2, Soldadura: 1 },
      email: 'npenal@coreplanner.local',
    },
    {
      id: 'u9',
      name: 'Héctor Navarro',
      initials: 'HN',
      dept: 'Automatización & SCADA',
      role: 'Ingeniero PLC (incorporación 11-23)',
      level: 'Junior',
      employment: 'objetivo',
      base_hours: 40,
      factor: 100,
      schedule: [0, 0, 0, 0, 0, 0, 0],
      skills: { PLC: 2, 'Redes industriales': 1 },
      email: 'hnavarro@coreplanner.local',
    },
  ]

  /* Historial de horarios: cada entrada entra en vigor en su valid_from. */
  var SCHEDULE_HISTORY = {
    u1: [{ valid_from: '2026-01-05', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada completa' }],
    u2: [
      { valid_from: '2025-09-01', factor: 100, schedule: [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0], note: 'Jornada reducida' },
      { valid_from: '2026-01-05', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada completa' },
    ],
    u3: [
      { valid_from: '2025-01-06', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Tiempo completo' },
      { valid_from: '2026-01-05', factor: 80, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada parcial al 80 %' },
    ],
    u4: [{ valid_from: '2026-01-05', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada completa' }],
    u5: [
      { valid_from: '2024-01-08', factor: 80, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada parcial al 80 %' },
      { valid_from: '2026-07-01', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada completa tras reincorporación' },
    ],
    u6: [
      { valid_from: '2025-01-06', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Tiempo completo' },
      { valid_from: '2026-04-01', factor: 100, schedule: [6, 6, 6, 0, 0, 0, 0], note: 'Reducción de jornada a 3 días' },
    ],
    u7: [{ valid_from: '2026-03-02', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada completa' }],
    u8: [{ valid_from: '2026-01-05', factor: 100, schedule: [8, 8, 8, 8, 8, 0, 0], note: 'Jornada completa' }],
    u9: [],
  }

  /* Horas reales imputadas por persona y semana (tabla time_entries agregada).
     Llega hasta la semana en curso; a partir de ahí no hay imputación. */
  var REAL = {
    u1: [11, 17.5, 31, 31, null, null, null, null, null],
    u2: [null, 28, 51, 33, null, null, null, null, null],
    u3: [19, 20, 25, 23, null, null, null, null, null],
    u4: [28, 22, 25, 46, null, null, null, null, null],
    u5: [36, 27, 44, 30, null, null, null, null, null],
    u6: [null, null, null, 13, null, null, null, null, null],
    u7: [21, 25, 30, 45, null, null, null, null, null],
    u8: [13, 20, 25, 29, null, null, null, null, null],
    u9: [null, null, null, null, null, null, null, null, null],
  }

  var PROJECTS = [
    {
      id: 'p1',
      code: 'PRJ-014',
      name: 'Línea Pasteurizadora SIVE',
      dept: 'Automatización & SCADA',
      status: 'active',
      manager_id: 'u1',
      members: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u9'],
      start: '2026-10-05',
      end: '2027-01-29',
    },
    {
      id: 'p2',
      code: 'PRJ-021',
      name: 'Red de tuberías línea 2',
      dept: 'Oficina Técnica / EPLAN',
      status: 'active',
      manager_id: 'u4',
      members: ['u4', 'u5', 'u6', 'u8'],
      start: '2026-09-28',
      end: '2026-12-31',
    },
    {
      id: 'p3',
      code: 'PRJ-033',
      name: 'Gateway IIoT — fase 2',
      dept: 'Automatización & SCADA',
      status: 'planning',
      manager_id: 'u1',
      members: ['u1', 'u2', 'u7'],
      start: '2026-12-01',
      end: '2027-01-15',
    },
    {
      id: 'p4',
      code: 'PRJ-008',
      name: 'Renovación S-700',
      dept: 'Mantenimiento',
      status: 'on_hold',
      manager_id: 'u5',
      members: ['u5', 'u8'],
      start: '2026-09-01',
      end: '2026-11-06',
    },
    {
      id: 'p5',
      code: 'PRJ-042',
      name: 'Cuadrante de turnos 2027',
      dept: 'Control de Calidad',
      status: 'planning',
      manager_id: 'u8',
      members: ['u8'],
      start: '2026-11-23',
      end: '2027-01-15',
    },
  ]

  var STATUS_LABELS = {
    active: { label: 'Activo', tone: 'active' },
    planning: { label: 'Planificación', tone: 'neutral' },
    on_hold: { label: 'Pausado', tone: 'paused' },
    done: { label: 'Completado', tone: 'neutral' },
    cancelled: { label: 'Cancelado', tone: 'neutral' },
  }

  var COLUMNS = [
    { key: 'backlog', label: 'Backlog', wip: 8 },
    { key: 'in_progress', label: 'En Desarrollo', wip: 3 },
    { key: 'testing', label: 'Pruebas (FAT/SAT)', wip: 2 },
    { key: 'done', label: 'Completado', wip: null },
  ]

  var TASKS = [
    // --- PRJ-014 Línea Pasteurizadora SIVE
    { id: 'T-101', project: 'p1', title: 'Ingeniería de requisitos y FAT', user: 'u4', start: '2026-10-26', end: '2026-11-06', hours: 54, status: 'done', progress: 100 },
    { id: 'T-102', project: 'p1', title: 'Diseño EPLAN del cuadro de fuerza', user: 'u4', start: '2026-11-09', end: '2026-11-13', hours: 26, status: 'in_progress', progress: 85 },
    { id: 'T-103', project: 'p1', title: 'Diseño EPLAN del cuadro de maniobra', user: 'u4', start: '2026-11-16', end: '2026-11-20', hours: 44, status: 'in_progress', progress: 40 },
    { id: 'T-104', project: 'p1', title: 'Diseño EPLAN del conexionado', user: 'u4', start: '2026-11-23', end: '2026-11-27', hours: 36, status: 'backlog', progress: 0 },
    { id: 'T-105', project: 'p1', title: 'Planos de montaje final', user: 'u4', start: '2026-11-30', end: '2026-12-04', hours: 24, status: 'backlog', progress: 0 },
    { id: 'T-106', project: 'p1', title: 'Arquitectura de seguridades de la línea', user: 'u2', start: '2026-11-02', end: '2026-11-06', hours: 30, status: 'done', progress: 100 },
    { id: 'T-107', project: 'p1', title: 'Programación PLC de seguridad', user: 'u2', start: '2026-11-09', end: '2026-11-13', hours: 48, status: 'in_progress', progress: 70 },
    { id: 'T-108', project: 'p1', title: 'Programación PLC de seguridad (lote 2)', user: 'u2', start: '2026-11-16', end: '2026-11-27', hours: 72, status: 'in_progress', progress: 25 },
    { id: 'T-109', project: 'p1', title: 'Programación PLC — cierre y pruebas', user: 'u2', start: '2026-11-30', end: '2026-12-11', hours: 54, status: 'backlog', progress: 0 },
    { id: 'T-110', project: 'p1', title: 'Documentación de seguridad (marcado CE)', user: 'u2', start: '2026-12-14', end: '2026-12-18', hours: 20, status: 'backlog', progress: 0 },
    { id: 'T-111', project: 'p1', title: 'Programación HMI / SCADA', user: 'u3', start: '2026-10-26', end: '2026-10-30', hours: 20, status: 'done', progress: 100 },
    { id: 'T-112', project: 'p1', title: 'Programación HMI / SCADA (continuación)', user: 'u3', start: '2026-11-02', end: '2026-11-13', hours: 48, status: 'in_progress', progress: 45 },
    { id: 'T-113', project: 'p1', title: 'Programación HMI — modelos de línea', user: 'u3', start: '2026-11-16', end: '2026-11-20', hours: 24, status: 'backlog', progress: 0 },
    { id: 'T-114', project: 'p1', title: 'Programación HMI — alarmas y recetas', user: 'u3', start: '2026-11-23', end: '2026-11-27', hours: 18, status: 'backlog', progress: 0 },
    { id: 'T-115', project: 'p1', title: 'Programación HMI — cierre y traspaso a pruebas', user: 'u3', start: '2026-11-30', end: '2026-12-11', hours: 22, status: 'backlog', progress: 0 },
    { id: 'T-116', project: 'p1', title: 'Coordinación de obra y reunión de seguimiento', user: 'u1', start: '2026-10-26', end: '2026-12-18', hours: 90, status: 'in_progress', progress: 60 },
    { id: 'T-117', project: 'p1', title: 'Gestión de proveedores y compras', user: 'u1', start: '2026-11-02', end: '2026-12-18', hours: 70, status: 'in_progress', progress: 55 },
    { id: 'T-118', project: 'p1', title: 'Documentación de requisitos y homologaciones', user: 'u1', start: '2026-11-09', end: '2026-12-04', hours: 40, status: 'in_progress', progress: 30 },
    { id: 'T-119', project: 'p1', title: 'Bancada de pruebas: definición', user: 'u7', start: '2026-10-26', end: '2026-10-30', hours: 22, status: 'done', progress: 100 },
    { id: 'T-120', project: 'p1', title: 'Bancada de pruebas: montaje', user: 'u7', start: '2026-11-02', end: '2026-11-06', hours: 26, status: 'done', progress: 100 },
    { id: 'T-121', project: 'p1', title: 'Integración: puesta en marcha', user: 'u7', start: '2026-11-09', end: '2026-11-13', hours: 32, status: 'in_progress', progress: 50 },
    { id: 'T-122', project: 'p1', title: 'Integración: pruebas en planta', user: 'u7', start: '2026-11-16', end: '2026-11-20', hours: 42, status: 'backlog', progress: 0 },
    { id: 'T-123', project: 'p1', title: 'Integración: cierre y traspaso', user: 'u7', start: '2026-11-23', end: '2026-11-27', hours: 36, status: 'backlog', progress: 0 },
    { id: 'T-124', project: 'p1', title: 'Documentación de la FAT', user: 'u7', start: '2026-11-30', end: '2026-12-04', hours: 30, status: 'backlog', progress: 0 },
    { id: 'T-125', project: 'p1', title: 'Banco de pruebas: mejoras', user: 'u7', start: '2026-12-07', end: '2026-12-11', hours: 24, status: 'backlog', progress: 0 },
    { id: 'T-126', project: 'p1', title: 'Ingeniería de la puesta en marcha', user: 'u7', start: '2026-12-14', end: '2026-12-18', hours: 14, status: 'backlog', progress: 0 },
    { id: 'T-127', project: 'p1', title: 'Documentación y manuales', user: 'u6', start: '2026-11-16', end: '2026-12-18', hours: 48, status: 'backlog', progress: 0 },
    { id: 'T-128', project: 'p1', title: 'Actualización de planos de armario', user: 'u6', start: '2026-11-16', end: '2026-11-20', hours: 6, status: 'backlog', progress: 0 },
    { id: 'T-129', project: 'p1', title: 'Puesta en marcha y acompañamiento (fase 1)', user: 'u5', start: '2026-11-09', end: '2026-11-13', hours: 41, status: 'in_progress', progress: 35 },
    { id: 'T-130', project: 'p1', title: 'Acompañamiento en planta (fase 2)', user: 'u5', start: '2026-11-16', end: '2026-12-18', hours: 150, status: 'backlog', progress: 0 },
    { id: 'T-131', project: 'p1', title: 'Puesta en marcha de la línea 2', user: 'u9', start: '2026-11-23', end: '2026-12-18', hours: 60, status: 'backlog', progress: 0 },

    // --- PRJ-021 Red de tuberías línea 2
    { id: 'T-133', project: 'p2', title: 'Levantamiento de campo', user: 'u4', start: '2026-10-19', end: '2026-10-23', hours: 18, status: 'done', progress: 100 },
    { id: 'T-134', project: 'p2', title: 'Cálculo de soportes y anclajes', user: 'u6', start: '2026-11-23', end: '2026-11-27', hours: 6, status: 'in_progress', progress: 60 },
    { id: 'T-135', project: 'p2', title: 'Planos isometricos', user: 'u4', start: '2026-11-30', end: '2026-12-04', hours: 10, status: 'backlog', progress: 0 },
    { id: 'T-136', project: 'p2', title: 'Inspección de soldadura y radiografías', user: 'u8', start: '2026-11-02', end: '2026-11-13', hours: 48, status: 'in_progress', progress: 35 },
    { id: 'T-137', project: 'p2', title: 'Certificación de calidad de soldadura', user: 'u8', start: '2026-11-16', end: '2026-11-27', hours: 62, status: 'backlog', progress: 0 },
    { id: 'T-138', project: 'p2', title: 'Protocolo de prueba de estanqueidad', user: 'u5', start: '2026-12-21', end: '2026-12-31', hours: 8, status: 'backlog', progress: 0 },

    // --- PRJ-033 Gateway IIoT — fase 2
    { id: 'T-139', project: 'p3', title: 'Arquitectura del gateway y brokers MQTT', user: 'u7', start: '2026-12-21', end: '2026-12-31', hours: 8, status: 'backlog', progress: 0 },
    { id: 'T-140', project: 'p3', title: 'Conectores OPC UA y drivers', user: 'u2', start: '2026-12-21', end: '2026-12-31', hours: 12, status: 'backlog', progress: 0 },
    { id: 'T-141', project: 'p3', title: 'Presupuesto de hardware del gateway', user: 'u1', start: '2026-12-21', end: '2026-12-31', hours: 6, status: 'backlog', progress: 0 },

    // --- PRJ-008 Renovación S-700
    { id: 'T-142', project: 'p4', title: 'Desmontaje y evaluación de rodamientos', user: 'u5', start: '2026-10-26', end: '2026-10-30', hours: 38, status: 'done', progress: 100 },
    { id: 'T-143', project: 'p4', title: 'Presupuesto de la intervención', user: 'u5', start: '2026-11-02', end: '2026-11-06', hours: 28, status: 'testing', progress: 90 },
    { id: 'T-144', project: 'p4', title: 'Informe de estado del activo', user: 'u8', start: '2026-10-26', end: '2026-10-30', hours: 14, status: 'done', progress: 100 },

    // --- PRJ-042 Cuadrante de turnos 2027
    { id: 'T-145', project: 'p5', title: 'Definición de turnos por área', user: 'u8', start: '2026-11-30', end: '2026-12-11', hours: 48, status: 'backlog', progress: 0 },
    { id: 'T-146', project: 'p5', title: 'Informe de cierre de línea', user: 'u8', start: '2026-12-14', end: '2026-12-18', hours: 10, status: 'backlog', progress: 0 },
    { id: 'T-147', project: 'p5', title: 'Recepción de materiales', user: 'u8', start: '2026-12-21', end: '2026-12-31', hours: 8, status: 'backlog', progress: 0 },
  ]

  /* Dependencias entre tareas: predecesor -> sucesor. */
  var DEPENDENCIES = [
    { from: 'T-101', to: 'T-102', type: 'precedes' },
    { from: 'T-102', to: 'T-103', type: 'precedes' },
    { from: 'T-103', to: 'T-104', type: 'precedes' },
    { from: 'T-104', to: 'T-124', type: 'blocks' },
    { from: 'T-120', to: 'T-121', type: 'blocks' },
    { from: 'T-121', to: 'T-122', type: 'precedes' },
    { from: 'T-122', to: 'T-123', type: 'precedes' },
    { from: 'T-123', to: 'T-126', type: 'blocks' },
    { from: 'T-124', to: 'T-126', type: 'blocks' },
    { from: 'T-106', to: 'T-113', type: 'blocks' },
    { from: 'T-113', to: 'T-114', type: 'precedes' },
    { from: 'T-129', to: 'T-130', type: 'precedes' },
    { from: 'T-133', to: 'T-134', type: 'precedes' },
    { from: 'T-134', to: 'T-135', type: 'precedes' },
  ]

  var CRITICAL_PATH = ['T-101', 'T-102', 'T-103', 'T-104', 'T-124', 'T-126']

  /* Politicas de capacidad (Paperclip): umbral blando y umbral duro. */
  var POLICIES = [
    {
      id: 'pol-1',
      scope: 'Proyecto PRJ-014',
      metric: 'Horas planificadas por semana',
      window: 'Semana ISO',
      warn: 80,
      hard: 100,
      warn_action: 'Notificar al responsable del proyecto',
      hard_action: 'Requiere aprobación antes de asignar',
      enabled: true,
    },
    {
      id: 'pol-2',
      scope: 'Persona (todas)',
      metric: 'Horas planificadas por semana',
      window: 'Semana ISO',
      warn: 85,
      hard: 100,
      warn_action: 'Aviso en la matriz y en el panel',
      hard_action: 'Bloquea nuevas asignaciones',
      enabled: true,
    },
    {
      id: 'pol-3',
      scope: 'Departamento Automatización & SCADA',
      metric: 'Horas planificadas por semana',
      window: 'Semana ISO',
      warn: 75,
      hard: 95,
      warn_action: 'Informe al jefe de departamento',
      hard_action: 'Requiere aprobación del jefe de departamento',
      enabled: false,
    },
  ]

  var INCIDENTS = [
    {
      id: 'inc-1',
      policy: 'pol-1',
      project: 'p1',
      person: 'u2',
      week: '2026-W46',
      level: 'hard',
      ratio: 120,
      status: 'open',
      detail: '48 h planificadas frente a 40 h de capacidad efectiva. 8 h de horas extra en la semana.',
    },
    {
      id: 'inc-2',
      policy: 'pol-1',
      project: 'p1',
      person: 'u4',
      week: '2026-W47',
      level: 'hard',
      ratio: 110,
      status: 'open',
      detail: '44 h planificadas frente a 40 h de capacidad efectiva.',
    },
    {
      id: 'inc-3',
      policy: 'pol-1',
      project: 'p1',
      person: 'u7',
      week: '2026-W47',
      level: 'hard',
      ratio: 117,
      status: 'open',
      detail: '42 h planificadas frente a 36 h de capacidad efectiva (media jornada de formación el lunes).',
    },
    {
      id: 'inc-4',
      policy: 'pol-1',
      project: 'p1',
      person: 'u5',
      week: '2026-W46',
      level: 'hard',
      ratio: 103,
      status: 'open',
      detail: '41 h planificadas frente a 40 h de capacidad efectiva.',
    },
    {
      id: 'inc-5',
      policy: 'pol-1',
      project: 'p1',
      person: 'u1',
      week: '2026-W46',
      level: 'soft',
      ratio: 83,
      status: 'acknowledged',
      detail: 'Umbral blando cruzado al 83 % de la capacidad.',
    },
    {
      id: 'inc-6',
      policy: 'pol-1',
      project: 'p2',
      person: 'u4',
      week: '2026-W49',
      level: 'soft',
      ratio: 85,
      status: 'closed',
      detail: 'Incidente cerrado tras reasignar 12 h a Lucía Ferrer.',
    },
  ]

  var APPROVALS = [
    {
      id: 'apr-1',
      project: 'p1',
      requester: 'u2',
      approver: 'u1',
      kind: 'Sobrecarga',
      subject: 'Aceptar 48 h en 2026-W46 (120 % de la capacidad)',
      detail:
        'La tarea "Programación PLC de seguridad" se solapa con el cierre de FAT. Sin aprobación, la asignación queda bloqueada.',
      status: 'pending',
    },
    {
      id: 'apr-2',
      project: 'p1',
      requester: 'u4',
      approver: 'u1',
      kind: 'Sobrecarga',
      subject: 'Aceptar 44 h a Jorge Landa en 2026-W47 (110 %)',
      detail:
        'El cuadro de maniobra adelanta una semana por la entrega de material. Requiere visto bueno del responsable de proyecto.',
      status: 'pending',
    },
    {
      id: 'apr-3',
      project: 'p1',
      requester: 'u5',
      approver: 'u1',
      kind: 'Horas extra',
      subject: 'Autorizar 8 h de horas extra en 2026-W46',
      detail:
        'La puesta en marcha exige 9,6 h al día durante la semana 46. Se proposes imputar el exceso como horas extra.',
      status: 'pending',
    },
  ]

  var SAVED_VIEWS = [
    { name: 'Sobrecarga SCADA', scope: 'Proyecto PRJ-014', owner: 'Ana Belén Ruiz', shared: true, filters: 'Departamento AUT · S44–S48 · solo críticos' },
    { name: 'Todo por encima del 80 %', scope: 'Global', owner: 'Ana Belén Ruiz', shared: true, filters: 'Utilización ≥ 80 % · cualquier proyecto' },
    { name: 'Oficina Técnica', scope: 'Global', owner: 'Jorge Landa', shared: false, filters: 'Departamento OTE · vista de planificación' },
    { name: 'Mapa de carga del trimestre', scope: 'Global', owner: 'Ana Belén Ruiz', shared: true, filters: 'S44–S52 · agrupado por persona · con deriva' },
  ]

  var HOLIDAYS = [
    { date: '2026-10-12', name: 'Fiesta Nacional', scope: 'global', scope_label: 'Global', half_day: false, impact: 4 },
    { date: '2026-11-02', name: 'Todos los Santos', scope: 'global', scope_label: 'Global', half_day: false, impact: 6 },
    { date: '2026-11-09', name: 'Día de la Comunidad', scope: 'dept', scope_label: 'Oficina Técnica / EPLAN', half_day: false, impact: 2 },
    { date: '2026-11-16', name: 'Formación interna (media jornada)', scope: 'dept', scope_label: 'Automatización & SCADA', half_day: true, impact: 3 },
    { date: '2026-11-23', name: 'Permiso individual', scope: 'person', scope_label: 'Marta Ruiz', half_day: false, impact: 1 },
    { date: '2026-12-07', name: 'Día de la Constitución', scope: 'global', scope_label: 'Global', half_day: false, impact: 5 },
    { date: '2026-12-24', name: 'Nochebuena', scope: 'global', scope_label: 'Global', half_day: true, impact: 7 },
    { date: '2026-12-31', name: 'Nochevieja', scope: 'global', scope_label: 'Global', half_day: true, impact: 3 },
  ]

  var TIME_ENTRIES = [
    { id: 'te-1', user: 'u2', task: 'T-107', date: '2026-11-13', hours: 9, note: 'Programación de seguridades F-CPU' },
    { id: 'te-2', user: 'u2', task: 'T-107', date: '2026-11-12', hours: 9, note: 'Pruebas de la lógica de emergency stop' },
    { id: 'te-3', user: 'u4', task: 'T-103', date: '2026-11-16', hours: 8, note: 'Cuadro de maniobra: disconnection de potencia' },
    { id: 'te-4', user: 'u5', task: 'T-129', date: '2026-11-16', hours: 8, note: 'Montaje provisional del rodamiento' },
    { id: 'te-5', user: 'u3', task: 'T-113', date: '2026-11-17', hours: 6, note: 'Modelo HMI de la línea 2' },
    { id: 'te-6', user: 'u1', task: 'T-117', date: '2026-11-17', hours: 5, note: 'Revisión de requisitos con producción' },
    { id: 'te-7', user: 'u7', task: 'T-121', date: '2026-11-17', hours: 9, note: 'Preparación del banco de pruebas' },
    { id: 'te-8', user: 'u5', task: 'T-129', date: '2026-11-17', hours: 9, note: 'Ajuste de rodamientos del carro' },
  ]

  var ACTIVITY = [
    { id: 'a1', actor: 'u1', actor_type: 'human', action: 'política', entity: 'PRJ-014', when: 'hace 12 min', payload: { key: 'warn_percent', from: '75', to: '80' }, text: 'Umbral de aviso del proyecto cambiado de 75 % a 80 %.' },
    { id: 'a2', actor: 'u2', actor_type: 'human', action: 'asignación', entity: 'T-108', when: 'hace 45 min', payload: { key: 'assigned_to', from: '—', to: 'Marta Ruiz' }, text: '8 h de "Programación PLC de seguridad (lote 2)" reasignadas a Marta Ruiz.' },
    { id: 'a3', actor: 'agent', actor_type: 'agent', action: 'tarea', entity: 'T-123', when: 'hace 1 h', payload: { key: 'run_id', from: '—', to: '7c1f2a' }, text: 'Tarea "Integración: cierre y traspaso" creada por el agente (run 7c1f2a).' },
    { id: 'a4', actor: 'u5', actor_type: 'human', action: 'horario', entity: 'Iván Cortés', when: 'hace 3 h', payload: { key: 'availability_factor', from: '80', to: '100' }, text: 'Factor de disponibilidad al 100 % desde 2026-07-01.' },
    { id: 'a5', actor: 'u4', actor_type: 'human', action: 'festivo', entity: 'OTE', when: 'ayer, 17:40', payload: { key: 'scope', from: 'Global', to: 'Oficina Técnica / EPLAN' }, text: 'Festivo "Día de la Comunidad" añadido con alcance de departamento.' },
    { id: 'a6', actor: 'u3', actor_type: 'human', action: 'imputación', entity: '2026-W47', when: 'ayer, 09:12', payload: { key: 'hours', from: '0', to: '23' }, text: '23 h imputadas en la semana en curso.' },
    { id: 'a7', actor: 'agent', actor_type: 'agent', action: 'consulta', entity: 'capacity_matrix', when: 'ayer, 08:58', payload: { key: 'run_id', from: '—', to: '9ab310' }, text: 'Consulta de la matriz de capacidad por el agente del equipo.' },
  ]

  var MCP_TOOLS = [
    { name: 'capacity_matrix', desc: 'Matriz de capacidad por persona y semana ISO, con veredicto y ratio de utilización.', ro: true, risk: 'bajo', default: 'permitir', profile: 'lectura' },
    { name: 'overloaded_people', desc: 'Personas que superan su capacidad efectiva en una ventana de fechas.', ro: true, risk: 'bajo', default: 'permitir', profile: 'lectura' },
    { name: 'project_capacity', desc: 'Capacidad y carga consolidada de un proyecto en un rango.', ro: true, risk: 'bajo', default: 'permitir', profile: 'lectura' },
    { name: 'task_dependencies', desc: 'Dependencias entre tareas y ruta crítica de un proyecto.', ro: true, risk: 'bajo', default: 'permitir', profile: 'lectura' },
    { name: 'time_entries', desc: 'Imputaciones de horas de una persona o de una tarea.', ro: true, risk: 'bajo', default: 'permitir', profile: 'lectura' },
    { name: 'export_ics', desc: 'Exporta las asignaciones a un calendario iCalendar.', ro: false, risk: 'medio', default: 'denegar', profile: 'exportación' },
    { name: 'create_task', desc: 'Crea una tarea en un proyecto, con fechas, horas y persona.', ro: false, risk: 'medio', default: 'denegar', profile: 'operación' },
    { name: 'assign_allocation', desc: 'Asigna horas de una tarea a una persona en un rango.', ro: false, risk: 'alto', default: 'denegar', profile: 'operación' },
    { name: 'approve_overload', desc: 'Aprueba un rebose de capacidad por encima del umbral duro.', ro: false, risk: 'alto', default: 'denegar', profile: 'aprobación' },
    { name: 'set_working_schedule', desc: 'Cambia el horario laboral o el factor de disponibilidad de una persona.', ro: false, risk: 'alto', default: 'denegar', profile: 'administración' },
  ]

  var MCP_RUNS = [
    { run: '7c1f2a', when: '2026-11-17 09:12', tool: 'create_task', status: 'ok', note: 'X-Run-Id: 7c1f2a — tarea T-123 creada' },
    { run: '7c1f2a', when: '2026-11-17 09:12', tool: 'capacity_matrix', status: 'ok', note: '200 OK — 9 personas × 9 semanas' },
    { run: '9ab310', when: '2026-11-16 08:58', tool: 'overloaded_people', status: 'ok', note: '200 OK — 4 personas' },
    { run: '5f7d21', when: '2026-11-14 16:41', tool: 'assign_allocation', status: 'denied', note: '403 — denegado por el perfil por defecto' },
  ]

  var VERDICTS = {
    critical: { label: 'Crítico', rank: 0, desc: 'Sobrepasa la capacidad efectiva de la semana' },
    tight: { label: 'Ajustado', rank: 1, desc: 'Entre el 80 % y el 100 % de la capacidad' },
    balanced: { label: 'Equilibrado', rank: 2, desc: 'Entre el 50 % y el 80 %' },
    buffer: { label: 'Holgado', rank: 3, desc: 'Por debajo del 50 %' },
    no_capacity: { label: 'Sin capacidad', rank: 4, desc: 'No hay horario vigente definido para esa persona' },
    no_work: { label: 'Sin carga', rank: 5, desc: 'Semana sin trabajo asignado' },
  }

  var THRESHOLDS = { warn: 80, hard: 100 }

  return {
    WEEKS: WEEKS,
    CURRENT_WEEK: CURRENT_WEEK,
    DEPARTMENTS: DEPARTMENTS,
    PEOPLE: PEOPLE,
    SCHEDULE_HISTORY: SCHEDULE_HISTORY,
    REAL: REAL,
    PROJECTS: PROJECTS,
    STATUS_LABELS: STATUS_LABELS,
    COLUMNS: COLUMNS,
    TASKS: TASKS,
    DEPENDENCIES: DEPENDENCIES,
    CRITICAL_PATH: CRITICAL_PATH,
    POLICIES: POLICIES,
    INCIDENTS: INCIDENTS,
    APPROVALS: APPROVALS,
    SAVED_VIEWS: SAVED_VIEWS,
    HOLIDAYS: HOLIDAYS,
    TIME_ENTRIES: TIME_ENTRIES,
    ACTIVITY: ACTIVITY,
    MCP_TOOLS: MCP_TOOLS,
    MCP_RUNS: MCP_RUNS,
    VERDICTS: VERDICTS,
    THRESHOLDS: THRESHOLDS,
  }
})()
