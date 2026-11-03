import { defineStore } from 'pinia'
import { ref } from 'vue'

import { authApi } from '../api/client'

const DEMO_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'coreplanner',
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('coreplanner_token') ?? null)
  const user = ref(JSON.parse(localStorage.getItem('coreplanner_user') ?? 'null'))

  function setSession(accessToken, profile) {
    token.value = accessToken
    user.value = profile
    localStorage.setItem('coreplanner_token', accessToken)
    localStorage.setItem('coreplanner_user', JSON.stringify(profile))
  }

  function clear() {
    token.value = null
    user.value = null
    localStorage.removeItem('coreplanner_token')
    localStorage.removeItem('coreplanner_user')
  }

  /**
   * Devuelve el token de sesion, iniciando una si no la hay.
   *
   * La aplicacion arranca con el administrador de demostracion, de modo
   * que al abrir cualquiera de sus vistas haya datos que ver.
   */
  async function ensureSession() {
    if (token.value) return token.value
    const data = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    setSession(data.access_token, data.user)
    return data.access_token
  }

  /**
   * Renueva la sesion con el administrador de demostracion.
   *
   * Se usa cuando el servidor responde 401, por ejemplo si el token
   * guardado en el navegador ya no vale.
   */
  async function refresh() {
    clear()
    const data = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    setSession(data.access_token, data.user)
    return data.access_token
  }

  return { token, user, setSession, clear, ensureSession, refresh }
})
