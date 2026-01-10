'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

interface DailyReport {
    date: string;
    presentCount: number;
    absentCount: number;
    totalExpenses: number;
    totalHours: number;
    status: 'OK' | 'MISMATCH' | 'PENDING';
}

interface RecentExpense {
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    created_by: string;
}

export default function AccountantDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');
    const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'expenses' | 'attendance' | 'settlements'>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Stats
    const [todayStats, setTodayStats] = useState({ present: 0, expenses: 0, hours: 0, workers: 0 });
    const [weeklyReports, setWeeklyReports] = useState<DailyReport[]>([]);
    const [recentExpenses, setRecentExpenses] = useState<RecentExpense[]>([]);
    const [monthTotal, setMonthTotal] = useState({ expenses: 0, attendance: 0, wages: 0 });

    const currentDate = new Date().toISOString().split('T')[0];

    useEffect(() => { checkAuth(); }, []);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();
        if (!profile || !['accountant', 'admin', 'owner'].includes(profile.role)) {
            router.push('/dashboard');
            return;
        }
        setUserEmail(profile.email || '');
        await loadData();
        setLoading(false);
    };

    const loadData = async () => {
        const monthStart = new Date();
        monthStart.setDate(1);
        const monthStartStr = monthStart.toISOString().split('T')[0];

        const weekDates = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        }).reverse();

        const [todayLogsRes, expensesRes, allLogsRes, closingsRes, workersRes] = await Promise.all([
            supabase.from('attendance_logs').select('*').eq('date', currentDate),
            supabase.from('expenses').select('*').gte('date', monthStartStr).order('created_at', { ascending: false }),
            supabase.from('attendance_logs').select('*').gte('date', monthStartStr),
            supabase.from('daily_closings').select('*').in('date', weekDates),
            supabase.from('workers').select('id, base_rate').eq('is_active', true),
        ]);

        const todayLogs = todayLogsRes.data || [];
        const expenses = expensesRes.data || [];
        const allLogs = allLogsRes.data || [];
        const closings = closingsRes.data || [];
        const workers = workersRes.data || [];

        const todayExpenses = expenses.filter(e => e.date === currentDate);
        let totalHours = 0;
        todayLogs.forEach(log => {
            if (log.check_in_time && log.check_out_time) {
                totalHours += (new Date(log.check_out_time).getTime() - new Date(log.check_in_time).getTime()) / 3600000;
            }
        });

        setTodayStats({
            present: todayLogs.filter(l => l.check_in_time).length,
            expenses: todayExpenses.reduce((sum, e) => sum + e.amount, 0),
            hours: Math.round(totalHours),
            workers: workers.length,
        });

        const reports: DailyReport[] = weekDates.map(date => {
            const dayLogs = allLogs.filter(l => l.date === date);
            const dayExpenses = expenses.filter(e => e.date === date);
            const closing = closings.find(c => c.date === date);

            let dayHours = 0;
            dayLogs.forEach(log => {
                if (log.check_in_time && log.check_out_time) {
                    dayHours += (new Date(log.check_out_time).getTime() - new Date(log.check_in_time).getTime()) / 3600000;
                }
            });

            return {
                date,
                presentCount: dayLogs.length,
                absentCount: workers.length - dayLogs.length,
                totalExpenses: dayExpenses.reduce((sum, e) => sum + e.amount, 0),
                totalHours: Math.round(dayHours),
                status: closing?.status || 'PENDING' as const,
            };
        });
        setWeeklyReports(reports);
        setRecentExpenses(expenses.slice(0, 20));

        const monthExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const monthAttendance = allLogs.length;
        const avgRate = workers.length > 0 ? workers.reduce((sum, w) => sum + w.base_rate, 0) / workers.length : 500;
        setMonthTotal({ expenses: monthExpenses, attendance: monthAttendance, wages: monthAttendance * avgRate });
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'tasks', label: 'My Tasks', icon: '📝' },
        { id: 'expenses', label: 'Expenses', icon: '💰' },
        { id: 'attendance', label: 'Attendance', icon: '📋' },
        { id: 'settlements', label: 'Settlements', icon: '💵' },
    ];

    return (
        <div className="min-h-screen bg-slate-900">
            {/* Background Gradient */}
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 pointer-events-none" />

            {/* Mobile Header */}
            <header className="sticky top-0 z-50 bg-black/40 backdrop-blur-xl border-b border-white/10 px-4 py-3 lg:px-8 lg:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-white text-lg">
                            ←
                        </button>
                        <div>
                            <h1 className="text-lg lg:text-xl font-bold text-white">Accounts</h1>
                            <p className="text-xs text-cyan-400 hidden sm:block">{COMPANY_NAME}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 lg:gap-4">
                        <span className="text-xs text-slate-400 hidden sm:block">{userEmail}</span>
                        <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs lg:text-sm hover:bg-red-500/20">
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* Tab Navigation - Mobile: ScrollableHorizontal, Desktop: Fixed */}
            <nav className="sticky top-14 lg:top-16 z-40 bg-black/30 backdrop-blur-lg border-b border-white/10 overflow-x-auto scrollbar-hide">
                <div className="flex gap-1 px-4 py-2 min-w-max">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}>
                            <span>{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </nav>

            {/* Main Content */}
            <main className="relative z-10 p-4 lg:p-8 pb-24">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Today's Stats Grid - Mobile: 2col, Desktop: 4col */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                            <StatCard icon="✅" label="Present" value={todayStats.present} gradient="from-green-500 to-emerald-600" />
                            <StatCard icon="💰" label="Expenses" value={`₹${todayStats.expenses.toLocaleString()}`} gradient="from-blue-500 to-cyan-600" />
                            <StatCard icon="⏱️" label="Hours" value={`${todayStats.hours}h`} gradient="from-purple-500 to-violet-600" />
                            <StatCard icon="👷" label="Workers" value={todayStats.workers} gradient="from-orange-500 to-amber-600" />
                        </div>

                        {/* Month Summary Card */}
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 lg:p-6">
                            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                                <span>📅</span> This Month
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-xl lg:text-3xl font-bold text-cyan-400">₹{monthTotal.expenses.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 mt-1">Expenses</p>
                                </div>
                                <div>
                                    <p className="text-xl lg:text-3xl font-bold text-green-400">{monthTotal.attendance}</p>
                                    <p className="text-xs text-slate-400 mt-1">Man-Days</p>
                                </div>
                                <div>
                                    <p className="text-xl lg:text-3xl font-bold text-purple-400">₹{monthTotal.wages.toLocaleString()}</p>
                                    <p className="text-xs text-slate-400 mt-1">Est. Wages</p>
                                </div>
                            </div>
                        </div>

                        {/* Weekly Report - Mobile: Cards, Desktop: Table */}
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-white/10">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <span>📈</span> Last 7 Days
                                </h3>
                            </div>

                            {/* Mobile View: Cards */}
                            <div className="lg:hidden p-4 space-y-3">
                                {weeklyReports.map(report => (
                                    <div key={report.date} className="bg-black/20 rounded-xl p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-white font-medium text-sm">
                                                {new Date(report.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">
                                                {report.presentCount} present • {report.totalHours}h
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-white font-medium">₹{report.totalExpenses.toLocaleString()}</p>
                                            <span className={`text-xs px-2 py-0.5 rounded ${report.status === 'OK' ? 'bg-green-500/20 text-green-400' :
                                                report.status === 'MISMATCH' ? 'bg-red-500/20 text-red-400' :
                                                    'bg-yellow-500/20 text-yellow-400'
                                                }`}>{report.status}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop View: Table */}
                            <div className="hidden lg:block overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-black/20 text-slate-400">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Date</th>
                                            <th className="px-4 py-3 text-center">Present</th>
                                            <th className="px-4 py-3 text-center">Absent</th>
                                            <th className="px-4 py-3 text-center">Hours</th>
                                            <th className="px-4 py-3 text-right">Expenses</th>
                                            <th className="px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {weeklyReports.map(report => (
                                            <tr key={report.date} className="hover:bg-white/5 text-white">
                                                <td className="px-4 py-3 font-medium">
                                                    {new Date(report.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                </td>
                                                <td className="px-4 py-3 text-center text-green-400">{report.presentCount}</td>
                                                <td className="px-4 py-3 text-center text-slate-400">{report.absentCount}</td>
                                                <td className="px-4 py-3 text-center">{report.totalHours}h</td>
                                                <td className="px-4 py-3 text-right font-medium">₹{report.totalExpenses.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${report.status === 'OK' ? 'bg-green-500/20 text-green-400' :
                                                        report.status === 'MISMATCH' ? 'bg-red-500/20 text-red-400' :
                                                            'bg-yellow-500/20 text-yellow-400'
                                                        }`}>{report.status}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-center">
                        <span className="text-4xl block mb-4">📝</span>
                        <p className="text-white font-medium mb-4">Daily Task Management</p>
                        <p className="text-sm text-slate-400 mb-6">Track your daily checklist and log activities</p>
                        <button
                            onClick={() => router.push('/accountant/tasks')}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400"
                        >
                            Open Task Manager →
                        </button>
                    </div>
                )}

                {activeTab === 'expenses' && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10">
                            <h3 className="font-semibold text-white">💰 Monthly Expenses</h3>
                        </div>

                        {/* Mobile: Cards */}
                        <div className="lg:hidden p-4 space-y-3">
                            {recentExpenses.map(expense => (
                                <div key={expense.id} className="bg-black/20 rounded-xl p-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">{expense.category}</span>
                                            <p className="text-white text-sm mt-1">{expense.description || 'No description'}</p>
                                        </div>
                                        <p className="text-white font-bold">₹{expense.amount.toLocaleString()}</p>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">{new Date(expense.date).toLocaleDateString('en-IN')}</p>
                                </div>
                            ))}
                        </div>

                        {/* Desktop: Table */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-black/20 text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Date</th>
                                        <th className="px-4 py-3 text-left">Category</th>
                                        <th className="px-4 py-3 text-left">Description</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {recentExpenses.map(expense => (
                                        <tr key={expense.id} className="hover:bg-white/5 text-white">
                                            <td className="px-4 py-3">{new Date(expense.date).toLocaleDateString('en-IN')}</td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">{expense.category}</span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-300">{expense.description || '-'}</td>
                                            <td className="px-4 py-3 text-right font-medium">₹{expense.amount.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
                        <span className="text-4xl block mb-4">📋</span>
                        <p className="text-white font-medium">Attendance Report</p>
                        <p className="text-sm text-slate-400 mt-2">Detailed attendance logs coming soon...</p>
                    </div>
                )}

                {activeTab === 'settlements' && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
                        <span className="text-4xl block mb-4">💵</span>
                        <p className="text-white font-medium">Settlements</p>
                        <p className="text-sm text-slate-400 mt-2">10-Day settlement batches coming soon...</p>
                    </div>
                )}
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/10 lg:hidden">
                <div className="flex justify-around py-2">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                            className={`flex flex-col items-center gap-1 px-4 py-2 ${activeTab === tab.id ? 'text-cyan-400' : 'text-slate-500'
                                }`}>
                            <span className="text-xl">{tab.icon}</span>
                            <span className="text-[10px]">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </nav>
        </div>
    );
}

function StatCard({ icon, label, value, gradient }: { icon: string; label: string; value: string | number; gradient: string }) {
    return (
        <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl lg:rounded-2xl p-3 lg:p-4">
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10`} />
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg lg:text-xl">{icon}</span>
                    <span className="text-xs lg:text-sm text-slate-400">{label}</span>
                </div>
                <p className="text-xl lg:text-2xl font-bold text-white">{value}</p>
            </div>
        </div>
    );
}
