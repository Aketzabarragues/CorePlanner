const API_BASE = '/api'

let refreshSession = null

/**
 * Registra la funcion que renueva la sesion.
 *
 * Cuando el servidor responde 401, por ejemplo porque el token guardado
 * ya no vale, se renueva la sesion y se repite la peticion una vez.
 */
export function setSessionRefresher(refresher) {
  refreshSession = refresher
}

function extractErrorDetail(payload, status) {
  const detail = payload?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null
    return field ? `${field}: ${first.msg}` : first.msg
  }
  return `Error ${status}`
}

export async function apiFetch(path, { token, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (response.status === 401 && refreshSession && path !== '/auth/login') {
    const fresh = await refreshSession()
    if (fresh) return apiFetch(path, { ...options, token: fresh })
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(extractErrorDetail(payload, response.status))
  }
  return response.status === 204 ? null : response.json()
}

export const authApi = {
  login: (email, password) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
}

export const projectsApi = {
  list: (token) => apiFetch('/projects', { token }),
  gantt: (token, projectId) => apiFetch(`/projects/${projectId}/gantt`, { token }),
  kanban: (token, projectId) => apiFetch(`/projects/${projectId}/kanban`, { token }),
  capacity: (token, projectId, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/projects/${projectId}/capacity${query ? `?${query}` : ''}`, { token })
  },
  members: (token, projectId) => apiFetch(`/projects/${projectId}/members`, { token }),
  tasks: (token, projectId, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/projects/${projectId}/tasks${query ? `?${query}` : ''}`, { token })
  },
}

export const departmentsApi = {
  list: (token) => apiFetch('/departments', { token }),
}

/** Ambito de la persona que entra: rol, departamento y proyectos editables. */
export const meApi = {
  get: (token) => apiFetch('/me', { token }),
}

/** Configuracion de la organizacion, reservada al gerente. */
export const configApi = {
  people: (token) => apiFetch('/users', { token }),
  createPerson: (token, person) =>
    apiFetch('/users', {
      method: 'POST',
      token,
      body: JSON.stringify(person),
    }),
  updatePerson: (token, id, changes) =>
    apiFetch(`/users/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(changes),
    }),

  companyRoles: (token) => apiFetch('/roles', { token }),
  projectRoles: (token) => apiFetch('/roles/project', { token }),

  createDepartment: (token, department) =>
    apiFetch('/departments', {
      method: 'POST',
      token,
      body: JSON.stringify(department),
    }),
  updateDepartment: (token, id, changes) =>
    apiFetch(`/departments/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(changes),
    }),

  createProject: (token, project) =>
    apiFetch('/projects', {
      method: 'POST',
      token,
      body: JSON.stringify(project),
    }),
  updateProject: (token, id, changes) =>
    apiFetch(`/projects/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(changes),
    }),

  addMember: (token, projectId, member) =>
    apiFetch(`/projects/${projectId}/members`, {
      method: 'POST',
      token,
      body: JSON.stringify(member),
    }),
  removeMember: (token, projectId, userId) =>
    apiFetch(`/projects/${projectId}/members/${userId}`, { method: 'DELETE', token }),
}

/** Endpoints de la vista global, que no pertenecen a ningun proyecto. */
export const overviewApi = {
  capacity: (token, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/capacity${query ? `?${query}` : ''}`, { token })
  },
  gantt: (token) => apiFetch('/gantt', { token }),
}
export const tasksApi = {
  list: (token, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/tasks${query ? `?${query}` : ''}`, { token })
  },
  create: (token, projectId, task) =>
    apiFetch(`/projects/${projectId}/tasks`, {
      method: 'POST',
      token,
      body: JSON.stringify(task),
    }),
  update: (token, taskId, changes) =>
    apiFetch(`/tasks/${taskId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(changes),
    }),
  remove: (token, taskId) =>
    apiFetch(`/tasks/${taskId}`, { method: 'DELETE', token }),
}
