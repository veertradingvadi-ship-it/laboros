'use client';

import { ReactNode, useState, useEffect, createContext, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { COMPANY_NAME } from '@/lib/config';
import { supabase } from '@/lib/supabase';

// Gujarati translations for owner pages
const translations = {
    en: {
        ownerPanel: 'Owner Panel',
        dashboard: 'Dashboard',
        sites: 'Sites',
        workers: 'Workers',
        staff: 'Staff',
        tasks: 'Tasks',
        audit: 'Audit',
        finance: 'Finance',
        back: 'Back',
        logout: 'Logout',
    },
    gu: {
        ownerPanel: 'માલિક પેનલ',
        dashboard: 'ડેશબોર્ડ',
        sites: 'સાઇટ્સ',
        workers: 'કામદારો',
        staff: 'સ્ટાફ',
        tasks: 'કાર્યો',
        audit: 'ઓડિટ',
        finance: 'નાણાં',
        back: 'પાછા',
        logout: 'લોગઆઉટ',
    }
};

// Language context for owner pages
export const OwnerLangContext = createContext<{ lang: 'en' | 'gu'; setLang: (l: 'en' | 'gu') => void; t: typeof translations['en'] }>({
    lang: 'gu',
    setLang: () => { },
    t: translations.gu
});

export const useOwnerLang = () => useContext(OwnerLangContext);

interface OwnerLayoutProps {
    children: ReactNode;
}

export default function OwnerLayout({ children }: OwnerLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [lang, setLang] = useState<'en' | 'gu'>('gu');

    const t = translations[lang];

    const navItems = [
        { href: '/owner', icon: '📊', label: t.dashboard },
        { href: '/owner/sites', icon: '📍', label: t.sites },
        { href: '/owner/workers', icon: '👷', label: t.workers },
        { href: '/owner/staff', icon: '👥', label: t.staff },
        { href: '/owner/tasks', icon: '✅', label: t.tasks },
        { href: '/owner/audit', icon: '📋', label: t.audit },
        { href: '/owner/finance', icon: '💰', label: t.finance },
    ];

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        const allowedRoles = ['admin', 'owner'];

        if (!profile || !allowedRoles.includes(profile.role)) {
            router.push('/dashboard');
            return;
        }

        setAuthorized(true);
        setLoading(false);
    };

    if (loading || !authorized) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#0f172a]">
                <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <OwnerLangContext.Provider value={{ lang, setLang, t }}>
            <div className="min-h-screen bg-[#0f172a] flex">
                {/* Sidebar - Desktop */}
                <aside className="hidden lg:flex flex-col w-56 bg-[#1e293b] border-r border-white/5">
                    <div className="p-4 border-b border-white/5">
                        <h1 className="font-bold text-white">{COMPANY_NAME}</h1>
                        <p className="text-xs text-white/50">{t.ownerPanel}</p>
                    </div>
                    <nav className="flex-1 py-4">
                        {navItems.map(item => (
                            <button
                                key={item.href}
                                onClick={() => router.push(item.href)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition ${pathname === item.href
                                    ? 'bg-blue-600 text-white'
                                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className="text-lg">{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                    </nav>
                    <div className="p-4 border-t border-white/5 space-y-2">
                        <button
                            onClick={() => setLang(lang === 'en' ? 'gu' : 'en')}
                            className="w-full py-2 bg-blue-600 rounded-lg text-white text-sm font-bold"
                        >
                            {lang === 'en' ? 'ગુજરાતી' : 'English'}
                        </button>
                        <button onClick={() => router.push('/dashboard')} className="text-sm text-white/50 hover:text-white">
                            ← {t.back}
                        </button>
                    </div>
                </aside>

                {/* Mobile Sidebar */}
                {sidebarOpen && (
                    <div className="lg:hidden fixed inset-0 z-50">
                        <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
                        <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#1e293b]">
                            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                <h1 className="font-bold text-white">{COMPANY_NAME}</h1>
                                <button onClick={() => setSidebarOpen(false)} className="text-2xl text-white">×</button>
                            </div>
                            <nav className="py-4">
                                {navItems.map(item => (
                                    <button
                                        key={item.href}
                                        onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-white ${pathname === item.href ? 'bg-blue-600' : 'hover:bg-white/5'}`}
                                    >
                                        <span className="text-lg">{item.icon}</span>
                                        {item.label}
                                    </button>
                                ))}
                            </nav>
                            <div className="p-4 border-t border-white/5">
                                <button
                                    onClick={() => setLang(lang === 'en' ? 'gu' : 'en')}
                                    className="w-full py-2 bg-blue-600 rounded-lg text-white text-sm font-bold mb-2"
                                >
                                    {lang === 'en' ? 'ગુજરાતી' : 'English'}
                                </button>
                            </div>
                        </aside>
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-1 flex flex-col">
                    {/* Mobile Header */}
                    <header className="lg:hidden bg-[#1e293b] border-b border-white/5 px-4 py-3 flex items-center justify-between">
                        <button onClick={() => setSidebarOpen(true)} className="text-2xl text-white">☰</button>
                        <h1 className="font-bold text-white">{t.ownerPanel}</h1>
                        <button
                            onClick={() => setLang(lang === 'en' ? 'gu' : 'en')}
                            className="px-3 py-1 bg-blue-600 rounded-lg text-white text-xs font-bold"
                        >
                            {lang === 'en' ? 'ગુજ' : 'ENG'}
                        </button>
                    </header>

                    {/* Content */}
                    <main className="flex-1 p-4 lg:p-6">
                        {children}
                    </main>
                </div>
            </div>
        </OwnerLangContext.Provider>
    );
}
