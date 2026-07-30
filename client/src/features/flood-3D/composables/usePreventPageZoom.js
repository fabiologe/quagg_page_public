// Browser-Seitenzoom im Werkzeug unterbinden: Trackpad-Pinch wird als
// Strg+Rad geliefert und würde die ganze Oberfläche skalieren statt der
// 3D-Szene. Solange ein flood-3D-Viewer gemountet ist, gehen Strg+Rad,
// Strg+±/0 und Safari-Gesten NICHT mehr an den Browser — das Zoomen der
// Szene (Rad über dem Canvas) bleibt unberührt.
import { onBeforeUnmount, onMounted } from 'vue'

export function usePreventPageZoom() {
  const wheelGuard = (e) => {
    if (e.ctrlKey) e.preventDefault()
  }
  const keyGuard = (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
      e.preventDefault()
    }
  }
  const gestureGuard = (e) => e.preventDefault()

  onMounted(() => {
    window.addEventListener('wheel', wheelGuard, { passive: false })
    window.addEventListener('keydown', keyGuard)
    window.addEventListener('gesturestart', gestureGuard)
    window.addEventListener('gesturechange', gestureGuard)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('wheel', wheelGuard)
    window.removeEventListener('keydown', keyGuard)
    window.removeEventListener('gesturestart', gestureGuard)
    window.removeEventListener('gesturechange', gestureGuard)
  })
}
