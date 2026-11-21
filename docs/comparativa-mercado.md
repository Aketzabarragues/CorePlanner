# Comparativa de mercado: CorePlanner frente a alternativas

Fecha: 2026-11-20. Fuente: investigacion web (paginas oficiales de producto,
notas de release, comparativas de terceros de 2026) contrastada con el analisis
interno de [`analisis-competitivo.md`](analisis-competitivo.md) (11 repos) y con
el estado actual de `docs/especificaciones.md`. No es ingenieria inversa de
codigo: son capacidades declaradas por cada producto y por las comparativas.

**Diferencia con el analisis previo**: ese documento estudia repos de codigo
para decidir que reimplementar. Este estudia el producto como lo compra y
configura un cliente: que se paga, que se bloquea tras el plan y que falta en
cada uno.

---

## 1. Veredicto

CorePlanner ocupa el unico hueco que ninguna de las alternativas cubre: una
matriz de capacidad persona x semana ISO contra capacidad resuelta, self-hosted,
con datos locales y sin coste por asiento. Nadie lo cubre:

- **OpenProject** (v17.7, ago 2026) acaba de lanzar su modulo de Resource
  management (planner, staffing, utilizacion, sobreasignacion) pero **solo como
  add-on Enterprise** (planes Premium/Corporate). La edicion comunitaria GPL no
  lo incluye. Es decir: el problema que CorePlanner resuelve gratis y en local,
  OpenProject lo ha convertido en su producto de pago.
- **EstiMate** (el "oestime") no compite en la misma capa: estima horas de
  proyecto por complejidad relativa y ancla horaria; CorePlanner consume esas
  horas. Son complementarios: EstiMate alimenta `estimated_hours`, CorePlanner
  reparte esas horas contra capacidad.
- **La categoria SaaS** (Float, Resource Guru, Runn, Mosaic, Productive,
  Kantata, Harvest Forecast, Teamdeck, Smartsheet, Teamwork.com) resuelve
  "quien esta libre y se le puede cargar trabajo" con calendario visual y
  forecast. Ninguno es self-hosted, todas cobran por persona y varias ponen las
  horas reales tras el plan de pago.

Posicion: **herramienta de capacidad self-hosted para equipos de ingenieria,
no un gestor de proyectos**. Ese es el hueco y no hay que salir de el.

## 2. Mapa de alternativas

| Herramienta | Tipo | Precio (2026) | Self-host | Capacidad real | Horas reales | Lo que define |
|---|---|---|---|---|---|---|
| **OpenProject** (17.7) | Open core GPL | Comunitaria gratis; Enterprise desde ~5-7 EUR/usuario/mes | Si (GPL) | Si, **solo Enterprise**: planner 4 vistas, staffing, utilizacion, sobreasignacion | Si (tiempo/coste en comunitaria) | Suite de PM completa; la capacidad es el add-on nuevo |
| **EstiMate** (PYES) | SaaS | 250 EUR/estimacion o 350 EUR/mes | No | No (no es su capa) | No | Estimacion por complejidad relativa + ancla horaria + MCP server |
| **Float** | SaaS | 7/12 USD por persona programada | No | Si: barras de capacidad, aviso de sobrecarga, tendencias de utilizacion | Pro (timesheets, plan vs real) | El scheduler visual de referencia |
| **Resource Guru** | SaaS | 4-12 USD/persona | No | Si: heatmap de sobrecarga (planes altos) | Blackbelt+ | Scheduling con clash management, lo mas barato |
| **Runn** | SaaS | 7-11 USD/sitio, minimo 20 | No | Si: forecast y escenarios | Standard+ | Forecast "puede aceptarlo en Q3" |
| **Mosaic** | SaaS | ~10 USD/persona, o quote | No | Si: heatmap trimestral, IA de asignacion | Si | IA que sugiere quien hace que |
| **Productive** | SaaS | ~10 USD/usuario | No | Si: capacidad ligada a rentabilidad | Si | Plataforma recursos+proyectos+finanzas |
| **Kantata** | SaaS enterprise | Quote | No | Si | Si | Enterprise 50+ empleados |
| **Harvest Forecast / Teamdeck / Smartsheet / Teamwork.com / ONES** | SaaS | Variable | No (ONES si) | Si en tiers altos | Variable | Plataformas amplias con modulo de recursos |

Notas de precio: las cifras son de las paginas oficiales y de las comparativas
citadas, verificadas por estas ultimas entre octubre y noviembre de 2026.
Float no tiene self-host; Resource Guru y Runn cobran por persona programada,
no por licencia.

## 3. Donde CorePlanner esta por delante

1. **La matriz es el producto, no una vista.** En todas las alternativas la
   capacidad es una vista mas de un gestor; aqui es el nucleo. Nadie mas cruza
   persona x semana ISO contra capacidad resuelta con horario versionado
   (`valid_from`) y factor de disponibilidad por dia.
