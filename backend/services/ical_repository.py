"""Consulta del calendario iCal de un proyecto.

Mantiene separado el mapeo puro (backend/services/ical.py) del acceso a
datos, de modo que el formateador se pueda probar sin base de datos.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Project, Task, User
from .ical import IcalEvent, IcalPerson


async def load_project_calendar_events(
    session: AsyncSession, project: Project
) -> list[IcalEvent]:
    """Tareas del proyecto con fechas, como eventos iCal.

    Sin fechas no hay evento: una tarea sin fecha no se puede situar en un
    calendario, asi que no entra. La persona asignada a la tarea va como
    ATTENDEE y el responsable del proyecto como ORGANIZER.
    """
    tasks = (
        await session.execute(
            select(Task)
            .where(Task.project_id == project.id, Task.start_date.is_not(None))
            .order_by(Task.start_date, Task.id)
        )
    ).scalars().all()
    if not tasks:
        return []

    user_ids = {task.assigned_to for task in tasks if task.assigned_to is not None}
    if project.owner_id is not None:
        user_ids.add(project.owner_id)
    users = {
        user.id: user
        for user in (
            await session.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
    }

    organizer: IcalPerson | None = None
    owner = users.get(project.owner_id) if project.owner_id is not None else None
    if owner is not None:
        organizer = IcalPerson(name=owner.name, email=owner.email)

    events: list[IcalEvent] = []
    for task in tasks:
        assignee = users.get(task.assigned_to) if task.assigned_to is not None else None
        description = (
            f"Proyecto: {project.name}.\n"
            f"Persona: {assignee.name if assignee is not None else 'sin asignar'}.\n"
            f"Horas estimadas: {task.estimated_hours}"
        )
        attendees = (
            [IcalPerson(name=assignee.name, email=assignee.email)]
            if assignee is not None
            else []
        )
        events.append(
            IcalEvent(
                uid=f"task-{task.id}@coreplanner",
                title=task.title,
                description=description,
                start_date=task.start_date,
                end_date=task.end_date if task.end_date is not None else task.start_date,
                attendees=attendees,
                organizer=organizer,
            )
        )
    return events
