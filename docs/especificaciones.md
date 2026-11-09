# CorePlanner - Especificaciones (v1)

Documento de alcance. Define que tiene que tener la aplicacion para
considerarla util, y sobre todo que NO tiene que tener. Es la referencia para
decidir si una funcionalidad entra o se queda fuera.

## 1. Que es

CorePlanner sirve para planning de la carga de trabajo de un equipo de ingenieria:
cuantas horas tiene cada persona en cada semana, repartidas entre los proyectos
en los que trabaja, y si esa carga supera su disponibilidad.

Sustituye las hojas de Excel de reparto de horas. No es un gestor de tareas
general ni un ERP: no lleva costes, ni compras, ni contabilidad.

## 2. Quien la usa

| Rol | Quien es | Que necesita |
| --- | --- | --- |
| **Gerente** | Responsable de area o de empresa | Ver toda la organizacion y detectar donde falta gente |
| **Jefe de departamento** | Responsable de un area tecnica | Ver la carga de su equipo y de los proyectos de su area |
| **Tecnico** | Persona que ejecuta trabajo | Ver cuanto tiene asignado y en que proyectos esta |

Los tres roles son de **empresa**, no de proyecto. Cada persona tiene uno.

## 3. Ambito de cada rol

| | Gerente | Jefe de departamento | Tecnico |
| --- | --- | --- | --- |
| Departamentos | todos | el suyo | el suyo |
| Personas | todas | las de su departamento | las de su departamento, sin su carga |
| Proyectos | todos | los que gestiona su departamento + los que es miembro | los que es miembro + los que tiene tareas |
| Tareas | todas | las de los proyectos visibles + las propias | las de los proyectos visibles + las propias |
| Matriz de capacidad | toda la empresa | los proyectos visibles (los de su area) | los proyectos visibles |
| Edicion | en todos los proyectos | en los proyectos de su departamento | en los proyectos donde es miembro |

Dentro de un proyecto visible, la matriz muestra la ocupacion de **todos** sus
miembros, no solo la de quien mira. Sin eso la matriz no sirve para detectar
solapes.

## 4. Reglas de visibilidad

1. **El gerente ve todo**, sin necesidad de ser miembro de nada.
2. **El jefe ve su departamento**: las personas que lo forman y los proyectos que
   lo gestionan. Tambien ve los proyectos de los que es miembro aunque no los
   gestione su departamento.
3. **El tecnico ve sus proyectos**: los de los que es miembro y los que tiene
   tareas asignadas. Una tarea asignada le da visibilidad del proyecto entero,
   aunque su departamento no lo gestione.
4. **La pertenencia al proyecto da permisos, el rol de empresa da ambito.**
   Ser miembro de un proyecto da acceso a el; el rol dentro del proyecto (ver,
   editar, gestionar miembros) dice que se puede hacer ahi dentro.
5. **El acceso se resuelve una vez**, al entrar, y no cambia durante la sesion.

## 5. Configuracion de la empresa

Lo que un administrador puede dar de alta y mantener:

| Elemento | Que se configura |
| --- | --- |
| Departamentos | nombre y responsable |
| Personas | nombre, correo, rol de empresa, departamento, puesto, nivel, tipo de contrato y horas base semanales |
| Horarios de persona | dias laborables por semana, factor de disponibilidad y fecha de entrada en vigor |
| Dias no laborables | fecha, nombre y alcance (global o de departamento) |
| Competencias | catalogo de habilidades y nivel de cada persona en cada una |
| Proyectos | nombre, departamento que lo gestiona, responsable y estado |
| Miembros de proyecto | que personas entran en cada proyecto y con que rol |
| Periodo de planificacion | cuantas semanas se muestran por defecto en la matriz |

Esta parte es configurable porque la empresa cambia. El conjunto de roles, en
cambio, es cerrado: gerente, jefe de departamento y tecnico. Crear roles nuevos
es material de una version posterior.

Los formularios de alta y edicion se abren en un modal centrado desde el boton
de cada panel, no en una tarjeta siempre visible: la tabla manda y el formulario
aparece solo cuando hace falta.

La configuracion de cada proyecto tiene su propia pantalla, dentro del espacio
del proyecto: ahi se editan el nombre, el estado, el departamento que lo
gestiona y el responsable, y ahi se da de alta a la gente que entra, se le
cambia el rol y se la quita. Editar el equipo de un proyecto es del gerente,
igual que el resto de la configuracion; quien no lo es ve la lista y los datos
del proyecto, pero sin poder tocarlos.

## 6. Que tiene que tener la aplicacion

| Pantalla | Para que sirve |
| --- | --- |
| Acceso | entrar con correo y contrasena |
| Mi trabajo | las tareas propias en el periodo de planificacion |
| Panel global | el estado de la organizacion de un vistazo |
| Proyectos | listado filtrado por el ambito de quien entra |
| Detalle de proyecto | tareas, miembros y estado |
| Tareas | alta, edicion, borrado, fechas, horas, responsable y estado |
| Matriz de capacidad | personas por semanas, con la sobrecarga marcada |
| Cronograma | barras de las tareas de un proyecto |
| Calendario | la planificacion dia a dia, en rejilla de mes |
| Calendario laboral | los dias no laborables, a quien afectan y que capacidad quitan |
| Tablero | columnas por estado de las tareas de un proyecto |
| Departamentos | quien hay en cada area, con su carga |
| Personas y competencias | directorio con el horario vigente de cada persona, historial de horarios y matriz de competencias |
| Configuracion | personas, roles, departamentos, proyectos y catalogo de competencias (solo gerente) |
| Miembros del proyecto | quien entra en el proyecto, con que rol y que horas base (el gerente lo edita) |
| Configuracion del proyecto | nombre, estado, departamento que lo gestiona y responsable (el gerente lo edita) |

## 7. Que NO tiene que tener la aplicacion (v1)

Esta lista es la que evita que la aplicacion crezca otra vez.

- Wiki, foros, reuniones, noticias, documentos.
- Control de costes, presupuestos y facturacion.
- Campos personalizados y tipos de tarea a medida.
- Sprints, versiones e iteraciones: el periodo es por semanas.
- Informes y exportacion a Excel.
- Integraciones con Jira, GitHub, LDAP, SAML u OIDC.
- El **planificador de recursos con tarjetas por persona**: las tarjetas
  repiten lo que ya dice la ficha de la persona. La capacidad esta en una sola
  pantalla desde el §22: la matriz con el detalle en un panel lateral y el
  arrastre con previsualizacion.
- Aplicacion movil.
- Permisos por tarea concreta (compartir una tarea suelta).
- Veredictos discretos de capacidad (critical, tight, balanced, buffer): son la
  politica de capacidad y van aparte, con sus umbrales y sus aprobaciones.
- Semantica del tipo de contrato en el calculo: por ahora es un dato.
- Asignacion automatica de tareas por competencia.
- Horarios por proyecto: el horario es de la persona, no del proyecto.

## 8. Datos minimos

| Entidad | Campos |
| --- | --- |
| Persona | nombre, correo, rol de empresa, departamento, puesto, nivel, tipo de contrato y horas base semanales |
| Horario de persona | persona, fecha de entrada en vigor, horas laborables de cada dia y factor de disponibilidad |
| Dia no laborable | fecha, nombre y alcance (global, de departamento o de persona) |
| Competencia | nombre del catalogo |
| Nivel de competencia | persona, competencia y nivel |
| Departamento | nombre, responsable |
| Proyecto | nombre, departamento que lo gestiona, responsable, estado |
| Miembro de proyecto | persona, proyecto, rol en el proyecto |
| Tarea | proyecto, titulo, responsable, estado, fechas, horas estimadas |

## 9. Que ya esta construido

| Parte de la especificacion | Estado |
| --- | --- |
| Departamentos y personas con departamento | Hecho |
| Proyectos con departamento que los gestiona | Hecho |
| Roles por proyecto con permisos | Hecho |
| Acceso con JWT y administrador global | Hecho |
| Matriz de capacidad por semanas con sobrecarga | Hecho |
| Cronograma y tablero | Hecho |
| Calendario de la planificacion | Hecho |
| Calendario laboral con impacto en la capacidad | Hecho |
| Pantalla unica de capacidad: modos, panel lateral y arrastre | Hecho |
| Ambito global (todo lo que puede ver quien entra) | Hecho |
| Rol de empresa (gerente / jefe / tecnico) | Hecho |
| Responsable de proyecto | Hecho |
| Mi trabajo | Hecho |
| Panel global | Hecho |
| Pantalla de configuracion | Hecho |
| Horario versionado por persona | Hecho |
| Dias no laborables con alcance | Hecho |
| Calendario laboral: dias, tareas afectadas e impacto semanal | Hecho |
| Competencias | Hecho |
| Pantalla de personas y competencias | Hecho |
| Miembros del proyecto (alta, cambio de rol y baja) | Hecho |
| Configuracion del proyecto | Hecho |

El administrador global que existe hoy es, de hecho, el gerente: el cambio que
ya esta hecho es que deje de ser un interruptor y pase a ser un rol de empresa
con su departamento y sus reglas de ambito.

## 10. Decisiones tomadas

1. **Alcance del tecnico.** No ve la carga de sus compañeros de departamento
   si no comparte proyecto con ellos. Solo ve la de los proyectos en los que
   participa.
2. **Editable por el jefe.** El jefe de departamento puede crear y editar
   tareas de los proyectos de su area.
3. **Responsable de proyecto.** Se anade una persona responsable por proyecto,
   distinta del departamento que lo gestiona.
4. **Horizonte de la matriz.** Cuatro semanas por defecto.

## 11. Bloque de personas: horario, competencias y calendario

La persona deja de ser un usuario con acceso y pasa a tener una identidad
profesional: puesto, nivel, tipo de contrato, horario vigente y competencias.

### Que entra

| Pieza | Que resuelve |
| --- | --- |
| Horario versionado por persona | La capacidad deja de ser un escalar y pasa a depender de la semana |
| Factor de disponibilidad | Permite «hasta marzo al 100 %, desde abril al 80 %» |
| Dias no laborables con alcance | Una tarea que cruza un puente se reparte en los dias que existen |
| Puesto, nivel y tipo de contrato | Identidad profesional de la persona |
| Competencias con nivel 1-3 | Catalogo de habilidades y matriz de la demo |
| Pantalla de personas y competencias | Directorio, historial de horarios y matriz |

### Como se calcula la capacidad de una semana

1. El horario vigente de una semana es el ultimo con fecha de entrada en vigor
   anterior o igual al lunes de esa semana.
2. La capacidad de la semana es la suma de las horas laborables de los siete
   dias multiplicada por el factor de disponibilidad.
3. Si la persona no tiene horario, se usa su horas base semanales.
4. Si la capacidad resuelta queda en cero horas, **su capacidad se desconoce**:
   no se marca como sobrecargada, porque el motor no inventa un limite que
   nadie ha definido.
5. Los dias no laborables de alcance global se quitan a todo el mundo; los de
   alcance de departamento, solo a quien pertenece a ese departamento.

### Reparto de las horas de una tarea

Las horas de una tarea se reparten entre los dias laborables de su rango: lunes
a viernes, menos los dias no laborables que apliquen a la persona asignada. Un
festivo de medio dia recibe la mitad de horas que un dia normal. El reparto es
proporcional al peso de cada dia y en centimas enteras, de modo que la suma de
las partes coincide exactamente con el total.

### Que no entra

- Veredictos discretos de capacidad y politica de umbrales (va aparte).
- Semantica del tipo de contrato en la matematica (por ahora es un dato).
- Asignacion automatica de tareas por competencia.
- Horarios por proyecto.

### Decisiones de este bloque

1. **El horario se guarda en centimas de hora enteras**, no en minutos: un
   minuto son 100/60 centimas y no siempre cabe en centimas enteras.
2. **El factor de disponibilidad es un porcentaje entero** entre 0 y 100.
3. **El nivel de competencia va de 1 a 3**, como en la demo.
4. **Las horas base semanales se mantienen obligatorias**, con 40 h por
   defecto. Una capacidad de cero horas se interpreta como capacidad no
   definida.
5. **El tipo de contrato tiene tres valores** (objetivo, techo, mejor
   esfuerzo) y no cambia todavia el calculo.
6. **La pantalla de personas y competencias vive en el espacio global** y tiene
   dos pestanas: directorio y competencias. Los dias no laborables se han ido
   a la configuracion, en la pestana de calendario laboral.

### Donde se configura cada cosa

| Que | Donde | Quien |
| --- | --- | --- |
| Competencias del catalogo | Configuracion, pestana de competencias | Gerente |
| Nivel de una persona en cada competencia | Ficha de la persona | Gerente |
| Horario de una persona | Ficha de la persona, historial de horarios | Gerente |
| Dias no laborables | Configuracion, pestana de calendario laboral | Gerente |
| Puesto, nivel y tipo de contrato | Configuracion, personas | Gerente |
| Equipo de un proyecto | Vista de miembros del proyecto | Gerente |
| Nombre, estado, departamento gestor y responsable de un proyecto | Vista de configuracion del proyecto | Gerente |

