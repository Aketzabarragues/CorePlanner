"""Dependencias entre tareas: el grafo de precedencia y lo que se deriva de el.

Funciones puras: las tareas y los vinculos entran por parametro y salen
como datos; el modulo no toca base de datos ni estado global. Solo los
vinculos `precedes` restringen la planificacion; los `relates` son de
referencia y no restringen nada, de modo que ni cierran ciclos ni se
rompen al mover una tarea.

Una tarea dependiente viola un vinculo `precedes` cuando empieza antes
de que termine su requisito; empezar el mismo dia en que este termina
no es violacion.
"""

from __future__ import annotations

import graphlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Protocol

PRECEDES = "precedes"
"""Vinculo de orden: el requisito termina antes de que empiece la dependiente."""

RELATES = "relates"
"""Vinculo de referencia: se dibuja, pero no restringe la planificacion."""

DEPENDENCY_TYPES = (PRECEDES, RELATES)
"""Tipos de vinculo que acepta la base de datos."""


class TaskDates(Protocol):
    """Tarea con las fechas que necesitan las derivaciones del grafo."""

    id: int
    start_date: date | None
    end_date: date | None


def detect_cycle(
    edges: Sequence[tuple[int, int, str]], new_edge: tuple[int, int, str]
) -> bool:
    """Indica si anadir new_edge cerraria un ciclo en el grafo de precedencia.

    Un vinculo (task_id, depends_on_id) ordena el requisito antes que la
    dependiente. Cerrar un ciclo es que la dependiente ya llegue, por las
    precedencias existentes, al requisito: en el grafo de precedencia
    (requisito -> dependiente) la dependiente alcanza el requisito. Un
    vinculo que no es `precedes` no puede cerrar un ciclo, y una tarea que
    depende de si misma lo cierra.
    """
    task_id, depends_on_id, tipo = new_edge
    if tipo != PRECEDES:
        return False
    if task_id == depends_on_id:
        return True

    # Grafo de precedencia: de cada requisito a las tareas que lo requieren.
    precedencia: dict[int, list[int]] = {}
    for tarea_id, requisito_id, tipo in edges:
        if tipo == PRECEDES:
            precedencia.setdefault(requisito_id, []).append(tarea_id)

    # La rama se lleva por parametro y no se comparte: un nodo que ya se
    # vio en una rama que no llego sigue siendo candidato en la siguiente.
    def _llega_a(target: int, current: int, rama: frozenset[int]) -> bool:
        """Indica si, bajando por precedencias, current llega a target."""
        for neighbor in precedencia.get(current, ()):
            if neighbor in rama:
                continue
            if neighbor == target or _llega_a(target, neighbor, rama | {neighbor}):
                return True
        return False

    return _llega_a(depends_on_id, task_id, frozenset({task_id}))


def find_violations(
    tasks: Mapping[int, TaskDates], edges: Sequence[tuple[int, int, str]]
) -> dict[int, list[int]]:
    """Por tarea dependiente, los requisitos `precedes` que no terminan antes.

    Es violacion cuando la dependiente empieza antes de que termine el
    requisito; empezar el mismo dia en que este termina no lo es. Las
    tareas sin fechas no violan nada: no hay nada que comprobar.
    """
    por_tarea: dict[int, list[int]] = {}
    for task_id, depends_on_id, tipo in edges:
        if tipo != PRECEDES:
            continue
        dependiente = tasks.get(task_id)
        requisito = tasks.get(depends_on_id)
        if dependiente is None or requisito is None:
            continue
        if (
            dependiente.start_date is not None
            and requisito.end_date is not None
            and dependiente.start_date < requisito.end_date
        ):
            por_tarea.setdefault(task_id, []).append(depends_on_id)
    return por_tarea


def topological_order(edges: Sequence[tuple[int, int, str]]) -> list[int]:
    """Orden topologico del grafo de precedencia, requisitos antes que dependientes.

    Usa graphlib.TopologicalSorter de la biblioteca estandar, lo mismo que
    hace ERPNext. Si el grafo tiene un ciclo, la ordenacion es imposible
    y se responde con graphlib.CycleError.

    Los vinculos `relates` no restringen el orden pero sus tareas entran
    en la lista. El orden dentro de un mismo nivel de la ordenacion es
    determinista: por identificador ascendente.
    """
    sorter = graphlib.TopologicalSorter()
    for task_id, depends_on_id, tipo in edges:
        if tipo == PRECEDES:
            sorter.add(task_id, depends_on_id)
        else:
            sorter.add(task_id)
            sorter.add(depends_on_id)
    lista: list[int] = []
    sorter.prepare()
    while sorter.is_active():
        listos = sorted(sorter.get_ready())
        lista.extend(listos)
        sorter.done(*listos)
    return lista


@dataclass(frozen=True, slots=True)
class CascadeMove:
    """Movimiento propuesto para una tarea: sus fechas nuevas."""

    task_id: int
    start_date: date
    end_date: date


