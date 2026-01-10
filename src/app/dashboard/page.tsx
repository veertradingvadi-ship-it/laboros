'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { THEME_COLOR, COMPANY_NAME, LOGO_URL } from '@/lib/config';
import { useDashboardData, useDashboardStats } from '@/lib/dashboard-context';

type UserRole = 'admin' | 'owner' | 'manager' | 'accountant';

// Gujarati translations
const translations = {
    en: {
        welcome: 'Welcome',
        dashboard: 'Dashboard',
        present: 'Present',
        left: 'Left',
        absent: 'Absent',
        halfDay: 'Half Day',
        total: 'Total',
        wages: 'Wages',
        faceScanner: 'Face Scanner',
        tapToScan: 'Tap to mark attendance',
        recentActivity: 'Recent Activity',
        workers: 'Workers',
        registered: 'registered',
        expenses: 'Expenses',
        ledger: 'Ledger',
        admin: 'Admin',
        settings: 'Settings',
        owner: 'Owner',
        fullControl: 'Full control',
        accounts: 'Accounts',
        reports: 'Reports',
        daySummary: 'Day Summary',
        logout: 'Logout',
        in: 'IN',
        out: 'OUT',
    },
    gu: {
        welcome: 'સ્વાગત છે',
        dashboard: 'ડેશબોર્ડ',
        present: 'હાજર',
        left: 'ગયા',
        absent: 'ગેરહાજર',
        halfDay: 'અડધો દિવસ',
        total: 'કુલ',
        wages: 'વેતન',
        faceScanner: 'ફેસ સ્કેનર',
        tapToScan: 'હાજરી માટે ટેપ કરો',
        recentActivity: 'તાજેતરની પ્રવૃત્તિ',
        workers: 'કામદારો',
        registered: 'નોંધાયેલ',
        expenses: 'ખર્ચ',
        ledger: 'ચોપડો',
        admin: 'એડમિન',
        settings: 'સેટિંગ્સ',
        owner: 'માલિક',
        fullControl: 'પૂર્ણ નિયંત્રણ',
        accounts: 'હિસાબ',
        reports: 'અહેવાલ',
        daySummary: 'દિવસ સારાંશ',
        logout: 'લોગઆઉટ',
        in: 'ઇન',
        out: 'આઉટ',
    }
};

