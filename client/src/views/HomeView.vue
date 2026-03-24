<template>
  <PublicLayout>
    <div class="home-view">
      <HomeHero @scrollToServices="scrollToServices" />
      <MethodologyComponent id="methodology" />
      <HomeServices id="services" />
      <InteractiveCaseStudy />
      <HomeProjects />
    </div>
  </PublicLayout>
</template>

<script setup>
import PublicLayout from '@/components/layout/PublicLayout.vue'
import HomeHero from '@/views/public/components/HomeHero.vue'
import MethodologyComponent from '@/views/public/components/MethodologyComponent.vue'
import HomeServices from '@/views/public/components/HomeServices.vue'
import InteractiveCaseStudy from '@/views/public/components/InteractiveCaseStudy.vue'
import HomeProjects from '@/views/public/components/HomeProjects.vue'

function scrollToServices() {
  document.getElementById('methodology').scrollIntoView({ behavior: 'smooth' })
}
</script>

<style scoped>
.home-view {
  width: 100%;
  overflow-x: hidden;
}
</style>