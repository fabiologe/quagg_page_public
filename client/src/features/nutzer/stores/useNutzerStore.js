import { defineStore } from 'pinia'
import { ref } from 'vue'
import { nutzerApi, fehlerText } from '../services/nutzerApi'

/** Admin-Nutzerverwaltung: Liste + die vier Aktionen, Fehler lesbar im Store. */
export const useNutzerStore = defineStore('nutzer', () => {
  const nutzer = ref([])
  const laedt = ref(false)
  const fehler = ref('')

  function _ersetze(neu) {
    const i = nutzer.value.findIndex(n => n.id === neu.id)
    if (i >= 0) nutzer.value[i] = neu
    else nutzer.value = [...nutzer.value, neu].sort((a, b) => a.username.localeCompare(b.username))
  }

  async function laden() {
    laedt.value = true
    fehler.value = ''
    try {
      nutzer.value = await nutzerApi.liste()
    } catch (err) {
      fehler.value = fehlerText(err, 'Nutzerliste konnte nicht geladen werden.')
    } finally {
      laedt.value = false
    }
  }

  async function anlegen(payload) {
    const neu = await nutzerApi.anlegen(payload)
    _ersetze(neu)
    return neu
  }

  async function aendern(id, payload) {
    const neu = await nutzerApi.aendern(id, payload)
    _ersetze(neu)
    return neu
  }

  async function passwortReset(id, neuesPasswort) {
    const neu = await nutzerApi.passwortReset(id, neuesPasswort)
    _ersetze(neu)
    return neu
  }

  return { nutzer, laedt, fehler, laden, anlegen, aendern, passwortReset }
})
