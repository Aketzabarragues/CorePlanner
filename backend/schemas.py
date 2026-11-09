"""Esquemas Pydantic de entrada y salida de la API."""

from __future__ import annotations

from datetime import date, datetime
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

from .models import (
    COMPANY_ROLE_LABELS,
    EMPLOYMENT_TYPE_LABELS,
    SENIORITY_LABELS,
    CompanyRole,
    EmploymentType,
    NonWorkingDayScope,
    ProjectStatus,
    TaskStatus,
)
from .services.units import hours_to_json

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
    owner_name: str | None = None
    """Nombre del responsable del proyecto."""


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
    job_title: str | None = None
    seniority: str | None = None
    seniority_label: str | None = None
    employment_type: str = EmploymentType.OBJETIVO.value
    employment_type_label: str = EMPLOYMENT_TYPE_LABELS[EmploymentType.OBJETIVO.value]


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
    job_title: str | None = Field(default=None, max_length=120)
    seniority: str | None = None
    employment_type: str = EmploymentType.OBJETIVO.value

    @field_validator("company_role")
    @classmethod
    def _known_company_role(cls, value: str) -> str:
        if value not in COMPANY_ROLE_LABELS:
            raise ValueError("El rol de empresa no existe")
        return value

    @field_validator("seniority")
    @classmethod
    def _known_seniority(cls, value: str | None) -> str | None:
        if value is not None and value not in SENIORITY_LABELS:
            raise ValueError("El nivel no existe")
        return value

    @field_validator("employment_type")
    @classmethod
    def _known_employment_type(cls, value: str) -> str:
        if value not in EMPLOYMENT_TYPE_LABELS:
            raise ValueError("El tipo de contrato no existe")
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
    job_title: str | None = Field(default=None, max_length=120)
    seniority: str | None = None
    employment_type: str | None = None

    @field_validator("company_role")
    @classmethod
    def _known_company_role(cls, value: str | None) -> str | None:
        if value is not None and value not in COMPANY_ROLE_LABELS:
            raise ValueError("El rol de empresa no existe")
        return value

    @field_validator("seniority")
    @classmethod
    def _known_seniority(cls, value: str | None) -> str | None:
        if value is not None and value not in SENIORITY_LABELS:
            raise ValueError("El nivel no existe")
        return value

    @field_validator("employment_type")
    @classmethod
    def _known_employment_type(cls, value: str | None) -> str | None:
        if value is not None and value not in EMPLOYMENT_TYPE_LABELS:
            raise ValueError("El tipo de contrato no existe")
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


class MemberRoleUpdate(BaseModel):
    """Cambio del rol que una persona ejerce en un proyecto."""

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
    assigned_name: str | None = None
    """Nombre de quien lleva la tarea."""
    title: str
    status: str
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    estimated_hours: Hours
    week_hours: Hours | None = None
    """Horas que aporta la tarea en la semana por la que se ha filtrado.

    Una tarea puede cruzar varias semanas, de modo que sus horas estimadas no
    son las horas de esa semana. Es None si la peticion no filtraba por semana.
    """
    checklist_total: int = 0
    """Puntos que tiene la lista de comprobacion de la tarea."""
    checklist_done: int = 0
    """Puntos de esa lista que estan hechos."""


class TaskCommentOut(BaseModel):
    """Comentario de una tarea, con quien lo puso."""

    id: int
    task_id: int
    author_id: int
    author_name: str
    body: str
    created_at: datetime
    """Momento del comentario, en UTC y con zona."""


class TaskCommentCreate(BaseModel):
    """Comentario nuevo. El texto es obligatorio."""

    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def _no_vacio(cls, value: str) -> str:
        limpio = value.strip()
        if not limpio:
            raise ValueError("El comentario no puede estar vacio")
        return limpio


class ChecklistItemOut(BaseModel):
    """Punto de la lista de comprobacion de una tarea."""

    id: int
    task_id: int
    label: str
    done: bool = False
    position: int = 0
    created_at: datetime


class ChecklistItemCreate(BaseModel):
    """Punto nuevo de la lista. El texto es obligatorio."""

    label: str = Field(min_length=1, max_length=255)

    @field_validator("label")
    @classmethod
    def _no_vacio(cls, value: str) -> str:
        limpio = value.strip()
        if not limpio:
            raise ValueError("El punto no puede estar vacio")
        return limpio