El catalogo de competencias **no es una lista fija**: se anade, se renombra y
se quita. Una competencia que alguien tiene asignada no se puede quitar, para
no dejar a nadie con un nivel sin nombre. El catalogo dice cuantas personas
tienen cada competencia.

El catalogo vive en **Configuracion**, no en la pantalla de personas: alli se
define que habilidades existen. La pantalla de personas responde a otra
pregunta, quien tiene cual, y por eso muestra la matriz y no el catalogo.

Los horarios van por versiones: cada una tiene su fecha de entrada en vigor.
Se pueden corregir o quitar, y el historial conserva lo que habia antes.
Corregir una version no cambia su fecha de entrada en vigor: cambiarla seria
otra version, no una correccion.

## 12. Pantalla de Mi trabajo

Es la vista personal: lo que tengo que hacer yo en el periodo de planificacion.
Vive en el espacio global, en `/my-work`, y cualquiera puede abrirla: no depende
del rol, porque cada uno ve lo suyo.

### Que entra

- Las **tareas propias** de los proyectos visibles, con su proyecto, su estado,
  sus fechas y las horas que caen dentro del periodo.
- La **carga por semana**: las horas propias de cada semana del periodo, la
  capacidad de esa semana y la marca de sobrecarga.
- El **periodo es el mismo** que el de la matriz de capacidad global: las
  semanas en las que hay actividad en los proyectos visibles. Asi las dos
  vistas hablan del mismo periodo y no hay que elegir entre ellas.

### Que no entra

- El horizonte configurable: el periodo se deduce de la actividad.
- Navegar de una semana a otra, o filtros por proyecto, estado o persona.
- Editar tareas desde aqui: la vista es de lectura, se editan en el tablero o
  en el desglose de una celda de la matriz.
- Arrastrar y soltar, o la asignacion por competencia.
- Imputacion de horas, que es la pantalla de tiempo del proyecto.
- Las tareas de otras personas: esta pantalla es la de uno mismo.

## 13. Panel global

Es la pantalla de entrada: el estado de la organizacion de un vistazo. Vive en
el espacio global, en `/panel`, y cualquiera puede abrirla.

### Que entra

- **Utilizacion de la semana de referencia**: horas planificadas frente a
  capacidad, en porcentaje. La semana de referencia es la semana en curso si hay
  actividad en ella, y si no la primera del periodo, para que el panel siempre
  muestre una semana con datos.
- **Personas sobrecargadas**: quien supera su capacidad en alguna semana del
  periodo, con sus horas, su capacidad y el exceso.
- **Proyectos por estado** y **tareas por estado**: recuentos.
- **Proyectos con mas carga**: horas estimadas, numero de tareas y de personas
  de cada proyecto visible.
- **Personas con carga** y **tareas del periodo**: dos recuentos mas.

### Que no entra

- Veredictos discretos, aprobaciones e incidentes de politica: son la politica
  de capacidad (N1) y van aparte.
- La bitacora de actividad: es su propia pantalla.
- Filtros, rangos de fecha y comparativas entre periodos.
- Edicion: el panel es de lectura.
- Asignacion automatica de trabajo.

## 14. Calendario de la planificacion

El Gantt muestra las tareas como barras sobre una linea de tiempo. El calendario
muestra la misma planificacion como una rejilla de meses: cada dia del mes y,
dentro, las tareas que lo ocupan. Son dos formas de mirar lo mismo.

Vive en los dos espacios, igual que el Gantt: en el global (`/calendar`) con
las tareas de los proyectos visibles y en el de proyecto
(`/projects/{id}/calendar`) con las de ese proyecto.

### Que entra

- La **rejilla mensual**, con la semana de lunes a domingo.
- Las **celdas de alto fijo**: la rejilla no crece con el contenido, de modo que
  el mes se ve siempre igual de regular. Lo que no cabe se ve desplazando la
  celda, no escondiendo tareas.
- Las **tareas de cada dia**, con su persona y su proyecto. La tarea aparece en
  todos los dias de lunes a viernes que ocupa; el fin de semana queda vacio,
  porque el motor de capacidad solo reparte horas entre dias laborables.
- La **navegacion de mes**: anterior, siguiente y hoy.
- Los **dias no laborables marcados** en su celda, con su motivo y su alcance
  (global o departamento). Forman parte del calendario de trabajo y por eso se
  ven junto a las tareas.
- Las **tareas sin fecha**, listadas aparte: la planificacion incompleta tiene
  que ser visible.

### Que no entra

- Arrastrar y soltar para mover o redimensionar tareas: el calendario es de
  lectura.
- Edicion desde el calendario.
- Filtros por proyecto, persona o estado.
- El calculo del "impacto en la capacidad" de los festivos: vive en el
  calendario laboral, que es su pantalla.
- Un calendario por persona: el color de la tarea ya dice quien la tiene.

## 15. Vista semanal del calendario

La rejilla mensual responde a "como queda el mes". La semanal responde a "como
queda esta semana": menos dias y mas detalle en cada uno. No es otra pantalla,
es el mismo calendario con otro corte: comparte ruta, datos y dias no laborables.

La semana es la **semana ISO**, de lunes a domingo: la misma unidad que usa la
matriz de capacidad, de modo que el calendario y la matriz hablan del mismo
periodo.

### Que entra

- El **conmutador de vista** (Mes / Semana) en la cabecera del calendario, en los
  dos espacios.
- La **rejilla de la semana**, con una columna por dia laborable, de lunes a
  viernes. El fin de semana no se muestra: el motor de capacidad nunca reparte
  horas un sabado ni un domingo, y una columna siempre vacia no aporta nada.
- Las **tareas de cada dia**, con mas detalle que en la vista mensual: titulo,
  persona, estado y las fechas completas de la tarea.
- La **navegacion de semana**: anterior, siguiente y hoy.
- Los **dias no laborables marcados** en su columna, con su motivo y su alcance.
- Las **tareas sin fecha**, listadas aparte, como en la vista mensual.

### Que no entra

- El **fin de semana**: no hay columna de sabado ni de domingo.
- Arrastrar y soltar, o edicion desde el calendario: es de lectura.
- El **desglose de horas por dia**: el motor reparte las horas de una tarea
  entre sus dias laborables, pero ese reparto no viaja en el feed del Gantt;
  verlo exigiria un endpoint nuevo.
- Filtros por proyecto, persona o estado.
- Un calendario por persona: el color de la tarea ya dice quien la tiene.

### Decisiones de este bloque

- La vista arranca en **Mes**, como hasta ahora: el cambio es optativo.
- La semana se elige con **el mismo par de botones** que el mes, para que la
  navegacion se sienta igual en las dos vistas.
- **Sin endpoint nuevo**: el feed del Gantt ya trae todas las tareas con fecha y
  la vista semanal filtra en cliente.

## 16. Vista de dia del calendario

La vista de dia es el detalle de un solo dia: que hay en el, quien lo lleva y
en que estado. Es la tercera vista del calendario y se abre al pulsar un dia
de la rejilla mensual o de la semanal.

### Que entra

- El **dia completo**, con su fecha en texto: "Lunes 9 de noviembre de 2026".
- Las **tareas de ese dia**, sin recorte: titulo, persona, estado, proyecto y
  las fechas completas de la tarea.
- La **navegacion de dia**: anterior, siguiente y hoy.
- Los **dias no laborables** de esa fecha, con su motivo y su alcance.
- El aviso de **tareas sin fecha**, que no aparecen en ningun dia.

### Que no entra

- El **desglose de horas del dia**: el motor reparte las horas de una tarea
  entre sus dias laborables, pero ese reparto no viaja en el feed del Gantt;
  verlo exigiria un endpoint nuevo.
- La **edicion de tareas**: la vista es de lectura.
- La **vista de fin de semana**: el fin de semana no tiene tareas ni carga, y
  el calendario entero lo deja vacio a proposito.
- Un **calendario por persona**: el color de la tarea ya dice quien la tiene.

### Decisiones de este bloque

- El dia se abre **pulsando el numero del dia** en la rejilla mensual o en la
  cabecera de la semanal, no pulsando cualquier punto de la celda: en la celda
  hay una lista que se desplaza y hay que poder hacerlo sin abrir nada.
- Al pulsarlo cambia la cabecera a "Dia" y el calendario muestra el dia entero.

## 17. Calendario laboral

El calendario de la planificacion dice cuando se trabaja. El calendario laboral
dice cuando no: que dias no laborables hay, a quien afectan y cuanta capacidad
se quitan.

### Que entra

- La **pestana de calendario laboral** de la configuracion, que es donde vive
  desde el §23. Es de lectura para cualquier rol y de escritura para el gerente.
- La **rejilla del mes** con los dias no laborables marcados por su alcance: en
  gris los globales, en ambar los de departamento y en morado los de persona.
- El **detalle del dia** con el festivo, su alcance, su jornada y las
  **tareas afectadas**: cuantas tareas cubren ese dia y estan asignadas a
  personas a las que el festivo aplica.
- El **cuadro de impacto en la capacidad semanal**: por persona y semana, la
  capacidad que habria sin el festivo, la capacidad efectiva, la diferencia y el
  motivo.
- El **alcance por persona**: un dia no laborable puede aplicar solo a una
  persona, como un permiso individual.

### Que no entra

- El **recalculo de asignaciones** al publicar un festivo: eso es motor, no
  pantalla, y va aparte.
- Los **veredictos discretos** (aprobaciones, incidencias de politica): son la
  politica de capacidad y van aparte.
- Un **calendario por persona**: la tabla ya dice a quien aplica cada festivo.

### Decisiones de este bloque

- El **alcance por persona** anade la columna `user_id` a `non_working_days`. El
  motor de capacidad deja de aplicar solo los dias globales y de departamento:
  aplica tambien los de la persona.
- Las **tareas afectadas** se cuentan sobre las tareas con persona asignada y
  con fechas, cuyo rango cubre el festivo, y solo cuando el festivo aplica a
  esa persona.
- El **impacto** se mide en la misma unidad que el motor, en centimas de hora,
  con su mismo redondeo. La capacidad sin festivo es la del horario vigente de
  esa semana por el factor de disponibilidad; la efectiva descuenta los dias no
  laborables que apliquen a esa persona.
- Solo se listan las filas con **diferencia**: lo que no se ve afectado no
  ocupa sitio.

## 18. Planificador de recursos

**Retirado.** La capacidad esta en una sola pantalla desde el §22: la matriz
con el detalle en un panel lateral y el arrastre con previsualizacion. Esta
seccion se conserva como registro de lo que se decidio entonces; lo que manda
es el §22.

La matriz de capacidad dice cuanto se ocupa cada persona. El planificador dice
lo mismo y, ademas, en que se ocupa: que tarea, en que proyecto y con cuanto
esfuerzo.

### Que entra

- La **pantalla global** del planificador, con tres vistas sobre el mismo rango
  de semanas.
- La **carga por tarea**: la matriz de persona y semana con las horas
  planificadas y el porcentaje de ocupacion, mas la tabla de asignaciones con
  las tareas de cada persona en cada semana.
- La **linea de tiempo por persona**: la misma matriz, pero cada celda lista las
  tareas de esa persona en esa semana.
- La **tabla de planificacion**: la misma matriz, pero cada celda muestra el
  reparto por proyecto.
- El **arrastre para reasignar**: arrastrar una tarea de una celda a la de otra
  persona le cambia el responsable.
- El color de la celda es el de la **sobrecarga** que ya usa la matriz de
  capacidad.

### Que no entra

- Las **tarjetas por persona**: repiten la ficha de la persona, que ya existe.
- Los **veredictos discretos** de capacidad: van aparte, con sus umbrales y sus
  aprobaciones.
- La **edicion de tareas** dentro del planificador: se edita desde la tarea.
- El **redimensionado** de tareas arrastrando sus bordes.
- Un planificador **por proyecto**: es global, como la matriz global.

### Decisiones de este bloque

- El planificador **no necesita backend nuevo**: la matriz viene de
  `/api/capacity` y las tareas de `/api/tasks`, que se amplia con un filtro de
  rango para no pedir una peticion por semana.
- El **arrastre** solo mueve el responsable de una tarea. Es la unica
  operacion que hace: el resto se cambia desde la tarea.
- Al soltar una tarea, la **matriz se recarga**: las horas se recalculan en el
  backend, no en el cliente.

## 19. Componentes comunes y textos visibles

Las pantallas repiten lo mismo: un texto "Cargando...", un bloque de error
copiado, una cabecera con titulo y subtitulo, un aviso de que algo ha ido
bien. Cada copia es una ocasion de que se queden desincronizadas. Este bloque
sustituye esas copias por cuatro componentes que usan todas las vistas.

