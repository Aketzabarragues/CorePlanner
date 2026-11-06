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
  <section class="space-y-6">
    <div class="rounded border border-slate-200 bg-white p-4">
      <h3 class="mb-3 text-sm font-semibold text-siemens-900">Roles de empresa</h3>
      <ul class="space-y-2">
        <li
          v-for="role in props.companyRoles"
          :key="role.value"
          class="rounded border border-slate-100 p-3"
        >
          <p class="text-sm font-medium text-siemens-900">{{ role.label }}</p>
          <p class="text-xs text-slate-500">{{ role.scope }}</p>
        </li>
      </ul>
    </div>

    <div class="rounded border border-slate-200 bg-white p-4">
      <h3 class="mb-3 text-sm font-semibold text-siemens-900">Roles de proyecto</h3>
      <ul class="space-y-2">
        <li
          v-for="role in props.projectRoles"
          :key="role.id"
          class="rounded border border-slate-100 p-3"
        >
          <p class="text-sm font-medium text-siemens-900">{{ role.name }}</p>
          <p class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="permission in role.permissions"
              :key="permission"
              class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
            >
              {{ permission }}
            </span>
          </p>
        </li>
      </ul>
    </div>
  </section>
</template>