class ChecklistItemUpdate(BaseModel):
    """Cambio de un punto: marcarlo, desmarcarlo o cambiar su texto.

    Solo se aplican los campos presentes.
    """

    label: str | None = Field(default=None, min_length=1, max_length=255)
    done: bool | None = None

    @field_validator("label")
    @classmethod
    def _no_vacio(cls, value: str | None) -> str | None:
        if value is None:
            return value
        limpio = value.strip()
        if not limpio:
            raise ValueError("El punto no puede estar vacio")
        return limpio

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class ActivityOut(BaseModel):
    """Entrada de la bitacora de cambios."""

    id: int
    actor_id: int
    actor_name: str
    action: str
    entity_type: str
    entity_id: int
    project_id: int
    project_name: str
    payload: dict = {}
    created_at: datetime
    """Momento de la accion, en UTC y con zona."""


class ActivityPageOut(BaseModel):
    """Pagina de la bitacora: las entradas y cuanto hay en total."""

    items: list[ActivityOut] = []
    total: int = 0
    limit: int = 50
    offset: int = 0


class HolidayOut(BaseModel):
    """Dia no laborable de alcance global, con su nombre."""

    date: date
    name: str
    scope: str = "global"
    half_day: bool = False


class MyWorkTaskOut(BaseModel):
    """Tarea propia dentro del periodo de planificacion."""

    id: int
    project_id: int
    project_name: str
    title: str
    status: str
    start_date: date | None = None
    end_date: date | None = None
    hours: Hours
    estimated_hours: Hours
    weeks: list[str] = []
    """Semanas del periodo que toca la tarea."""


class MyWorkWeekOut(BaseModel):
    """Carga propia de una semana del periodo."""

    week: str
    hours: Hours
    capacity: Hours | None = None
    is_overloaded: bool
    holidays: list[HolidayOut] = []
    capacity_without: Hours | None = None
    """Capacidad de la semana si no contaran los dias no laborables."""


class MyWorkOut(BaseModel):
    """Mi trabajo: tareas propias y carga por semana."""

    weeks: list[MyWorkWeekOut]
    tasks: list[MyWorkTaskOut]
    total_hours: Hours
    has_overload: bool
    current_week: str | None = None
    """Semana de referencia de la pantalla: la actual si cae en el periodo."""


class PanelOverloadOut(BaseModel):
    """Persona que supera su capacidad en una semana."""

    user_id: int
    name: str
    week: str
    hours: Hours
    capacity: Hours
    excess_hours: Hours


class PanelWeekOut(BaseModel):
    """Uso del equipo en una semana del periodo."""

    week: str
    hours: Hours
    capacity: Hours | None = None
    utilization: int | None = None


class PanelPendingOut(BaseModel):
    """Tarea que todavia no cuenta en la matriz."""

    id: int
    title: str
    project_id: int
    project_name: str
    problem: str


class PanelProjectOut(BaseModel):
    """Proyecto visible, con el trabajo que concentra."""

    id: int
    name: str
    status: str
    estimated_hours: Hours
    task_count: int
    people_count: int
    department_id: int | None = None


class PanelDepartmentOut(BaseModel):
    """Resumen de un departamento: sus proyectos, sus sobrecargas y su uso."""

    id: int
    name: str
    active_projects: int
    overloaded_people: int
    utilization: int | None = None
    planned_hours: Hours = 0
    capacity_hours: Hours = 0


class PanelOut(BaseModel):
    """Panel global: el estado de la organizacion."""

    week: str | None = None
    is_current_week: bool = False
    planned_hours: Hours
    capacity_hours: Hours
    utilization: int | None = None
    overloaded: list[PanelOverloadOut]
    projects_by_status: dict[str, int]
    tasks_by_status: dict[str, int]
    projects: list[PanelProjectOut]
    total_tasks: int
    total_people: int
    weeks: list[PanelWeekOut] = []
    pending: list[PanelPendingOut] = []
    by_department: list[PanelDepartmentOut] = []


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
    title: str = ""
    assigned_to: int | None = None
    assigned_name: str | None = None
    status: str = ""


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
    description: str | None = None
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
    description: str | None = None
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


class ScheduleOut(BaseModel):
    """Version de horario de una persona.

    Los dias van en centimas de hora enteras y las horas salen ya convertidas
    en el unico punto de paso a JSON del motor.
    """

    id: int
    valid_from: date
    days: list[int]
    hours: list[Hours]
    availability_factor: int
    note: str | None = None


class ScheduleCreate(BaseModel):
    """Alta de una version de horario."""

    valid_from: date
    days: list[int] = Field(min_length=7, max_length=7)
    availability_factor: int = Field(default=100, ge=0, le=100)
    note: str | None = Field(default=None, max_length=255)

    @field_validator("days")
    @classmethod
    def _valid_days(cls, value: list[int]) -> list[int]:
        for day in value:
            if not 0 <= day <= 10000:
                raise ValueError("Las horas de un día van de 0 a 10000 céntimas")
        return value


