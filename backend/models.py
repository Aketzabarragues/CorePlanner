"""Modelos declarativos de CorePlanner.

Esquema portable: tipos declarativos (Mapped/mapped_column), ON DELETE explicito
y restricciones CHECK que SQLite y PostgreSQL interpretan igual. Cambiar a
PostgreSQL requiere unicamente sustituir la URL de conexion y el driver async.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base declarativa compartida por todos los modelos."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class ProjectStatus(enum.StrEnum):
    PLANNING = "planning"
    ACTIVE = "active"
    ON_HOLD = "on_hold"
    DONE = "done"
    CANCELLED = "cancelled"


class TaskStatus(enum.StrEnum):
    BACKLOG = "backlog"
    IN_PROGRESS = "in_progress"
    TESTING = "testing"
    DONE = "done"


class User(Base):
    """Persona con acceso a la aplicacion."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_global_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    weekly_base_hours: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("40.00"), server_default="40"
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("email", name="email"),
        CheckConstraint("weekly_base_hours >= 0", name="weekly_base_hours_positive"),
    )

    department: Mapped[Department | None] = relationship(
        back_populates="members", foreign_keys=[department_id]
    )
    memberships: Mapped[list[ProjectMember]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    assigned_tasks: Mapped[list[Task]] = relationship(
        back_populates="assignee", passive_deletes=True
    )


class Department(Base):
    """Departamento: agrupa a las personas y es el gestor de un proyecto.

    El responsable es una persona del propio departamento. Las personas y el
    proyecto se relacionan con el departamento, no al reves: una tarea puede
    asignarse a cualquiera del equipo, este o de otro departamento.
    """

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    __table_args__ = (UniqueConstraint("name", name="name"),)

    manager: Mapped[User | None] = relationship(foreign_keys=[manager_id])
    members: Mapped[list[User]] = relationship(
        back_populates="department", foreign_keys="User.department_id"
    )
    projects: Mapped[list[Project]] = relationship(back_populates="department")


class Role(Base):
    """Rol aplicable dentro de un proyecto concreto."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    permissions_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    __table_args__ = (UniqueConstraint("name", name="name"),)

    members: Mapped[list[ProjectMember]] = relationship(
        back_populates="role", passive_deletes=True
    )


class Project(Base):
    """Proyecto. parent_id permite el arbol de subproyectos."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ProjectStatus.PLANNING.value
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('planning', 'active', 'on_hold', 'done', 'cancelled')",
            name="status",
        ),
    )

    parent: Mapped[Project | None] = relationship(
        remote_side=[id], back_populates="children"
    )
    children: Mapped[list[Project]] = relationship(back_populates="parent")
    department: Mapped[Department | None] = relationship(back_populates="projects")
    members: Mapped[list[ProjectMember]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    tasks: Mapped[list[Task]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ProjectMember(Base):
    """Vinculo usuario-proyecto con el rol que ejerce en ese proyecto."""

    __tablename__ = "project_members"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="RESTRICT"), primary_key=True, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="memberships")
    project: Mapped[Project] = relationship(back_populates="members")
    role: Mapped[Role] = relationship(back_populates="members")


class Task(Base):
    """Tarea asignable dentro de un proyecto.

    La persona asignada puede ser cualquiera del proyecto, este o de otro
    departamento: la pertenencia al departamento no restringe la asignacion.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_to: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TaskStatus.BACKLOG.value
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    estimated_hours: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('backlog', 'in_progress', 'testing', 'done')",
            name="status",
        ),
        CheckConstraint("estimated_hours >= 0", name="estimated_hours_positive"),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="date_range",
        ),
        Index("ix_tasks_project_assignee", "project_id", "assigned_to"),
    )

    project: Mapped[Project] = relationship(back_populates="tasks")
    assignee: Mapped[User | None] = relationship(back_populates="assigned_tasks")
