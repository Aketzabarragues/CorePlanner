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
import AlertBanner from '../components/common/AlertBanner.vue'
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
      class="w-full max-w-sm space-y-4 rounded-tarjeta border border-borde bg-tarjeta p-6 shadow-tarjeta"
      @submit.prevent="submit"
    >
      <h1 class="text-cp-titulo font-semibold text-primario-fuerte">CorePlanner</h1>
      <p class="text-cp-sm text-texto-tenue">Acceso al gestor de capacidad.</p>

      <label class="block">
        <span class="text-cp-sm font-medium text-texto">Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="username"
          class="mt-1 w-full min-h-10 rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        />
      </label>

      <label class="block">
        <span class="text-cp-sm font-medium text-texto">Contraseña</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="mt-1 w-full min-h-10 rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        />
      </label>

      <AlertBanner v-if="error" variant="error">
        {{ error }}
      </AlertBanner>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded-control bg-primario-fuerte px-3 py-2 text-cp-sm font-medium text-sobre-primario shadow-primaria disabled:opacity-60"
      >
        {{ pending ? 'Entrando...' : 'Entrar' }}
      </button>
    </form>
  </main>
</template>