De paso se revisan las cadenas visibles: hay una decena de sitios donde falta
la tilde ("Matriz de ocupacion", "Todavia", "Titulo"), en una interfaz que por
lo demas si la lleva.

### Que entra

- **`AsyncState`**: los tres estados de una vista que carga datos.
  - Cargando: un esqueleto con la forma de la pantalla, no un texto suelto.
    Se anuncia con `role="status"` y `aria-live="polite"`, y respeta la
    preferencia de "reducir movimiento".
  - Error: `role="alert"`, el mensaje y un boton **Reintentar**.
  - Vacio: un texto y una accion.
- **`AlertBanner`**: el aviso en linea, con icono y accion opcional, en cuatro
  variantes (exito, aviso, info, error). Es el unico patron de aviso: el aviso
  flotante del shell desaparece.
- **`PageHeader`**: titulo, subtitulo y acciones, siempre en el mismo orden y con
  el mismo aspecto en todas las pantallas.
- **`SidePanel`**: el panel lateral de detalle, con `role="dialog"`,
  `aria-modal`, cierre con `Esc` y trampa de foco. El modal de desglose de la
  matriz de capacidad deja de estar hecho a mano y pasa a usar este componente.
  Admite un modo **no modal**, en el que el fondo se sigue viendo y se puede
  seguir usando: lo necesita la matriz de capacidad, donde las celdas tienen
  que recibir el arrastre de una tarea.
- **`useDialog`**: el comportamiento de los dialogos (escucha de `Esc`, bloqueo
  del desplazamiento, trampa de foco y devolucion del foco) en un solo sitio.
  `ModalDialog` lo usa tambien, y de paso gana la trampa de foco que le
  faltaba.
- La **tilde en las cadenas visibles** del frontend y de los mensajes de error
  que ve el operario.

### Que no entra

- **El aviso flotante**: no hay dos patrones de aviso a la vez. El mensaje de
  "tarea creada" pasa a un banner en linea.
- **Los estados vacios propios de cada pantalla**: cada vista decide que
  escribe en su estado vacio; el componente solo aporta el hueco y la accion.
- **El panel lateral de la pantalla unificada de capacidad**: es de la fase 4.
  Aqui solo se prepara el componente.
- **La unificacion de rutas y el menu**: son de la fase 5, la de mayor riesgo.
- **Un sistema de diseno nuevo**: se mantienen el azul de Siemens y la paleta
  actual.
- **Los atajos de teclado** del prototipo: son de otra fase y se resuelven con
  el panel lateral.

### Decisiones de este bloque

1. **Un solo patron de aviso.** El prototipo lo dice: "Un solo patron de
   aviso, en linea, con icono y accion. El toast flotante desaparece." El
   banner va en la propia vista, donde se puede leer y donde puede llevar su
   accion; un flotante se traga el mensaje a los seis segundos.
2. **El azul de Siemens se mantiene.** El prototipo usa teal (`#0f766e`) en el
   boton principal. Aqui manda el azul de la casa: `bg-siemens-900`. Los avisos
   usan la paleta estandar de Tailwind (verde, ambar, azul y rojo) para no
   mezclarse con el azul de marca.
3. **El esqueleto tiene la forma de la pantalla**, no una barra generica: una
   cabecera y las filas de la tabla o de la rejilla. Se puede cambiar entero
   con el slot `loading`.
4. **Cada componente se aplica en su propio commit**, con la suite en verde, y
   se puede revertir por separado.
5. **Los mensajes del backend tambien se acentuan.** El operario los ve igual
   que los de la interfaz, asi que la convencion es la misma: lo que se ve,
   lleva tilde. Lo que no se ve (comentarios, nombres de archivo, documentacion
   tecnica) sigue en ASCII. Tambien los datos de demostracion: el nombre de un
   proyecto y el titulo de una tarea salen en pantalla.
6. **Los componentes viven en `frontend/src/components/common/`**, con sus
   pruebas en `frontend/src/tests/`.
7. **Un fallo de operacion es un banner; un fallo de validacion no.** Cuando
   la accion falla ("no se ha podido guardar"), el mensaje va en un
   `AlertBanner` con icono, este donde este el formulario. Cuando el propio
   formulario avisa de que un campo no vale ("el titulo es obligatorio"), el
   mensaje se queda pegado al campo, en rojo y sin caja: son dos cosas
   distintas y el operario las distingue de un vistazo.
8. **`PageHeader` no lleva migas.** El shell ya las pinta encima de la vista:
   meterlas tambien en el componente seria verlas dos veces. El componente
   aporta el titulo, el subtitulo y el hueco de acciones; las migas siguen
   siendo del shell.
9. **El `AsyncState` envuelve solo el contenido**, por debajo de la cabecera. La
   cabecera de la pantalla se ve mientras cargan los datos: si no, el operario
   pierde el titulo y las acciones en cada recarga.
10. **El esqueleto sale al cargar y al reintentar, no en cada refresco.** Un
    refresco por cambio de tarea no debe parpadear: cada vista decide cuando
    recargar de verdad y avisa con su propio boton de reintentar.
11. **El detalle se abre en un panel lateral, no en un modal centrado.** El
    desglose de una celda de la matriz deja de tapar la matriz: el panel entra
    desde la derecha y el operario sigue viendo la pantalla que lo ha
    producido. El panel es un dialogo (`role="dialog"`, `aria-modal`), asi que
    se cierra con Esc y el foco no se sale de el. En la matriz de capacidad el
    panel **no es modal**: la matriz se queda viva al lado, porque las celdas
    tienen que poder recibir el arrastre de una tarea.
12. **El comportamiento de los dialogos vive en un solo sitio.** `useDialog`
    se encarga de Esc, del bloqueo del desplazamiento, de la trampa de foco y
    de devolver el foco al elemento que abrio el dialogo. `ModalDialog` lo usa
    tambien, y de paso gana la trampa de foco que le faltaba.

## 20. Escala de carga e informes que no se piden dos veces

La matriz de capacidad enseña las horas de cada persona en cada semana, pero
hasta ahora solo decia si la semana estaba sobrecargada o no. El operario
tenia que dividir a mano para saber cuanto de la jornada se lleva. Ademas, en
el espacio global, la pantalla pedia los miembros de cada proyecto por
separado: una peticion por proyecto solo para poder pintar el panel de
detalle.

Este bloque introduce la escala de carga y quita esas peticiones de mas. Es la
fase 2 de la propuesta de interfaz, con el cierre de la correccion 6.5.

### Que entra

- **La escala de carga**, en `frontend/src/utils/load.js`, con su test
  unitario:
  - El uso es `horas / capacidad`, y los umbrales (50 %, 85 %, 100 %, 110 %)
    son constantes del modulo, no valores sueltos en las plantillas.
  - Seis estados: sin carga, libre, carga media, optimo, sobrecarga leve y
    sobrecarga alta.
  - **Capacidad desconocida** (`capacity` a null): la celda enseña las horas
    sin barra y sin estado. No se marca como libre ni como sobrecargada.
  - La sobrecarga lleva icono de triangulo ademas del color: nunca solo
    color.
- **Las celdas** de la matriz enseñan horas, capacidad, barra de uso e icono.
  Una celda sin horas muestra un punto, no un cero.
- **La fila de equipo**, al final de la tabla: el uso agregado por semana.
- **La cabecera de semana**: el numero de semana, el rango de fechas y la
  insignia de "Hoy" en la semana en curso.
- **La leyenda** de la escala, debajo de la matriz.
- **El informe de capacidad trae el perfil de cada persona**: su
  departamento, su puesto y los proyectos de los que es miembro. Con eso, la
  pantalla deja de pedir los miembros de cada proyecto por separado.
- **El panel de detalle filtra por persona en el servidor**, no en el
  cliente: se piden solo las tareas de esa persona en esa semana.

### Que no entra

- **Los modos de la celda** (horas, % de uso, proyectos): son de la fase 4, la
  que unifica la pantalla de capacidad. Aqui la celda enseña siempre las
  horas con su capacidad.
- **El eje de semanas continuo** y los filtros por proyecto, departamento y
  competencia: son de la fase 3, con sus cambios de API.
- **La insignia de festivo** en la cabecera de semana: necesita que la API
  devuelva los festivos de cada semana (cambio 7.4 de la propuesta), que es
  de la fase 3.
- **El arrastre de tareas** entre personas, con previsualizacion: es de la
  fase 4.
- **Los filtros y el estado en la URL**: son de la fase 3.
- **La fila de equipo no la calcula el backend**: es la suma de las horas y
  las capacidades que el backend ya devuelve. El motor sigue siendo el unico
  sitio donde se reparten las horas.

### Decisiones de este bloque

1. **La escala vive en un helper, no en las plantillas.** `load.js` decide el
   estado y devuelve las clases y las etiquetas. Las vistas pintan; no
   calculan. Asi la escala es la misma en la matriz y en el panel, y se puede
   probar sola.
2. **La capacidad desconocida no se inventa.** Si el backend no sabe la
   capacidad de una persona, la celda no la pinta de ninguna manera: se ve
   la cifra, pero sin barra y sin estado. Pinta "libre" cuando no se sabe si
   esta libre seria mentir.
3. **El perfil de la persona va en el informe, no en una peticion aparte.**
   Cada fila de la matriz lleva su departamento, su puesto y sus proyectos.
   Asi el espacio global deja de hacer una peticion por proyecto, y mas
   adelante se puede saber a quien se puede reasignar una tarea sin mirar
   otra pantalla.
4. **El filtro por persona va en SQL.** El backend ya filtraba por semana en
   SQL; faltaba el filtro por persona. El panel pide solo las tareas de esa
   persona en esa semana.
5. **La sobrecarga la sigue diciendo el backend.** La celda usa el mismo
   `capacity` que el backend usa para marcar la sobrecarga, de modo que el
   icono y el color no pueden contradecir al motor.
6. **El icono de sobrecarga es el del prototipo**: un triangulo de
   advertencia, dibujado con `AppIcon`, que ya sabe hacer iconos decorativos.
7. **La fila de equipo suma lo que el backend ya devolvio.** No recalcula
   horas ni capacidades: solo las agrega para enseñar el uso del conjunto.
   Las semanas en las que alguien no tiene capacidad definida se cuentan
   como capacidad desconocida, no como cero.

## 21. Eje de semanas continuo, filtros y estado en la URL

Hoy la matriz enseña solo las semanas en las que hay algo: si nadie tiene
tareas en la semana 52, esa columna no existe. El operario no ve el hueco, no
sabe que la semana esta libre y tiene que preguntar. Ademas, con las semanas
sueltas, no se puede pedir un periodo concreto ni compartir un enlace que
muestre lo mismo que ve el que lo envia.

Este bloque hace que el eje sea continuo (todas las semanas del rango, tengan
actividad o no), anade los filtros que faltan y deja el estado de la pantalla
en la URL. Es la fase 3 de la propuesta de interfaz.

### Que entra

- **El informe acepta un rango de semanas.** `GET /api/capacity` y
  `GET /api/projects/{id}/capacity` aceptan `from` y `to` con semanas ISO
  ("2026-W45") y devuelven todas las semanas del rango, tengan actividad o no.
  Es el cambio 7.1 de la propuesta.
- **Los filtros que faltan** (cambio 7.2 de la propuesta):
  - `project_id`: limita el informe a un proyecto de entre los visibles.
  - `skill_id` con `min_level`: limita las filas a las personas que tienen esa
    competencia con ese nivel o mas.
  - `department_id`: ya existia, y sigue significando lo mismo (los proyectos
    que gestiona ese departamento).
- **Los dias no laborables de cada semana** (cambio 7.4 de la propuesta): la
  semana del informe lleva `holidays: [{date, name, scope}]`, para que la
  cabecera pueda marcar los festivos.
- **La barra de filtros** de la matriz, como en el prototipo: proyecto,
  departamento y competencia con su nivel minimo.
- **La navegacion de rango**: anterior, "Hoy" y siguiente.
- **La insignia de festivo** en la cabecera de la semana.
- **El estado en la URL**: los filtros y el rango se leen de la URL al entrar y
  se escriben al cambiar, de modo que recargar la pagina no pierde nada y el
  enlace se puede compartir.
- **La cabecera de la tabla queda fija** al hacer scroll vertical, como la
  columna de personas, que ya lo estaba.

### Que no entra

- **Los modos de celda** (Horas / % de uso / Proyectos): son de la fase 4, que
  unifica la pantalla de capacidad.
- **El arrastre de tareas** con previsualizacion y el teclado: son de la fase 4.
- **El resumen en chips** (celdas sobrecargadas, huecos libres, uso medio): es de
  la fase 4.
- **La celda abierta en la URL**: va con el panel lateral definitivo, que es de
  la fase 4. En esta fase la celda abierta no sobrevive a la recarga.
