"""Endpoints de politicas de capacidad de la empresa."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status

from ..schemas import CapacityPolicyCreate, CapacityPolicyOut, CapacityPolicyUpdate
from ..security import SessionDep, require_manager
from ..services.configuration import (
    create_capacity_policy,
    delete_capacity_policy,
    list_capacity_policies,
    update_capacity_policy,
)

router = APIRouter(prefix="/capacity-policies", tags=["capacity-policies"])


@router.get("", response_model=list[CapacityPolicyOut])
async def list_policies(
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> list[CapacityPolicyOut]:
    """Todas las politicas de capacidad de la empresa."""
    policies = await list_capacity_policies(session)
    return [CapacityPolicyOut.model_validate(policy) for policy in policies]


@router.post(
    "", response_model=CapacityPolicyOut, status_code=status.HTTP_201_CREATED
)
async def add_policy(
    payload: CapacityPolicyCreate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> CapacityPolicyOut:
    """Da de alta una politica de capacidad."""
    policy = await create_capacity_policy(session, payload)
    return CapacityPolicyOut.model_validate(policy)


@router.patch("/{policy_id}", response_model=CapacityPolicyOut)
async def edit_policy(
    policy_id: int,
    payload: CapacityPolicyUpdate,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> CapacityPolicyOut:
    """Modifica los campos indicados de una politica de capacidad."""
    policy = await update_capacity_policy(session, policy_id, payload)
    return CapacityPolicyOut.model_validate(policy)


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_policy(
    policy_id: int,
    session: SessionDep,
    _manager=Depends(require_manager()),
) -> None:
    """Borra una politica de capacidad."""
    await delete_capacity_policy(session, policy_id)
