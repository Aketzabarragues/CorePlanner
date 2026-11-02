import { createRouter, createWebHistory } from 'vue-router'

import CapacityView from '../views/CapacityView.vue'
import GanttView from '../views/GanttView.vue'
import LoginView from '../views/LoginView.vue'
import ProjectsView from '../views/ProjectsView.vue'

const routes = [
  { path: '/', redirect: '/projects' },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/projects', name: 'projects', component: ProjectsView },
  { path: '/projects/:id/capacity', name: 'capacity', component: CapacityView, props: true },
  { path: '/projects/:id/gantt', name: 'gantt', component: GanttView, props: true },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
