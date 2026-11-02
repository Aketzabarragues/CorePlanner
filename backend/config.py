"""Configuracion de la aplicacion, leida del entorno."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent

DEFAULT_DATABASE_URL = f"sqlite+aiosqlite:///{(REPO_ROOT / 'coreplanner.db').as_posix()}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="COREPLANNER_",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "CorePlanner"
    api_prefix: str = "/api"

    # sqlite+aiosqlite en desarrollo, postgresql+asyncpg en produccion.
    # La ruta por defecto es absoluta para que el servidor y el seed
    # apunten al mismo fichero con independencia del directorio actual.
    database_url: str = DEFAULT_DATABASE_URL
    database_echo: bool = False

    jwt_secret_key: str = "cambia-esta-clave-en-produccion-ahora-mismo"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
