/**
 * Guardas del router.
 *
 * Se separan del fichero del router para poder probarlas sin levantar una
 * aplicacion entera: cada guarda recibe sus dependencias por parametro.
 */
import { meApi } from '../api/client'
import { useAuthStore } from '../stores/auth'

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
 * Lleva a la vista de entrada de cada rol.
 *
 * El tecnico entra por Mi trabajo, que es lo suyo; el gerente y el jefe de
 * departamento entran por el Panel, que es la foto de la organizacion.
 */
export async function redirectByRole() {
  const auth = useAuthStore()
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    const rol = scope?.user?.company_role
    return rol === 'tecnico' ? { name: 'my-work' } : { name: 'panel' }
  } catch {
    return { name: 'login' }
  }
}

/**
 * Redirige una ruta de proyecto a la vista global con el filtro puesto.
 *
 * El proyecto paso de ser un espacio a ser un filtro, de modo que las rutas
 * antiguas se quedan con una redireccion para no romper los enlaces.
 */
export function conFiltroDeProyecto(name) {
  return (to) => ({ name, query: { project: to.params.id } })
}
