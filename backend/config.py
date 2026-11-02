"""Configuracion de la aplicacion, leida del entorno."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="COREPLANNER_",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "CorePlanner"
    api_prefix: str = "/api"

    # sqlite+aiosqlite en desarrollo, postgresql+asyncpg en produccion
    database_url: str = "sqlite+aiosqlite:///./coreplanner.db"
    database_echo: bool = False

    jwt_secret_key: str = "cambia-esta-clave-en-produccion-ahora-mismo"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
