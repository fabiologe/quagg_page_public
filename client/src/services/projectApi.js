import api from './api'

export const projectApi = {
  /**
   * Holt alle existierenden Projekt-Ordner-Namen aus der StorageBox.
   * Gut für Dropdowns und Autocompletes.
   * @returns Promise
   */
  getAllIds() {
    return api.get('/projects/all_ids')
  }
}
