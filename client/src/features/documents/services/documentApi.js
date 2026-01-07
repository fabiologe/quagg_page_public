import api from '@/services/api'

export const documentApi = {
  async getAll() {
    const response = await api.get('/documents')
    return response.data
  },

  async getById(id) {
    const response = await api.get(`/documents/${id}`)
    return response.data
  },

  async upload(file, metadata = {}) {
    const formData = new FormData()
    formData.append('file', file)
    Object.keys(metadata).forEach(key => {
      formData.append(key, metadata[key])
    })

    const response = await api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  async delete(id) {
    const response = await api.delete(`/documents/${id}`)
    return response.data
  }
}

