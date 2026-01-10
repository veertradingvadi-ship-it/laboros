'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

interface AdminLayoutProps {
    children: React.ReactNode;
}

const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/admin' },
    { icon: '👥', label: 'Users & Staff', href: '/admin/users' },
    { icon: '👷', label: 'Workers', href: '/admin/workers' },
    { icon: '📍', label: 'Sites', href: '/admin/sites' },
    { icon: '🕐', label: 'Shifts', href: '/admin/shifts' },
    { icon: '📊', label: 'Attendance', href: '/admin/attendance' },
    { icon: '📈', label: 'Analytics', href: '/admin/analytics' },
    { icon: '🧾', label: 'Payslips', href: '/admin/payslips' },
    { icon: '🔓', label: 'Access Requests', href: '/admin/access-requests', badge: true },
    { icon: '💰', label: 'Finance', href: '/admin/finance' },
    { icon: '📋', label: 'Audit Log', href: '/admin/audit' },
    { icon: '💾', label: 'Backup', href: '/admin/backup' },
    { icon: '⚙️', label: 'Settings', href: '/admin/settings' },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [userName, setUserName] = useState('Admin');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [pendingRequests, setPendingRequests] = useState(0);

    useEffect(() => {
        checkAuth();
        loadPendingRequests();

        // Real-time subscription for access requests
        const channel = supabase
            .channel('layout_access_requests')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'access_requests' },
                () => loadPendingRequests()
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();

        // Check if admin by role OR by email (permanent admin)
        const isAdminEmail = user.email === 'veertrading.vadi@gmail.com';
        const isAdminRole = profile?.role === 'admin';

        if (!isAdminRole && !isAdminEmail) {
            router.push('/dashboard');
            return;
        }

        // Auto-fix: If admin email but wrong role, update it
        if (isAdminEmail && !isAdminRole && profile) {
            await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id);
        }

        setUserName(profile?.email?.split('@')[0] || user.email?.split('@')[0] || 'Admin');
        setLoading(false);
    };

    const loadPendingRequests = async () => {
        const { count } = await supabase
            .from('access_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING');
        setPendingRequests(count || 0);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900">
                <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-screen flex bg-slate-900">
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 pointer-events-none z-0" />

            {/* Sidebar - Glassmorphism */}
            <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} relative z-10 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col transition-all duration-300`}>
                {/* Logo */}
                <div className="p-6 border-b border-white/10 flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
                        LA
                    </div>
                    {sidebarOpen && (
                        <div>
                            <h1 className="font-bold text-base text-white">Master Admin</h1>
                            <p className="text-[10px] text-cyan-400 uppercase tracking-wider">{COMPANY_NAME}</p>
                        </div>
                    )}
                </div>

                {/* Menu */}
                <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
                    {sidebarItems.map(item => (
                        <Link key={item.href} href={item.href}
                            className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group relative ${pathname === item.href
                                ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/20'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}>
                            <span className={`text-xl transition-transform group-hover:scale-110 ${pathname === item.href ? 'scale-110' : ''}`}>{item.icon}</span>
                            {sidebarOpen && <span className="font-medium text-sm">{item.label}</span>}

                            {/* Pending Badge for Access Requests */}
                            {item.badge && pendingRequests > 0 && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full animate-pulse">
                                    {pendingRequests}
                                </span>
                            )}

                            {/* Active Glow Indicator */}
                            {pathname === item.href && (
                                <div className="absolute left-0 w-1 h-8 bg-cyan-400 rounded-r-full blur-[2px]" />
                            )}
                        </Link>
                    ))}
                </nav>

                {/* Toggle */}
                <button onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-4 border-t border-white/10 text-slate-500 hover:text-white transition-colors text-sm flex justify-center">
                    {sidebarOpen ? '← Collapse Sidebar' : '→'}
                </button>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                {/* Top Header */}
                <header className="bg-black/20 backdrop-blur-sm border-b border-white/5 px-8 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white">Dashboard Overview</h2>
                        <p className="text-xs text-slate-400">Welcome back, {userName}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-slate-300">
                            ● Online
                        </div>
                        <button onClick={handleLogout} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm transition-all hover:scale-105">
                            Logout
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {children}
                </main>
            </div>
        </div>
    );
}