class ScheduleUpdate(BaseModel):
    """Correccion de una version de horario.

    La fecha de entrada en vigor no se puede cambiar: cambiarla seria otra
    version, no una correccion.
    """

    days: list[int] = Field(min_length=7, max_length=7)
    availability_factor: int = Field(default=100, ge=0, le=100)
    note: str | None = Field(default=None, max_length=255)

    @field_validator("days")
    @classmethod
    def _valid_days(cls, value: list[int]) -> list[int]:
        for day in value:
            if not 0 <= day <= 10000:
                raise ValueError("Las horas de un día van de 0 a 10000 céntimas")
        return value


class PersonSkillOut(BaseModel):
    """Competencia de una persona, con su nivel."""

    skill_id: int
    name: str
    level: int


class PersonSkillIn(BaseModel):
    """Nivel de una persona en una competencia."""

    skill_id: int
    level: int = Field(ge=1, le=3)


class PersonSkillsIn(BaseModel):
    """Conjunto de competencias de una persona."""

    skills: list[PersonSkillIn]


class SkillOut(BaseModel):
    """Competencia del catalogo, con cuantas personas la tienen."""

    id: int
    name: str
    person_count: int = 0


class SkillCreate(BaseModel):
    """Alta de competencia en el catalogo."""

    name: str = Field(min_length=1, max_length=100)


class SkillUpdate(BaseModel):
    """Renombrado de una competencia del catalogo."""

    name: str = Field(min_length=1, max_length=100)


class PersonSummaryOut(BaseModel):
    """Persona del directorio, con su horario vigente y su carga."""

    id: int
    name: str
    email: str
    company_role: str
    company_role_label: str
    job_title: str | None = None
    seniority: str | None = None
    seniority_label: str | None = None
    employment_type: str
    employment_type_label: str
    department_id: int | None = None
    department_name: str | None = None
    weekly_base_hours: Hours
    schedule: ScheduleOut | None = None
    skills: list[PersonSkillOut] = []
    capacity: Hours | None = None
    hours: Hours | None = None
    is_overloaded: bool | None = None
    week: str


class PersonProfileOut(PersonSummaryOut):
    """Persona con su historial completo de horarios."""

    schedule_history: list[ScheduleOut] = []


class NonWorkingDayOut(BaseModel):
    """Dia no laborable, con su alcance."""

    id: int
    date: date
    name: str
    scope: str
    department_id: int | None = None
    department_name: str | None = None
    user_id: int | None = None
    user_name: str | None = None
    half_day: bool


class NonWorkingDayCreate(BaseModel):
    """Alta de dia no laborable."""

    date: date
    name: str = Field(min_length=1, max_length=255)
    scope: str = NonWorkingDayScope.GLOBAL.value
    department_id: int | None = None
    user_id: int | None = None
    half_day: bool = False

    @field_validator("scope")
    @classmethod
    def _known_scope(cls, value: str) -> str:
        if value not in {item.value for item in NonWorkingDayScope}:
            raise ValueError("El alcance no existe")
        return value

    @model_validator(mode="after")
    def _check_scope(self) -> NonWorkingDayCreate:
        if self.scope == NonWorkingDayScope.DEPARTMENT.value:
            if self.department_id is None:
                raise ValueError(
                    "Un día no laborable de departamento necesita su departamento"
                )
            if self.user_id is not None:
                raise ValueError(
                    "Un día no laborable de departamento no lleva persona"
                )
        elif self.scope == NonWorkingDayScope.PERSON.value:
            if self.user_id is None:
                raise ValueError("Un día no laborable de persona necesita su persona")
            if self.department_id is not None:
                raise ValueError("Un día no laborable de persona no lleva departamento")
        else:
            if self.department_id is not None:
                raise ValueError("Un día no laborable global no lleva departamento")
            if self.user_id is not None:
                raise ValueError("Un día no laborable global no lleva persona")
        return self


class LaborDayOut(BaseModel):
    """Dia no laborable con su alcance y las tareas a las que afecta."""

    id: int
    date: date
    name: str
    scope: str
    department_id: int | None = None
    department_name: str | None = None
    user_id: int | None = None
    user_name: str | None = None
    half_day: bool
    affected_task_count: int


class CapacityImpactOut(BaseModel):
    """Efecto de los dias no laborables en la capacidad de una semana."""

    user_id: int
    user_name: str
    week: str
    capacity_without: Hours
    capacity_effective: Hours
    difference: Hours
    reasons: list[str] = []


class LaborCalendarOut(BaseModel):
    """Calendario laboral de un rango de fechas."""

    days: list[LaborDayOut] = []
    impact: list[CapacityImpactOut] = []
