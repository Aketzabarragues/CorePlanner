"""Estados de tarea configurables por proyecto.

Cada proyecto tiene sus propios estados: el tablero se dibuja con ellos, el
Gantt usa su avance y el resumen cuenta como completadas las tareas de un
estado con avance al cien. La clave es inmutable porque las tareas la
referencian; solo se editan la etiqueta, el color y el avance.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import DEFAULT_TASK_STATUSES, ProjectTaskStatus, Task
from ..schemas import TaskStatusCreate, TaskStatusUpdate

__all__ = [
    "TaskStatusView",
    "default_progress",
    "first_status_key",
    "generate_key",
    "list_statuses",
    "progress_by_project",
    "statuses_by_project",
    "status_keys",
    "status_usage",
    "create_status",
    "update_status",
    "reorder_statuses",
    "delete_status",
]


@dataclass(frozen=True, slots=True)
class TaskStatusView:
    """Estado de un proyecto, con el numero de tareas que lo usan."""

    id: int
    project_id: int
    key: str
    label: str
    color: str | None
    progress: int
    order_index: int
    task_count: int = 0


def generate_key(label: str, existing: Sequence[str] = ()) -> str:
    """Clave a partir de la etiqueta: ASCII en minusculas, separada por guion
    bajo, de como mucho 32 caracteres.

    La clave es inmutable: se genera una vez, aqui. Si ya existe en el
    proyecto, se prefija un contador hasta encontrar una libre.
    """
    sin_acentos = unicodedata.normalize("NFKD", label)
    ascii_only = sin_acentos.encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-z0-9]+", "_", ascii_only.lower()).strip("_")
    base = base[:32].rstrip("_") or "estado"
    clave = base
    sufijo = 2
    while clave in existing:
        sufijo_texto = str(sufijo)
        clave = f"{base[: 32 - len(sufijo_texto) - 1]}_{sufijo_texto}"
        sufijo += 1
    return clave


def default_progress() -> dict[str, int]:
    """Avance por clave de los estados por defecto, para las vistas que no
    cargan los proyectos."""
    return {estado.key: estado.progress for estado in DEFAULT_TASK_STATUSES}


async def status_keys(session: AsyncSession, project_id: int) -> frozenset[str]:
    """Claves de los estados del proyecto, para validar sin traer el resto."""
    filas = (
        await session.execute(
            select(ProjectTaskStatus.key).where(
                ProjectTaskStatus.project_id == project_id
            )
        )
    ).scalars().all()
    return frozenset(filas)


async def first_status_key(session: AsyncSession, project_id: int) -> str:
    """Clave del primer estado por orden: aqui nace cada tarea nueva."""
    clave = (
        await session.execute(
            select(ProjectTaskStatus.key)
            .where(ProjectTaskStatus.project_id == project_id)
            .order_by(ProjectTaskStatus.order_index, ProjectTaskStatus.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if clave is None:
        # Invariante: todo proyecto tiene al menos un estado. Si falta, es
        # una base sin migrar o una insercion manual sin la siembra.
        raise RuntimeError(
            f"El proyecto {project_id} no tiene estados de tarea: la base "
            "necesita la migracion (backend/migrations.py) o la siembra "
            "del evento de alta de proyecto"
        )
    return clave


async def progress_by_project(
    session: AsyncSession, project_ids: Sequence[int]
) -> dict[int, dict[str, int]]:
    """Avance de cada estado de cada proyecto, en una consulta.

    Lo comparten el Gantt y el resumen: el avance de una barra o de un
    conteo depende del estado de SU proyecto, no de una tabla global.
    """
    if not project_ids:
        return {}
    filas = (
        await session.execute(
            select(
                ProjectTaskStatus.project_id,
                ProjectTaskStatus.key,
                ProjectTaskStatus.progress,
            ).where(ProjectTaskStatus.project_id.in_(list(project_ids)))
        )
    ).all()
    grouped: dict[int, dict[str, int]] = {}
    for project_id, clave, progress in filas:
        grouped.setdefault(project_id, {})[clave] = progress
    return grouped


async def status_usage(session: AsyncSession, project_id: int) -> dict[int, int]:
    """Tareas que usan cada estado del proyecto, por identificador del estado.

    Mismo patron que `skill_usage`: quien borra un estado necesita ver de
    antemano cuantas tareas lo usan.
    """
    counts = (await _usage_by_projects(session, {project_id})).get(project_id, {})
    return dict(counts)


async def _usage_by_projects(
    session: AsyncSession, project_ids: set[int]
) -> dict[int, dict[int, int]]:
    """Uso de los estados por proyecto: identificador del estado -> tareas.

    Las tareas se agrupan por (proyecto, clave) y se emparejan con los
    estados por los dos, de modo que ninguna tarea de un proyecto cuente
    para un estado de otro.
    """
    if not project_ids:
        return {}
    pares = (
        await session.execute(
            select(Task.project_id, Task.status, func.count(Task.id))
            .where(Task.project_id.in_(list(project_ids)))
            .group_by(Task.project_id, Task.status)
        )
    ).all()
    estados = (
        await session.execute(
            select(
                ProjectTaskStatus.id,
                ProjectTaskStatus.project_id,
                ProjectTaskStatus.key,
            ).where(ProjectTaskStatus.project_id.in_(list(project_ids)))
        )
    ).all()
    por_par = {
        (project_id, clave): count for project_id, clave, count in pares
    }
    grouped: dict[int, dict[int, int]] = {}
    for estado_id, project_id, clave in estados:
        grouped.setdefault(project_id, {})[estado_id] = por_par.get(
            (project_id, clave), 0
        )
    return grouped


def _view(
    estado: ProjectTaskStatus, task_count: int
) -> TaskStatusView:
    return TaskStatusView(
        id=estado.id,
        project_id=estado.project_id,
        key=estado.key,
        label=estado.label,
        color=estado.color,
        progress=estado.progress,
        order_index=estado.order_index,
        task_count=task_count,
    )


async def list_statuses(session: AsyncSession, project_id: int) -> list[TaskStatusView]:
    """Estados del proyecto, en el orden del tablero, con sus contadores."""
    filas = (
        await session.execute(
            select(ProjectTaskStatus)
            .where(ProjectTaskStatus.project_id == project_id)
            .order_by(ProjectTaskStatus.order_index, ProjectTaskStatus.id)
        )
    ).scalars().all()
    counts = await status_usage(session, project_id)
    return [_view(estado, counts.get(estado.id, 0)) for estado in filas]


async def statuses_by_project(
    session: AsyncSession, project_ids: Sequence[int]
) -> dict[int, list[TaskStatusView]]:
    """Estados de varios proyectos, para las vistas multiproyecto."""
    if not project_ids:
        return {}
    filas = (
        await session.execute(
            select(ProjectTaskStatus)
            .where(ProjectTaskStatus.project_id.in_(list(project_ids)))
            .order_by(
                ProjectTaskStatus.project_id,
                ProjectTaskStatus.order_index,
                ProjectTaskStatus.id,
            )
        )
    ).scalars().all()
    counts = await _usage_by_projects(session, set(project_ids))
    grouped: dict[int, list[TaskStatusView]] = {}
    for estado in filas:
        grouped.setdefault(estado.project_id, []).append(
            _view(estado, counts.get(estado.project_id, {}).get(estado.id, 0))
        )
    return grouped


async def create_status(
    session: AsyncSession,
    project_id: int,
    payload: TaskStatusCreate,
) -> ProjectTaskStatus:
    """Anade un estado al proyecto, con la clave generada y al final de la
    lista de columnas."""
    existentes = (
        await session.execute(
            select(ProjectTaskStatus.key).where(
                ProjectTaskStatus.project_id == project_id
            )
        )
    ).scalars().all()
    ultimo = (
        await session.execute(
            select(func.max(ProjectTaskStatus.order_index)).where(
                ProjectTaskStatus.project_id == project_id
            )
        )
    ).scalar_one()
    estado = ProjectTaskStatus(
        project_id=project_id,
        key=generate_key(payload.label, existentes),
        label=payload.label,
        color=payload.color,
        progress=payload.progress,
        order_index=(ultimo or 0) + 1,
    )
    session.add(estado)
    await session.commit()
    await session.refresh(estado)
    return estado


async def update_status(
    session: AsyncSession,
    project_id: int,
    status_id: int,
    payload: TaskStatusUpdate,
) -> ProjectTaskStatus:
    """Cambia la etiqueta, el color o el avance. La clave no se toca."""
    estado = await session.get(ProjectTaskStatus, status_id)
    if estado is None or estado.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estado de tarea no encontrado",
        )
    changed = payload.changed_fields()
    if "label" in changed and payload.label is not None:
        estado.label = payload.label
    if "color" in changed:
        # El color se puede quitar: enviarlo con null lo deja sin color.
        estado.color = payload.color
    if "progress" in changed and payload.progress is not None:
        estado.progress = payload.progress
    await session.commit()
    await session.refresh(estado)
    return estado


async def reorder_statuses(
    session: AsyncSession, project_id: int, ids: Sequence[int]
) -> list[ProjectTaskStatus]:
    """Reordena los estados del proyecto: la lista de identificadores es el
    orden nuevo, de la primera columna a la ultima."""
    filas = list(
        (
            await session.execute(
                select(ProjectTaskStatus).where(
                    ProjectTaskStatus.project_id == project_id
                )
            )
        )
        .scalars()
        .all()
    )
    por_id = {estado.id: estado for estado in filas}
    if set(ids) != set(por_id) or len(ids) != len(por_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La lista no contiene exactamente los estados del proyecto",
        )
    for indice, estado_id in enumerate(ids):
        por_id[estado_id].order_index = indice
    await session.commit()
    return filas


async def delete_status(
    session: AsyncSession,
    project_id: int,
    status_id: int,
    reassign_to: str | None = None,
) -> None:
    """Borra un estado y, si tiene tareas, las mueve al estado indicado.

    El ultimo estado del proyecto no se puede borrar. Con reassign_to, las
    tareas pasan a ese estado y la columna destino queda recompuesta
    (0..n-1, sin huecos ni repeticiones), en la misma transaccion que el
    borrado.
    """
    estado = await session.get(ProjectTaskStatus, status_id)
    if estado is None or estado.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Estado de tarea no encontrado",
        )

    total = (
        await session.execute(
            select(func.count(ProjectTaskStatus.id)).where(
                ProjectTaskStatus.project_id == project_id
            )
        )
    ).scalar_one()
    if total <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El proyecto necesita al menos un estado",
        )

    destino = None
    if reassign_to is not None:
        if reassign_to == estado.key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="El estado de reasignacion no puede ser el que se borra",
            )
        destino = (
            await session.execute(
                select(ProjectTaskStatus).where(
                    ProjectTaskStatus.project_id == project_id,
                    ProjectTaskStatus.key == reassign_to,
                )
            )
        ).scalar_one_or_none()
        if destino is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="El estado de reasignacion no existe en el proyecto",
            )

    usadas = (
        await session.execute(
            select(func.count(Task.id)).where(
                Task.project_id == project_id,
                Task.status == estado.key,
            )
        )
    ).scalar_one()
    if usadas and destino is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El estado tiene {usadas} tareas: indica a qué estado se reasignan",
        )

    if destino is not None:
        await _reasignar_tareas(session, estado, destino)
    await session.delete(estado)
    await session.commit()


def _orden_columna():
    """Orden actual de una columna del tablero: las que tienen posicion en su
    orden, las que no al final, y el desempate (start_date, id)."""
    return (
        case((Task.position.is_(None), 1), else_=0),
        Task.position,
        Task.start_date,
        Task.id,
    )


async def _reasignar_tareas(
    session: AsyncSession, origen: ProjectTaskStatus, destino: ProjectTaskStatus
) -> None:
    """Mueve las tareas del origen al destino y recompone la columna destino.

    La recompuesta sigue la regla del tablero: la columna queda con posiciones
    0..n-1 y el orden relativo no cambia: las que ya estaban en destino
    primero, en su orden actual, y las que llegan detras.
    """
    filas = list(
        (
            await session.execute(
                select(Task)
                .where(
                    Task.project_id == destino.project_id,
                    Task.status.in_((origen.key, destino.key)),
                )
                .order_by(*_orden_columna())
            )
        )
        .scalars()
        .all()
    )
    existentes = [tarea for tarea in filas if tarea.status == destino.key]
    llegadas = [tarea for tarea in filas if tarea.status == origen.key]
    for indice, tarea in enumerate(existentes + llegadas):
        tarea.status = destino.key
        tarea.position = indice
    await session.flush()
