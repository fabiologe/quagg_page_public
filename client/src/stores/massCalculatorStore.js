import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useMassCalculatorStore = defineStore('massCalculator', () => {
    const mode = ref('excavation') // 'excavation', 'trench', 'pyramid'

    // State
    const inputs = ref({
        l2: null,
        b2: null,
        h: null,
        n: 1.0,
        a2: null,
        a1: null // Calculated in pyramid mode
    })

    const result = ref(null)

    // Actions
    const setMode = (newMode) => {
        mode.value = newMode
        reset()

        // Set default defaults based on mode
        if (newMode === 'trench') {
            inputs.value.n = 0
        } else if (newMode === 'excavation') {
            inputs.value.n = 1.0
        } else if (newMode === 'pyramid') {
            inputs.value.n = 1.0
        }
    }

    const reset = () => {
        inputs.value = {
            l2: null,
            b2: null,
            h: null,
            n: mode.value === 'trench' ? 0 : 1.0,
            a2: null,
            a1: null
        }
        result.value = null
    }

    const calculate = () => {
        const { l2, b2, h, n, a2 } = inputs.value

        if (mode.value === 'pyramid') {
            if (!a2 || !h) return

            // Pyramid Mode (Area based)
            // Assume square base for geometry derivation
            const L2 = Math.sqrt(a2)
            const B2 = L2

            const L1 = L2 + 2 * n * h
            const B1 = B2 + 2 * n * h

            const A1 = L1 * B1
            inputs.value.a1 = Math.round(A1 * 100) / 100 // Update displayed A1

            const V = (h / 3) * (A1 + a2 + Math.sqrt(A1 * a2))

            result.value = {
                volume: V,
                l1: L1,
                b1: B1,
                l2: L2,
                b2: B2,
                h: h,
                areaTop: A1,
                areaBottom: a2
            }

        } else {
            // Excavation & Trench Mode (Dimension based)
            if (!l2 || !b2 || !h) return

            const L2 = l2
            const B2 = b2
            const H = h
            const N = n

            const L1 = L2 + 2 * N * H
            const B1 = B2 + 2 * N * H

            const A2 = L2 * B2
            const A1 = L1 * B1

            const L_mid = (L1 + L2) / 2
            const B_mid = (B1 + B2) / 2
            const A_mid = L_mid * B_mid

            const V = (H / 6) * (A1 + A2 + 4 * A_mid)

            // Wall Area
            const s = Math.sqrt(1 + N * N) * H
            const Area_B = (B1 + B2) / 2 * s
            const Area_L = (L1 + L2) / 2 * s
            const WallArea = 2 * Area_B + 2 * Area_L

            result.value = {
                volume: V,
                areaBottom: A2,
                areaTop: A1,
                wallArea: WallArea,
                l1: L1,
                b1: B1,
                l2: L2,
                b2: B2,
                h: H
            }
        }
    }

    // Watcher-like logic for Pyramid A1 preview could be a computed or action
    // For now, we'll let the component handle the live preview or just calculate on button click.
    // Actually, the previous implementation had a live preview of A1.
    // Let's add a computed for previewA1
    const previewA1 = computed(() => {
        if (mode.value === 'pyramid' && inputs.value.a2 && inputs.value.h) {
            const L2 = Math.sqrt(inputs.value.a2)
            const L1 = L2 + 2 * inputs.value.n * inputs.value.h
            return Math.round(L1 * L1 * 100) / 100
        }
        return null
    })

    return {
        mode,
        inputs,
        result,
        previewA1,
        setMode,
        reset,
        calculate
    }
})
