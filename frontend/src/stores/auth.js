import { defineStore } from 'pinia'
import { ref } from 'vue'

import { authApi } from '../api/client'

const DEMO_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'coreplanner',
}

const SIGNED_OUT_KEY = 'coreplanner_signed_out'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('coreplanner_token') ?? null)
  const user = ref(JSON.parse(localStorage.getItem('coreplanner_user') ?? 'null'))
  const signedOut = ref(localStorage.getItem(SIGNED_OUT_KEY) === '1')

  function setSession(accessToken, profile) {
    token.value = accessToken
    user.value = profile
    signedOut.value = false
    localStorage.setItem('coreplanner_token', accessToken)
    localStorage.setItem('coreplanner_user', JSON.stringify(profile))
    localStorage.removeItem(SIGNED_OUT_KEY)
  }

  function clear() {
    token.value = null
    user.value = null
    localStorage.removeItem('coreplanner_token')
    localStorage.removeItem('coreplanner_user')
  }

  /** Cierra la sesion y evita que el acceso automatico la reponga. */
  function signOut() {
    clear()
    signedOut.value = true
    localStorage.setItem(SIGNED_OUT_KEY, '1')
  }

  /**
   * Devuelve el token de sesion, iniciando una si no la hay.
   *
   * La aplicacion arranca con el administrador de demostracion, de modo que
   * al abrir cualquiera de sus vistas haya datos que ver. Si el usuario ha
   * cerrado la sesion, no se entra automaticamente.
   */
  async function ensureSession() {
    if (token.value) return token.value
    if (signedOut.value) throw new Error('La sesion esta cerrada')
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
    if (signedOut.value) throw new Error('La sesion esta cerrada')
    clear()
    const data = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    setSession(data.access_token, data.user)
    return data.access_token
  }

  return { token, user, signedOut, setSession, clear, signOut, ensureSession, refresh }
})
