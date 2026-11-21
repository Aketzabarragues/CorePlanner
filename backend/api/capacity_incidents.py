"""Endpoints de incidentes de capacidad.

La lista sale filtrada por el ambito de quien entra y la resolucion es de
quien puede resolver: el jefe del departamento de la persona o el gerente.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..models import CapacityIncident, User
from ..schemas import IncidentOut, ResolveIncident
from ..security import CurrentUser, SessionDep
from ..services.capacity_incidents import (
    can_resolve,
    list_incidents,
    resolve_incident,
)

router = APIRouter(prefix="/capacity-incidents", tags=["capacity-incidents"])


@router.get("", response_model=list[IncidentOut])
async def incidents(
    session: SessionDep,
    user: CurrentUser,
) -> list[IncidentOut]:
    """Incidentes que tocan a la persona que entra, con la carga actual."""
    return await list_incidents(session, user)


@router.post("/{incident_id}/resolve", response_model=IncidentOut)
async def resolve(
    incident_id: int,
    payload: ResolveIncident,
    session: SessionDep,
    user: CurrentUser,
) -> IncidentOut:
    """Aprueba o rechaza un incidente pendiente."""
    incident = await session.get(CapacityIncident, incident_id)
    person = None if incident is None else await session.get(User, incident.user_id)
    if incident is None or person is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incidente no encontrado"
        )
    if not can_resolve(user, person):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el jefe del departamento o el gerente pueden resolver",
        )
    incident = await resolve_incident(
        session, incident, payload.decision, payload.note, user
    )
    # El incidente resuelto sigue tocando a la persona que entra: se le
    # responde con lo que ve su ambito, que es el resuelto.
    visibles = await list_incidents(session, user)
    for out in visibles:
        if out.id == incident.id:
            return out
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail="Incidente no encontrado"
    )
