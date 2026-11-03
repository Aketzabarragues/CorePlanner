import { createRouter, createWebHistory } from 'vue-router'

import CapacityMatrix from '../components/CapacityMatrix.vue'
import GanttView from '../views/GanttView.vue'
import KanbanView from '../views/KanbanView.vue'
import LoginView from '../views/LoginView.vue'
import ProjectsView from '../views/ProjectsView.vue'
import { redirectToFirstProject, requireSession } from './guards'

/** Pantalla de espera mientras la raiz decide a que proyecto llevar. */
const Redirecting = { name: 'Redirecting', render: () => null }

const routes = [
  {
    path: '/',
    name: 'home',
    component: Redirecting,
    beforeEnter: redirectToFirstProject,
  },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/projects', name: 'projects', component: ProjectsView },
  {
    path: '/projects/:id',
    name: 'project',
    redirect: (to) => ({ name: 'capacity', params: { id: to.params.id } }),
  },
  {
    path: '/projects/:id/capacity',
    name: 'capacity',
    component: CapacityMatrix,
    props: true,
  },
  { path: '/projects/:id/gantt', name: 'gantt', component: GanttView, props: true },
  { path: '/projects/:id/kanban', name: 'kanban', component: KanbanView, props: true },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(requireSession)

export default router