2. **Datos en local, sin coste por asiento.** La categoria entera cobra por
   persona programada y pone las horas reales tras el plan. Para un equipo de
   ingenieria que quiere sus datos en su infraestructura, eso no existe:
   OpenProject lo metio en Enterprise y el resto es SaaS.
3. **Precision horaria.** Todo en centimas de hora enteras con `Decimal`
   (`Numeric(12,2)`). OpenProject usa float para `estimated_hours`; ERPNext
   tambien. El total de la matriz coincide con la suma de las tareas.
4. **Horario versionado por persona con vigencia.** `working_schedules` con
   `valid_from` + `availability_factor` + minutos por dia. Es el modelo
   `UserWorkingHours` de OpenProject (que ahora es de pago) pero gratis y en
   local.
5. **Dias no laborables con alcance** (global / departamento / persona) y
   **medio dia**, con cuadro de impacto en capacidad. ERPNext tiene festivos
   por empresa/empleado; OpenProject, globales; esto combina ambos.
6. **RBAC por proyecto con resolucion en base de datos.** Cada peticion
   consulta el rol, asi un cambio surte efecto inmediato. La categoria SaaS
   usa roles mas gruesos; los self-hosted (OpenProject) lo tienen pero con
   otro modelo.

## 4. Donde CorePlanner esta por detras (y es la lista de mejoras)

En orden de lo que el mercado ya da por hecho y de la relacion valor/esfuerzo
para CorePlanner. Las tres primeras son lo que separa a un "informe" de una
"herramienta que gobierna".

### G1. Horas reales: plan vs real (la mas importante)
**Estado de CorePlanner:** solo `estimated_hours`. La matriz es una
intencion, no un termometro.
**Lo que tienen los demas:** Float (Pro), Resource Guru (Blackbelt+), Runn
(Standard+), Mosaic, Productive, OpenProject (comunitaria) y Leantime comparan
horas reales contra planificadas, por persona y por proyecto, y calculan
utilizacion real. Es la funcion que todo el mundo espera y la unica que
CorePlanner no hace.
**Como:** una tabla `time_entries` (persona, tarea, fecha, horas) con
imputacion en centimas de hora enteras (no float, como hacen OpenProject y
ERPNext, que no hay que repetir). La comparacion va en la ventana semanal,
que es donde la capacidad es comparable. Riesgo real: sin adopcion la tabla
no se rellena; tratar como opcional y no penalizar a quien no imputa.
**Nota:** esto saca a CorePlanner de "informe" a "termometro". Es el hueco que
mas separa del resto.

### G2. Forecast: capacidad futura, no solo actual
**Estado de CorePlanner:** la matriz muestra las semanas del rango; no hay
"que pasara si acepto este proyecto".
**Lo que tienen los demas:** en 2026 el forecast es expectativa de base, no
premium. Runn modela proyectos provisionales y escenarios; Float tiene trabajos
en borrador (scenario planning); Mosaic y Productive proyectan capacidad por
rol. La pregunta del jefe es "puedo aceptar este proyecto en Q3", y hoy
CorePlanner no la responde.
**Como:** no hace falta nuevo motor: el informe ya calcula carga por persona y
semana. Falta (a) un modo "provisional" para tareas/proyectos no confirmados
que se pinten en contorno (como el outline de Float) y (b) un delta "capacidad
libre por persona y semana" como metrica de primera clase, no solo el estado
rojo. El ratio de utilizacion `scheduled / capacity x 100` de OpenProject
como medida publica.
**Es lo mas barato de la lista y lo que mas acerca a la categoria.**

### G3. Politica de capacidad con umbral y consecuencias
**Estado de CorePlanner:** la celda se pinta roja. Fin.
**Lo que tienen los demas:** Float avisa de sobrecarga al planificar;
Resource Guru pone clash management; Mosaic sugiere reasignacion. Ninguno
tiene politica configurable con registro, pero el umbral + aviso ya es la
linea de base.
**Como (ya esta disenado en el analisis interno):** tabla `capacity_policies`
(ambito persona/proyecto/departamento, metrica horas, ventana semana ISO,
umbral de aviso 80 %, umbral duro 100 %, accion avisar/pausar/aprobar)
evaluada como funcion pura, con incidentes idempotentes por ventana y umbral
duro como aprobacion obligatoria (no alerta). Es una tabla y una funcion
pura: la mejor relacion valor/esfuerzo de todo el analisis.
**Nota:** los "veredictos discretos" (critical/tight/balanced/buffer) de
Leantime encajan aqui como la lectura de la politica, no como un booleano.

