import { createRouter, createWebHistory } from 'vue-router'

import CapacityMatrix from '../components/CapacityMatrix.vue'
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
import WorkCalendarView from '../views/WorkCalendarView.vue'
import { redirectToFirstProject, requireSession } from './guards'

/** Pantalla de espera mientras la raiz decide a que vista llevar. */
const Redirecting = { name: 'Redirecting', render: () => null }

const routes = [
  {
    path: '/',
    name: 'home',
    component: Redirecting,
    beforeEnter: redirectToFirstProject,
  },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },

  // Espacio global: la organizacion entera, sin proyecto en la URL.
  { path: '/panel', name: 'panel', component: PanelView },
  { path: '/my-work', name: 'my-work', component: MyWorkView },
  { path: '/projects', name: 'projects', component: ProjectsView },
  { path: '/capacity', name: 'global-capacity', component: CapacityMatrix },
  { path: '/gantt', name: 'global-gantt', component: GanttView },
  { path: '/calendar', name: 'global-calendar', component: CalendarView },
  { path: '/work-calendar', name: 'work-calendar', component: WorkCalendarView },
  { path: '/departments', name: 'departments', component: DepartmentsView },
  { path: '/people', name: 'people', component: PeopleView },
  { path: '/configuration', name: 'configuration', component: SettingsView },

  // Espacio de proyecto: todo lo que cuelga de un identificador.
  {
    path: '/projects/:id',
    name: 'project',
    component: ProjectSummaryView,
    props: true,
  },
  {
    path: '/projects/:id/capacity',
    name: 'capacity',
    component: CapacityMatrix,
    props: true,
  },
  { path: '/projects/:id/gantt', name: 'gantt', component: GanttView, props: true },
  {
    path: '/projects/:id/calendar',
    name: 'calendar',
    component: CalendarView,
    props: true,
  },
  { path: '/projects/:id/kanban', name: 'kanban', component: KanbanView, props: true },
  { path: '/projects/:id/members', name: 'members', component: MembersView, props: true },
  {
    path: '/projects/:id/settings',
    name: 'settings',
    component: ProjectSettingsView,
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(requireSession)

export default router
