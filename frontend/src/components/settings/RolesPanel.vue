<script setup>
/**
 * Catalogo de roles.
 *
 * Los roles de empresa son cerrados y dicen hasta donde llega el ambito de
 * cada persona. Los roles de proyecto llevan los permisos que se pueden usar
 * dentro de el.
 */
const props = defineProps({
  companyRoles: { type: Array, required: true },
  projectRoles: { type: Array, required: true },
})
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
      <header class="border-b border-borde-suave px-4 py-3">
        <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Roles de empresa</h2>
      </header>
      <ul class="space-y-2 p-4">
        <li
          v-for="role in props.companyRoles"
          :key="role.value"
          class="rounded-control border border-borde bg-tarjeta-suave p-3"
        >
          <p class="text-cp-sm font-medium text-texto">{{ role.label }}</p>
          <p class="mt-0.5 text-cp-xs text-texto-suave">{{ role.scope }}</p>
        </li>
      </ul>
    </section>

    <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
      <header class="border-b border-borde-suave px-4 py-3">
        <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Roles de proyecto</h2>
      </header>
      <ul class="space-y-2 p-4">
        <li
          v-for="role in props.projectRoles"
          :key="role.id"
          class="rounded-control border border-borde bg-tarjeta-suave p-3"
        >
          <p class="text-cp-sm font-medium text-texto">{{ role.name }}</p>
          <p class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="permission in role.permissions"
              :key="permission"
              class="rounded-pastilla bg-tarjeta px-2 py-0.5 text-cp-xs text-texto-suave"
            >
              {{ permission }}
            </span>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
