import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { setSessionRefresher } from './api/client'
import './assets/main.css'
import router from './router'
// Se importa el ultimo para que sus reglas ganen a las de la libreria de
// Gantt, que se compilan con su propio codigo.
import './assets/gantt.css'
import { useAuthStore } from './stores/auth'

const app = createApp(App).use(createPinia()).use(router)

// Si el token guardado ya no vale, se renueva la sesion y se repite la
// peticion que habia fallado.
setSessionRefresher(() => useAuthStore().refresh())

app.mount('#app')
