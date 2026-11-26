"""Esquemas Pydantic de entrada y salida de la API."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, Self

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
)
from .palette import PALETTE_COLORS
from .services.units import hours_to_json


def _check_palette_color(value: str) -> str:
    """Comprueba que el color sea uno de la paleta."""
    if value not in PALETTE_COLORS:
        raise ValueError("El color no esta en la paleta")
    return value

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
    color: str | None = None
    """Color propio del proyecto, uno de la paleta."""
    status: str
    is_provisional: bool
    """Proyecto provisional: su carga no cuenta como sobrecarga."""
    parent_id: int | None = None
    department_id: int | None = None
    owner_id: int | None = None
    owner_name: str | None = None
    """Nombre del responsable del proyecto."""


class ProjectSummaryMemberOut(BaseModel):
    """Persona del equipo de un proyecto."""

    user_id: int
    name: str


class ProjectLoadOut(BaseModel):
    """Carga de un proyecto en una semana, frente a la capacidad de su equipo."""

    week: str
    planned_hours: Hours = 0
    capacity_hours: Hours = 0
    utilization: int | None = None
    overloaded: bool = False
    """La carga del proyecto supera la capacidad de su equipo esa semana."""


class ProjectSummaryOut(BaseModel):
    """Resumen de un proyecto para el listado global."""

    id: int
    members: list[ProjectSummaryMemberOut] = Field(default_factory=list)
    tasks_total: int = 0
    tasks_done: int = 0
    load: ProjectLoadOut


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
    color: str | None = None
    """Color propio. Si no viene, el backend elige el de la paleta que menos se use."""
    manager_id: int | None = None

    @field_validator("color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _check_palette_color(value)


class DepartmentUpdate(BaseModel):
    """Modificacion parcial de departamento."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = None
    """Color propio. No se puede quedar vacio: el color siempre esta puesto."""
    manager_id: int | None = None

    @field_validator("color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("El color no puede quedar vacio")
        return _check_palette_color(value)

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


ScopeType = Literal["persona", "departamento"]


class CapacityPolicyCreate(BaseModel):
    """Alta de politica de capacidad: umbral de aviso y de aprobacion."""

    scope_type: ScopeType
    scope_id: int = Field(ge=1)
    warn_percent: int = Field(default=80, ge=1, le=100)
    requires_approval_percent: int = Field(default=100, ge=1, le=100)
    active: bool = True

    @model_validator(mode="after")
    def _aprobacion_no_por_debajo_del_aviso(self) -> Self:
        if self.requires_approval_percent < self.warn_percent:
            raise ValueError(
                "El umbral de aprobacion no puede estar por debajo del de aviso"
            )
        return self


class CapacityPolicyUpdate(BaseModel):
    """Modificacion parcial de politica. Solo se aplican los campos presentes.

    Para unsetear un valor opcional se manda `null` explicito, como en el
    resto de los PATCH parciales de la API.
    """

    scope_type: ScopeType | None = None
    scope_id: int | None = Field(default=None, ge=1)
    warn_percent: int | None = Field(default=None, ge=1, le=100)
    requires_approval_percent: int | None = Field(default=None, ge=1, le=100)
    active: bool | None = None

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class CapacityPolicyOut(BaseModel):
    """Politica de capacidad, en el formato de la API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    scope_type: ScopeType
    scope_id: int
    warn_percent: int
    requires_approval_percent: int
    active: bool
    created_at: datetime


class ResolveIncident(BaseModel):
    """Resolucion de un incidente de capacidad: aprobar o rechazar."""

    decision: Literal["aprobada", "rechazada"]
    note: str | None = Field(default=None, max_length=2000)


class IncidentOut(BaseModel):
    """Incidente de capacidad, en el formato de la API.

    Lleva la carga y la capacidad de la semana del incidente, en el momento
    en que se le: quien resuelve decide viendo el estado actual, no el de
    cuando se abrio.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    policy_id: int
    user_id: int
    user_name: str
    department_id: int | None = None
    department_name: str | None = None
    week: str
    state: str
    hours: Hours | None = None
    capacity: Hours | None = None
    warn_percent: int
    requires_approval_percent: int
    note: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by: str | None = None


class ProjectCreate(BaseModel):
    """Alta de proyecto."""

    name: str = Field(min_length=1, max_length=255)
    color: str | None = None
    """Color propio. Si no viene, el backend elige el de la paleta que menos se use."""
    status: str = ProjectStatus.PLANNING.value
    is_provisional: bool = False
    """Provisional: su carga se muestra aparte y no cuenta como sobrecarga."""
    department_id: int | None = None
    owner_id: int | None = None

    @field_validator("color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _check_palette_color(value)

    @field_validator("status")
    @classmethod
    def _known_status(cls, value: str) -> str:
        if value not in {item.value for item in ProjectStatus}:
            raise ValueError("El estado del proyecto no existe")
        return value


class ProjectUpdate(BaseModel):
    """Modificacion parcial de proyecto."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    color: str | None = None
    """Color propio. No se puede quedar vacio: el color siempre esta puesto."""
    status: str | None = None
    is_provisional: bool | None = None
    """Provisional. En este PATCH parcial, `null` explicito significa 'absente':
    el campo no se toca. `false` si se aplica; solo el campo ausente deja el
    valor anterior, de modo que la marca no se puede quitar con null."""
    department_id: int | None = None
    owner_id: int | None = None

    @field_validator("color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("El color no puede quedar vacio")
        return _check_palette_color(value)

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
    color: str | None = None
    """Color propio del departamento, uno de la paleta."""
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
    position: int | None = None
    """Posicion de la tarea dentro de su columna de tablero; None si no la tiene."""


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
    """Uso del equipo en una semana del periodo.

    capacity es la suma de las capacidades conocidas; unknown_capacity_users
    cuenta a quien no la tiene, para que el grafico diga cuanto se queda fuera
    del denominador.
    """

    week: str
    hours: Hours
    capacity: Hours | None = None
    utilization: int | None = None
    unknown_capacity_users: int = 0


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
    project_color: str
    project_id: int
    project_name: str
    is_provisional: bool = False
    title: str = ""
    assigned_to: int | None = None
    assigned_name: str | None = None
    status: str = ""
    estimated_hours: Hours = Decimal("0")
    violations: list[int] = []
    """Requisitos que la barra empieza antes de que terminen: el vinculo esta
    roto y el diagrama lo marca."""
    in_critical_path: bool = False
    """La tarea esta en la ruta critica de su proyecto: la cadena mas larga
    de precedencias, medida en dias de calendario."""


class GanttMemberOut(BaseModel):
    """Persona con el color que le toca en el diagrama."""

    user_id: int
    name: str
    css_class: str


class GanttDependencyOut(BaseModel):
    """Vinculo en el feed del diagrama: las flechas del grafo."""

    task_id: int
    depends_on_id: int
    type: str


class GanttOut(BaseModel):
    """Diagrama de Gantt de un proyecto."""

    tasks: list[GanttTaskOut]
    members: list[GanttMemberOut]
    undated_task_ids: list[int]
    unassigned_task_ids: list[int]
    dependencies: list[GanttDependencyOut] = []
    """Vinculos entre tareas del proyecto, para dibujar las flechas."""


class TaskDependencyPairOut(BaseModel):
    """El par de tareas de un vinculo, con su tipo.

    `precedes` restringe la planificacion: la dependiente no puede empezar
    antes de que termine el requisito. `relates` es de referencia.
    """

    task_id: int
    depends_on_id: int
    type: Literal["precedes", "relates"]


class TaskDependencyCreate(TaskDependencyPairOut):
    """Alta de un vinculo: `task_id` depende de `depends_on_id`."""


class TaskDependencyLinkOut(BaseModel):
    """Vinculo entre dos tareas del mismo proyecto."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    depends_on_id: int
    type: str


class TaskDependencyProjectLinkOut(TaskDependencyLinkOut):
    """Vinculo del proyecto, con los titulos de las dos tareas."""

    task_title: str = ""
    depends_on_title: str = ""


class TaskDependencyProjectOut(BaseModel):
    """Vinculos del proyecto, en el orden en que se crearon."""

    dependencies: list[TaskDependencyProjectLinkOut]


class TaskTaskDependenciesOut(BaseModel):
    """Requisitos y dependientes de una tarea."""

    requirements: list[TaskDependencyLinkOut]
    dependents: list[TaskDependencyLinkOut]


class TaskDependencyMoveOut(BaseModel):
    """Movimiento de una tarea dentro de la propuesta de cascada."""

    task_id: int
    start_date: date
    end_date: date


class TaskCascadeOut(BaseModel):
    """Propuesta de cascada si una tarea se moviera: solo se propone."""

    task_id: int
    delta_days: int
    moves: list[TaskDependencyMoveOut]


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
    position: int | None = None


class KanbanColumnOut(BaseModel):
    """Columna del tablero, con las tarjetas de un estado y sus totales."""

    status: str
    tasks: list[KanbanTaskOut]
    task_count: int
    """Numero de tareas de la columna, calculado por el backend."""
    estimated_hours: Hours
    """Suma de las horas estimadas de las tarjetas de la columna."""


class TaskOrder(BaseModel):
    """Cambio de orden del tablero: mueve una tarea y deja su columna en el
    orden de la lista de identificadores.

    Los identificadores que no vengan en la lista quedan detras, en su orden
    actual. La lista no puede llevar identificadores repetidos.
    """

    task_id: int
    status: str = Field(min_length=1, max_length=32)
    task_ids: list[int] = Field(min_length=1)

    @model_validator(mode="after")
    def _sin_repetidos(self) -> TaskOrder:
        if len(set(self.task_ids)) != len(self.task_ids):
            raise ValueError("Los identificadores de la lista se repiten")
        return self


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
    status: str | None = Field(default=None, min_length=1, max_length=32)

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


class TaskStatusCreate(BaseModel):
    """Alta de un estado de tarea del proyecto.

    La clave no viene en la peticion: la genera el servidor a partir de la
    etiqueta, de modo que las tareas siempre la referencian por un valor
    inmutable.
    """

    label: str = Field(min_length=1, max_length=60)
    color: str | None = None
    """Uno de la paleta, o None para dejar el estado sin color."""
    progress: int = Field(default=0, ge=0, le=100)

    @field_validator("color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _check_palette_color(value)


class TaskStatusUpdate(BaseModel):
    """Modificacion parcial de un estado. La clave no se edita nunca."""

    label: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)

    @field_validator("color")
    @classmethod
    def _known_color(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _check_palette_color(value)

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class TaskStatusOut(BaseModel):
    """Estado de un proyecto, con el numero de tareas que lo usan."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    key: str
    label: str
    color: str | None = None
    progress: int
    order_index: int
    task_count: int = 0


class TaskStatusOrder(BaseModel):
    """Nuevo orden de los estados del proyecto: la lista es el orden nuevo."""

    ids: list[int] = Field(min_length=1)


class TimeEntryCreate(BaseModel):
    """Imputacion de horas reales: el dia en que se trabajo y las horas.

    La tarea sale de la ruta y la persona es quien registra: no vienen en el
    cuerpo.
    """

    work_date: date
    hours: Decimal = Field(ge=0, max_digits=8, decimal_places=2)
    note: str | None = Field(default=None, max_length=4000)


class TimeEntryUpdate(BaseModel):
    """Correccion de una imputacion. Solo se aplican los campos presentes."""

    work_date: date | None = None
    hours: Decimal | None = Field(default=None, ge=0, max_digits=8, decimal_places=2)
    note: str | None = Field(default=None, max_length=4000)

    def changed_fields(self) -> set[str]:
        """Nombres de los campos presentes en la peticion."""
        return self.model_fields_set


class TimeEntryOut(BaseModel):
    """Imputacion de horas reales, con quien la registro."""

    id: int
    task_id: int
    user_id: int
    user_name: str
    work_date: date
    hours: Hours
    note: str | None = None
    created_at: datetime
    """Momento de la imputacion, en UTC y con zona."""


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
