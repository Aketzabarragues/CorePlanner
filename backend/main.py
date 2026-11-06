"""Aplicacion FastAPI de CorePlanner."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    auth,
    departments,
    gantt,
    kanban,
    me,
    members,
    non_working_days,
    overview,
    people,
    projects,
    roles,
    skills,
    tasks,
    users,
)
from .config import get_settings
from .database import create_all, dispose_engine, engine
from .migrations import apply_migrations

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_all()
    await apply_migrations(engine)
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

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(me.router, prefix=settings.api_prefix)
app.include_router(users.router, prefix=settings.api_prefix)
app.include_router(roles.router, prefix=settings.api_prefix)
app.include_router(projects.router, prefix=settings.api_prefix)
app.include_router(overview.router, prefix=settings.api_prefix)
app.include_router(tasks.router, prefix=settings.api_prefix)
app.include_router(members.router, prefix=settings.api_prefix)
app.include_router(gantt.router, prefix=settings.api_prefix)
app.include_router(kanban.router, prefix=settings.api_prefix)
app.include_router(departments.router, prefix=settings.api_prefix)
app.include_router(people.router, prefix=settings.api_prefix)
app.include_router(skills.router, prefix=settings.api_prefix)
app.include_router(non_working_days.router, prefix=settings.api_prefix)


@app.get("/health", tags=["sistema"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
