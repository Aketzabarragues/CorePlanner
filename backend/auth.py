"""Autenticacion JWT: hash de contrasenas, emision y validacion de tokens.

El token transporta la identidad del usuario (sub) y la pertenencia a
proyectos con su rol. La autorizacion fina se resuelve en core/security.py
contra el project_id solicitado.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_db
from .models import ProjectMember, Role, User

settings = get_settings()

ALGORITHM = settings.jwt_algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login")

BCRYPT_MAX_BYTES = 72


class TokenError(Exception):
    """Token ausente, caducado o con firma invalida."""


class TokenPayload(BaseModel):
    """Contenido del token de acceso."""

    sub: int = Field(description="Identificador del usuario")
    email: str
    name: str
    is_global_admin: bool = False
    exp: int
    iat: int
    jti: str
    projects: dict[str, list[str]] = Field(
        default_factory=dict,
        description="project_id -> lista de permisos heredados del rol",
    )

    @field_validator("sub", mode="before")
    @classmethod
    def _sub_to_int(cls, value: str | int) -> int:
        """RFC 7519 obliga a que sub sea texto; aqui se recupera el entero."""
        return int(value)


def hash_password(password: str) -> str:
    """Genera el hash bcrypt de una contrasena en texto plano."""
    encoded = password.encode("utf-8")
    if len(encoded) > BCRYPT_MAX_BYTES:
        raise ValueError(f"La contrasena supera los {BCRYPT_MAX_BYTES} bytes admitidos")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """Comprueba una contrasena en texto plano contra su hash bcrypt."""
    encoded = password.encode("utf-8")
    if len(encoded) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(encoded, hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    user: User,
    projects: dict[str, list[str]] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Emite un token de acceso firmado para el usuario indicado."""
    now = datetime.now(UTC)
    expires = now + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "email": user.email,
        "name": user.name,
        "is_global_admin": user.is_global_admin,
        "projects": projects or {},
        "exp": int(expires.timestamp()),
        "iat": int(now.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> TokenPayload:
    """Valida la firma y la vigencia del token. Lanza TokenError si no es valido."""
    try:
        raw = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "sub", "jti"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("El token ha caducado") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("El token no es valido") from exc
    return TokenPayload(**raw)


async def load_user_projects(
    session: AsyncSession, user_id: int
) -> dict[str, list[str]]:
    """Permisos por proyecto: project_id -> lista de permisos del rol asignado."""
    stmt = (
        select(ProjectMember.project_id, Role.permissions_json)
        .join(Role, Role.id == ProjectMember.role_id)
        .where(ProjectMember.user_id == user_id)
    )
    result = await session.execute(stmt)
    projects: dict[str, list[str]] = {}
    for project_id, permissions in result.all():
        projects[str(project_id)] = list(permissions or [])
    return projects


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Dependencia FastAPI que resuelve el usuario autenticado."""
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales invalidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise credentials_error from exc

    user = await session.get(User, payload.sub)
    if user is None:
        raise credentials_error
    return user
