const API_BASE = '/api'

export async function apiFetch(path, { token, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail ?? `Error ${response.status}`)
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
  capacity: (token, projectId, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/projects/${projectId}/capacity${query ? `?${query}` : ''}`, { token })
  },
}
