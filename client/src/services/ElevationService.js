import axios from 'axios'

const BASE_URL = 'https://api.open-meteo.com/v1/elevation'

export const ElevationService = {
    /**
     * Fetches elevation for a single coordinate.
     * @param {number} lat 
     * @param {number} lng 
     * @returns {Promise<number>} Elevation in meters
     */
    async getElevation(lat, lng) {
        try {
            const response = await axios.get(BASE_URL, {
                params: {
                    latitude: lat,
                    longitude: lng
                }
            })

            if (response.data && response.data.elevation && response.data.elevation.length > 0) {
                return response.data.elevation[0]
            }
            return 0
        } catch (error) {
            console.error('Elevation API Error:', error)
            throw new Error('Höhendaten konnten nicht geladen werden.')
        }
    },

    /**
     * Fetches elevation for multiple coordinates.
     * @param {Array<{lat, lng}>} coords 
     * @returns {Promise<Array<number>>} Array of elevations
     */
    async getElevations(coords) {
        try {
            const lats = coords.map(c => c.lat).join(',')
            const lngs = coords.map(c => c.lng).join(',')

            const response = await axios.get(BASE_URL, {
                params: {
                    latitude: lats,
                    longitude: lngs
                }
            })

            return response.data.elevation || []
        } catch (error) {
            console.error('Elevation API Error:', error)
            return []
        }
    }
}
