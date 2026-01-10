'use client';

import dynamic from 'next/dynamic';
import { LocationGuard } from '@/lib/location-guard';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ScannerComponent = dynamic(() => import('./ScannerComponent'), {
    ssr: false,
    loading: () => (
        <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-cyan-400">Loading Scanner...</p>
            </div>
        </div>
    )
});

interface ActiveSite {
    name: string;
    lat: number;
    lng: number;
    radius: number;
}

export default function ScannerPage() {
    const [sites, setSites] = useState<ActiveSite[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasRemoteAccess, setHasRemoteAccess] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    // Load sites and check remote access
    const loadSites = async () => {
        const { data } = await supabase
            .from('sites')
            .select('name, latitude, longitude, radius_meters')
            .eq('is_active', true);

        if (data) {
            setSites(data.map(s => ({
                name: s.name,
                lat: s.latitude,
                lng: s.longitude,
                radius: s.radius_meters
            })));
        }
        setLastUpdate(new Date());
        setLoading(false);
    };

    // Check if user has approved remote access
    const checkRemoteAccess = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: request } = await supabase
            .from('access_requests')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'APPROVED')
            .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()) // Valid for 12 hours
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (request) {
            console.log('✅ Remote access approved - bypassing geofence');
            setHasRemoteAccess(true);
        }
    };

    useEffect(() => {
        loadSites();
        checkRemoteAccess();

        // Real-time subscription to sites table
        const sitesChannel = supabase
            .channel('scanner_sites_sync')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'sites' },
                (payload) => {
                    console.log('🔄 Sites updated in real-time:', payload);
                    loadSites(); // Reload sites when admin makes changes
                }
            )
            .subscribe();

        // Real-time subscription to access_requests for approval updates
        const accessChannel = supabase
            .channel('scanner_access_sync')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'access_requests' },
                () => {
                    checkRemoteAccess(); // Re-check when access requests change
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(sitesChannel);
            supabase.removeChannel(accessChannel);
        };
    }, []);

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-cyan-400">Syncing Site Data...</p>
                </div>
            </div>
        );
    }

    if (sites.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900 p-6">
                <div className="text-center text-white max-w-sm">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h1 className="text-xl font-bold mb-2">No Active Sites</h1>
                    <p className="text-white/60 mb-4">Please contact admin to activate a work site.</p>
                </div>
            </div>
        );
    }

    // If remote access is approved, bypass LocationGuard
    if (hasRemoteAccess) {
        return (
            <div className="relative">
                {/* Remote Access Banner */}
                <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 px-4 text-center text-sm font-medium shadow-lg">
                    🌍 Remote Access Mode - Scanning from outside site boundary
                </div>
                <div className="pt-10">
                    <ScannerComponent />
                </div>
            </div>
        );
    }

    return (
        <LocationGuard sites={sites}>
            {/* Show last sync time */}
            <div className="fixed bottom-4 right-4 z-40 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full text-xs text-white/50">
                🔄 Synced: {lastUpdate.toLocaleTimeString()}
            </div>
            <ScannerComponent />
        </LocationGuard>
    );
}
