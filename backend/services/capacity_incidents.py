"""Incidentes de capacidad: apertura por carga y resolucion.

El umbral de aprobacion no es una alerta, es una aprobacion obligatoria.
Cuando una mutacion de tarea deja a una persona por encima del umbral que
exige aprobacion, se abre un incidente en la misma transaccion que el
cambio: si la mutacion falla, no hay incidente. El incidente no se cierra
solo, ni se reabre: es el hecho de que hubo que aprobar, no un estado que
se recalcula, de modo que quien lo resuelve ve la carga actual y decide.

La carga y la capacidad de cada celda salen del motor de capacidad, con el
mismo alcance que el informe: la carga provisional va aparte, porque no
esta firmada.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    CapacityIncident,
    CapacityPolicy,
    CompanyRole,
    Project,
    Task,
    User,
)
from ..schemas import IncidentOut
from .capacity import compute_task_week_units
from .capacity_policy import (
    VERDICT_APPROVAL,
    PolicyCell,
    evaluate_policies,
)
from .capacity_repository import (
    load_holidays,
    load_person_capacities,
    load_policies,
)
from .dates import as_utc
from .schedule import capacity_units_for_week, week_start_from_key
from .units import from_units

STATE_PENDIENTE = "pendiente"
STATE_APROBADA = "aprobada"
STATE_RECHAZADA = "rechazada"
"""Estados de un incidente: abierto, resuelto aprobando o resuelto
rechazando."""


async def _carga_y_provisional(
    session: AsyncSession, user_ids: Sequence[int], week: str
) -> tuple[int, int]:
    """Carga confirmada y provisional de unas personas en una semana.

    Misma carga que el informe, con el mismo reparto por dias laborables y
    por dias no laborables de cada persona: solo las tareas que solapan la
    semana, y la provisional aparte porque no esta firmada.
    """
    monday = week_start_from_key(week)
    sunday = monday + timedelta(days=6)
    tasks = (
        (
            await session.execute(
                select(Task).where(
                    Task.assigned_to.in_(list(user_ids)),
                    Task.start_date.is_not(None),
                    Task.end_date.is_not(None),
                    Task.start_date <= sunday,
                    Task.end_date >= monday,
                )
            )
        )
        .scalars()
        .all()
    )
    if not tasks:
        return 0, 0

    provisional_ids = set(
        (
            await session.execute(
                select(Project.id).where(
                    Project.id.in_({task.project_id for task in tasks}),
                    Project.is_provisional.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )

    holidays_by_scope, _ = await load_holidays(session)
    users = (
        (
            await session.execute(select(User).where(User.id.in_(list(user_ids))))
        )
        .scalars()
        .all()
    )
    people = {
        person.user_id: person
        for person in await load_person_capacities(
            session, users, holidays_by_scope=holidays_by_scope
        )
    }

    confirmed = 0
    provisional = 0
    for task in tasks:
        person = people.get(task.assigned_to)
        week_units = compute_task_week_units(
            task.start_date,
            task.end_date,
            task.estimated_hours,
            person.holidays if person is not None else {},
        ).get(week, 0)
        confirmed += week_units
        if task.project_id in provisional_ids:
            provisional += week_units
    return confirmed, provisional


async def abrir_incidentes_por_carga(
    session: AsyncSession,
    user_ids: Iterable[int],
    semanas: Iterable[str],
) -> list[CapacityIncident]:
    """Abre los incidentes de capacidad que la carga actual exige.

    Para cada persona y semana se compara la carga contra la capacidad con
    las politicas activas de la empresa: si el veredicto es de aprobacion y
    no hay ya ningun incidente -abierto o resuelto- para (politica,
    persona, semana), se abre. Es idempotente: una segunda llamada con la
    misma carga no duplica. No hace commit: el incidente se confirma o se
    pierde con la mutacion que lo ha llamado.
    """
    ids = [int(user_id) for user_id in user_ids]
    semanas = sorted(set(semanas))
    if not ids or not semanas:
        return []

    policies = await load_policies(session)
    if not policies:
        return []

    users = (
        (await session.execute(select(User).where(User.id.in_(ids))))
        .scalars()
        .all()
    )
    if not users:
        return []

    holidays_by_scope, _ = await load_holidays(session)
    people = await load_person_capacities(
        session, users, holidays_by_scope=holidays_by_scope
    )
    abiertos: list[CapacityIncident] = []
    for person in people:
        for week in semanas:
            confirmed, provisional = await _carga_y_provisional(
                session, [person.user_id], week
            )
            units = confirmed - provisional
            if units <= 0:
                continue
            capacity = capacity_units_for_week(
                person.schedules,
                person.weekly_base_hours,
                week,
                person.holidays,
            )
            evaluation = evaluate_policies(
                policies,
                [
                    PolicyCell(
                        user_id=person.user_id,
                        department_id=person.department_id,
                        week=week,
                        units=units,
                        capacity_units=capacity,
                    )
                ],
            )
            clave = (person.user_id, week)
            policy = evaluation.applied.get(clave)
            # Solo el veredicto de aprobacion abre incidente: la politica
            # aplicada con veredicto de aviso u ok no obliga a nada.
            if policy is None or evaluation.verdicts.get(clave) != VERDICT_APPROVAL:
                continue
            # Si ya hay un incidente para la misma politica, persona y semana
            # -abierto o resuelto- no se abre otro: el resuelto no se
            # reabre. El indice unico parcial respalda el caso abierto.
            ya_abierto = (
                await session.execute(
                    select(CapacityIncident.id)
                    .where(
                        CapacityIncident.policy_id == policy.id,
                        CapacityIncident.user_id == person.user_id,
                        CapacityIncident.week == week,
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if ya_abierto is not None:
                continue
            incident = CapacityIncident(
                policy_id=policy.id,
                user_id=person.user_id,
                week=week,
                state=STATE_PENDIENTE,
            )
            session.add(incident)
            await session.flush()
            abiertos.append(incident)
    return abiertos


async def list_incidents(session: AsyncSession, viewer: User) -> list[IncidentOut]:
    """Incidentes que le tocan a quien entra, con la carga actual.

    El gerente ve todos; el jefe de departamento, los de su departamento;
    el tecnico, los suyos. La carga y la capacidad que se muestran son las
    actuales, no las del momento en que se abrio: quien resuelve decide
    viendo el estado presente.
    """
    stmt = select(CapacityIncident)
    if not (
        viewer.is_global_admin
        or viewer.company_role == CompanyRole.GERENTE.value
    ):
        if viewer.company_role == CompanyRole.JEFE_DEPARTAMENTO.value:
            if viewer.department_id is None:
                stmt = stmt.where(CapacityIncident.id.is_(None))
            else:
                stmt = stmt.where(
                    CapacityIncident.user_id.in_(
                        select(User.id).where(
                            User.department_id == viewer.department_id
                        )
                    )
                )
        else:
            stmt = stmt.where(CapacityIncident.user_id == viewer.id)

    incidents = (
        (
            await session.execute(stmt.order_by(CapacityIncident.id))
        )
        .scalars()
        .all()
    )
    if not incidents:
        return []

    users = {
        user.id: user
        for user in (
            (
                await session.execute(
                    select(User).where(
                        User.id.in_({incident.user_id for incident in incidents})
                    )
                )
            )
            .scalars()
            .all()
        )
    }
    policies = {
        policy.id: policy
        for policy in (
            (
                await session.execute(
                    select(CapacityPolicy).where(
                        CapacityPolicy.id.in_(
                            {incident.policy_id for incident in incidents}
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
    }
    resolver_ids = {
        incident.resolved_by_id
        for incident in incidents
        if incident.resolved_by_id is not None
    }
    resolvers = {
        user.id: user
        for user in (
            (
                await session.execute(
                    select(User).where(User.id.in_(resolver_ids))
                )
            )
            .scalars()
            .all()
        )
    }

    holidays_by_scope, _ = await load_holidays(session)
    people = {
        person.user_id: person
        for person in await load_person_capacities(
            session, list(users.values()), holidays_by_scope=holidays_by_scope
        )
    }

    outs: list[IncidentOut] = []
    for incident in incidents:
        user = users.get(incident.user_id)
        person = people.get(incident.user_id)
        policy = policies.get(incident.policy_id)
        if user is None or policy is None:
            continue
        confirmed, provisional = await _carga_y_provisional(
            session, [incident.user_id], incident.week
        )
        units = confirmed - provisional
        capacity = (
            capacity_units_for_week(
                person.schedules,
                person.weekly_base_hours,
                incident.week,
                person.holidays,
            )
            if person is not None
            else None
        )
        resolver = (
            resolvers.get(incident.resolved_by_id)
            if incident.resolved_by_id is not None
            else None
        )
        outs.append(
            IncidentOut(
                id=incident.id,
                policy_id=incident.policy_id,
                user_id=incident.user_id,
                user_name=user.name,
                department_id=user.department_id,
                department_name=(
                    person.department_name if person is not None else None
                ),
                week=incident.week,
                state=incident.state,
                hours=from_units(units),
                capacity=from_units(capacity) if capacity is not None else None,
                warn_percent=policy.warn_percent,
                requires_approval_percent=policy.requires_approval_percent,
                note=incident.note,
                created_at=as_utc(incident.created_at),
                resolved_at=(
                    as_utc(incident.resolved_at)
                    if incident.resolved_at is not None
                    else None
                ),
                resolved_by=resolver.name if resolver is not None else None,
            )
        )
    return outs


def can_resolve(viewer: User, person: User) -> bool:
    """Puede resolver el jefe del departamento de la persona o el gerente."""
    if viewer.is_global_admin or viewer.company_role == CompanyRole.GERENTE.value:
        return True
    return (
        viewer.company_role == CompanyRole.JEFE_DEPARTAMENTO.value
        and viewer.department_id is not None
        and person.department_id == viewer.department_id
    )


async def resolve_incident(
    session: AsyncSession,
    incident: CapacityIncident,
    decision: str,
    note: str | None,
    actor: User,
) -> CapacityIncident:
    """Aprueba o rechaza un incidente pendiente.

    Deja estado, nota, quien resolvio y cuando. Un incidente que ya no esta
    pendiente no se resuelve de nuevo: es un 422, no un cambio de estado.
    """
    if decision not in (STATE_APROBADA, STATE_RECHAZADA):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La decision tiene que ser 'aprobada' o 'rechazada'",
        )
    if incident.state != STATE_PENDIENTE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El incidente ya estaba resuelto",
        )
    incident.state = decision
    incident.note = note
    incident.resolved_at = func.now()
    incident.resolved_by_id = actor.id
    await session.flush()
    await session.commit()
    return incident
