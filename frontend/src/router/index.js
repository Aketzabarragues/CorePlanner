import { createRouter, createWebHistory } from 'vue-router'

import CapacityMatrix from '../components/CapacityMatrix.vue'
import GanttView from '../views/GanttView.vue'
import LoginView from '../views/LoginView.vue'
import ProjectsView from '../views/ProjectsView.vue'

const routes = [
  { path: '/', name: 'capacity-matrix', component: CapacityMatrix },
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/projects', name: 'projects', component: ProjectsView },
  { path: '/projects/:id/gantt', name: 'gantt', component: GanttView, props: true },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