### G4. Dependencias entre tareas y ruta critica
**Estado de CorePlanner:** el Gantt no tiene predecesores.
**Lo que tienen los demas:** OpenProject (comunitaria), ERPNext, Plane,
Kanboard tienen dependencias. Sin esto el Gantt es una vista de barras, no un
grafo, y no se puede decir "esta tarea no empieza hasta que termine aquella".
**Como:** tabla `task_dependencies` (tarea, predecesor, tipo), orden
topologico con `graphlib.TopologicalSorter` de la stdlib (lo que hace
ERPNext), deteccion de ciclos con CTE recursivo, y reprogramacion en cascada
**propuesta, nunca aplicada** (mover el Gantt sin avisar pierde la
confianza).

### G5. MCP server: CorePlanner operable por un agente
**Estado de CorePlanner:** nada.
**Lo que tienen los demas:** EstiMate y Leantime y Paperclip y Kaneo ya
exponen MCP. Es la jugada de 2026 y el perfil del operario (automatizacion
industrial) hace que esta sea la pieza con mas afinidad.
**Como:** servidor MCP por stdio, tools de solo lectura primero
(`capacity_matrix`, `overloaded_people`, `project_capacity`,
`task_dependencies`), autenticacion bearer token con hash, cabecera de run-id
en las escrituras, deny-by-default para las herramientas, y test de contrato
que fije el catalogo (si se renombra una tool, el CI falla). Referencia de
codigo MIT: `packages/mcp-server` de Paperclip y `apps/api/src/mcp/` de
Kaneo.

### G6. Bitacora de cambios
**Estado de CorePlanner:** ya existe `activity_log` (append-only, payload
JSON). **Este punto ya esta cubierto**; se lista aqui solo para confirmar que
no es un hueco. Verificar que se escribe en la misma transaccion que el
cambio y que guarda el payload como foto del momento.

## 5. Lo que NO hay que hacer

- **No convertir CorePlanner en un clon de Jira/Plane/OpenProject.** Diez de
  los once repos del analisis interno empujan a eso; es un mercado saturado y
  sin ventaja. La pregunta "esta persona, esta semana, cuanto tiene y contra
  que capacidad" sigue siendo el hueco.
- **No perseguir la IA de asignacion de Mosaic** ("sugiere quien hace que")
  sin antes tener horas reales (G1) y forecast (G2): la IA sobre datos
  incompletos es ruido.
- **No meter costes, facturacion, sprints, campos personalizados, jerarquias
  de espacios, CRDT ni plugins.** Ya esta decidido en el analisis interno y en
  la v1; la categoria SaaS vive de eso y es justo lo que nos aparta.
- **No copiar codigo de AGPL/GPL/Planka/Focalboard.** Reimplementar desde
  cero es licito; copiar la expresion obliga a publicar. Paperclip, Kanboard
  y Kaneo (MIT) son las unicas fuentes reutilizables.
- **No abrir a "todos los usuarios" el forecast ni las horas reales sin
  antes fijar el RBAC por proyecto**: son datos mas sensibles que la matriz.

## 6. Orden de ejecucion sugerido

Fijado en `docs/especificaciones.md` §51 (Hoja de ruta post-v1), junto con el
bloque nuevo de componentes interactivos (Kanban, Gantt y Calendario) y el
motor de Gantt propio.

1. **G2 (forecast + capacidad libre)**: no toca el esquema, solo el informe
   y una vista. Es lo que mas acerca a la categoria y lo mas barato.
2. **G1 (horas reales)**: tabla nueva + imputacion + comparacion semanal. Es
   el hueco que mas separa; depende de adopcion, no de tecnica.
3. **G3 (politica de capacidad)**: tabla + funcion pura + incidentes. Con G1
   y G2 ya hay queja que gobernar.
4. **G5 (MCP)**: con el informe estable, exponerlo a un agente es barato y es
   la jugada con mas afinidad al perfil.
5. **G4 (dependencias)**: el mas caro y el que mas cambia el Gantt; cuando la
   matriz y el forecast ya sean la rutina.

G6 ya esta hecho.

## 7. Fuentes

- OpenProject: notas de release 17.7.0 (2026-08-05), user guide "Resource
  management", blog "Resource management comes to OpenProject 17.7" y
  "Planning work is only half the job". El modulo de Resource management es
  add-on Enterprise (Premium/Corporate); Departments, user attributes y work
  schedules estan en todos los planes.
- EstiMate (estimate.pyes.software, PYES Software): metodologia de
  complejidad relativa + ancla horaria, MCP server, precio 250 EUR/estimacion
  o 350 EUR/mes.
- Categoria SaaS: comparativas de 2026 (Float, Resource Guru, Runn, Mosaic,
  Productive, Kantata, Harvest Forecast, Teamdeck, Smartsheet, Teamwork.com,
  ONES) sobre precios por persona, self-host y que hay tras cada plan. Float
  no tiene self-host; Resource Guru y Runn cobran por persona programada.
- Interno: `docs/analisis-competitivo.md` (11 repos, licencias, que
  reimplementar) y `docs/especificaciones.md` (alcance v1 y lo que no entra).
