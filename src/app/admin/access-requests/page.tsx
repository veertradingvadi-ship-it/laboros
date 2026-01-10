'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AccessRequest {
    id: string;
    user_id: string;
    requested_site_id: number;
    current_lat: number;
    current_long: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at: string;
    profiles?: {
        email: string;
        role: string;
    };
    sites?: {
        name: string;
    };
}

export default function AccessRequestsPage() {
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        loadRequests();

        // Real-time subscription for new requests
        const channel = supabase
            .channel('access_requests_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'access_requests' },
                () => loadRequests()
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const loadRequests = async () => {
        // Load requests first
        const { data: requestsData, error } = await supabase
            .from('access_requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading requests:', error);
            setLoading(false);
            return;
        }

        // Enrich with profile and site data
        const enrichedRequests = await Promise.all((requestsData || []).map(async (req) => {
            // Get profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, role')
                .eq('id', req.user_id)
                .single();

            // Get site
            const { data: site } = await supabase
                .from('sites')
                .select('name')
                .eq('id', req.requested_site_id)
                .single();

            return {
                ...req,
                profiles: profile || { email: req.user_id, role: 'unknown' },
                sites: site || { name: `Site #${req.requested_site_id}` }
            };
        }));

        setRequests(enrichedRequests);
        setLoading(false);
    };

    const handleApprove = async (requestId: string) => {
        const { error } = await supabase
            .from('access_requests')
            .update({ status: 'APPROVED' })
            .eq('id', requestId);

        if (error) {
            setNotification({ type: 'error', message: `Failed: ${error.message}` });
            return;
        }
        setNotification({ type: 'success', message: 'Access APPROVED!' });
        loadRequests();
    };

    const handleReject = async (requestId: string) => {
        const { error } = await supabase
            .from('access_requests')
            .update({ status: 'REJECTED' })
            .eq('id', requestId);

        if (error) {
            setNotification({ type: 'error', message: `Failed: ${error.message}` });
            return;
        }
        setNotification({ type: 'success', message: 'Access REJECTED' });
        loadRequests();
    };

    const filteredRequests = filter === 'ALL'
        ? requests
        : requests.filter(r => r.status === filter);

    const pendingCount = requests.filter(r => r.status === 'PENDING').length;

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            {/* Toast Notification */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-slide-up ${notification.type === 'success'
                    ? 'bg-slate-900/90 border-green-500/30 text-green-400'
                    : 'bg-slate-900/90 border-red-500/30 text-red-400'
                    }`}>
                    <span className="text-2xl">{notification.type === 'success' ? '✓' : '⚠️'}</span>
                    <span className="font-medium">{notification.message}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-3">
                        Access Requests
                        {pendingCount > 0 && (
                            <span className="px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-sm animate-pulse">
                                {pendingCount} Pending
                            </span>
                        )}
                    </h1>
                    <p className="text-sm text-slate-400">Approve or reject manager login requests from outside sites</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-4">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => (
                    <button
                        key={status}
                        onClick={() => setFilter(status)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === status
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        {status}
                        {status === 'PENDING' && pendingCount > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Requests List */}
            <div className="space-y-4">
                {filteredRequests.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">
                        <span className="text-4xl block mb-4">📭</span>
                        <p>No {filter.toLowerCase()} requests</p>
                    </div>
                ) : (
                    filteredRequests.map(request => (
                        <div
                            key={request.id}
                            className={`bg-white/5 backdrop-blur-xl border rounded-2xl p-6 transition-all ${request.status === 'PENDING'
                                ? 'border-orange-500/30 shadow-lg shadow-orange-500/5'
                                : 'border-white/10'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                {/* User Info */}
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                                        {(request.profiles?.email?.[0] || '?').toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">{request.profiles?.email || 'Unknown User'}</h3>
                                        <p className="text-sm text-slate-400">
                                            Role: <span className="text-cyan-400">{request.profiles?.role || 'manager'}</span>
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Requesting access to: <span className="text-white">{request.sites?.name || `Site #${request.requested_site_id}`}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* Status & Actions */}
                                <div className="flex items-center gap-3">
                                    {request.status === 'PENDING' ? (
                                        <>
                                            <button
                                                onClick={() => handleReject(request.id)}
                                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-all hover:scale-105"
                                            >
                                                ✕ Reject
                                            </button>
                                            <button
                                                onClick={() => handleApprove(request.id)}
                                                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-500/20 transition-all hover:scale-105"
                                            >
                                                ✓ Approve
                                            </button>
                                        </>
                                    ) : (
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${request.status === 'APPROVED'
                                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                            }`}>
                                            {request.status}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Location Info */}
                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-6 text-xs text-slate-500">
                                <div>
                                    📍 Location: <span className="text-slate-300 font-mono">
                                        {request.current_lat?.toFixed(5) || '?'}, {request.current_long?.toFixed(5) || '?'}
                                    </span>
                                </div>
                                <div>
                                    🕒 Requested: <span className="text-slate-300">
                                        {new Date(request.created_at).toLocaleString('en-IN')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
