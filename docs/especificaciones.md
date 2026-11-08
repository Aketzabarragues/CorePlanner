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
  repiten lo que ya dice la ficha de la persona. El planificador de lectura, con
  sus tres vistas y el arrastre para reasignar, si entra, en el §18.
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
| Planificador de recursos: tres vistas y arrastre | Hecho |
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
   tres pestanas: directorio, competencias y dias no laborables.

### Donde se configura cada cosa

| Que | Donde | Quien |
| --- | --- | --- |
| Competencias del catalogo | Configuracion, pestana de competencias | Gerente |
| Nivel de una persona en cada competencia | Ficha de la persona | Gerente |
| Horario de una persona | Ficha de la persona, historial de horarios | Gerente |
| Dias no laborables | Pestana de dias no laborables | Gerente |
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

- La **pantalla global** del calendario laboral, de lectura.
- La **tabla de dias no laborables**, con fecha, festivo, alcance, jornada y las
  **tareas afectadas**: cuantas tareas cubren ese dia y estan asignadas a
  personas a las que el festivo aplica.
- La **rejilla del mes** con los dias no laborables marcados por su alcance: en
  gris los globales, en ambar los de departamento y en morado los de persona.
- El **cuadro de impacto en la capacidad semanal**: por persona y semana, la
  capacidad que habria sin el festivo, la capacidad efectiva, la diferencia y el
  motivo.
- El **alcance por persona**: un dia no laborable puede aplicar solo a una
  persona, como un permiso individual.

### Que no entra

- El **recalculo de asignaciones** al publicar un festivo: eso es motor, no
  pantalla, y va aparte.
- El **alta de dias no laborables** desde aqui: se sigue haciendo en la
  pestana "Dias no laborables" de Personas.
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
   tecnica) sigue en ASCII.
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
