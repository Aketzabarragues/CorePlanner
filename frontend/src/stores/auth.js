import { defineStore } from 'pinia'
import { ref } from 'vue'

import { authApi } from '../api/client'

const DEMO_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'coreplanner',
}

const SIGNED_OUT_KEY = 'coreplanner_signed_out'

/**
 * Indica si el acceso automatico de demostracion esta permitido.
 *
 * La bandera `VITE_DEMO_AUTO_LOGIN` manda si esta puesta: `true` lo activa y
 * `false` lo desactiva. Sin bandera, solo se activa en desarrollo, de modo
 * que en una compilacion de produccion queda apagado: ahi cada persona entra
 * con sus credenciales y nadie hereda la sesion del administrador.
 */
export function demoAutoLoginEnabled() {
  const flag = import.meta.env.VITE_DEMO_AUTO_LOGIN
  if (flag === 'true') return true
  if (flag === 'false') return false
  return import.meta.env.DEV === true
}

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
   * En desarrollo, si no hay token, se entra con el administrador de
   * demostracion, de modo que al abrir cualquiera de sus vistas haya datos
   * que ver. Si el usuario ha cerrado la sesion, no se entra automaticamente.
   */
  async function ensureSession() {
    if (token.value) return token.value
    if (signedOut.value) throw new Error('La sesión está cerrada')
    if (!demoAutoLoginEnabled()) throw new Error('No hay ninguna sesión iniciada')
    const data = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    setSession(data.access_token, data.user)
    return data.access_token
  }

  /**
   * Renueva la sesion con el administrador de demostracion.
   *
   * Se usa cuando el servidor responde 401, por ejemplo si el token
   * guardado en el navegador ya no vale. Si el acceso automatico esta
   * apagado, no hay nada que renovar: se devuelve null y la peticion falla
   * con su propio 401, que es lo que debe pasar.
   */
  async function refresh() {
    if (signedOut.value) throw new Error('La sesión está cerrada')
    if (!demoAutoLoginEnabled()) return null
    clear()
    const data = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    setSession(data.access_token, data.user)
    return data.access_token
  }

  return { token, user, signedOut, setSession, clear, signOut, ensureSession, refresh }
})
