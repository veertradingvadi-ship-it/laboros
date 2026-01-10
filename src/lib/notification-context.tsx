'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface AccessRequest {
    id: string;
    user_id: string; // Foreign key to profiles
    requested_site_id: string; // Foreign key to sites
    status: 'PENDING' | 'APPROVED' | 'DENIED';
    created_at: string;
}

interface NotificationContextType {
    pendingRequests: AccessRequest[];
    approveRequest: (id: string, adminName: string) => Promise<void>;
    denyRequest: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
    pendingRequests: [],
    approveRequest: async () => { },
    denyRequest: async () => { },
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: ReactNode }) {
    const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
    const [userProfiles, setUserProfiles] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);

    // Initial Load function
    const loadPending = async () => {
        // Fetch pending requests
        const { data: requests } = await supabase
            .from('access_requests')
            .select('*')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false });

        if (requests) {
            setPendingRequests(requests);
            // Fetch profile names for these requests
            const userIds = requests.map(r => r.user_id);
            if (userIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, role').in('id', userIds);
                if (profiles) {
                    const profileMap: any = {};
                    profiles.forEach(p => profileMap[p.id] = p);
                    setUserProfiles(profileMap);
                }
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        loadPending();

        // Realtime Subscription
        const channel = supabase
            .channel('access-requests-channel')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'access_requests' },
                (payload) => {
                    console.log('New Access Request!', payload);
                    const newRequest = payload.new as AccessRequest;
                    if (newRequest.status === 'PENDING') {
                        setPendingRequests(prev => [newRequest, ...prev]);
                        // Should fetch profile for new request
                        supabase.from('profiles').select('*').eq('id', newRequest.user_id).single().then(({ data }) => {
                            if (data) setUserProfiles(prev => ({ ...prev, [data.id]: data }));
                        });

                        // Play Notification Sound
                        try {
                            const audio = new Audio('/notification.mp3'); // Need to add a sound file or use browser beep?
                            // Browser beep workaround:
                            // We can't guarantee sound, but the visual popup will show.
                        } catch (e) { }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const approveRequest = async (id: string, adminName: string) => {
        console.log('Approving request:', id);
        const { error } = await supabase
            .from('access_requests')
            .update({ status: 'APPROVED', approved_by: adminName })
            .eq('id', id);

        if (error) {
            console.error('Approve failed:', error);
            alert('Failed to approve: ' + error.message);
        } else {
            console.log('✓ Request approved');
            setPendingRequests(prev => prev.filter(r => r.id !== id));
        }
    };

    const denyRequest = async (id: string) => {
        console.log('Denying request:', id);
        const { error } = await supabase
            .from('access_requests')
            .update({ status: 'DENIED' })
            .eq('id', id);

        if (error) {
            console.error('Deny failed:', error);
            alert('Failed to deny: ' + error.message);
        } else {
            console.log('✓ Request denied');
            setPendingRequests(prev => prev.filter(r => r.id !== id));
        }
    };

    return (
        <NotificationContext.Provider value={{ pendingRequests, approveRequest, denyRequest }}>
            {children}

            {/* Global Notification Popup */}
            {pendingRequests.length > 0 && (
                <div className="fixed top-4 right-4 z-[9999] space-y-4">
                    {pendingRequests.map(req => {
                        const user = userProfiles[req.user_id];
                        const userName = user?.full_name || user?.email || 'Unknown User';

                        return (
                            <div key={req.id} className="bg-slate-900 border-l-4 border-cyan-500 text-white p-4 rounded-xl shadow-2xl shadow-cyan-500/20 max-w-sm animate-in slide-in-from-right fade-in duration-300">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl">🔐</span>
                                    <div>
                                        <h4 className="font-bold text-sm">Access Request</h4>
                                        <p className="text-xs text-white/70 mt-1">
                                            <span className="text-cyan-400 font-bold">{userName}</span> wants to login from outside the site.
                                        </p>
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => denyRequest(req.id)}
                                                className="px-3 py-1.5 bg-red-500/20 text-red-400 text-xs rounded-lg hover:bg-red-500/30 font-medium"
                                            >
                                                Deny
                                            </button>
                                            <button
                                                onClick={() => approveRequest(req.id, 'Admin')} // You might want dynamic admin name here
                                                className="px-3 py-1.5 bg-cyan-500 text-white text-xs rounded-lg hover:bg-cyan-600 font-bold shadow-lg shadow-cyan-500/30"
                                            >
                                                Approve
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setPendingRequests(prev => prev.filter(r => r.id !== req.id))} // Dismiss only UI
                                        className="text-white/20 hover:text-white"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </NotificationContext.Provider>
    );
}
