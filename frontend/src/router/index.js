import { createRouter, createWebHistory } from 'vue-router'

import CapacityMatrix from '../components/CapacityMatrix.vue'
import ActivityView from '../views/ActivityView.vue'
import CalendarView from '../views/CalendarView.vue'
import DepartmentsView from '../views/DepartmentsView.vue'
import GanttView from '../views/GanttView.vue'
import KanbanView from '../views/KanbanView.vue'
import LoginView from '../views/LoginView.vue'
import MembersView from '../views/MembersView.vue'
import MyWorkView from '../views/MyWorkView.vue'
import PanelView from '../views/PanelView.vue'
import PeopleView from '../views/PeopleView.vue'
import ProjectSettingsView from '../views/ProjectSettingsView.vue'
import ProjectSummaryView from '../views/ProjectSummaryView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TaskListView from '../views/TaskListView.vue'
import { conFiltroDeProyecto, redirectByRole, requireSession } from './guards'

/** Pantalla de espera mientras la raiz decide a que vista llevar. */
const Redirecting = { name: 'Redirecting', render: () => null }

const routes = [
  {
    path: '/',
    name: 'home',
    component: Redirecting,
    beforeEnter: redirectByRole,
  },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },

  // Vistas de la organizacion.
  { path: '/panel', name: 'panel', component: PanelView },
  { path: '/my-work', name: 'my-work', component: MyWorkView },
  { path: '/projects', name: 'projects', component: ProjectsView },
  { path: '/capacity', name: 'capacity', component: CapacityMatrix },
  { path: '/gantt', name: 'gantt', component: GanttView },
  { path: '/calendar', name: 'calendar', component: CalendarView },
  { path: '/activity', name: 'activity', component: ActivityView },
  { path: '/departments', name: 'departments', component: DepartmentsView },
  { path: '/people', name: 'people', component: PeopleView },
  { path: '/configuration', name: 'configuration', component: SettingsView },
  // El calendario laboral vive en Configuracion: esta ruta lleva allí.
  {
    path: '/work-calendar',
    name: 'work-calendar',
    redirect: { name: 'configuration', query: { tab: 'calendar' } },
  },

  // Pagina del proyecto y sus pestanas.
  {
    path: '/projects/:id',
    name: 'project',
    component: ProjectSummaryView,
    props: true,
  },
  { path: '/projects/:id/kanban', name: 'kanban', component: KanbanView, props: true },
  {
    path: '/projects/:id/tasks',
    name: 'task-list',
    component: TaskListView,
    props: true,
  },
  { path: '/projects/:id/members', name: 'members', component: MembersView, props: true },
  {
    path: '/projects/:id/settings',
    name: 'project-settings',
    component: ProjectSettingsView,
    props: true,
  },

  // Rutas antiguas: el proyecto era un espacio y ahora es un filtro.
  {
    path: '/projects/:id/capacity',
    redirect: conFiltroDeProyecto('capacity'),
  },
  {
    path: '/projects/:id/gantt',
    redirect: conFiltroDeProyecto('gantt'),
  },
  {
    path: '/projects/:id/calendar',
    redirect: conFiltroDeProyecto('calendar'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(requireSession)

export default router
