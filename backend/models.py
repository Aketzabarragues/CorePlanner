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
    Text,
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


class CompanyRole(enum.StrEnum):
    """Rol de empresa: dice hasta donde llega el ambito de cada persona.

    El rol de empresa y el departamento abren la puerta a los proyectos. Lo que
    se puede hacer dentro de cada uno lo dice el rol de proyecto.
    """

    GERENTE = "gerente"
    JEFE_DEPARTAMENTO = "jefe_departamento"
    TECNICO = "tecnico"


COMPANY_ROLE_LABELS = {
    CompanyRole.GERENTE.value: "Gerente",
    CompanyRole.JEFE_DEPARTAMENTO.value: "Jefe de departamento",
    CompanyRole.TECNICO.value: "Técnico",
}

COMPANY_ROLE_SCOPES = {
    CompanyRole.GERENTE.value: "Ve toda la organización y trabaja en todos los proyectos",
    CompanyRole.JEFE_DEPARTAMENTO.value: (
        "Ve los proyectos de su departamento y trabaja en ellos, aunque no sea miembro"
    ),
    CompanyRole.TECNICO.value: (
        "Ve los proyectos de los que es miembro y los que tiene tareas, "
        "y trabaja solo en los primeros"
    ),
}


class Seniority(enum.StrEnum):
    """Nivel profesional de una persona."""

    JUNIOR = "junior"
    MEDIO = "medio"
    SENIOR = "senior"


SENIORITY_LABELS = {
    Seniority.JUNIOR.value: "Junior",
    Seniority.MEDIO.value: "Medio",
    Seniority.SENIOR.value: "Senior",
}


class EmploymentType(enum.StrEnum):
    """Tipo de contrato de la persona.

    Por ahora es un dato descriptivo: no cambia como se calcula la capacidad.
    """

    OBJETIVO = "objetivo"
    TECHO = "techo"
    MEJOR_ESFUERZO = "mejor_esfuerzo"


EMPLOYMENT_TYPE_LABELS = {
    EmploymentType.OBJETIVO.value: "Objetivo",
    EmploymentType.TECHO.value: "Techo",
    EmploymentType.MEJOR_ESFUERZO.value: "Mejor esfuerzo",
}


class NonWorkingDayScope(enum.StrEnum):
    """Alcance de un dia no laborable."""

    GLOBAL = "global"
    DEPARTMENT = "department"
    PERSON = "person"


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
    company_role: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=CompanyRole.TECNICO.value,
        server_default=CompanyRole.TECNICO.value,
    )
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    seniority: Mapped[str | None] = mapped_column(String(32), nullable=True)
    employment_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=EmploymentType.OBJETIVO.value,
        server_default=EmploymentType.OBJETIVO.value,
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
        CheckConstraint(
            "company_role IN ('gerente', 'jefe_departamento', 'tecnico')",
            name="company_role",
        ),
        CheckConstraint(
            "seniority IS NULL OR seniority IN ('junior', 'medio', 'senior')",
            name="seniority",
        ),
        CheckConstraint(
            "employment_type IN ('objetivo', 'techo', 'mejor_esfuerzo')",
            name="employment_type",
        ),
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
    schedules: Mapped[list[WorkingSchedule]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="WorkingSchedule.valid_from",
    )
    skills: Mapped[list[PersonSkill]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
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
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
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
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])
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
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Texto largo de la tarea. Es opcional: la mayoria no lo lleva."""
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
    comments: Mapped[list[TaskComment]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    checklist_items: Mapped[list[TaskChecklistItem]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="TaskChecklistItem.position",
    )


class TaskComment(Base):
    """Comentario puesto en una tarea.

    No se edita ni se borra: un comentario es lo que se dijo en su momento, y
    la bitacora ya guarda el historial de lo que fue.
    """

    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    task: Mapped[Task] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class TaskChecklistItem(Base):
    """Punto de una lista de comprobacion de una tarea.

    La lista es plana: cada punto es una linea de la tarea, no una tarea con sus
    propias dependencias.
    """

    __tablename__ = "task_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    task: Mapped[Task] = relationship(back_populates="checklist_items")

    __table_args__ = (Index("ix_task_checklist_items_task_position", "task_id", "position"),)


class WorkingSchedule(Base):
    """Horario laboral de una persona, versionado en el tiempo.

    Las horas de cada dia van en centimas de hora enteras, no en minutos: un
    minuto son 100/60 centimas y no siempre cabe en centimas enteras. El
    factor de disponibilidad es un porcentaje entero que multiplica la
    capacidad de la semana.
    """

    __tablename__ = "working_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    monday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    tuesday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    wednesday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    thursday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    friday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    saturday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    sunday: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    availability_factor: Mapped[int] = mapped_column(
        Integer, nullable=False, default=100, server_default="100"
    )
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "valid_from", name="user_valid_from"),
        CheckConstraint(
            "availability_factor BETWEEN 0 AND 100", name="availability_factor"
        ),
        CheckConstraint(
            "monday BETWEEN 0 AND 10000 AND tuesday BETWEEN 0 AND 10000 "
            "AND wednesday BETWEEN 0 AND 10000 AND thursday BETWEEN 0 AND 10000 "
            "AND friday BETWEEN 0 AND 10000 AND saturday BETWEEN 0 AND 10000 "
            "AND sunday BETWEEN 0 AND 10000",
            name="daily_hours",
        ),
    )

    user: Mapped[User] = relationship(back_populates="schedules")


class NonWorkingDay(Base):
    """Dia no laborable, con alcance global, de departamento o de persona.

    Los dias de alcance global se quitan a todo el mundo; los de alcance de
    departamento, solo a quien pertenece a ese departamento; los de alcance de
    persona, solo a esa persona.
    """

    __tablename__ = "non_working_days"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=NonWorkingDayScope.GLOBAL.value,
        server_default=NonWorkingDayScope.GLOBAL.value,
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    half_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )

    __table_args__ = (
        CheckConstraint(
            "scope IN ('global', 'department', 'person')", name="scope"
        ),
        CheckConstraint(
            "(scope = 'global' AND department_id IS NULL AND user_id IS NULL) OR "
            "(scope = 'department' AND department_id IS NOT NULL AND user_id IS NULL) OR "
            "(scope = 'person' AND department_id IS NULL AND user_id IS NOT NULL)",
            name="scope_target",
        ),
    )

    department: Mapped[Department | None] = relationship()
    user: Mapped[User | None] = relationship()


class Skill(Base):
    """Habilidad del catalogo de la empresa."""

    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    __table_args__ = (UniqueConstraint("name", name="name"),)


class PersonSkill(Base):
    """Nivel de una persona en una competencia."""

    __tablename__ = "person_skills"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (CheckConstraint("level BETWEEN 1 AND 3", name="level"),)

    user: Mapped[User] = relationship(back_populates="skills")
    skill: Mapped[Skill] = relationship()


class ActivityLog(Base):
    """Bitacora de cambios: una fila por accion registrada.

    Solo se anaden filas: la bitacora dice lo que fue, no lo que es. Cada
    entrada cuelga de un proyecto, de modo que el filtro por proyecto es el
    mismo que el de las vistas de planificacion.
    """

    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    __table_args__ = (Index("ix_activity_log_project_created", "project_id", "created_at"),)

    actor: Mapped[User] = relationship()
    project: Mapped[Project] = relationship()
