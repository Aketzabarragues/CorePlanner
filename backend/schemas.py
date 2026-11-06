"""Esquemas Pydantic de entrada y salida de la API."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)

from .models import COMPANY_ROLE_LABELS, CompanyRole, ProjectStatus, TaskStatus
from .services.capacity import hours_to_json

Hours = Annotated[
    Decimal,
    PlainSerializer(hours_to_json, return_type=float, when_used="json"),
]
"""Horas de la respuesta.

Se transportan como Decimal y salen como numero JSON gracias al unico punto
de paso a JSON del motor, de modo que el contrato no dependa de coma
flotante por el camino.
"""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    is_global_admin: bool
    company_role: str = "tecnico"
    weekly_base_hours: Hours
    department_id: int | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: str
    parent_id: int | None = None
    department_id: int | None = None
    owner_id: int | None = None


class ScopeOut(BaseModel):
    """Ambito de la persona que entra."""

    user: UserOut
    role_label: str
    is_manager: bool = False
    department_name: str | None = None
    visible_project_ids: list[int]
    editable_project_ids: list[int]


class CompanyRoleOut(BaseModel):
    """Rol de empresa del catalogo."""

    value: str
    label: str
    scope: str


class PersonOut(BaseModel):
    """Persona de la organizacion, con su rol y su departamento."""

    id: int
    name: str
    email: str
    company_role: str
    company_role_label: str
    department_id: int | None = None
    department_name: str | None = None
    weekly_base_hours: Hours
    is_global_admin: bool


class PersonCreate(BaseModel):
    """Alta de persona."""

    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    company_role: str = CompanyRole.TECNICO.value
    department_id: int | None = None
    weekly_base_hours: Decimal = Field(
        default=Decimal("40.00"), ge=0, max_digits=8, decimal_places=2
    )

    @field_validator("company_role")
    @classmethod
    def _known_company_role(cls, value: str) -> str:
        if value not in COMPANY_ROLE_LABELS:
            raise ValueError("El rol de empresa no existe")
        return value


class PersonUpdate(BaseModel):
    """Modificacion parcial de persona. Solo se aplican los campos presentes."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    company_role: str | None = None
    department_id: int | None = None
    weekly_base_hours: Decimal | None = Field(
        default=None, ge=0, max_digits=8, decimal_places=2
    )

    @field_validator("company_role")
    @classmethod
    def _known_company_role(cls, value: str | None) -> str | None:
        if value is not None and value not in COMPANY_ROLE_LABELS:
            raise ValueError("El rol de empresa no existe")
        return value

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class DepartmentCreate(BaseModel):
    """Alta de departamento."""

    name: str = Field(min_length=1, max_length=100)
    manager_id: int | None = None


class DepartmentUpdate(BaseModel):
    """Modificacion parcial de departamento."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    manager_id: int | None = None

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class ProjectCreate(BaseModel):
    """Alta de proyecto."""

    name: str = Field(min_length=1, max_length=255)
    status: str = ProjectStatus.PLANNING.value
    department_id: int | None = None
    owner_id: int | None = None

    @field_validator("status")
    @classmethod
    def _known_status(cls, value: str) -> str:
        if value not in {item.value for item in ProjectStatus}:
            raise ValueError("El estado del proyecto no existe")
        return value


class ProjectUpdate(BaseModel):
    """Modificacion parcial de proyecto."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = None
    department_id: int | None = None
    owner_id: int | None = None

    @field_validator("status")
    @classmethod
    def _known_status(cls, value: str | None) -> str | None:
        if value is not None and value not in {item.value for item in ProjectStatus}:
            raise ValueError("El estado del proyecto no existe")
        return value

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class RoleOut(BaseModel):
    """Rol aplicable dentro de un proyecto, con sus permisos."""

    id: int
    name: str
    permissions: list[str]


class MemberCreate(BaseModel):
    """Alta de persona en un proyecto."""

    user_id: int
    role_id: int


class DepartmentOut(BaseModel):
    """Departamento de la organizacion, con su responsable."""

    id: int
    name: str
    manager_id: int | None = None
    manager_name: str | None = None


class MemberOut(BaseModel):
    """Persona asignada a un proyecto, con el rol que ejerce en el."""

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    name: str
    email: str
    role_id: int
    role_name: str
    weekly_base_hours: Hours


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    assigned_to: int | None = None
    title: str
    status: str
    start_date: date | None = None
    end_date: date | None = None
    estimated_hours: Hours


class GanttTaskOut(BaseModel):
    """Barra del diagrama de Gantt."""

    id: int
    name: str
    start: date
    end: date
    progress: int
    dependencies: str
    custom_class: str
    project_id: int
    project_name: str


class GanttMemberOut(BaseModel):
    """Persona con el color que le toca en el diagrama."""

    user_id: int
    name: str
    css_class: str


class GanttOut(BaseModel):
    """Diagrama de Gantt de un proyecto."""

    tasks: list[GanttTaskOut]
    members: list[GanttMemberOut]
    undated_task_ids: list[int]
    unassigned_task_ids: list[int]


class KanbanTaskOut(BaseModel):
    """Tarjeta del tablero."""

    id: int
    title: str
    status: str
    assigned_to: int | None = None
    assigned_name: str | None = None
    estimated_hours: Hours
    start_date: date | None = None
    end_date: date | None = None


class KanbanColumnOut(BaseModel):
    """Columna del tablero, con las tarjetas de un estado."""

    status: str
    tasks: list[KanbanTaskOut]


class KanbanOut(BaseModel):
    """Tablero de un proyecto, con las cuatro columnas siempre presentes."""

    columns: list[KanbanColumnOut]


class TaskCreate(BaseModel):
    """Alta de tarea. Las fechas y las horas son obligatorias."""

    title: str = Field(min_length=1, max_length=255)
    assigned_to: int | None = None
    start_date: date
    end_date: date
    estimated_hours: Decimal = Field(ge=0, max_digits=8, decimal_places=2)

    @model_validator(mode="after")
    def _check_range(self) -> TaskCreate:
        if self.end_date < self.start_date:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class TaskUpdate(BaseModel):
    """Modificacion parcial de tarea. Solo se aplican los campos presentes.

    Los campos ausentes no se tocan. Para desasignar una tarea hay que
    enviar assigned_to con valor null de forma explicita, que se distingue
    de la ausencia del campo.
    """

    title: str | None = Field(default=None, min_length=1, max_length=255)
    assigned_to: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    estimated_hours: Decimal | None = Field(
        default=None, ge=0, max_digits=8, decimal_places=2
    )
    status: TaskStatus | None = None

    @model_validator(mode="after")
    def _check_range(self) -> TaskUpdate:
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set
