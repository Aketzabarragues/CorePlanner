"""Endpoints de autenticacion."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..auth import (
    create_access_token,
    load_user_projects,
    verify_password,
)
from ..models import User
from ..schemas import LoginRequest, TokenOut, UserOut
from ..security import SessionDep

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(payload: LoginRequest, session: SessionDep) -> TokenOut:
    """Comprueba las credenciales y devuelve un token de acceso."""
    result = await session.execute(
        select(User).where(User.email == payload.email.lower())
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    projects = await load_user_projects(session, user.id)
    token = create_access_token(user, projects=projects)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))
