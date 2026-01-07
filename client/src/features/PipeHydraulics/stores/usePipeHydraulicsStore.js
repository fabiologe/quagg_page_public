import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useHydraulicMath } from '../composables/useHydraulicMath'

export const usePipeHydraulicsStore = defineStore('pipe-hydraulics', () => {
    const { calculateCircular, calculateRectangular, calculateEgg } = useHydraulicMath()

    // State
    const profileType = ref('circular') // 'circular', 'egg', 'rectangular'

    // Geometry definitions
    // Circular
    const diameter = ref(1.0) // m

    // Rectangular / Egg
    const width = ref(1.0) // m
    const height = ref(1.5) // m

    // Hydraulic parameters
    const slope = ref(1.0) // % (input usually in %, calculation usually in m/m or needs conversion)
    // Let's assume input is standard Slope I in promille or percent?
    // User prompt said "Manning-Strickler (v=kst * rh^(2/3) * I^(1/2))"
    // Usually I is unitless (m/m). Input of 1% = 0.01.

    const roughness = ref(70) // kSt

    // State Variable
    const fillingHeight = ref(0.5) // m

    // Actions / Computeds
    const results = computed(() => {
        // Slope conversion: if user inputs %, divide by 100.
        // If user inputs permille, divide by 1000.
        // Let's assume user inputs % for now (common in field). 
        const I = slope.value / 100

        // Safety
        if (fillingHeight.value < 0) return null

        switch (profileType.value) {
            case 'circular':
                return calculateCircular(diameter.value, fillingHeight.value, roughness.value, I)
            case 'rectangular':
                return calculateRectangular(width.value, height.value, fillingHeight.value, roughness.value, I)
            case 'egg':
                return calculateEgg(width.value, height.value, fillingHeight.value, roughness.value, I)
            default:
                return null
        }
    })

    // Watch for profile changes to set defaults or clamp height
    watch(profileType, (newType) => {
        // Logic to adjust fillingHeight if out of bounds?
        // Optional.
    })

    // Persist (Basic implementation) - could use pinia-plugin-persistedstate if available, 
    // but let's do manual for simplicity as per requirements "Pinia Store or LocalStorage"
    const loadState = () => {
        const saved = localStorage.getItem('pipe-hydraulics-state')
        if (saved) {
            const p = JSON.parse(saved)
            if (p.profileType) profileType.value = p.profileType
            if (p.diameter) diameter.value = p.diameter
            if (p.width) width.value = p.width
            if (p.height) height.value = p.height
            if (p.slope) slope.value = p.slope
            if (p.roughness) roughness.value = p.roughness
            if (p.fillingHeight) fillingHeight.value = p.fillingHeight
        }
    }

    const saveState = () => {
        const state = {
            profileType: profileType.value,
            diameter: diameter.value,
            width: width.value,
            height: height.value,
            slope: slope.value,
            roughness: roughness.value,
            fillingHeight: fillingHeight.value
        }
        localStorage.setItem('pipe-hydraulics-state', JSON.stringify(state))
    }

    // Watch all state to save
    watch([profileType, diameter, width, height, slope, roughness, fillingHeight], () => {
        saveState()
    })

    // Reset function
    const reset = () => {
        profileType.value = 'circular'
        diameter.value = 1.0
        width.value = 1.0
        height.value = 1.5
        slope.value = 1.0
        roughness.value = 70
        fillingHeight.value = 0.5
    }

    // Initialize
    loadState()

    return {
        profileType,
        diameter,
        width,
        height,
        slope,
        roughness,
        fillingHeight,
        results,
        reset
    }
})