export default function DashboardPage() {
    const router = useRouter();
    const [userRole, setUserRole] = useState<UserRole>('manager');
    const [userName, setUserName] = useState('');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [lang, setLang] = useState<'en' | 'gu'>('gu'); // Default Gujarati

    const t = translations[lang];

    // Use global real-time data
    const { workers, todayLogs, loading: contextLoading } = useDashboardData();
    const basicStats = useDashboardStats();

    const [showDayEnd, setShowDayEnd] = useState(false);

    // Provide enhanced stats for the UI
    const stats = {
        ...basicStats,
        presentToday: todayLogs.filter(l => l.check_in_time && !l.check_out_time).length,
        checkedOut: todayLogs.filter(l => l.check_out_time).length,
        absent: workers.filter(w => w.is_active).length - todayLogs.filter(l => l.check_in_time).length,
        halfDay: todayLogs.filter(l => l.status === 'half-day').length,
        totalWages: todayLogs.reduce((sum, l) => {
            const worker = workers.find(w => w.id === l.worker_id);
            const rate = worker?.base_rate || 500;
            return sum + (l.status === 'half-day' ? rate / 2 : rate);
        }, 0)
    };

    // Auth check
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            // Get role
            const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
            if (roleData) setUserRole(roleData.role as UserRole);

            // Get name
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
            if (profile) setUserName(profile.full_name);
        };
        checkAuth();
    }, [router]);

    // Live clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Helper functions
    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    if (contextLoading) {
        return (
            <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    // Permissions
    const isAdmin = userRole === 'admin';
    const canAccessScanner = isAdmin || ['owner', 'manager'].includes(userRole);
    const canAccessAdmin = isAdmin;
    const canAccessOwner = isAdmin || userRole === 'owner';
    const canAccessWorkers = isAdmin || ['owner', 'manager'].includes(userRole);
    const canAccessKhata = isAdmin || ['owner', 'manager'].includes(userRole);

    return (
        <div className="min-h-screen bg-[#0f172a]">
            {/* Header */}
            <header className="bg-[#1e293b] border-b border-white/10 px-4 py-4">
                <div className="flex items-center justify-between max-w-xl mx-auto">
                    <div className="flex items-center gap-3">
                        {LOGO_URL && <img src={LOGO_URL} alt="" className="w-10 h-10 rounded-xl" />}
                        <div>
                            <h1 className="text-lg font-bold text-white">{COMPANY_NAME}</h1>
                            <p className="text-white/50 text-xs">{userRole} {t.dashboard}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Language Toggle */}
                        <button
                            onClick={() => setLang(lang === 'en' ? 'gu' : 'en')}
                            className="px-3 py-2 bg-blue-600 rounded-lg text-white text-xs font-bold"
                        >
                            {lang === 'en' ? 'ગુજ' : 'ENG'}
                        </button>
                        <span className="text-white/60 text-sm font-mono">
                            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={handleLogout} className="px-3 py-2 bg-white/10 rounded-lg text-white/70 text-xs">
                            {t.logout}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-xl mx-auto px-4 py-6 space-y-5">
                {/* Welcome */}
                <div className="text-center">
                    <p className="text-white/60 text-sm">{t.welcome}, <span className="text-blue-400 font-semibold">{userName}</span></p>
                </div>

                {/* Stats Grid - 4 columns */}
                <div className="grid grid-cols-4 gap-3">
                    <div className="bg-[#1e293b] rounded-xl p-3 text-center border border-white/5">
                        <p className="text-2xl font-bold text-green-400">{stats.presentToday}</p>
                        <p className="text-white/50 text-[10px] uppercase">{t.present}</p>
                    </div>
                    <div className="bg-[#1e293b] rounded-xl p-3 text-center border border-white/5">
                        <p className="text-2xl font-bold text-blue-400">{stats.checkedOut}</p>
                        <p className="text-white/50 text-[10px] uppercase">{t.left}</p>
                    </div>
                    <div className="bg-[#1e293b] rounded-xl p-3 text-center border border-white/5">
                        <p className="text-2xl font-bold text-red-400">{stats.absent}</p>
                        <p className="text-white/50 text-[10px] uppercase">{t.absent}</p>
                    </div>
                    <div className="bg-[#1e293b] rounded-xl p-3 text-center border border-white/5">
                        <p className="text-lg font-bold text-yellow-400">₹{stats.totalWages.toLocaleString()}</p>
                        <p className="text-white/50 text-[10px] uppercase">{t.wages}</p>
                    </div>
                </div>

                {/* Face Scanner - Main Action */}
                {canAccessScanner && (
                    <Link href="/scanner" className="block bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 shadow-lg shadow-blue-600/20">
                        <div className="flex items-center gap-4">
                            <span className="text-4xl">📷</span>
                            <div>
                                <h2 className="text-xl font-bold text-white">{t.faceScanner}</h2>
                                <p className="text-blue-200 text-sm">{t.tapToScan}</p>
                            </div>
                        </div>
                    </Link>
                )}

                {/* Recent Activity */}
                {todayLogs.length > 0 && (
                    <div className="bg-[#1e293b] rounded-xl p-4 border border-white/5">
                        <h3 className="text-white/70 text-sm font-medium mb-3">{t.recentActivity}</h3>
                        <div className="space-y-2">
                            {todayLogs.slice(-5).reverse().map((log: any) => {
                                const worker = workers.find(w => w.id === log.worker_id);
                                return (
                                    <div key={log.id} className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                                                {worker?.photo_url ?
                                                    <img src={worker.photo_url} alt="" className="w-full h-full object-cover" /> :
                                                    <span className="text-white text-xs font-bold">{worker?.name?.charAt(0)}</span>
                                                }
                                            </div>
                                            <span className="text-white text-sm">{worker?.name || 'Unknown'}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${log.check_out_time ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                                            }`}>
                                            {log.check_out_time ? t.out : t.in}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Quick Actions - 2 columns */}
                <div className="grid grid-cols-2 gap-3">
                    {canAccessWorkers && (
                        <Link href="/workers" className="bg-[#1e293b] rounded-xl p-4 border border-white/5 hover:border-blue-500/30 transition-colors">
                            <span className="text-2xl block mb-2">👷</span>
                            <p className="text-white font-semibold">{t.workers}</p>
                            <p className="text-white/40 text-xs">{stats.totalWorkers} {t.registered}</p>
                        </Link>
                    )}
                    {canAccessKhata && (
                        <Link href="/khata" className="bg-[#1e293b] rounded-xl p-4 border border-white/5 hover:border-green-500/30 transition-colors">
                            <span className="text-2xl block mb-2">💰</span>
                            <p className="text-white font-semibold">{t.expenses}</p>
                            <p className="text-white/40 text-xs">{t.ledger}</p>
                        </Link>
                    )}
                    {canAccessAdmin && (
                        <Link href="/admin" className="bg-[#1e293b] rounded-xl p-4 border border-white/5 hover:border-purple-500/30 transition-colors">
                            <span className="text-2xl block mb-2">⚙️</span>
                            <p className="text-white font-semibold">{t.admin}</p>
                            <p className="text-white/40 text-xs">{t.settings}</p>
                        </Link>
                    )}
                    {canAccessOwner && (
                        <Link href="/owner" className="bg-[#1e293b] rounded-xl p-4 border border-white/5 hover:border-amber-500/30 transition-colors">
                            <span className="text-2xl block mb-2">👑</span>
                            <p className="text-white font-semibold">{t.owner}</p>
                            <p className="text-white/40 text-xs">{t.fullControl}</p>
                        </Link>
                    )}
                    {(userRole === 'accountant' || isAdmin) && (
                        <Link href="/accountant" className="bg-[#1e293b] rounded-xl p-4 border border-white/5 hover:border-indigo-500/30 transition-colors">
                            <span className="text-2xl block mb-2">📋</span>
                            <p className="text-white font-semibold">{t.accounts}</p>
                            <p className="text-white/40 text-xs">{t.reports}</p>
                        </Link>
                    )}
                </div>

                {/* Day Summary Button */}
                {(userRole === 'manager' || isAdmin || userRole === 'owner') && (
                    <button
                        onClick={() => setShowDayEnd(true)}
                        className="w-full py-4 bg-[#1e293b] border border-white/5 rounded-xl text-white/70 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2"
                    >
                        <span>📊</span> {t.daySummary}
                    </button>
                )}
            </main>

            {/* Day End Summary Modal */}
            {showDayEnd && (
                <DayEndSummary
                    stats={stats}
                    workers={workers}
                    logs={todayLogs}
                    onClose={() => setShowDayEnd(false)}
                    isAccountant={userRole === 'accountant'}
                />
            )}
        </div>
    );
}

// Components
function StatCard({ value, label, color, isText }: { value: string | number, label: string, color: string, isText?: boolean }) {
    const colors: any = {
        green: 'text-green-400 from-green-500/20 to-green-600/5 border-green-500/30',
        orange: 'text-orange-400 from-orange-500/20 to-orange-600/5 border-orange-500/30',
        red: 'text-red-400 from-red-500/20 to-red-600/5 border-red-500/30',
        purple: 'text-purple-400 from-purple-500/20 to-purple-600/5 border-purple-500/30',
        cyan: 'text-cyan-400 from-cyan-500/20 to-cyan-600/5 border-cyan-500/30',
        yellow: 'text-yellow-400 from-yellow-500/20 to-yellow-600/5 border-yellow-500/30'
    };

    return (
        <div className={`bg-gradient-to-br ${colors[color]} backdrop-blur-md rounded-2xl p-3 lg:p-4 border flex flex-col items-center justify-center`}>
            <span className={`font-bold ${isText ? 'text-lg lg:text-xl' : 'text-2xl lg:text-3xl'}`}>{value}</span>
            <span className="text-white/40 text-[10px] lg:text-xs uppercase tracking-wider">{label}</span>
        </div>
    );
}

function DayEndSummary({ stats, workers, logs, onClose, isAccountant }: any) {
    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#0f172a] w-full max-w-lg rounded-3xl border border-white/10 p-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-6 text-center">Day Summary</h2>

                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                        <p className="text-3xl font-bold text-green-400">{stats.presentToday + stats.checkedOut}</p>
                        <p className="text-green-400/70 text-sm">Total Present</p>
                    </div>
                    <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/20">
                        <p className="text-2xl font-bold text-yellow-400">₹{stats.totalWages.toLocaleString()}</p>
                        <p className="text-yellow-400/70 text-sm">{isAccountant ? 'Total Expense' : 'Total Wages'}</p>
                    </div>
                    <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                        <p className="text-3xl font-bold text-red-400">{stats.absent}</p>
                        <p className="text-red-400/70 text-sm">Absent</p>
                    </div>
                    <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20">
                        <p className="text-3xl font-bold text-purple-400">{stats.halfDay}</p>
                        <p className="text-purple-400/70 text-sm">Half Day</p>
                    </div>
                </div>

                {/* Worker List */}
                <div className="space-y-2 mb-6">
                    <h3 className="text-white/70 text-sm font-medium">Attendance List</h3>
                    {logs.map((log: any) => (
                        <div key={log.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden">
                                    {log.workers?.photo_url ? <img src={log.workers.photo_url} alt="" className="w-full h-full object-cover" />
                                        : <span className="flex items-center justify-center h-full text-white text-xs text-center pt-2 font-bold">{log.workers?.name?.charAt(0)}</span>}
                                </div>
                                <span className="text-white text-sm">{log.workers?.name}</span>
                            </div>
                            <div className="text-right">
                                <span className={`text-xs ${log.status === 'half-day' ? 'text-purple-400' : 'text-green-400'}`}>
                                    {log.status === 'half-day' ? 'Half' : 'Full'}
                                </span>
                                <p className="text-white/40 text-xs">₹{log.status === 'half-day' ? (log.workers?.base_rate || 500) / 2 : log.workers?.base_rate || 500}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Absent List */}
                {stats.absent > 0 && (
                    <div className="space-y-2 mb-6">
                        <h3 className="text-red-400/70 text-sm font-medium">Absent Today</h3>
                        {workers.filter((w: any) => w.is_active && !logs.find((l: any) => l.worker_id === w.id)).map((worker: any) => (
                            <div key={worker.id} className="flex items-center gap-3 bg-red-500/10 rounded-xl p-3">
                                <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden">
                                    {worker.photo_url ? <img src={worker.photo_url} alt="" className="w-full h-full object-cover" />
                                        : <span className="flex items-center justify-center h-full text-white text-xs pt-2 font-bold">{worker.name.charAt(0)}</span>}
                                </div>
                                <span className="text-red-400 text-sm">{worker.name}</span>
                                <span className="ml-auto text-red-400/50 text-xs">ABSENT</span>
                            </div>
                        ))}
                    </div>
                )}

                <button onClick={onClose} className="w-full py-4 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-xl font-medium">Close</button>
            </div>
        </div>
    );
}
