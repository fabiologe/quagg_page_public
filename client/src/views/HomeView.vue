<template>
  <PublicLayout>
    <div class="home-view">
      <HomeHero @scrollToServices="scrollToServices" />
      <HomeServices id="services" />
      <HomeProjects />
      <HomePartners />
      <HomePhilosophy />
    </div>
  </PublicLayout>
</template>

<script setup>
import PublicLayout from '@/components/layout/PublicLayout.vue'
import HomeHero from '@/views/public/components/HomeHero.vue'
import HomeServices from '@/views/public/components/HomeServices.vue'
import HomeProjects from '@/views/public/components/HomeProjects.vue'
import HomePartners from '@/views/public/components/HomePartners.vue'
import HomePhilosophy from '@/views/public/components/HomePhilosophy.vue'

function scrollToServices() {
  document.getElementById('services').scrollIntoView({ behavior: 'smooth' })
}
</script>

<style scoped>
.home-view {
  width: 100%;
  overflow-x: hidden;
}
</style>