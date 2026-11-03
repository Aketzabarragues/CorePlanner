/**
 * Guardas del router.
 *
 * Se separan del fichero del router para poder probarlas sin levantar una
 * aplicacion entera: cada guarda recibe sus dependencias por parametro.
 */
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'

/**
 * Obliga a tener sesion antes de entrar en una vista privada.
 *
 * Si la sesion no se puede establecer, lleva al formulario de acceso
 * recordando a donde se queria ir.
 */
export async function requireSession(to) {
  if (to.meta?.public) return true
  const auth = useAuthStore()
  try {
    await auth.ensureSession()
    return true
  } catch {
    return { name: 'login', query: { next: to.fullPath } }
  }
}

/**
 * Lleva a la matriz del primer proyecto disponible.
 *
 * Es la redireccion de la raiz: en lugar de dejar una pantalla vacia, la
 * aplicacion abre el primer proyecto al que tiene acceso el usuario.
 */
export async function redirectToFirstProject() {
  const auth = useAuthStore()
  const store = useProjectsStore()
  try {
    const token = await auth.ensureSession()
    const projects = await store.ensureProjects(token)
    if (!projects.length) return { name: 'projects' }
    return { name: 'capacity', params: { id: String(projects[0].id) } }
  } catch {
    return { name: 'projects' }
  }
}
