<script setup>
/**
 * Raiz de la aplicacion.
 *
 * Las vistas publicas, como el acceso, se dibujan sin armazon. El resto
 * cuelga del shell, que aporta la barra superior y las pestanas.
 */
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

import AppShell from './components/AppShell.vue'

const route = useRoute()

const isPublic = computed(() => route.meta.public === true)
</script>

<template>
  <RouterView v-if="isPublic" />
  <AppShell v-else />
</template>
