<script setup>
/**
 * Formulario de acceso.
 *
 * Si ya hay una sesion guardada en el navegador, la vista no se muestra: se
 * entra directamente a la aplicacion. Es el acceso automatico de desarrollo.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { authApi } from '../api/client'
import { useAuthStore } from '../stores/auth'

const email = ref('')
const password = ref('')
const error = ref(null)
const pending = ref(false)

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

/** Destino tras entrar: el que dejo el guard al saltar a la vista privada. */
function destination() {
  const next = route.query.next
  return typeof next === 'string' && next.startsWith('/') ? next : '/'
}

async function submit() {
  error.value = null
  pending.value = true
  try {
    const data = await authApi.login(email.value, password.value)
    auth.setSession(data.access_token, data.user)
    router.push(destination())
  } catch (err) {
    error.value = err.message
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  if (auth.token) router.replace('/')
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center p-6">
    <form
      class="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      @submit.prevent="submit"
    >
      <h1 class="text-xl font-semibold text-siemens-900">CorePlanner</h1>
      <p class="text-sm text-slate-500">Acceso al gestor de capacidad.</p>

      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="username"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">Contrasena</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {{ pending ? 'Entrando...' : 'Entrar' }}
      </button>
    </form>
  </main>
</template>
