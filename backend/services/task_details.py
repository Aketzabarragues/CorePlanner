"""Comentarios y lista de comprobacion de una tarea.

Los comentarios no se editan ni se borran: son lo que se dijo en su momento, y
la bitacora ya guarda el historial de lo que fue. La lista de comprobacion es
plana: cada punto es una linea de la tarea, no una tarea con sus propias
dependencias.

Todo lo que pasa aqui deja rastro en la bitacora, igual que los cambios de la
tarea.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Task, TaskChecklistItem, TaskComment, User
from ..schemas import ChecklistItemUpdate
from .activity import log_activity
from .dates import as_utc

PREVIEW_LENGTH = 160
"""Longitud maxima del texto que se lleva la bitacora de un comentario."""


def _preview(text: str) -> str:
    """El texto del comentario, en una linea y recortado para la bitacora."""
    limpio = " ".join(text.split())
    if len(limpio) <= PREVIEW_LENGTH:
        return limpio
    return limpio[: PREVIEW_LENGTH - 3] + "..."


async def list_comments(session: AsyncSession, task_id: int) -> list[dict]:
    """Comentarios de la tarea, del mas antiguo al mas reciente.

    Los autores se resuelven en una consulta, no una por comentario.
    """
    result = await session.execute(
        select(TaskComment)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at, TaskComment.id)
    )
    comments = list(result.scalars().all())
    if not comments:
        return []

    authors = {
        row.id: row.name
        for row in (
            await session.execute(
                select(User).where(User.id.in_({c.author_id for c in comments}))
            )
        ).scalars()
    }

    return [
        {
            "id": comment.id,
            "task_id": comment.task_id,
            "author_id": comment.author_id,
            "author_name": authors.get(comment.author_id, "Alguien"),
            "body": comment.body,
            "created_at": as_utc(comment.created_at),
        }
        for comment in comments
    ]


async def add_comment(
    session: AsyncSession, task: Task, actor: User, body: str
) -> TaskComment:
    """Pone un comentario en la tarea y lo anota en la bitacora."""
    comment = TaskComment(task_id=task.id, author_id=actor.id, body=body.strip())
    session.add(comment)
    await session.flush()
    await log_activity(
        session,
        actor,
        "task.commented",
        "task",
        task.id,
        task.project_id,
        {"title": task.title, "body": _preview(comment.body)},
    )
    await session.commit()
    await session.refresh(comment)
    return comment


async def list_checklist(session: AsyncSession, task_id: int) -> list[dict]:
    """Puntos de la lista de comprobacion, en su orden."""
    result = await session.execute(
        select(TaskChecklistItem)
        .where(TaskChecklistItem.task_id == task_id)
        .order_by(TaskChecklistItem.position, TaskChecklistItem.id)
    )
    return [
        {
            "id": item.id,
            "task_id": item.task_id,
            "label": item.label,
            "done": item.done,
            "position": item.position,
            "created_at": as_utc(item.created_at),
        }
        for item in result.scalars().all()
    ]


async def add_checklist_item(
    session: AsyncSession, task: Task, actor: User, label: str
) -> TaskChecklistItem:
    """Anade un punto al final de la lista y lo anota en la bitacora."""
    siguiente = await session.scalar(
        select(func.max(TaskChecklistItem.position)).where(
            TaskChecklistItem.task_id == task.id
        )
    )
    item = TaskChecklistItem(
        task_id=task.id,
        label=label.strip(),
        position=int(siguiente or 0) + 1,
    )
    session.add(item)
    await session.flush()
    await log_activity(
        session,
        actor,
        "task.checklist_item_added",
        "task",
        task.id,
        task.project_id,
        {"title": task.title, "label": item.label},
    )
    await session.commit()
    await session.refresh(item)
    return item


async def update_checklist_item(
    session: AsyncSession,
    task: Task,
    item: TaskChecklistItem,
    actor: User,
    changes: ChecklistItemUpdate,
) -> TaskChecklistItem:
    """Cambia el texto o el estado de un punto y lo anota en la bitacora.

    Marcar y desmarcar son la misma accion con distinto resultado: el payload
    lleva el estado al que se ha dejado el punto.
    """
    changed = changes.changed_fields()

    if "label" in changed and changes.label is not None:
        antes = item.label
        item.label = changes.label.strip()
        if item.label != antes:
            await log_activity(
                session,
                actor,
                "task.checklist_item_updated",
                "task",
                task.id,
                task.project_id,
                {"title": task.title, "label": item.label, "from": antes},
            )

    if "done" in changed and changes.done is not None and changes.done != item.done:
        item.done = changes.done
        await log_activity(
            session,
            actor,
            "task.checklist_item_done",
            "task",
            task.id,
            task.project_id,
            {"title": task.title, "label": item.label, "done": item.done},
        )

    await session.commit()
    await session.refresh(item)
    return item


async def remove_checklist_item(
    session: AsyncSession, task: Task, item: TaskChecklistItem, actor: User
) -> None:
    """Quita un punto de la lista y lo anota en la bitacora."""
    await log_activity(
        session,
        actor,
        "task.checklist_item_removed",
        "task",
        task.id,
        task.project_id,
        {"title": task.title, "label": item.label},
    )
    await session.delete(item)
    await session.commit()
