'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

interface AccountantLayoutProps {
    children: ReactNode;
}

const navItems = [
    { href: '/accountant', icon: '📊', label: 'Dashboard' },
    { href: '/accountant/tasks', icon: '✅', label: 'Daily Tasks' },
];

export default function AccountantLayout({ children }: AccountantLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [userName, setUserName] = useState('');

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();
        const allowedRoles = ['admin', 'owner', 'accountant'];

        if (!profile || !allowedRoles.includes(profile.role)) {
            router.push('/dashboard');
            return;
        }

        setUserName(profile.email?.split('@')[0] || 'User');
        setAuthorized(true);
        setLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (loading || !authorized) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-900/20 to-slate-900">
                <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900/20 to-slate-900">
            {/* Header */}
            <header className="bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg">
                        AC
                    </div>
                    <div>
                        <h1 className="font-bold text-white">{COMPANY_NAME}</h1>
                        <p className="text-xs text-emerald-400">Accountant Panel</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-white/60">{userName}</span>
                    <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm hover:bg-red-500/20 transition">
                        Logout
                    </button>
                </div>
            </header>

            {/* Navigation */}
            <nav className="flex bg-black/20 border-b border-white/5 px-4">
                {navItems.map(item => (
                    <Link key={item.href} href={item.href}
                        className={`px-4 py-3 text-sm font-medium transition-colors ${pathname === item.href
                            ? 'text-emerald-400 border-b-2 border-emerald-400'
                            : 'text-white/60 hover:text-white'}`}>
                        <span className="mr-2">{item.icon}</span>
                        {item.label}
                    </Link>
                ))}
                <Link href="/dashboard" className="ml-auto px-4 py-3 text-sm text-white/40 hover:text-white transition-colors">
                    ← Back
                </Link>
            </nav>

            {/* Content */}
            <main className="p-4 lg:p-6">
                {children}
            </main>
        </div>
    );
}
