"""Aplicacion FastAPI de CorePlanner."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import create_all, dispose_engine

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_all()
    yield
    await dispose_engine()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Gestor ligero de capacidad para equipos de ingenieria.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["sistema"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
