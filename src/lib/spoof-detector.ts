/**
 * GPS Spoof Detector for LaborOS
 * Detects fake GPS/mock location apps using physics-based checks
 */

export interface LocationData {
    lat: number;
    lng: number;
    accuracy: number; // meters
    timestamp: number; // ms
}

export interface SpoofCheckResult {
    isSpoofed: boolean;
    confidence: number; // 0-1
    reason: string | null;
    speed?: number; // km/h
}

// Earth radius in km
const EARTH_RADIUS = 6371;

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Check if location update appears to be spoofed
 * Uses multiple heuristics:
 * 1. Teleport detection (impossible speed)
 * 2. Accuracy validation
 * 3. Timestamp anomalies
 */
export function detectSpoof(
    currentLocation: LocationData,
    previousLocation: LocationData | null,
    options: {
        maxSpeedKmH?: number;      // Max believable speed (default: 150 km/h)
        minAccuracy?: number;       // Min acceptable accuracy (default: 100m)
        perfectAccuracyThreshold?: number; // Flag if accuracy too perfect (default: 3m)
    } = {}
): SpoofCheckResult {
    const {
        maxSpeedKmH = 150,          // 150 km/h = fast car, reasonable max
        minAccuracy = 100,          // Reject if GPS claims >100m accuracy
        perfectAccuracyThreshold = 3 // Fake GPS often shows 0-3m accuracy
    } = options;

    // Check 1: Accuracy Validation
    if (currentLocation.accuracy > minAccuracy) {
        return {
            isSpoofed: false, // Not spoofed, just bad GPS
            confidence: 0.3,
            reason: `GPS accuracy too poor: ${currentLocation.accuracy}m (need <${minAccuracy}m)`,
        };
    }

    // Check 2: Suspiciously Perfect Accuracy (often from fake GPS apps)
    if (currentLocation.accuracy === 0 || currentLocation.accuracy < perfectAccuracyThreshold) {
        return {
            isSpoofed: true,
            confidence: 0.7,
            reason: `Suspiciously perfect accuracy: ${currentLocation.accuracy}m (likely mock GPS)`,
        };
    }

    // Check 3: Teleport Detection (Speed Check)
    if (previousLocation) {
        const distance = haversineDistance(
            previousLocation.lat, previousLocation.lng,
            currentLocation.lat, currentLocation.lng
        );

        const timeDiffHours = (currentLocation.timestamp - previousLocation.timestamp) / (1000 * 60 * 60);

        // Avoid division by zero for very quick updates
        if (timeDiffHours > 0.001) { // At least 3.6 seconds apart
            const speed = distance / timeDiffHours; // km/h

            if (speed > maxSpeedKmH) {
                return {
                    isSpoofed: true,
                    confidence: Math.min(speed / 1000, 1), // Higher speed = higher confidence
                    reason: `Impossible travel speed: ${Math.round(speed)} km/h in ${Math.round(timeDiffHours * 60)} minutes`,
                    speed,
                };
            }

            // Check for instant teleport (>10km in <10 seconds)
            const timeDiffSeconds = (currentLocation.timestamp - previousLocation.timestamp) / 1000;
            if (distance > 10 && timeDiffSeconds < 10) {
                return {
                    isSpoofed: true,
                    confidence: 0.95,
                    reason: `Teleport detected: ${Math.round(distance)}km in ${timeDiffSeconds}s`,
                    speed,
                };
            }
        }
    }

    return {
        isSpoofed: false,
        confidence: 0,
        reason: null,
    };
}

/**
 * Check if a point is within a circular radius of a center point
 */
export function isWithinRadius(
    lat: number, lng: number,
    centerLat: number, centerLng: number,
    radiusMeters: number
): boolean {
    const distance = haversineDistance(lat, lng, centerLat, centerLng) * 1000; // Convert to meters
    return distance <= radiusMeters;
}

/**
 * Get current GPS position with promise wrapper
 */
export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            ...options,
        });
    });
}

/**
 * Watch position with callback
 */
export function watchPosition(
    onPosition: (pos: GeolocationPosition) => void,
    onError?: (err: GeolocationPositionError) => void
): number | null {
    if (!navigator.geolocation) return null;

    return navigator.geolocation.watchPosition(
        onPosition,
        onError || console.error,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

/**
 * Stop watching position
 */
export function clearWatch(watchId: number | null): void {
    if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
    }
}

/**
 * Format coordinates for display
 */
export function formatCoords(lat: number, lng: number): string {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
