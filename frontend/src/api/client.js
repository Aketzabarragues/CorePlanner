const API_BASE = '/api'

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
  capacity: (token, projectId, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return apiFetch(`/projects/${projectId}/capacity${query ? `?${query}` : ''}`, { token })
  },
}