- **La escala semana / mes**: el prototipo no la tiene, asi que no entra.
- **El panel, el resumen de proyecto y la vista de proyecto** no cambian de
  forma: siguen pidiendo el informe sin rango y viendo las semanas con
  actividad. El eje continuo es, de momento, cosa de la matriz.
- **La entrada por rol** (el tecnico aterriza en "Mi trabajo"): es de las fases
  5 y 6.
- **Los filtros no se guardan** en el navegador entre sesiones: solo viven en
  la URL.

### Decisiones de este bloque

1. **El backend obedece.** Si no llegan `from` y `to`, el informe sale como
   hasta ahora: las semanas con actividad. Asi el panel, el resumen de
   proyecto y el resto de consumidores no cambian de golpe.
2. **El rango por defecto lo decide el frontend**: la semana en curso y las
   ocho siguientes, nueve columnas. Es lo que dice la propuesta y lo que
   enseña el prototipo.
3. **Las flechas mueven el rango una semana**, no un periodo entero. El rango
   siempre son nueve semanas y va deslizando: "semana siguiente" es un clic.
   "Hoy" lo devuelve a la semana en curso.
4. **Cada semana del informe es un objeto** `{week, holidays}`. Es la forma que
   ya usa el informe de "Mi trabajo" y deja sitio a lo que crece en la fase 4.
   El motor sigue trabajando con las claves de semana: el cambio de forma es
   de la capa que habla con el frontend.
5. **La insignia de festivo solo enseña los dias globales.** La cabecera es de
   la matriz, no de una persona: un festivo de departamento o de persona no
   aplica a toda la columna. El texto es el nombre del festivo, y si es de
   medio dia se marca con "1/2". Si hay mas de un festivo en la semana, se
   enseño el primero y cuantos hay mas.
6. **El filtro por competencia filtra personas.** Solo salen en la matriz las
   que tienen esa competencia con ese nivel o mas; sus tareas se siguen
   imputando con normalidad.
7. **El filtro por departamento no cambia de significado.** Sigue siendo "los
   proyectos que gestiona ese departamento", que es lo que ya hacia y lo que
   dice el endpoint.
8. **El estado en la URL usa los nombres de la propuesta**: `?from=`, `?to=`,
   `?project=`, `?department=`, `?skill=` y `?level=`. Los de la API son mas
   explicitos (`project_id`, `skill_id`, `min_level`), pero el enlace se escribe
   a mano y se comparte.
9. **En la vista de un proyecto, el filtro de proyecto no se muestra**: ese
   proyecto ya es el filtro. Los demas filtros si.
10. **Con filtro de proyecto, el desglose es el de ese proyecto.** La celda
    cuenta las horas de una persona en un proyecto, asi que el panel tiene que
    enseñar las tareas de ese mismo proyecto. Si no, el panel contaria horas
    que la celda no tiene.
11. **Las dos semanas del rango van juntas.** Si llega una sola, es un 422: un
    rango a medias no significa nada.

### Decisiones cerradas

1. **Que significa el filtro de departamento.** Mantiene lo que ya hacia:
   limita los proyectos que gestiona ese departamento, no las personas. Se
   documenta en la ayuda del filtro.
2. **Cuantas semanas se ven por defecto.** Nueve: la semana en curso y las
   ocho siguientes, como en el prototipo.

## 22. Una sola pantalla de capacidad, con arrastre y previsualizacion

Hoy la capacidad esta partida en dos: la matriz (`CapacityMatrix.vue`) y el
planificador de recursos (`PlannerView.vue` con su `PlannerMatrix.vue`). Cada
una enseña una parte y el operario va y viene entre las dos. Ademas, reasignar
una tarea a otra persona se hace escribiendo en un desplegable, y si la persona
no es miembro del proyecto, el backend responde con un 422 despues de soltar.

Este bloque deja una sola pantalla de capacidad, con el detalle en un panel
lateral y el arrastre con previsualizacion. Es la fase 4 de la propuesta de
interfaz.

### Que entra

- **Una sola pantalla de capacidad.** La matriz actual es el sitio unico para
  ver la carga. Se borran `PlannerView.vue` y `PlannerMatrix.vue`, y su entrada
  del menu.
- **El selector de modo**, en la cabecera: Horas, % de uso y Proyectos. El modo
  cambia lo que se ve en la celda, no lo que se guarda.
- **La celda segun el modo**:
  - Horas: "36/40", barra de uso e icono si hay sobrecarga.
  - % de uso: "90 %" y debajo "36/40 h".
  - Proyectos: una etiqueta por proyecto, con sus horas.
- **El resumen en chips**, encima de la matriz: celdas sobrecargadas, huecos
  libres de 20 h o mas, y uso medio del equipo.
- **El panel lateral definitivo**, como en el prototipo: la cifra grande de
  horas, la pila de estado con su porcentaje, la barra, la nota, la lista de
  tareas con su selector de reasignacion, y el pie con "Nueva tarea esta
  semana" y "Ver en el Gantt".
- **El panel no tapa la matriz**: es una columna al lado, no un modal. Las
  celdas se pueden seguir pulsando y, sobre todo, reciben el arrastre.
- **El arrastre con previsualizacion**: al arrastrar una tarea del panel, todas
  las celdas de esa semana enseñan lo que pasaria al soltar:
  - La celda de origen enseña lo que quedaria sin esa tarea.
  - Los destinos no permitidos (quien no es miembro del proyecto de la tarea)
    se marcan antes de soltar, con rayado y sin aceptar el destino.
  - Los demas enseñan la carga resultante con la escala de colores.
- **La actualizacion optimista**: la matriz se actualiza al soltar y vuelve
  atras si la API falla, en vez de recargarlo todo.
- **La alternativa de teclado**: "Mayus + flecha arriba" y "Mayus + flecha
  abajo" sobre una tarea del panel la mueven a la persona anterior o a la
  siguiente. La reasignacion se puede hacer entera con teclado.
- **La celda abierta en la URL** (`?cell=persona-semana`): al recargar la
  pagina, el panel sigue abierto en la misma celda.

### Que no entra

- **El menu agrupado y las rutas unificadas**: son de la fase 5, la de mayor
  riesgo.
- **La pantalla de proyecto** (Resumen, Tablero, Miembros, Ajustes): es de la
  fase 6.
- **El movil y el menu en cajon**: son de la fase 6.
- **Los atajos de teclado globales** del prototipo: aqui solo entra el de mover
  una tarea.
- **La edicion de una tarea**: ya existe dentro del panel de detalle.
- **Los filtros y el rango**: son de la fase 3 y no cambian.

### Decisiones tomadas

1. **El reparto por proyecto de cada celda lo trae el informe.** El motor
   acumula el reparto por proyecto de cada persona y semana con el mismo
   criterio con el que reparte las horas, asi que los proyectos siempre suman
   las horas de la celda. El modo Proyectos no hace una peticion por celda.
2. **La linea de tiempo por persona se va con el planificador.** El detalle de
   una celda vive en el panel lateral, y el Gantt global ya cubre el reparto
   por proyecto.
3. **La previsualizacion usa las horas de la tarea en esa semana**, no las
   estimadas enteras: es lo que cuenta la celda, asi que lo que se previsualiza
   es exactamente lo que va a pasar.

## 23. Pantallas personales, panel, proyecto y calendario laboral integrado

Las cuatro pantallas que faltan de la propuesta (5.2 a 5.5) son hoy listas de
tablas: Mi trabajo es una tabla de semanas y otra de tareas, el Panel son
cuatro cifras sueltas, el resumen de proyecto son tres indicadores, y el
calendario laboral vive en una vista aparte a la que no se llega desde
Configuracion.

Este bloque las lleva al estado del prototipo. Es la fase 6 de la propuesta de
interfaz, la ultima antes del menu agrupado y las rutas unificadas (fase 5).

### Que entra

**Mi trabajo** (`views/MyWorkView.vue`)

- **Banner de sobrecarga**, uno por cada semana sobrecargada, con las horas y
  la capacidad de esa semana.
- **Grafico de barras de las proximas 8 semanas**, con la linea del 100 % de
  la capacidad, el icono de sobrecarga y la marca de "Hoy" y de festivo. El
  contenedor lleva `role="img"` y un `aria-label` que resume las cifras.
- **Tarjeta "Esta semana"**: horas, capacidad, barra y pila de estado.
- **Pestanas de tareas**: "Esta semana", "Proximas" y "Completadas".
- **Selector de estado por tarea**, para cambiar el estado sin salir de la
  pantalla.
- **Los festivos de cada semana**, que el backend ya calcula: hacen falta para
  la insignia de festivo del grafico.

**Panel** (`views/PanelView.vue`)

- **Cuatro indicadores clicables**, que llevan a la pantalla de origen: uso del
  equipo, personas con sobrecarga, proyectos activos y planificacion
  incompleta.
- **Uso del equipo por semana**, con la linea del 100 %.
- **Personas con sobrecarga**, agrupadas por persona, con su semana y su
  maximo.
- **Proyectos con mas carga**, con su barra.
- **Planificacion incompleta**: las tareas sin persona y las tareas sin fechas,
  con el motivo y una accion para resolverlas.

**Proyecto** (`views/ProjectSummaryView.vue`)

- **Cabecera** con nombre, estado, departamento y responsable.
- **Pestanas**: Resumen, Tablero, Miembros y Ajustes. Las cuatro vistas ya
  existen; aqui entran en la pantalla de resumen.
- **Accesos a "Ver su capacidad" y "Ver su Gantt"**.
- **Estado de las tareas**: barra segmentada y contadores por estado.
- **Horas del proyecto por semana**.
- **Equipo**, con el rol de cada persona en el proyecto.

**Configuracion** (`views/SettingsView.vue`)

- **Pestana "Calendario laboral"** al principio de la lista; el resto de las
  pestanas no cambia.
- **Lectura para cualquier rol**: quien no es gerente ve solo esta pestana y sin
  los controles de alta y baja.
- **Cuadricula mensual** con los tres alcances distinguibles (Global,
  Departamento, Persona) y el medio dia marcado con "1/2".
- **Panel de detalle del dia**: nombre, alcance, jornada, impacto por persona
  (antes h -> despues h) y el aviso de las tareas afectadas.
- **Alta de dia no laborable** desde la propia pestana.
- **Eliminacion con confirmacion**.

**Movil y menu en cajon**

- **Menu en cajon** por debajo de 640 px, con el boton de apertura en la
  cabecera y su `aria-expanded`.
- **Objetivos tactiles de 44 px** en los controles de la barra superior.
- **Tarjetas apiladas** en Mi trabajo y en el Panel.

### Que no entra

- **El menu agrupado y las rutas unificadas**: son de la fase 5, la de mayor
  riesgo. La fase 6 no cambia ninguna URL, salvo la entrada del calendario.
- **El Gantt global con filtro de proyecto**: "Ver su Gantt" abre la vista del
  proyecto, no la global con filtro.
- **La edicion completa de una tarea**: el selector de estado cambia el estado
  y nada mas.
- **Los filtros y el rango de la matriz**: son de la fase 3 y no cambian.
- **La entrada por rol**: el tecnico sigue entrando por Mi trabajo y el gerente
  por Panel.
- **Las mejoras estructurales** que estan pendientes de decidir (Alembic, CI,
  LICENSE, limite de intentos del login).

### Decisiones tomadas

Del operario:

1. **El boton "Avisar a mi jefa" se retira.** No hay endpoint de notificacion y
   no lo hay en esta fase: el banner de sobrecarga informa y nada mas.
2. **El selector de estado de las tareas de Mi trabajo se implementa.** Cada
   tarea lleva un desplegable que la mueve de estado con el
   `PATCH /api/tasks/{id}` de siempre.
3. **El calendario laboral vive en un solo sitio**: la primera pestana de la
   configuracion. La ruta `/work-calendar` redirige ahi, de modo que los
   enlaces antiguos siguen funcionando.

Del agente:

4. **La ventana por defecto son nueve semanas**, la en curso y las ocho
   siguientes, en `/api/my-work` y en `/api/panel`: la misma que muestra por
   defecto la matriz, para que las tres vistas hablen de las mismas semanas.
   Los dos endpoints aceptan `from` y `to`, y rechazan con 422 un rango a medias.
5. **La planificacion incompleta se resuelve desde el tablero**: el enlace
   "Resolver" lleva a `/projects/{id}/kanban`, que lista todas las tareas del
   proyecto, incluidas las que no tienen persona y las que no tienen fechas.
6. **"Ver su Gantt" abre el Gantt del proyecto** (`/projects/{id}/gantt`). El
   Gantt global con filtro de proyecto es de la fase 5.
7. **Se mantiene la pestana "Miembros"** de la configuracion. El prototipo no
   la trae, pero quitarla perderia funcionalidad.
8. **Las horas por semana de la pantalla de proyecto se suman en el frontend**,
   con lo que da el motor, que es el mismo criterio que ya usa el informe de
   carga por proyecto.
