import axios from 'axios'

const BASE_URL = '/FastAPI/external'

export const KostraApiService = {
    /**
     * Fetches KOSTRA data for a specific coordinate (EPSG:4326).
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {Promise<Object>} - Mapped rain data { r5_2, r5_30, r5_100 }
     */
    async fetchRainData(lat, lng) {
        try {
            const response = await axios.get(`${BASE_URL}/kostra-proxy`, {
                params: {
                    x: lng,
                    y: lat
                }
            })

            const data = response.data

            // Extract relevant values for 5 minutes duration (Key "5")
            // RN_002A = 2 years, RN_030A = 30 years, RN_100A = 100 years
            const r5_2 = data['5']?.RN_002A || 0
            const r5_30 = data['5']?.RN_030A || 0
            const r5_100 = data['5']?.RN_100A || 0

            return {
                r5_2,
                r5_30,
                r5_100,
                raw: data // Return full dataset for other durations
            }
        } catch (error) {
            console.error('KOSTRA API Error:', error)
            throw new Error('Fehler beim Abrufen der KOSTRA-Daten.')
        }
    }
}
