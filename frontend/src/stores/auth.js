import { defineStore } from 'pinia'
import { ref } from 'vue'

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

  return { token, user, setSession, clear }
})
