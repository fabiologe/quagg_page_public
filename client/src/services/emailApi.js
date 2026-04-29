import api from './api'

export const emailApi = {
  /**
   * Holt alle E-Mails aus der globalen Inbox (nicht zugewiesen)
   * @param {number} skip 
   * @param {number} limit 
   * @returns Promise
   */
  getUnassigned(skip = 0, limit = 100) {
    return api.get('/emails/unassigned', { params: { skip, limit } })
  },

  /**
   * Weist eine E-Mail einem Projekt zu
   * @param {number} emailId 
   * @param {string} projectId 
   * @returns Promise
   */
  assignToProject(emailId, projectId) {
    return api.patch(`/emails/${emailId}/assign`, { project_folder_name: projectId })
  },

  /**
   * Löst eine Zuweisung auf (schickt Mail zurück in die Inbox)
   * @param {number} emailId 
   * @returns Promise
   */
  unassign(emailId) {
    return api.patch(`/emails/${emailId}/unassign`)
  },

  /**
   * Holt alle E-Mails eines spezifischen Projekts
   * @param {string} projectId 
   * @param {number} skip 
   * @param {number} limit 
   * @returns Promise
   */
  getForProject(projectId, skip = 0, limit = 100) {
    return api.get(`/emails/project/${projectId}`, { params: { skip, limit } })
  },

  /**
   * Steckt einen Anhang in Quarantäne (Blockiert den Typ)
   * @param {number} emailId 
   * @param {string} filename 
   * @returns Promise
   */
  quarantineAttachment(emailId, filename) {
    return api.post(`/emails/${emailId}/attachments/${encodeURIComponent(filename)}/quarantine`)
  }
}
