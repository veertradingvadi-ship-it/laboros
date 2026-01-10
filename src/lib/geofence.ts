/**
 * Geofencing utilities for LaborOS
 * Uses turf.js for polygon calculations
 */

import * as turf from '@turf/turf';

export interface Polygon {
    type: 'Polygon';
    coordinates: number[][][]; // [[[lng, lat], [lng, lat], ...]]
}

export interface Point {
    lat: number;
    lng: number;
}

/**
 * Check if a point is inside a polygon
 */
export function isPointInPolygon(point: Point, polygon: Polygon): boolean {
    try {
        const turfPoint = turf.point([point.lng, point.lat]);
        const turfPolygon = turf.polygon(polygon.coordinates);
        return turf.booleanPointInPolygon(turfPoint, turfPolygon);
    } catch (err) {
        console.error('Polygon check error:', err);
        return false;
    }
}

/**
 * Check if a point is within a circular radius (fallback for simple sites)
 */
export function isPointInRadius(point: Point, center: Point, radiusMeters: number): boolean {
    const from = turf.point([center.lng, center.lat]);
    const to = turf.point([point.lng, point.lat]);
    const distance = turf.distance(from, to, { units: 'meters' });
    return distance <= radiusMeters;
}

/**
 * Calculate distance between two points in meters
 */
export function getDistance(point1: Point, point2: Point): number {
    const from = turf.point([point1.lng, point1.lat]);
    const to = turf.point([point2.lng, point2.lat]);
    return turf.distance(from, to, { units: 'meters' });
}

/**
 * Get the center point of a polygon
 */
export function getPolygonCenter(polygon: Polygon): Point {
    try {
        const turfPolygon = turf.polygon(polygon.coordinates);
        const center = turf.center(turfPolygon);
        return {
            lat: center.geometry.coordinates[1],
            lng: center.geometry.coordinates[0],
        };
    } catch (err) {
        console.error('Center calculation error:', err);
        return { lat: 0, lng: 0 };
    }
}

/**
 * Calculate the area of a polygon in square meters
 */
export function getPolygonArea(polygon: Polygon): number {
    try {
        const turfPolygon = turf.polygon(polygon.coordinates);
        return turf.area(turfPolygon);
    } catch {
        return 0;
    }
}

/**
 * Convert a circle (center + radius) to a polygon approximation
 */
export function circleToPolygon(center: Point, radiusMeters: number, steps: number = 32): Polygon {
    const circle = turf.circle([center.lng, center.lat], radiusMeters / 1000, {
        steps,
        units: 'kilometers',
    });
    return {
        type: 'Polygon',
        coordinates: circle.geometry.coordinates as number[][][],
    };
}

/**
 * Create a simple bounding box polygon from two corner points
 */
export function createBoundingBox(corner1: Point, corner2: Point): Polygon {
    const minLng = Math.min(corner1.lng, corner2.lng);
    const maxLng = Math.max(corner1.lng, corner2.lng);
    const minLat = Math.min(corner1.lat, corner2.lat);
    const maxLat = Math.max(corner1.lat, corner2.lat);

    return {
        type: 'Polygon',
        coordinates: [[
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
            [minLng, minLat], // Close the polygon
        ]],
    };
}

/**
 * GeoJSON to database-friendly format
 */
export function polygonToWKT(polygon: Polygon): string {
    const coords = polygon.coordinates[0]
        .map(([lng, lat]) => `${lng} ${lat}`)
        .join(', ');
    return `POLYGON((${coords}))`;
}

/**
 * Parse WKT to GeoJSON polygon
 */
export function wktToPolygon(wkt: string): Polygon | null {
    try {
        const match = wkt.match(/POLYGON\(\((.+)\)\)/i);
        if (!match) return null;

        const coords = match[1].split(',').map(pair => {
            const [lng, lat] = pair.trim().split(' ').map(Number);
            return [lng, lat];
        });

        return {
            type: 'Polygon',
            coordinates: [coords],
        };
    } catch {
        return null;
    }
}

/**
 * Validate that a polygon is properly closed
 */
export function isValidPolygon(polygon: Polygon): boolean {
    try {
        if (!polygon.coordinates || !polygon.coordinates[0]) return false;
        const coords = polygon.coordinates[0];
        if (coords.length < 4) return false; // Need at least 3 points + closing point

        // Check if polygon is closed
        const first = coords[0];
        const last = coords[coords.length - 1];
        return first[0] === last[0] && first[1] === last[1];
    } catch {
        return false;
    }
}
