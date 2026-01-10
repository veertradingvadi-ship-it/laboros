'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { COMPANY_NAME, LOGO_URL } from '@/lib/config';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [blockingSite, setBlockingSite] = useState<any>(null); // State to hold site info if blocked
    const [requestSent, setRequestSent] = useState(false);

    const handleRequestAccess = async () => {
        if (!blockingSite) return;
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user session');

            // Get actual location for the request
            let lat = 0, long = 0;
            try {
                const { getCurrentPosition } = await import('@/lib/spoof-detector');
                const pos = await getCurrentPosition();
                lat = pos.coords.latitude;
                long = pos.coords.longitude;
            } catch { } // Fallback to 0,0 if location fails

            const { error } = await supabase.from('access_requests').insert({
                user_id: user.id,
                requested_site_id: blockingSite.id || 1,
                current_lat: lat,
                current_long: long,
                status: 'PENDING'
            });

            if (error) throw error;

            setRequestSent(true);
            setSuccess('✅ Request sent! Waiting for Admin approval...');
            setError(null);

            // Start listening for approval
            startApprovalListener(user.id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Real-time listener for approval
    const startApprovalListener = (userId: string) => {
        const channel = supabase
            .channel('approval_listener')
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'access_requests', filter: `user_id=eq.${userId}` },
                (payload) => {
                    if (payload.new && (payload.new as any).status === 'APPROVED') {
                        setSuccess('🎉 Access APPROVED! Redirecting...');
                        setError(null);
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else if (payload.new && (payload.new as any).status === 'REJECTED') {
                        setError('❌ Access request was REJECTED');
                        setSuccess(null);
                    }
                }
            )
            .subscribe();

        // Cleanup on unmount
        return () => supabase.removeChannel(channel);
    };

    // Auto-redirect if already logged in
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                console.log('Session found, redirecting...');
                router.replace('/dashboard');
            }
        };
        checkSession();
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter email and password');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            console.log('Attempting login for:', email);

            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            console.log('Login response:', { user: data?.user?.id, session: !!data?.session, error: signInError });

            if (signInError) {
                console.error('Login error:', signInError);
                if (signInError.message.includes('Invalid login')) {
                    setError('Invalid email or password');
                } else if (signInError.message.includes('Email not confirmed')) {
                    setError('Please verify your email first');
                } else {
                    setError(signInError.message);
                }
                setLoading(false);
                return;
            }

            if (data.user && data.session) {
                setSuccess('Login successful! Redirecting...');
                console.log('Login successful, checking role...');

                // Check/create profile and get role
                let userRole = 'manager';
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                console.log('Profile check:', { profile, error: profileError });

                if (!profile && !profileError) {
                    // Create new profile - check if admin email
                    const isAdmin = data.user.email === 'veertrading.vadi@gmail.com';
                    userRole = isAdmin ? 'admin' : 'manager';
                    console.log('Creating profile with role:', userRole);
                    await supabase.from('profiles').insert({
                        id: data.user.id,
                        email: data.user.email!,
                        role: userRole,
                    });
                } else if (profile) {
                    userRole = profile.role;
                    // Force admin for permanent admin email
                    if (data.user.email === 'veertrading.vadi@gmail.com' && userRole !== 'admin') {
                        await supabase.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
                        userRole = 'admin';
                    }
                }

                // Manager Location Lock
                if (userRole === 'manager') {
                    setSuccess('Verifying location...');
                    console.log('Manager login - checking location...');

                    try {
                        const { getCurrentPosition } = await import('@/lib/spoof-detector');
                        const { isPointInRadius } = await import('@/lib/geofence');

                        // 1. Get User Location
                        const position = await getCurrentPosition();
                        const userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };

                        // 2. Determine Required Site
                        let targetSite: { id: string; latitude: number; longitude: number; radius_meters: number; name: string } | null = null;

                        if (profile?.assigned_site_id) {
                            // Fetch assigned site
                            const { data: site } = await supabase
                                .from('sites')
                                .select('id, latitude, longitude, radius_meters, name')
                                .eq('id', profile.assigned_site_id)
                                .single();
                            targetSite = site;
                        } else {
                            // Fallback: Check if near ANY active site (priority to Main Charcoal Site)
                            const { data: allSites } = await supabase
                                .from('sites')
                                .select('id, latitude, longitude, radius_meters, name')
                                .eq('is_active', true);

                            // Check if inside ANY active site
                            if (allSites && allSites.length > 0) {
                                targetSite = allSites.find(s => isPointInRadius(userLocation, { lat: s.latitude, lng: s.longitude }, s.radius_meters)) || allSites[0];
                            }
                        }

                        if (!targetSite) {
                            console.warn('Manager login: No active sites found in DB');
                            // Optional: Allow login if no sites exist? Or block?
                            // Blocking is safer for 'Location Lock' feature.
                            await supabase.auth.signOut();
                            setError('Login Failed: System has no active work sites configured.');
                            setLoading(false);
                            return;
                        }

                        // 3. Verify Distance
                        const isInside = isPointInRadius(
                            userLocation,
                            { lat: targetSite.latitude, lng: targetSite.longitude },
                            targetSite.radius_meters
                        );

                        if (!isInside) {
                            // CHECK FOR REMOTE ACCESS APPROVAL
                            // Check if there is a PENDING or APPROVED request created in the last 12 hours
                            const { data: request } = await supabase
                                .from('access_requests')
                                .select('*')
                                .eq('user_id', data.user.id)
                                .eq('requested_site_id', targetSite.id || profile.assigned_site_id || 1) // Fallback ID if needed
                                .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()) // Valid for 12 hours
                                .order('created_at', { ascending: false })
                                .limit(1)
                                .single();

                            if (request && request.status === 'APPROVED') {
                                console.log('Login allowed via Remote Access Approval');
                                setSuccess('Remote Access Approved! Logging in...');
                            } else {
                                console.warn(`Manager login blocked: Outside ${targetSite.name}`);
                                // DO NOT SIGN OUT YET - Allow requesting access
                                setBlockingSite(targetSite);

                                // Check if we already requested
                                if (request && request.status === 'PENDING') {
                                    setRequestSent(true);
                                    setError(`You are away from ${targetSite.name}. Approval Pending...`);
                                } else {
                                    setError(`Login Failed: you are away from ${targetSite.name}`);
                                }
                                setLoading(false);
                                return;
                            }
                        }
                        console.log(`Location verified: Inside ${targetSite.name}`);
                    } catch (locError: any) {
                        console.error('Location check failed:', locError);
                        // For safety, if location fails completely, we block.
                        await supabase.auth.signOut();
                        setError('Location required for Manager login. Please enable GPS.');
                        setLoading(false);
                        return;
                    }
                }

                console.log('Redirecting based on role:', userRole);

                // Role-based redirect
                let redirectUrl = '/dashboard';
                if (userRole === 'admin') {
                    redirectUrl = '/admin';
                } else if (userRole === 'owner') {
                    redirectUrl = '/owner';
                } else if (userRole === 'accountant') {
                    redirectUrl = '/accountant';
                }

                window.location.href = redirectUrl;
            } else {
                setError('Login failed - no session returned');
            }
        } catch (err: any) {
            console.error('Login catch error:', err);
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    {LOGO_URL && (
                        <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/10 backdrop-blur-xl p-2 border border-white/20">
                            <img src={LOGO_URL} alt="" className="w-full h-full object-contain" />
                        </div>
                    )}
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        {COMPANY_NAME}
                    </h1>
                    <p className="text-white/40 text-sm mt-1 tracking-wider">LABOR MANAGEMENT SYSTEM</p>
                </div>

                {/* Request Access / Login Card */}
                <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10">

                    {blockingSite ? (
                        <div className="text-center">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                                <span className="text-2xl">📍</span>
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Location Restriction</h2>
                            <p className="text-white/60 text-sm mb-6">
                                You are too far from <span className="text-cyan-400">{blockingSite.name}</span>.
                                <br />Manager login is restricted to the site.
                            </p>

                            {requestSent ? (
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 animate-pulse">
                                    <p className="text-yellow-400 font-bold">Request Sent!</p>
                                    <p className="text-yellow-200/60 text-xs mt-1">Waiting for Admin to approve...</p>
                                    <button onClick={() => window.location.reload()} className="mt-3 text-xs text-white/40 underline hover:text-white">
                                        Check Status / Refresh
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleRequestAccess}
                                    disabled={loading}
                                    className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl font-medium hover:opacity-90 transition-all shadow-lg shadow-red-500/20"
                                >
                                    {loading ? 'Sending...' : 'Request Remote Access'}
                                </button>
                            )}

                            <button onClick={() => { setBlockingSite(null); supabase.auth.signOut(); setError(null); }} className="mt-4 text-xs text-white/30 hover:text-white transition-colors">
                                Cancel & Sign Out
                            </button>
                        </div>
                    ) : (
                        /* Standard Login Form */
                        <>
                            <h2 className="text-xl font-bold text-white text-center mb-6">Sign In</h2>
                            <form onSubmit={handleLogin} className="space-y-4">
                                { /* ... inputs ... */}
                                <div>
                                    <label className="text-white/60 text-sm mb-1 block">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="your@email.com"
                                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-cyan-500 transition-all"
                                        required
                                        autoComplete="email"
                                    />
                                </div>

                                <div>
                                    <label className="text-white/60 text-sm mb-1 block">Password</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-cyan-500 transition-all"
                                        required
                                        autoComplete="current-password"
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm text-center">
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-sm text-center">
                                        {success}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                            Signing In...
                                        </span>
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>
                            <div className="mt-6 text-center">
                                <p className="text-white/40 text-sm">Contact admin to get access</p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-white/30 text-xs mt-6">
                    Powered by LaborOS • Biometric Attendance
                </p>
            </div>
        </div>
    );
}
