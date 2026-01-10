/**
 * Geo-Fencing Utilities
 * Haversine formula for calculating distance between GPS coordinates
 */

// Earth's radius in meters
const EARTH_RADIUS_M = 6371000;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Calculate the Haversine distance between two GPS coordinates
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in meters
 */
export function calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_M * c;
}

/**
 * Check if a user is within the allowed radius of a site
 * @param userLat User's current latitude
 * @param userLon User's current longitude
 * @param siteLat Site's latitude
 * @param siteLon Site's longitude
 * @param radiusMeters Allowed radius in meters (default 200m)
 * @returns Object with isWithinRadius and distance
 */
export function checkGeoFence(
    userLat: number,
    userLon: number,
    siteLat: number,
    siteLon: number,
    radiusMeters: number = 200
): { isWithinRadius: boolean; distance: number } {
    const distance = calculateDistance(userLat, userLon, siteLat, siteLon);
    return {
        isWithinRadius: distance <= radiusMeters,
        distance: Math.round(distance),
    };
}

/**
 * Get current GPS position using browser's Geolocation API
 * @returns Promise with coordinates or error
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        reject(new Error('Location permission denied. Please enable GPS.'));
                        break;
                    case error.POSITION_UNAVAILABLE:
                        reject(new Error('Location unavailable. Please check GPS signal.'));
                        break;
                    case error.TIMEOUT:
                        reject(new Error('Location request timed out. Please try again.'));
                        break;
                    default:
                        reject(new Error('An unknown error occurred.'));
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    });
}

/**
 * Format distance for display
 * @param meters Distance in meters
 * @returns Formatted string (e.g., "150m" or "1.2km")
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
}