9. **El calendario laboral se lee desde cualquier rol y solo lo escribe el
   gerente.** Antes de mudarse de sitio, la tabla de festivos era visible para
   todos y solo el gerente podia darlos de alta o quitarlos; ese reparto se
   conserva: quien no es gerente ve la pestana del calendario y nada mas, sin
   el formulario ni los botones de alta y baja.
10. **La ruta `/work-calendar` sigue en el menu** y lleva a la pestana del
    calendario dentro de la configuracion, que es la que queda marcada como
    vista abierta.

## 24. Dos menus: el global y el del proyecto

La navegacion tiene dos arboles y dos menus. Las vistas globales (`/panel`,
`/my-work`, `/projects`, `/capacity`, `/gantt`, `/calendar`, `/departments`,
`/people`, `/configuration`) y las del proyecto (`/projects/:id`,
`/projects/:id/kanban`, `/projects/:id/members`, `/projects/:id/settings`) se
muestran en menus distintos segun donde se este. El proyecto es un **espacio**
con su propio menu, su propia cabecera y su propio bloque de migas.

Lo que decide cual de los dos se ve es una sola cosa: **que proyecto se esta
mirando**. Sale de la URL, del parametro de la ruta (`/projects/:id/...`) o del
filtro de la query (`?project=` en las vistas de planificacion). Si hay
proyecto, se ve el menu de proyecto; si no, el global. Es el criterio de la
maqueta (`demo/coreplanner-demo.html`, con `GLOBAL_NAV` y `PROJECT_NAV`) y del
competidor que mas se ha estudiado (`docs/openproject/analisis-openproject.md`).

### Que entra

**Los dos menus**

- **Menu global**, con cuatro grupos y sin proyecto delante:

  | Grupo | Vistas |
  | --- | --- |
  | Mi espacio | Panel, Mi trabajo |
  | Planificacion | Capacidad, Gantt, Calendario |
  | Organizacion | Proyectos, Personas, Departamentos |
  | Administracion | Configuracion (solo gerente) |

- **Menu de proyecto**, con dos grupos:

  | Grupo | Vistas |
  | --- | --- |
  | Planificacion y ejecucion | Resumen, Capacidad, Gantt, Calendario, Tablero |
  | Gestion y equipo | Miembros, Ajustes |

- **Que menu se ve lo decide el proyecto activo**, no la ruta: si hay
  proyecto, el de proyecto; si no, el global.
- **El menu global solo aparece sin proyecto**, asi que sus enlaces nunca
  llevan filtro. El filtro viaja con los enlaces del menu de proyecto.
- **El menu de proyecto lleva el proyecto en cada enlace**: en el parametro de
  la ruta para Resumen, Tablero, Miembros y Ajustes (`/projects/1/kanban`), y en
  el filtro de la query para Capacidad, Gantt y Calendario
  (`/capacity?project=1`).
- **El calendario laboral sigue sin ser un item del menu**: ya vive en la
  primera pestana de la configuracion (§23), asi que el menu solo lleva a ella.
- **El menu no decide quien ve que**: lo decide el rol de empresa, igual que
  hasta ahora. El grupo de Administracion es el unico que se esconde.

**La cabecera del menu**

- Con proyecto delante, dice **Proyecto**, el nombre del proyecto y su
  departamento.
- Sin proyecto, dice **Espacio Global**, **Toda la organizacion** y
  **Consolidado de todos los proyectos**.

**El boton "Volver a vista global"**

- Al final del menu de proyecto hay un boton que quita el filtro y vuelve al
  espacio global: a la misma vista de planificacion sin `?project=`, o al panel
  cuando la vista no era de planificacion.

**Las migas de pan**

- En el espacio de proyecto: **departamento / proyecto / vista**.
- En el espacio global: solo la **vista**.

**Las rutas**

- **Las vistas de planificacion siguen unificadas y con filtro de proyecto en
  la URL**: `/capacity?project=<id>`, `/gantt?project=<id>` y
  `/calendar?project=<id>`. El menu de proyecto es quien genera esos enlaces.
- **No se reintroducen las rutas anidadas** `/projects/:id/capacity`,
  `/projects/:id/gantt` y `/projects/:id/calendar`: siguen siendo
  redirecciones a las vistas unificadas, para no romper los enlaces guardados.
- **En la URL el parametro se llama `project`; en la API, `project_id`.** Es
  el mismo filtro con dos nombres, uno para quien navega y otro para quien
  llama: el filtro por proyecto de la matriz ya usa `project_id`.
- **Las rutas del proyecto se quedan**: `/projects/:id` (resumen),
  `/projects/:id/kanban`, `/projects/:id/members` y `/projects/:id/settings`.
- **`/` redirige segun el rol** y **`/work-calendar` sigue redirigiendo** al
  calendario laboral de la configuracion.

**La cabecera de la pagina**

- **El selector de proyecto es el filtro `?project=`** de las vistas de
  planificacion, y sale de las demas pantallas.
- **La pila de estado del proyecto y el boton "Nueva Tarea"** aparecen cuando
  hay un proyecto: en su pagina o filtrando por el.

**El backend**

- No cambia. **`GET /api/gantt` admite `project_id`**, **`GET /api/capacity` ya
  lo admitia**, el calendario se monta con el feed del Gantt y hereda el filtro,
  y los endpoints por proyecto (`/api/projects/:id/...`) siguen atendiendo al
  proyecto que lleva la ruta.

**Lo que se simplifica**

- `frontend/src/utils/navigation.js`: dos catalogos de secciones,
  `GLOBAL_SECTIONS` y `PROJECT_SECTIONS`. Cada entrada del menu de proyecto
  dice si lleva el proyecto en la ruta (`projectIn: 'params'`) o en el filtro
  (`projectIn: 'query'`).
- `frontend/src/components/AppShell.vue`: el proyecto activo se resuelve una
  sola vez, como `route.params.id ?? route.query.project`, y de ahi salen el
  menu, las migas y el boton de vuelta.
- **El desplegable "Proyecto" de la barra de filtros de la matriz sigue sin
  estar**: el filtro tiene un solo control, el selector de la cabecera.

### Que no entra

- **La exportacion `.ics`**, que sigue pendiente.
- **La edicion de una tarea**: el selector de estado y el alta siguen siendo lo
  unico que se puede cambiar de una tarea.
- **Los demas filtros de la matriz**: departamento, competencia, escala, modo,
  rango y celda abierta no cambian de sitio ni de nombre.
- **Las mejoras estructurales pendientes de decidir**: Alembic, CI, LICENSE,
  limite de intentos del login y el N+1 de la configuracion.
- **La notificacion "Avisar a mi jefa"**, que se decidio retirar en el §23.
- **La API de tareas, de proyectos y de personas**: no cambian. Esto es de
  navegacion, no de datos.
- **Los permisos por proyecto**: el filtro `?project=` no abre proyectos que no
  se ven; el backend responde 404 y el frontend no los pide.
- **La pantalla unica de capacidad** con su panel lateral y su arrastre (§22),
  **la escala de carga** (§20), **el eje de semanas continuo** (§21), **las
  pantallas personales** (§23) y **los componentes comunes**: nada de eso se
  toca.

### Decisiones tomadas

1. **El proyecto activo se resuelve una sola vez**, en `AppShell.vue`, como
   `route.params.id ?? route.query.project`. De ahi salen el menu que se ve, las
   migas y el boton de vuelta. Es la unica fuente de verdad de "que proyecto
   estoy mirando", que es lo que faltaba cuando el menu era unico.
2. **Los enlaces del menu de proyecto llevan el proyecto**: en el parametro de
   la ruta para Resumen, Tablero, Miembros y Ajustes; en el filtro para
   Capacidad, Gantt y Calendario. Ningun enlace del menu global lleva filtro,
   porque sin proyecto no hay filtro que llevar.
3. **Las pestanas del proyecto se quedan en tres rutas**:
   `/projects/:id/kanban`, `/projects/:id/members` y `/projects/:id/settings`. El
   proyecto conserva su arbol, la URL dice que pantalla es y los enlaces del
   resumen del proyecto siguen valiendo.
4. **El calendario laboral se queda en `/configuration?tab=calendar`**. Las
   siete pestanas de la configuracion se comportan igual y no hay que tocar lo
   ya verificado en la fase 6.
5. **El selector de la cabecera es el filtro `?project=` y sale de las demas
   pantallas**. Aparece en Capacidad, Gantt y Calendario, que son las vistas
   donde hay un proyecto que filtrar; en el resto no se muestra, porque alli no
   filtraria nada.
6. **El filtro de proyecto tiene un solo control**, el selector de la cabecera.
   El desplegable "Proyecto" de la barra de filtros de la matriz se retira: dos
   controles para el mismo filtro obligan al operario a decidir cual de los dos
   manda.
7. **El enlace de la vista que ya esta abierta conserva su estado entero**,
   para que el rango, el modo o la celda abierta no se pierdan.

El nombre del parametro en la URL es `project` y en la API `project_id`. Es el
mismo filtro con dos nombres: el que ve quien navega y el que usa la llamada.

## 25. Bitacora de actividad

