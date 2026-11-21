"""Evaluacion pura de politicas de capacidad contra las celdas del informe.

Una politica fija dos umbrales en porcentaje sobre la capacidad de la persona
en esa semana: al alcanzar el de aviso la celda sale en `aviso`, y al
alcanzar el de aprobacion, en `aprobacion`. Sin politica aplicable no hay
veredicto: la celda se comporta como antes de las politicas.

El ambito es una persona o un departamento, nunca un proyecto. La politica de
la persona manda sobre la del departamento; si hay varias del mismo ambito,
gana la mas reciente por `created_at` (empate: la de menor `id`). La
comparacion es de enteros: `units * 100 >= capacity_units * percent`, sin
float ni Decimal de mas. Sin capacidad conocida (None o <= 0) no hay limite
contra el que comparar y, por tanto, no hay veredicto.

Todo es puro: ni base de datos ni estado global; la semana llega por
parametro en cada celda.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

__all__ = [
    "PolicyLike",
    "PolicyCell",
    "PolicyEvaluation",
    "evaluate_policies",
]

VERDICT_OK = "ok"
VERDICT_WARN = "aviso"
VERDICT_APPROVAL = "aprobacion"
"""Veredictos de una celda frente a su politica: dentro del limite, por encima
del umbral de aviso y por encima del umbral de aprobacion, en ese orden de
gravedad."""


class PolicyLike(Protocol):
    """Datos de politica que la evaluacion necesita."""

    id: int
    scope_type: str
    scope_id: int
    warn_percent: int
    requires_approval_percent: int
    active: bool
    created_at: datetime


@dataclass(frozen=True, slots=True)
class PolicyCell:
    """Celda del informe vista por las politicas.

    Lleva solo lo que la evaluacion necesita: la persona, su departamento,
    la semana ISO, la carga firmada y la capacidad, ambas en centimas.
    `capacity_units` es None cuando la persona no tiene capacidad definida.
    """

    user_id: int
    department_id: int | None
    week: str
    units: int
    capacity_units: int | None


@dataclass(frozen=True, slots=True)
class PolicyEvaluation:
    """Resultado de aplicar las politicas a las celdas.

    `verdicts` y `applied` van juntos, con la misma clave `(user_id, week)`:
    el veredicto y la politica que lo dio, o None cuando no hay veredicto.
    """

    verdicts: dict[tuple[int, str], str]
    applied: dict[tuple[int, str], PolicyLike | None]


def _pick_policy(
    policies: Sequence[PolicyLike], scope_type: str, scope_id: int
) -> PolicyLike | None:
    """Politica activa de ese ambito, o None si no la hay.

    Entre varias del mismo ambito gana la mas reciente por `created_at`; si
    empata, la de menor `id`.
    """
    candidates = [
        policy
        for policy in policies
        if policy.active
        and policy.scope_type == scope_type
        and policy.scope_id == scope_id
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda policy: (policy.created_at, -policy.id))


def _verdict(units: int, capacity_units: int, policy: PolicyLike) -> str:
    """Veredicto de una celda frente a su politica, comparando en enteros."""
    if units * 100 >= capacity_units * policy.requires_approval_percent:
        return VERDICT_APPROVAL
    if units * 100 >= capacity_units * policy.warn_percent:
        return VERDICT_WARN
    return VERDICT_OK


def evaluate_policies(
    policies: Iterable[PolicyLike], cells: Iterable[PolicyCell]
) -> PolicyEvaluation:
    """Evalua cada celda contra la politica que le aplique.

    Devuelve un `PolicyEvaluation` con el veredicto de cada celda y la
    politica aplicada. Sin politica aplicable, o sin capacidad conocida, la
    celda no entra en `verdicts` y su politica aplicada es None.
    """
    verdicts: dict[tuple[int, str], str] = {}
    applied: dict[tuple[int, str], PolicyLike | None] = {}
    for cell in cells:
        key = (cell.user_id, cell.week)
        if cell.capacity_units is None or cell.capacity_units <= 0:
            applied[key] = None
            continue
        policy = _pick_policy(policies, "persona", cell.user_id)
        if policy is None and cell.department_id is not None:
            policy = _pick_policy(policies, "departamento", cell.department_id)
        if policy is None:
            applied[key] = None
            continue
        verdicts[key] = _verdict(cell.units, cell.capacity_units, policy)
        applied[key] = policy
    return PolicyEvaluation(verdicts=verdicts, applied=applied)
