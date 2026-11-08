"""Bitacora de cambios: lo que se anade y lo que se lee.

La bitacora es de solo anadir: cada fila dice lo que paso, con quien lo hizo y
sobre que. No se edita ni se borra, de modo que cuenta como registro de lo que
ocurrio en el proyecto.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ActivityLog, Project, User

PAGE_SIZE = 50
"""Entradas que trae una pagina de la bitacora."""

MAX_PAGE_SIZE = 200
"""Tope de entradas por pagina, para que nadie pida la tabla entera."""


async def log_activity(
    session: AsyncSession,
    actor: User,
    action: str,
    entity_type: str,
    entity_id: int,
    project_id: int,
    payload: dict | None = None,
) -> ActivityLog:
    """Anota una accion en la bitacora del proyecto.

    La fila se anade a la sesion y se confirma con la propia mutacion: asi la
    accion y el cambio que la ha causado se guardan o se pierden juntos.
    """
    entry = ActivityLog(
        actor_id=actor.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        project_id=project_id,
        payload=payload or {},
    )
    session.add(entry)
    await session.flush()
    return entry


async def count_activity(session: AsyncSession, project_ids: Sequence[int]) -> int:
    """Cuantas entradas tienen los proyectos indicados."""
    if not project_ids:
        return 0
    total = await session.scalar(
        select(func.count())
        .select_from(ActivityLog)
        .where(ActivityLog.project_id.in_(set(project_ids)))
    )
    return int(total or 0)


async def list_activity(
    session: AsyncSession,
    project_ids: Sequence[int],
    limit: int = PAGE_SIZE,
    offset: int = 0,
) -> list[ActivityLog]:
    """Entradas de la bitacora de los proyectos indicados, de la mas nueva a la mas vieja.

    El orden es por fecha descendente y, a igualdad de fecha, por identificador
    descendente: dos acciones del mismo instante salen en el mismo orden en que
    se registraron.
    """
    if not project_ids:
        return []
    result = await session.execute(
        select(ActivityLog)
        .where(ActivityLog.project_id.in_(set(project_ids)))
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def activity_items(
    session: AsyncSession, entries: Sequence[ActivityLog]
) -> list[dict]:
    """Entradas de la bitacora con el nombre de quien actua y del proyecto.

    Los nombres se resuelven en dos consultas, no una por entrada: la vista
    lista hasta una pagina entera de acciones.
    """
    if not entries:
        return []

    actor_ids = {entry.actor_id for entry in entries}
    project_ids = {entry.project_id for entry in entries}

    actors = {
        row.id: row.name
        for row in (await session.execute(select(User).where(User.id.in_(actor_ids)))).scalars()
    }
    projects = {
        row.id: row.name
        for row in (
            await session.execute(select(Project).where(Project.id.in_(project_ids)))
        ).scalars()
    }

    return [
        {
            "id": entry.id,
            "actor_id": entry.actor_id,
            "actor_name": actors.get(entry.actor_id, "Alguien"),
            "action": entry.action,
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "project_id": entry.project_id,
            "project_name": projects.get(entry.project_id, ""),
            "payload": entry.payload or {},
            "created_at": _as_utc(entry.created_at),
        }
        for entry in entries
    ]


def _as_utc(value: datetime) -> datetime:
    """La fecha con zona, en UTC.

    SQLite guarda las fechas sin zona y las devuelve naive. Anadirla aqui
    evita que el navegador las lea como hora local y calculates mal el tiempo
    transcurrido.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