La aplicacion deja constancia de **que ha pasado y quien lo ha hecho**. Es el
patron N4 del analisis competitivo (`docs/analisis-competitivo.md`, "bitacora de
cambios append-only") y la vista "Actividad" de la maqueta
(`demo/coreplanner-demo.html`), que la tiene en las dos formas: global y de
proyecto.

La bitacora es un registro **append-only**: las entradas se anaden y no se
borran ni se editan. No hay ni deshacer ni rehacer: se registra lo que paso, no
se controla.

### Que entra

**La tabla `activity_log`**

| Campo | Que guarda |
| --- | --- |
| `id` | identificador de la entrada |
| `actor_id` | quien lo hizo (usuarios) |
| `action` | que paso: `task.created`, `task.moved`, `member.added`, `project.updated`... |
| `entity_type` | sobre que tipo de cosa: `task`, `member`, `project` |
| `entity_id` | el identificador de esa cosa |
| `project_id` | el proyecto al que pertenece, **no nulo** |
| `payload` | JSON con el detalle de lo que cambio |
| `created_at` | cuando |

Todo lo que se registra cuelga de un proyecto, asi que `project_id` no puede ser
nulo. La tabla se crea sola con `create_all`: es nueva, no hace falta migracion.

**Lo que se registra**

- **Tareas**: `task.created`, `task.updated`, `task.moved` y `task.deleted`.
- **Equipo**: `member.added`, `member.removed` y `member.role_changed`.
- **Ajustes del proyecto**: `project.updated`.

**Lo que no se registra**: las lecturas y el alta de proyecto.

**Como se registra**

- **No hay middleware ni interceptor**: el registro se escribe desde los
  servicios que ya mutan datos, con una funcion explicita
  `log_activity(session, actor, action, entity_type, entity_id, project_id,
  payload)`. Los servicios de tareas y de configuracion reciben ahora el actor.
- **El registro va en el mismo commit que el cambio**, de modo que la accion y su
  efecto se guardan o se pierden juntos.
- **El `payload` guarda una foto del momento**: el titulo de la tarea, el nombre
  de la persona y los estados de origen y destino. Si la tarea se renombra
  depois, la bitacora sigue diciendo como se llamaba entonces. El nombre de
  quien actua y el del proyecto si se resuelven en vivo, al leer.

**El endpoint**

- `GET /api/activity` devuelve `items`, `total`, `limit` y `offset`, ordenado de
  mas reciente a mas antigua.
- Admite `?project_id=`: sin el, sale lo de **todos los proyectos visibles**;
  con el, solo ese, y si no esta entre los que se ven responde **404**, igual
  que `/api/capacity`.
- `limit` es 50 por defecto y 200 como maximo; la paginacion va por `offset`.

**La vista**

- **Una sola pantalla**, `/activity`, que lee `?project=` de la URL igual que
  `CapacityMatrix.vue`, `GanttView.vue` y `CalendarView.vue`.
- Cada entrada dice **quien**, **que hizo**, **sobre que** y **cuando**. El
  tiempo va en relativo ("hace 10 min", "hace 2 h", "hace 3 d") y la fecha
  completa va en el `title`.
- En la vista global cada entrada lleva el nombre de su proyecto; con filtro no
  lo lleva, porque es redundante.
- El menu tiene la entrada en los dos arboles: en el **global**, en el grupo
  *Organizacion*; en el **de proyecto**, en el grupo *Gestion y equipo*, con
  `projectIn: 'query'`, como Capacidad, Gantt y Calendario: es una vista
  unificada con filtro, no una ruta propia del proyecto.

### Que no entra

- **Revertir o deshacer** una accion desde la bitacora.
- **Filtros adicionales**: por persona o por tipo de accion.
- **La exportacion** de la bitacora.
- **Instrumentar las lecturas**: abrir una pantalla no deja rastro.
- **El alta de proyecto**, que no estaba en la lista de puntos de registro.
- **La edicion de una tarea** como pantalla: la bitacora registra los cambios,
  pero el alta y el cambio de estado siguen siendo lo unico que se puede cambiar
  de una tarea (§24).

### Decisiones tomadas

1. **El registro es explicito, no automatico**. Se escribe desde los servicios
   que ya mutan datos, no desde un middleware: asi se ve exactamente que puntos
   de la aplicacion dejan rastro, y leer no deja ninguno.
2. **El actor viaja hasta el servicio**. `create_task`, `update_task`,
   `delete_task`, `update_project`, `add_project_member`,
   `remove_project_member` y `update_project_member_role` reciben el actor, y el
   endpoint se lo pasa.
3. **Un cambio de estado es `task.moved`**, no `task.updated`: el payload lleva
   `from` y `to`. El resto de ediciones son `task.updated`, con los campos que
   cambiaron.
4. **El `payload` es una foto del momento**, con el nombre de la entidad. El
   nombre de quien actua y el del proyecto se resuelven al leer, porque son los
   que-interesta tener al dia.
5. **Los permisos son los de `capacity.read` por proyecto**, replicando el
   criterio de `/api/capacity`: los proyectos visibles y 404 con `project_id`,
   no 403.
6. **La paginacion va por `limit` y `offset`**, que es lo que ya usaba la API, y
   el total sale en la misma respuesta.
7. **Una sola vista** para las dos lecturas: la diferencia entre global y de
   proyecto es el filtro de la URL y el nombre del proyecto en cada entrada.

## 26. Detalle de una tarea: descripcion, comentarios y checklist

Una tarea no es solo una fila con un titulo. Tiene una descripcion, una lista de
comprobacion, comentarios y su propio historico. Todo eso vive en un panel de
detalle que se abre desde la tarjeta del Tablero, que es donde se gestionan las
tareas de verdad: hasta ahora, editar una tarea solo era posible desde
Capacidad, haciendo clic en una celda y luego en la tarea.

### Que entra

**La descripcion**

- Columna `tasks.description`: texto largo y opcional. La mayoria de las tareas
  no la lleva.
- Se edita en el panel y se guarda con el `PATCH /api/tasks/{id}` de siempre.
- Entra en la bitacora como `task.updated`, con el valor anterior y el nuevo.

**Los comentarios**

- Tabla `task_comments`: id, task_id, author_id, body, created_at.
- **Solo se anaden y se leen**: un comentario no se edita ni se borra. Es lo que
  se dijo en su momento, y la bitacora ya guarda el historial.
- `POST /api/tasks/{id}/comments` y `GET /api/tasks/{id}/comments`.

**La lista de comprobacion**

- Tabla `task_checklist_items`: id, task_id, label, done, position, created_at.
- Es **plana**: cada punto es una linea de la tarea, no una tarea con sus
  propias dependencias.
- `GET`, `POST`, `PATCH` y `DELETE` en `/api/tasks/{id}/checklist`.

**El permiso**

- **Es el de `PATCH /api/tasks/{id}`**: quien puede editar la tarea puede
  comentar y tocar su checklist.
- **Leer** (los comentarios, el checklist y el historico) es `capacity.read` del
  proyecto de la tarea. Quien solo puede ver, ve.

**La bitacora**

- Acciones nuevas: `task.commented`, `task.checklist_item_added`,
  `task.checklist_item_done`, `task.checklist_item_updated` y
  `task.checklist_item_removed`.
- **`GET /api/activity` admite `entity_type` y `entity_id`**: el historico de una
  tarea sale filtrado. El permiso sigue siendo el del proyecto de esa entidad:
  una tarea de un proyecto que no se ve responde 404, como el resto.

**El panel**

- `TaskDetailPanel.vue`, sobre `SidePanel`.
- **Se abre desde la tarjeta del Tablero con un clic fuera del desplegable de
  estado**. El desplegable se queda donde esta, para el cambio rapido sin
  abrir nada. Un arrastre no abre el panel.
- Secciones: los campos de la tarea, la descripcion, la lista de comprobacion,
  los comentarios, la actividad y el boton de eliminar.
- **La actividad se refresca sola con cada accion**: lo que se hace desde el
  panel se ve en su propio historico, sin recargar la pagina.
- El boton de eliminar pide confirmacion antes de borrar, y al borrar se van
  tambien los comentarios y la lista de la tarea.

### Que no entra

- **Editar o borrar un comentario ya puesto**.
- **Adjuntos, menciones y notificaciones**.
- **Subtareas de verdad**: el checklist es una lista plana, no tareas
  independientes con fecha, responsable ni horas.
- **Prioridad y etiquetas**.
- **Un historial de la tarea que se mantenga aparte**: el historico sale de la
  bitacora filtrada por la tarea, que ya existe.
- **El panel desde Capacidad**: el componente es el mismo y alli ya esta el
  formulario de edicion, asi que el desglose de una celda no cambia.

### Decisiones tomadas

1. **El panel se abre desde la tarjeta del Tablero**, no desde el desplegable
   de estado. El desplegable se queda para el cambio rapido y el panel para
   todo lo demas.
2. **Un arrastre no abre el panel**: si el puntero se ha movido, el gesto es un
   arrastre y no un clic, por mucho que la tarjeta vuelva a su columna.
3. **El panel es un componente aparte** (`TaskDetailPanel.vue`), no un trozo
   del Tablero: asi el mismo detalle puede abrirse desde donde haga falta.
4. **Los comentarios y el checklist se escriben con `task.write`**, el mismo
   permiso que protege `PATCH /api/tasks/{id}`. Leerlos es `capacity.read`.
5. **Un comentario no se edita ni se borra**: es una foto del momento, como las
   entradas de la bitacora.
6. **Marcar y desmarcar un punto son la misma accion** (`task.checklist_item_done`),
   con el estado al que se deja en el payload.
7. **La lista es plana y lleva su orden** (`position`): no hay subtareas, solo
   lineas de la tarea en el orden en que se han puesto.
8. **El historico de la tarea sale de la bitacora**, filtrada por
   `entity_type=task` y `entity_id`. No hay un segundo historial que mantener.
9. **El boton de eliminar pide confirmacion**: borrar una tarea no tiene
   vuelta atras, porque se van con ella sus comentarios y su lista.

## 27. Vista de lista de tareas del proyecto

El Tablero enseña el reparto por estado y el Gantt enseña el calendario. Faltaba la
tercera forma de mirar las tareas del proyecto: en fila, con su responsable, su
estado, sus fechas, sus horas y el progreso de su lista de comprobacion.

Es una **vista del proyecto**, como el Tablero: el proyecto va en la ruta. No es una
vista global con filtro, asi que no entra en el menu global.

### Que entra

**La ruta y el menu**

- `frontend/src/views/TaskListView.vue`, ruta `/projects/:id/tasks`, nombre `task-list`.
- Entrada "Lista" en `PROJECT_SECTIONS`, grupo "Planificacion y ejecucion", junto a
  Tablero, con `projectIn: 'params'`.
- Tambien es una pestaña del resumen del proyecto, para que el camino sea el mismo
  desde los dos sitios.
- Icono `list` propio en `AppIcon.vue`.

**La tabla**

- Columnas: Titulo, Asignado, Estado, Inicio → Fin, Horas y Checklist.
- El checklist sale como "x/y hechos" solo si la tarea tiene puntos. Si no tiene, la
  celda se queda vacia.
- El responsable lo trae el backend (`assigned_name`), no la lista de miembros del
  proyecto: una tarea puede quedar asignada a alguien que ya no es miembro.

**El orden**

- Clic en la cabecera de una columna: ordena por ella de forma ascendente. Un
  segundo clic invierte el sentido. Al cambiar de columna, el orden empieza de
  nuevo en ascendente.
- Por defecto se ordena por **fecha de inicio ascendente**.
- Lo que no tiene valor (una tarea sin fecha) se queda al final en los dos sentidos.

**Los filtros**

- Dos selects encima de la tabla, al estilo de los de la matriz de capacidad:
  **Estado** (los cuatro estados del Tablero) y **Persona**.
- Se combinan, y el encabezado dice cuanto se esta enseñando ("3 de 6 tareas").

**El detalle**

- Un clic en la fila abre `TaskDetailPanel.vue`: **el mismo panel del §26**, con sus
  campos, su descripcion, su checklist, sus comentarios y su actividad. Mismas props
  (`task-id`, `can-edit`).
- El boton "Nueva Tarea" no se repite: lo pone el armazon.

**El backend**

- `GET /api/projects/{id}/tasks` ya existia. Se ha enriquecido `TaskOut` con
  `assigned_name`, `checklist_total` y `checklist_done`.
- El progreso del checklist se calcula con **una consulta agrupada** para todas las
  tareas de la respuesta, no una por tarea. Lo mismo con los nombres de los
  responsables.
- Sirve para el listado del proyecto y para el global (`GET /api/tasks`).

**Solo lectura**

- `canEdit` sale del mismo sitio que en el Tablero: el proyecto tiene que estar
  entre los editables de quien entra. Quien solo puede ver ve la tabla y abre el
  panel, pero dentro no puede tocar nada.

### Que no entra

- **Paginacion**: hoy ningun proyecto llega a necesitarla (el mayor tiene 6 tareas).
- **Exportar a CSV o Excel**.
- **Columnas configurables**.
- **Vista guardada** (recordar como se ordenaba y que filtros me llevo).
- **Editar desde la tabla**: los cambios se hacen desde el panel.

### Decisiones tomadas

1. **Es una vista del proyecto, no una vista global con filtro**: por eso la ruta
   lleva el id del proyecto y la entrada va en el menu del proyecto
   (`projectIn: 'params'`), no en el global.
2. **El icono `list` es nuevo**: en Heroicons las rutas `list` y `board` son
   identicas, y `board` ya lo usa el Tablero.
3. **El orden por defecto es por fecha de inicio**: es la columna por la que se
   planifica. Titulo y responsable se ordenan de forma alfabetica.
4. **Clic en la cabecera ordena ascendente y otro clic invierte**: al cambiar de
   columna se empieza de nuevo en ascendente, para no dejar una columna al reves sin
   querer.
5. **Lo que no tiene valor se queda siempre al final**: una tarea sin fecha no
   desaparece ni sube al principio al invertir el orden.
6. **El progreso del checklist lo calcula el backend**: el frontend solo pinta
   "x/y hechos". Una consulta agrupada, no una por tarea.
7. **El responsable tambien viene del backend**: una tarea puede estar asignada a
   alguien que ya no es miembro del proyecto, y ese nombre tiene que seguir vieto.
8. **El filtro de personas se arma con los miembros y con las tareas**: si una
   tarea esta asignada a alguien que no es miembro, ese nombre tambien sale.
9. **El panel es el del §26, sin tocar**: la lista no duplica la logica de edicion.
10. **Los filtros son de la vista, no de la URL**: no se guardan ni se comparten.
    Eso queda para una vista guardada, que no entra.

## 28. Ambito de departamentos y desglose por departamento

El listado de departamentos no miraba el ambito de quien entraba: `GET /api/departments`
devolvia los tres departamentos a cualquiera con un token. Un jefe de area veia los
departamentos de los demas con sus responsables, sin tener nada que hacer ahi. El
panel global tampoco descentraba los departamentos: daba un numero agregado y punto.

### Que entra

**El listado acotado**

- `GET /api/departments` resuelve el ambito con `resolve_scope()` y filtra por
  `scope.department_id`, igual que hace `list_visible_users()` con las personas.
- El gerente y el administrador global ven todos. El resto ve solo el suyo. Quien no
  tiene departamento asignado no ve ninguno: la lista sale vacia, no da error.
- La escritura no se toca: `POST` y `PATCH` de departamentos siguen exigiendo gerente.

**El filtro de departamento de la capacidad**

- El backend ya aceptaba `department_id` en `GET /api/capacity`; lo que faltaba era
  acotar la lista del desplegable y decidir cuando esconderlo.
- El desplegable lista los departamentos visibles de quien entra y deja la matriz en
  el equipo de ese departamento. Por defecto, "Todos los departamentos".
- Con una sola opcion el desplegable no se muestra: no hay nada que elegir y solo
  ocupa sitio.
- Si una URL guardada lleva un departamento que ya no se ve, el filtro se cae de la
  URL y la matriz vuelve a enseñar lo visible, en vez de quedarse vacia sin explicacion.

**El desglose del panel**

- `PanelOut` gana `by_department`: una entrada por departamento visible con sus
  proyectos activos, sus personas con sobrecarga y el uso de su equipo.
- Cada departamento se mide con **su propio grupo de proyectos** y con el mismo
  calculo que el agregado global (semana de referencia, horas planificadas frente a
  capacidad, sobrecargas). No es el informe global repartido: cada equipo se mide
  con su gente.
- Un proyecto sin departamento no entra en ningun grupo: no hay contra que medirlo.
- En `PanelView.vue` es una tabla debajo de las cuatro tarjetas. Solo se muestra con
  mas de un departamento: con uno solo seria redundante con las tarjetas de arriba.

### Que no entra

- **Un desglose por persona**: el panel ya dice quien se pasa y cuanto.
- **Series por departamento**: el desglose es de la semana de referencia, no de todo el
  periodo.
- **Filtros en el panel**: el desglose es de lectura, no un selector mas.
- **Comparar departamentos entre si**: la tabla no ordena ni rankea areas.

### Decisiones tomadas

1. **El filtro por `department_id` se queda en la URL**: es un filtro mas de la matriz,
   y el resto de filtros ya viajan con ella.
2. **Con una sola opcion el desplegable se esconde**: es lo menos forzado. Un jefe de
   area ve su equipo entero en la matriz, sin un selector que no puede usar.
3. **La URL guardada se limpia sola**: un filtro que ya no se puede aplicar se quita,
   en vez de dejar la pantalla vacia sin decir por que.
4. **Cada departamento se mide con sus proyectos**: el uso de un equipo no se reparte
   desde el informe global. Una persona que trabaja en dos departamentos cuenta en
   los dos, con su capacidad completa en cada uno.
5. **El desglose es del gerente, en la practica**: se muestra con mas de un
   departamento visible, que solo pasa con el gerente o el administrador global.
6. **El calculo es el mismo**: se extrajo `week_usage()` para que el agregado global
   y el desglose usen exactamente la misma aritmetica.


## 29. Filtros del feed global de Gantt

El feed global de Gantt (`GET /api/gantt`) lo usan el diagrama de Gantt y el calendario, y no tenia ningun filtro: devolvia todo lo visible para quien entra. El selector de proyecto ya existia, pero solo aceptaba un `project_id` suelto, y no habia forma de filtrar por departamento ni por persona.

### Que entra

**El filtro por departamento**

- `GET /api/gantt` acepta `department_id`. Filtra por el departamento gestor del proyecto, el mismo criterio que ya usa `_by_department` en el resto del panel.
- Se aplica dentro de `list_accessible_projects()`: el filtro acota, nunca amplia. Un departamento que no se ve no se puede pedir ni a mano.
- Si el `project_id` pedido no esta entre los proyectos visibles, la peticion responde 404. Un feed vacio no distingue "no hay trabajo" de "no tienes permiso".

**El filtro por persona**

- `GET /api/gantt` acepta `assigned_to`: acota las tareas a las de esa persona y deja la lista de miembros del feed reducida a ella.
- Los dos filtros se combinan con AND: departamento Y persona.
- El recorte se hace en `load_gantt_for_projects()`, no en la vista: el feed sale ya filtrado.

**El nombre del departamento en la capacidad**

- El informe de capacidad (`GET /api/capacity`) gana `department_name` en cada fila de persona.
- Se resuelve con `department_names()` de `services/work_calendar.py`. `store.departments` esta acotado al ambito de quien entra, asi que no garantiza el nombre de todos los departamentos de las personas de la matriz.

### Que no entra

- **Ampliar el ambito**: ningun filtro da acceso a algo que ya no estuviera visible.
- **Varios proyectos a la vez**: `project_id` sigue siendo uno solo.
- **Filtros por competencia, por estado o por fecha**: no entran en esta tanda.
- **Guardar el filtro en el backend**: los filtros viajan en la URL.

### Decisiones tomadas

1. **El departamento es el gestor del proyecto**, no el de la persona asignada: es el mismo criterio que usa el filtro de capacidad del §28, de modo que un mismo numero de departamento significa lo mismo en las tres pantallas.
2. **El filtro va en el backend y no solo en la vista**: el feed global alimenta tres pantallas, y filtrar en el servidor evita tres copias de la misma regla.
3. **404 y no feed vacio** cuando se pide un proyecto que no se ve.
4. **`department_name` lo da el backend**: la capacidad es la unica de las tres que tiene que pintar el departamento de una persona, y el listado de departamentos no cubre a los que no son tuyos.

## 30. Capacidad: filtro de proyecto, franja de departamento y panel de visibilidad

La matriz de capacidad tenia filtro de departamento, de competencia y de nivel, pero **no de proyecto**: el `projectFilter` ya estaba cableado en el script y no habia ningun select que lo moviera. Ademas, con mas de un departamento, la matriz no decia de quien era cada fila: solo se veia el nombre de la persona.

### Que entra

**El filtro de proyecto**

- Se anade el `<select>` de proyecto, con las opciones de `store.projects` y "Todos los proyectos".
- El filtro ya estaba cableado; lo que faltaba era el control. No se toca lo que ya funcionaba.
- Vive en la misma fila que los demas filtros, y en la URL, como el resto de la matriz.

**Los cuatro filtros en pastilla**

- Departamento, proyecto, competencia y nivel pasan al mismo marcado de pastilla que el Gantt: etiqueta pequena encima, `<select>` nativo debajo.
- Siguen siendo `<select>` nativos: no se sustituyen por un componente propio.

**La franja de departamento**

- Cada fila de persona lleva una franja de color vertical pegada a la celda, con el nombre del departamento debajo.
- La franja **no agrupa**: las personas mantienen su orden y el departamento es un dato de la fila, no un separador.
- Sin departamento asignado, la franja es gris y no se pinta el nombre.

**El panel de mostrar/ocultar**

- Un boton "Mostrar/ocultar" abre un panel con casillas por departamento y por persona.
- Contador de cuantos hay ocultos y un "Mostrar todos" para deshacerlo de golpe.
- Ocultar un departamento oculta a sus miembros. Si desactivas a una persona de un departamento que esta oculto, se muestra ella y se ocultan sus compañeros, para no cambiar el conjunto visible sin avisar.
- El panel se cierra al pulsar fuera.

### Que no entra

- **Modo (Horas / % / Proyectos), rango de semanas y desglose de celda**: no se tocan.
- **Arrastrar tareas en la matriz**: sigue igual.
- **Persistir lo que se oculta**: es estado local del componente. No va a la URL, ni al backend, ni se recuerda al recargar.
- **Agrupar por departamento**: la franja informa, no agrupa.

### Decisiones tomadas

1. **El color sale de `department_id`, no del orden de las personas**: el color que ya usaba el feed de Gantt depende de la posicion alfabetica de la persona, asi que con el filtro de competencia un departamento podia cambiar de color entre dos usuarios. Con `id % 6` el color es estable para todos.
2. **Seis colores fijos y ciclicos**: `bg-blue-900`, `bg-teal-700`, `bg-amber-700`, `bg-violet-700`, `bg-rose-800` y `bg-slate-600`. Con mas de seis departamentos el color se repite, pero el nombre al lado del color resuelve la ambiguedad.
3. **La paleta son clases de Tailwind, no CSS a mano**: el guard de CSS del repo no admite clases inventadas.
4. **"Mostrar/ocultar" es local y no un filtro**: es una vista de la matriz. Los filtros van en la URL; esto no.
5. **Desmarcar a una persona de un departamento oculto muestra a sus compañeros**: la alternativa (no hacer nada) dejaba la casilla en un estado que no correspondia con lo que se veia.

## 31. Gantt: filtros, agrupacion y franja divisoria

El diagrama de Gantt era una sola lista de barras en orden de fecha. No habia forma de filtrar por persona ni de agrupar el trabajo por proyecto, departamento o persona: con la organizacion real, las barras de un mismo equipo salian dispersas.

### Que entra

**Los tres filtros**

- Departamento, proyecto y persona, en pastilla, con la misma forma que en la capacidad.
- Los tres viajan en la URL (`?department=`, `?project=`, `?assigned_to=`), asi que una vista filtrada se puede compartir.
- Los tres se pasan al feed: `department_id`, `project_id` y `assigned_to`.
- El selector de personas usa el directorio visible (`peopleApi.list`) y no los miembros del feed: con el filtro de persona puesto el feed se reduce a una sola persona, y el selector quedaria sin opciones.

**El selector de agrupacion**

- "Agrupar por" con Proyecto, Departamento, Persona y Sin agrupar. Por defecto, Proyecto.
- Tambien viaja en la URL (`?group=`).
- Al cambiar de agrupacion se reordena el diagrama, no se vuelve a pedir el feed.

**La franja divisoria**

- Cada bloque de grupo lleva una franja horizontal en el borde superior de su primera fila, dibujada por encima del SVG de la libreria.
- El nombre del grupo encabeza su bloque: solo lo lleva la primera barra del grupo, de modo que se lee como cabecera y no se repite en cada barra.
- El proyecto y la persona se siguen viendo en cada barra: son datos distintos del grupo, salvo que ya sean el grupo, en cuyo caso no se repiten.
- Sin agrupar no hay franja: no hay bloques que separar.

### Que no entra

- **Dia / Semana / Mes y el guardado de fechas al arrastrar**: no se tocan.
- **Una fila de cabecera dentro de la libreria**: frappe-gantt no las tiene.
- **Agrupar por cliente, por fase o por semana**: no entran.
- **Colores por grupo**: la unica marca visual del grupo es la franja.

### Decisiones tomadas

1. **La franja es una linea real inyectada en el SVG**, no una tarea fantasma: la libreria solo dibuja barras, una barra de duracion 0 es invisible y una tarea fantasma anadiria filas reales al diagrama. La franja va en una capa propia (`g.grupos`) sobre el SVG, y se repinta despues de cada `render()` y tras `change_view_mode`, que borra el SVG.
2. **El ancho de la franja se lee del DOM** (`.grid .grid-row`), no se calcula: el ancho de columna cambia con la escala de la vista.
3. **El nombre del grupo va en el texto de la primera barra**, no en una fila nueva: no habria forma de reservar una fila de cabecera en la libreria.
4. **El orden dentro del grupo es por fecha de inicio**, como antes. Cambiar el criterio de orden no era parte del encargo.
5. **Agrupar por departamento usa el departamento gestor del proyecto**, el mismo criterio que el filtro de departamento del §29.

## 32. Calendario: detalle de tarea y filtros

El calendario global no tenia forma de abrir una tarea: en las tres vistas (mes, semana y dia) las tareas eran texto. El detalle de tarea ya existia (el del §26) y lo usaba el Tablero, pero aqui no estaba conectado.

### Que entra

**Abrir el detalle de una tarea**

- Mes, semana y dia enganchan el clic de una tarea y abren el `TaskDetailPanel`, el mismo componente que el Tablero.
- La vista de dia y la de semana emiten `open-task`; el mes engancha el clic sobre la tarea de la celda.
- El permiso se calcula con `scope.editable_project_ids` de `GET /api/me`: el panel abre en solo lectura si la persona no puede editar el proyecto de la tarea.
- Al guardar o al borrar, el calendario recarga el feed.

**Los tres filtros**

- Departamento, proyecto y persona, en pastilla, con los mismos parametros de URL que el Gantt (`?department=`, `?project=`, `?assigned_to=`).
- Se combinan con AND.
- El filtro de departamento se aplica tambien en el cliente, cruzando el `project_id` de cada tarea con `store.projects`: el feed no trae el departamento de la tarea. Si la lista de proyectos no se puede leer, el filtro se deja al servidor en vez de dejar el calendario vacio.
- Si no queda ninguna tarea, se avisa con "Ninguna tarea coincide con los filtros".

### Que no entra

- **Editar tareas de un proyecto que no es editable**: se muestran en solo lectura, no se ocultan.
- **Filtro por competencia o por estado**: no entran.
- **Mover tareas arrastrandolas en el calendario**: el calendario no edita fechas.
- **Recordar el filtro entre sesiones**: vive en la URL.

### Decisiones tomadas

1. **Se reutiliza el `TaskDetailPanel` del §26** en vez de crear uno especifico del calendario: asi el checklist, los comentarios y la bitacora se comportan igual en las tres pantallas.
2. **El permiso se lee una vez con `GET /api/me`** y se resuelve por tarea: es lo que ya devuelve el panel de las otras pantallas.
3. **El filtro de departamento se aplica en cliente y en servidor**: en cliente por lo inmediato, en servidor porque el feed ya lo soporta. El filtro del cliente solo puede quitar mas, nunca devolver algo que el servidor no dio.
4. **Los filtros del calendario son los mismos que los del Gantt**, con los mismos nombres de parametro: una URL de calendario y una de Gantt se leen igual.

## 33. Un solo formato de filtro en toda la app

La app tenia dos formatos de filtro conviviendo: el cuadrado, de `ProjectsView.vue` y `TaskListView.vue`, y la pildora que se metio en la ronda anterior en Capacidad, Gantt y Calendario. El cuadrado es el que se queda.

### Que entra

- Los cuatro filtros de `CapacityMatrix.vue` (Departamento, Proyecto, Competencia, Nivel minimo), los cuatro de `GanttView.vue` (Departamento, Proyecto, Persona, Agrupar por) y los tres de `CalendarView.vue` (Departamento, Proyecto, Persona) pasan al formato cuadrado.
- El patron es el de `ProjectsView.vue`: `<label class="text-xs font-medium text-slate-600">`, la etiqueta en un `<span class="mb-1 block">` con texto normal, y el `<select class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">`.
- El hueco entre filtros pasa de `gap-2` a `gap-3`, como en el resto de la app.

### Que no entra

- **La logica de los filtros**: la URL, el panel de mostrar/ocultar de Capacidad y la agrupacion del Gantt se quedan como estaban.
- **Las pastillas que no son filtros**: "Activo", "Sobrecargada", "Con margen", la franja de departamento de Capacidad y los badges de estado siguen siendo `rounded-full`.
- **Los botones**: el de "Mostrar/ocultar" de Capacidad y los de modo (Horas / % / Proyectos) no son filtros y no cambian.

### Decisiones tomadas

1. **El cuadrado gana porque es el mayoritario**: Proyectos y Lista de tareas ya lo usaban, y el Gantt y el Calendario tienen ademas el filtro de proyecto con el mismo nombre de parametro. La pildora solo estaba en las tres vistas de la ronda anterior.
2. **La etiqueta baja de MAYUSCULAS a texto normal**: con el `text-xs` del `<label>` se lee igual que en el resto, y la mayuscula con `tracking-wide` era parte del envoltorio de la pildora.
3. **Los `data-testid` no cambian**: los tests que comprueban el formato miran el `<label>`, el `<span>` y el `<select>` por separado, para que un cambio de una pieza no tape al otro.

## 34. Columnas del listado de proyectos y su alineacion

El listado global de proyectos agrupaba por departamento, pero cada seccion era una tabla por su cuenta. Al calcular el ancho de cada columna por separado, RESPONSABLE y ESTADO caian en una posicion X distinta en cada seccion. Ademas, el mockup aprobado tenia tres columnas que se quedaron fuera: Equipo, Tareas y Carga esta semana.

### Que entra

**Una sola tabla**

- Los grupos de departamento se dibujan dentro de un unico `<table>`, con una fila de cabecera de departamento entre medias (`<th colspan="6">`).
- Asi el limite de cada columna cae en el mismo pixel en todas las secciones.
- La fila de cabecera de departamento no es clicable. La fila de proyecto sigue siendolo, con `role="button"`, `tabindex`, Enter y espacio.

**El resumen de cada proyecto**

- `GET /api/projects/summary` devuelve, para cada proyecto visible, su equipo, el avance de sus tareas y la carga de la semana en curso.
- El ambito es el de siempre: solo los proyectos visibles para quien entra (`list_accessible_projects`).
- El equipo son las personas asignadas al proyecto, con sus iniciales para el avatar.
- El avance son las tareas completadas y el total.
- La carga son las horas planificadas del proyecto en la semana frente a la capacidad de las personas que trabajan en el, con su porcentaje y un aviso cuando lo supera.

**Las tres columnas**

- **Equipo**: avatares apilados con las iniciales, hasta cuatro, y un "+N" si sobran.
- **Tareas**: "x/y completadas" y una mini barra de progreso.
- **Carga esta semana**: el porcentaje de uso, o el aviso de sobrecarga, o "Sin capacidad" cuando no se conoce.

### Que no entra

- **Columna de acciones**: la fila entera sigue siendo clicable.
- **Elegir la semana**: la columna es de la semana en curso.
- **Repartir la capacidad entre proyectos**: una persona aporta su capacidad completa a cada proyecto en el que trabaja esa semana, como ya hace el desglose por departamento del panel (§28).

### Decisiones tomadas

1. **Una sola tabla y no anchos fijos**: con una tabla por seccion, dos contenedores con scroll pueden medir distinto, y un porcentaje de ancho tampoco coincide. Una tabla no puede desalinearse consigo misma.
2. **La carga se calcula con el motor de capacidad, no con una cuenta nueva**: el motor ya deja en cada celda el desglose por proyecto (`CellProject`), asi que las horas del proyecto salen de ahi, y la comparacion con la capacidad reutiliza `utilization_percent()` del panel. No se duplica el reparto de horas.
3. **La capacidad es la de quien tiene horas en el proyecto esa semana**: una persona sin horas esta semana no consume capacidad, y contarla haria bajar el porcentaje sin motivo.
4. **Sin capacidad conocida no se afirma nada**: si nadie del equipo tiene capacidad definida, el porcentaje no se publica y el aviso no sale, igual que en el panel.
5. **El resumen es un endpoint aparte y no una ampliacion de `GET /api/projects`**: el listado de proyectos se usa en tres sitios mas como fuente de filtros, y esas pantallas no necesitan el resumen. Si el resumen no llega, el listado sigue en pie y las columnas muestran "—".

## 35. Filtro de departamento en el directorio de personas

`PeopleView.vue` era la unica vista global sin ningun filtro: ni busqueda ni departamento, mientras que Proyectos, Capacidad, Gantt y Calendario dejan acotar por departamento.

### Que entra

- Un `<select>` de departamento sobre el directorio, en formato cuadrado (el del §33), con las opciones de los departamentos visibles y "Todos los departamentos".
- Acota el directorio: es presentacion sobre la lista ya cargada, no cambia el ambito de nadie.
- Con un solo departamento visible el desplegable no se muestra: no hay nada que elegir.

### Que no entra

- **Busqueda por texto**: no entra en esta tanda.
- **Filtro por estado o por contrato**: el minimo pedido es el departamento.
- **Filtros en la matriz de competencias**: es otra pestana, con otra logica.

### Decisiones tomadas

1. **El filtro vive en `PeopleView.vue`, no dentro del `PeopleDirectory`**: la vista es la que tiene la lista de departamentos y la que decide que se pasa a cada componente.
2. **Se esconde con un solo departamento**, como ya hace el filtro de departamento de la capacidad (§28): un desplegable con una sola opcion no aporta nada.
3. **El filtro no acota el ambito**: solo deja de pintar filas de la lista ya cargada.

## 36. Los dos listados de personas

Hay dos UIs de personas: el directorio de Personas y Competencias (boton "Perfil") y la pestana "Personas" de Configuracion (boton "Editar"). Se mantienen separadas: una es para consultar, otra para administrar. Lo que se unifica es el lenguaje visual, para que se perciban como parte del mismo sistema de diseño aunque las columnas y las acciones sean distintas.

### Que entra

- El mismo contenedor de tabla: `overflow-x-auto rounded-lg border border-slate-200 bg-white`.
- La misma cabecera: `thead` con `bg-slate-50`, texto `uppercase tracking-wide text-slate-500` y `th` con `font-medium`.
- Los mismos separadores de fila: `divide-y divide-slate-100`.
- El mismo avatar de iniciales: circulo `h-8 w-8 rounded-full bg-siemens-900` con las iniciales de la persona, tambien en la tabla de Configuracion, que no tenia ninguno.
- Las iniciales salen de un util compartido (`frontend/src/utils/people.js`), en vez de repetidas en cada componente.

### Que no entra

- **Las columnas**: cada lista conserva las suyas. El directorio tiene horario, capacidad y carga; Configuracion tiene rol, puesto, horas y el boton de edicion.
- **Las acciones**: "Perfil" y "Editar" siguen siendo distintas.
- **Un unico componente**: son dos vistas con dos propositos.

### Decisiones tomadas

1. **El directorio manda en el estilo**: es la vista operativa, la que se mira todos los dias, y la que ya tenia el avatar. Configuracion se ajusta a ella.
2. **El avatar se anade en vez de quitarse**: quitarlo de Configuracion habria hecho la tabla mas pobre sin ganar nada.
3. **Las iniciales son dos letras, o una si el nombre es una sola palabra**: es el criterio que ya usaba el directorio.
## 37. El panel de visibilidad, compartido

El boton "Mostrar/ocultar" que ya tenia Capacidad pasa a ser un control de filtro mas, y su logica se saca a dos piezas que las tres vistas comparten: un composable con el estado (`frontend/src/composables/useVisibilidad.js`) y un componente con el dibujo (`frontend/src/components/common/VisibilityPanel.vue`).

### Que entra

- El boton "Mostrar/ocultar" de Capacidad pasa de `rounded-full` a `rounded`, igual que los demas controles de filtro de la vista.
- El contador de ocultos **se queda en pastilla** (`rounded-full`): es un indicador de estado, como "Activo" u "Sobrecargada", no un control de filtro.
- El panel desplegable ya era cuadrado y no se toca.
- El composable `useVisibilidad(personas)`: guarda las personas escondidas una a una, las claves de los departamentos escondidos, el contador y las tres acciones (esconder persona, esconder departamento, mostrar todos).
- El componente `VisibilityPanel`: el boton, el panel con las casillas agrupadas por departamento, "Mostrar todos" y el contador. El componente dibuja; el estado lo tiene la vista.
- Los `data-testid` son los mismos en las tres vistas: `toggle-visibility`, `visibility-panel`, `hide-department-{id}`, `hide-person-{id}`, `show-all` y `hidden-count`.

### Que no entra

- **No se persiste**: el estado es del componente. No va a la URL, no se pide al servidor y al recargar se ha perdido.
- **No cambia el alcance**: es un acotamiento de presentacion sobre lo que ya esta visible. Nunca amplia lo que `resolve_scope` deja ver.
- **El panel desplegable no cambia**: sigue siendo cuadrado, con la misma sombra y el mismo ancho.
- **No se anade a otras vistas**: Panel, Mi trabajo y las vistas de proyecto se quedan como estan.

### Decisiones tomadas

1. **Dos piezas y no una**: el estado (composable) y el dibujo (componente) van separados. Asi las tres vistas comparten la logica y solo cada vista decide a quien esconde. El componente no sabe nada de la matriz, del diagrama ni del calendario: recibe una lista de personas y devuelve lo que se pulsa.
2. **El departamento es el de la persona**, no el del proyecto que gestiona. En el Gantt, "Agrupar por: Departamento" agrupa las barras por el proyecto, pero el panel agrupa a las personas por el departamento que tienen en el directorio. Asi el panel significa lo mismo en las tres vistas.
3. **Marcar a una persona de un departamento escondido no cambia quien se ve**: el departamento se muestra y sus demas companeros se esconden uno a uno. Si no, al desmarcar a alguien se verian de golpe todos los companeros del departamento.
4. **El boton es cuadrado y el contador es pastilla**: el boton es un control de filtro, como los selects; el contador es un estado, como las pastillas de estado de la app.
5. **Una persona escondida sigue escondida aunque ya no este en la lista**: el filtro comprueba el id y el departamento de la persona, no solo las casillas marcadas.

## 38. El panel de visibilidad en el Gantt

### Que entra

- El boton "Mostrar/ocultar" junto a los filtros del diagrama (departamento, proyecto, persona y "Agrupar por").
- Las barras de las personas escondidas desaparecen del diagrama. Las tareas sin asignar se quedan: no son de nadie que se pueda esconder.
- Las personas escondidas desaparecen de la leyenda de colores.
- El diagrama se vuelve a pintar cuando cambia la seleccion.

### Que no entra

- No cambia los filtros de la URL ni hace falta volver a pedir el diagrama: esconder a alguien es solo de pantalla.
- No se puede esconder a una persona que no aparece en el diagrama.

### Decisiones tomadas

1. **La lista del panel sale de los miembros del feed** (las personas con barra), unidos al directorio para el departamento. Los miembros del feed pueden no tener barra en la semana abierta: se pueden esconder igual y cuentan en el contador.
2. **El diagrama se repinta entero**, en vez de quitar barras sueltas del SVG: la libreria dibuja el diagrama completo y las franjas de grupo se calculan con las barras que quedan.
3. **La lista se deriva del feed y no del ref de miembros**: ese ref se reescribe en cada repintado, y si el panel se apoyara en el, cada repintado volveria a disparar el repintado.

## 39. El panel de visibilidad en el Calendario

### Que entra

- El boton "Mostrar/ocultar" junto a los tres filtros del calendario.
- Las tarjetas de las personas escondidas desaparecen del mes, de la semana y del dia.
- Las personas escondidas desaparecen de la leyenda de colores.

### Que no entra

- No cambia los filtros de la URL ni vuelve a pedir el calendario.
- El detalle de una tarea ya escondida se puede seguir abriendo: el detalle busca la tarea en la lista completa, no en la que se ve.

### Decisiones tomadas

1. **El corte se hace en `visibleTasks`**: de ahi salen la rejilla del mes, la rejilla de la semana y el detalle del dia. Un solo sitio, las tres vistas quedan cubiertas.
2. **Las tareas sin asignar se quedan**, como en el Gantt.
3. **La lista del panel sale de los miembros del feed**, igual que en el Gantt, y las personas que no estan en el directorio se agrupan en "Sin departamento".