def propose_cascade(
    tasks: Mapping[int, TaskDates],
    edges: Sequence[tuple[int, int, str]],
    moved_task_id: int,
    delta_days: int,
) -> list[CascadeMove]:
    """Propuesta de cascada si una tarea se moviera delta_days dias.

    Devuelve las tareas que habria que mover con ella, en orden
    topologico, cada una con sus fechas nuevas. Es una propuesta: nada
    se aplica solo.

    La tarea movida se propone siempre con su delta. Cada dependiente,
    en orden topologico, se propone mover el mismo delta si su fecha
    actual rompe o romperia el vinculo con su requisito (el que ya se
    haya movido, con sus fechas nuevas); el movimiento se propaga a las
    dependientes siguientes. Una tarea que no viola no se propone.
    """
    if delta_days == 0:
        return []
    delta = timedelta(days=delta_days)

    por_tarea: dict[int, list[int]] = {}
    for task_id, depends_on_id, tipo in edges:
        if tipo == PRECEDES:
            por_tarea.setdefault(task_id, []).append(depends_on_id)

    nuevos: dict[int, tuple[date, date]] = {}
    propuestas: list[CascadeMove] = []

    def _fechas_vigentes(task_id: int) -> tuple[date, date] | None:
        if task_id in nuevos:
            return nuevos[task_id]
        tarea = tasks.get(task_id)
        if tarea is None or tarea.start_date is None or tarea.end_date is None:
            return None
        return (tarea.start_date, tarea.end_date)

    for task_id in topological_order(edges):
        vigentes = _fechas_vigentes(task_id)
        if vigentes is None:
            continue
        if task_id == moved_task_id:
            nuevos[task_id] = (vigentes[0] + delta, vigentes[1] + delta)
            propuestas.append(
                CascadeMove(
                    task_id=task_id,
                    start_date=vigentes[0] + delta,
                    end_date=vigentes[1] + delta,
                )
            )
            continue
        # El requisito que termina mas tarde es el que manda: si la tarea
        # empieza antes de que el termine, con las fechas nuevas de este,
        # el vinculo se rompe o estaba roto y la tarea se mueve.
        terminos: list[date] = []
        for requisito in por_tarea.get(task_id, ()):
            if requisito in nuevos:
                terminos.append(nuevos[requisito][1])
            else:
                tarea = tasks.get(requisito)
                if tarea is not None and tarea.end_date is not None:
                    terminos.append(tarea.end_date)
        if not terminos:
            continue
        if vigentes[0] < max(terminos):
            nuevos[task_id] = (vigentes[0] + delta, vigentes[1] + delta)
            propuestas.append(
                CascadeMove(
                    task_id=task_id,
                    start_date=vigentes[0] + delta,
                    end_date=vigentes[1] + delta,
                )
            )
    return propuestas


def critical_path(
    tasks: Mapping[int, TaskDates], edges: Sequence[tuple[int, int, str]]
) -> list[int]:
    """Cadena mas larga del grafo de precedencia, medida en dias de calendario.

    La duracion de cada tarea va de start_date a end_date, inclusivas; una
    tarea sin fechas mide un dia. Devuelve los identificadores de la cadena
    mas larga, en orden de requisito a dependiente.

    Desempate determinista: a igual duracion total, manda la cadena que
    empieza por la tarea de menor identificador, y dentro de la cadena, el
    requisito que la continua es el de menor identificador entre los que
    dan igual duracion.
    """
    duracion: dict[int, int] = {}
    for task_id, tarea in tasks.items():
        if tarea.start_date is None or tarea.end_date is None:
            duracion[task_id] = 1
        else:
            duracion[task_id] = (tarea.end_date - tarea.start_date).days + 1

    depende_de: dict[int, list[int]] = {}
    ids: set[int] = set()
    for task_id, depends_on_id, tipo in edges:
        if tipo != PRECEDES:
            continue
        ids.add(task_id)
        ids.add(depends_on_id)
        depende_de.setdefault(task_id, []).append(depends_on_id)

    mejor: dict[int, tuple[int, tuple[int, ...]]] = {}

    def _mejor_cadena(task_id: int) -> tuple[int, tuple[int, ...]]:
        """La cadena mas larga que termina en task_id y su duracion total.

        La cadena va de requisito a dependiente, con task_id al final.
        """
        if task_id in mejor:
            return mejor[task_id]
        base = duracion.get(task_id, 1)
        total = base
        cadena: tuple[int, ...] = (task_id,)
        for requisito in sorted(set(depende_de.get(task_id, ()))):
            if requisito not in ids:
                continue
            sub_total, sub_cadena = _mejor_cadena(requisito)
            if base + sub_total > total:
                total = base + sub_total
                cadena = sub_cadena + (task_id,)
        mejor[task_id] = (total, cadena)
        return mejor[task_id]

    mejor_total = 0
    mejor_cadena: tuple[int, ...] = ()
    for task_id in sorted(ids):
        total, cadena = _mejor_cadena(task_id)
        if total > mejor_total:
            mejor_total = total
            mejor_cadena = cadena
    return list(mejor_cadena)
