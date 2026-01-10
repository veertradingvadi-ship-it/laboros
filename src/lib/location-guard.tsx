'use client';

import { useEffect, useState, ReactNode } from 'react';
import { isPointInRadius } from './geofence';
import { detectSpoof, LocationData, getCurrentPosition } from './spoof-detector';
import { supabase } from './supabase';

interface SiteParams {
    name: string;
    lat: number;
    lng: number;
    radius: number;
}

interface LocationGuardProps {
    children: ReactNode;
    siteCenter?: { lat: number; lng: number };
    radiusMeters?: number;
    sites?: SiteParams[];
    onLocationUpdate?: (location: LocationData, isInside: boolean) => void;
    onSpoofDetected?: (reason: string) => void;
    enabled?: boolean;
}

interface LocationState {
    status: 'loading' | 'inside' | 'outside' | 'spoofed' | 'error';
    message: string;
    location: LocationData | null;
    distance: number | null;
    closestSiteName?: string;
}

export function LocationGuard({
    children,
    siteCenter,
    radiusMeters = 200,
    sites = [],
    onLocationUpdate,
    onSpoofDetected,
    enabled = true,
}: LocationGuardProps) {
    const [state, setState] = useState<LocationState>({
        status: 'loading',
        message: 'Getting location...',
        location: null,
        distance: null,
    });
    const [previousLocation, setPreviousLocation] = useState<LocationData | null>(null);
    const [requesting, setRequesting] = useState(false);
    const [requestSent, setRequestSent] = useState(false);

    const activeSites = sites.length > 0 ? sites : (siteCenter ? [{
        name: 'Site',
        lat: siteCenter.lat,
        lng: siteCenter.lng,
        radius: radiusMeters
    }] : []);

    useEffect(() => {
        if (!enabled || activeSites.length === 0) {
            setState({ status: 'inside', message: 'Location check disabled', location: null, distance: null });
            return;
        }

        let watchId: number | null = null;

        const checkRule = (currentLocation: LocationData): LocationState => {
            const spoofCheck = detectSpoof(currentLocation, previousLocation);
            if (spoofCheck.isSpoofed) {
                return {
                    status: 'spoofed',
                    message: spoofCheck.reason || 'GPS spoofing detected',
                    location: currentLocation,
                    distance: null,
                };
            }

            let insideSite = null;
            let minDistance = Infinity;
            let closestSite = activeSites[0];

            for (const site of activeSites) {
                const isInside = isPointInRadius(
                    { lat: currentLocation.lat, lng: currentLocation.lng },
                    { lat: site.lat, lng: site.lng },
                    site.radius
                );

                if (isInside) {
                    insideSite = site;
                    break;
                }

                const R = 6371000;
                const dLat = (site.lat - currentLocation.lat) * Math.PI / 180;
                const dLng = (site.lng - currentLocation.lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(currentLocation.lat * Math.PI / 180) * Math.cos(site.lat * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const distance = R * c;

                if (distance < minDistance) {
                    minDistance = distance;
                    closestSite = site;
                }
            }

            if (insideSite) {
                return {
                    status: 'inside',
                    message: `Inside ${insideSite.name}`,
                    location: currentLocation,
                    distance: 0,
                    closestSiteName: insideSite.name,
                };
            }

            return {
                status: 'outside',
                message: `You are ${Math.round(minDistance - closestSite.radius)}m away from ${closestSite.name}`,
                location: currentLocation,
                distance: Math.round(minDistance - closestSite.radius),
                closestSiteName: closestSite.name,
            };
        };

        const checkLocation = async () => {
            try {
                const position = await getCurrentPosition();
                const currentLocation: LocationData = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                };
                const newState = checkRule(currentLocation);
                setState(newState);

                if (newState.status !== 'spoofed') {
                    onLocationUpdate?.(currentLocation, newState.status === 'inside');
                    setPreviousLocation(currentLocation);
                } else {
                    onSpoofDetected?.(newState.message);
                }
            } catch (error: any) {
                setState({
                    status: 'error',
                    message: error.message || 'Failed to get location',
                    location: null,
                    distance: null,
                });
            }
        };

        checkLocation();

        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const currentLocation: LocationData = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp,
                    };

                    const newState = checkRule(currentLocation);
                    setState(newState);

                    if (newState.status !== 'spoofed') {
                        onLocationUpdate?.(currentLocation, newState.status === 'inside');
                        setPreviousLocation(currentLocation);
                    }
                },
                (error) => {
                    console.error('Watch position error:', error);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        }

        return () => {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, [enabled, JSON.stringify(activeSites)]);

    const handleRequestAccess = async () => {
        if (!state.location) return;
        setRequesting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                alert('Please login first');
                setRequesting(false);
                return;
            }

            const { data: site } = await supabase
                .from('sites')
                .select('id')
                .eq('is_active', true)
                .limit(1)
                .single();

            if (!site) {
                alert('No site configured');
                setRequesting(false);
                return;
            }

            const { error } = await supabase
                .from('access_requests')
                .insert({
                    user_id: user.id,
                    requested_site_id: site.id,
                    current_lat: state.location.lat,
                    current_long: state.location.lng,
                    status: 'PENDING'
                });

            if (error) {
                console.error('Request failed:', error);
                alert(`Request failed: ${error.message}`);
            } else {
                setRequestSent(true);
            }
        } catch (err: any) {
            console.error('Request error:', err);
            alert(`Error: ${err.message}`);
        }
        setRequesting(false);
    };

    // Loading state
    if (state.status === 'loading') {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-white">Getting location...</p>
                    <p className="text-white/50 text-sm mt-1">Please allow GPS access</p>
                </div>
            </div>
        );
    }

    // Outside site
    if (state.status === 'outside') {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-red-950 via-slate-900 to-slate-900 p-6">
                <div className="text-center text-white max-w-sm">
                    <div className="text-6xl mb-4">📍</div>
                    <h1 className="text-2xl font-bold mb-2">Outside Site Boundary</h1>
                    <p className="text-white/80 mb-4">{state.message}</p>
                    <div className="bg-red-900/50 border border-red-500/30 rounded-xl p-4 mb-4">
                        <p className="text-lg font-bold">Move {state.distance}m closer</p>
                        <p className="text-sm text-white/60">Or request remote access below</p>
                    </div>

                    {requestSent ? (
                        <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-4">
                            <p className="text-green-400 font-bold">✓ Request Sent!</p>
                            <p className="text-sm text-white/60">Waiting for admin approval...</p>
                            <p className="text-xs text-white/40 mt-2">Page will auto-refresh when approved</p>
                        </div>
                    ) : (
                        <button
                            onClick={handleRequestAccess}
                            disabled={requesting}
                            className="w-full px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold shadow-lg hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all"
                        >
                            {requesting ? '⏳ Sending Request...' : '🔓 Request Remote Access'}
                        </button>
                    )}

                    <p className="text-xs text-white/40 mt-4">
                        GPS: {state.location?.lat.toFixed(5)}, {state.location?.lng.toFixed(5)}
                    </p>
                </div>
            </div>
        );
    }

    // Spoofed
    if (state.status === 'spoofed') {
        return (
            <div className="h-screen flex items-center justify-center bg-red-950 p-6">
                <div className="text-center text-white max-w-sm">
                    <div className="text-6xl mb-4">🚨</div>
                    <h1 className="text-2xl font-bold mb-2">GPS Spoofing Detected</h1>
                    <p className="text-red-300 mb-4">{state.message}</p>
                    <div className="bg-red-900 rounded-xl p-4">
                        <p className="text-sm">This incident has been logged.</p>
                        <p className="text-xs text-red-300 mt-2">Disable fake GPS apps and retry</p>
                    </div>
                </div>
            </div>
        );
    }

    // Error
    if (state.status === 'error') {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900 p-6">
                <div className="text-center text-white max-w-sm">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h1 className="text-xl font-bold mb-2">Location Error</h1>
                    <p className="text-white/60 mb-4">{state.message}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 rounded-xl">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Inside site - render children
    return <>{children}</>;
}

export default LocationGuard;
