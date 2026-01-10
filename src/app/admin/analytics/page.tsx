'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface DailyStats {
    date: string;
    present: number;
    absent: number;
    halfDay: number;
    overtime: number;
    expenses: number;
}

interface SiteStats {
    site_id: string;
    site_name: string;
    workers: number;
    present: number;
}

export default function AnalyticsPage() {
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'7' | '14' | '30'>('7');
    const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
    const [siteStats, setSiteStats] = useState<SiteStats[]>([]);
    const [totals, setTotals] = useState({
        totalWorkers: 0,
        avgPresent: 0,
        totalExpenses: 0,
        totalOvertimeHours: 0
    });

    useEffect(() => {
        loadAnalytics();
    }, [period]);

    const loadAnalytics = async () => {
        setLoading(true);

        const days = parseInt(period);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        // Get attendance logs
        const { data: logs } = await supabase
            .from('attendance_logs')
            .select('*, workers(name, site_id)')
            .gte('date', startDateStr)
            .order('date', { ascending: true });

        // Get expenses
        const { data: expenses } = await supabase
            .from('expenses')
            .select('*')
            .gte('date', startDateStr);

        // Get workers count
        const { data: workers } = await supabase
            .from('workers')
            .select('id, site_id')
            .eq('is_active', true);

        // Get sites
        const { data: sites } = await supabase
            .from('sites')
            .select('id, name')
            .eq('is_active', true);

        // Process daily stats
        const dailyMap: Record<string, DailyStats> = {};

        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dailyMap[dateStr] = { date: dateStr, present: 0, absent: 0, halfDay: 0, overtime: 0, expenses: 0 };
        }

        (logs || []).forEach((log: any) => {
            if (dailyMap[log.date]) {
                if (log.check_in_time) dailyMap[log.date].present++;
                if (log.status === 'half-day') dailyMap[log.date].halfDay++;
                if (log.overtime_hours) dailyMap[log.date].overtime += log.overtime_hours;
            }
        });

        (expenses || []).forEach((exp: any) => {
            if (dailyMap[exp.date]) {
                dailyMap[exp.date].expenses += exp.amount;
            }
        });

        const sortedStats = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        setDailyStats(sortedStats);

        // Process site stats
        const siteMap: Record<string, SiteStats> = {};
        (sites || []).forEach((site: any) => {
            siteMap[site.id] = { site_id: site.id, site_name: site.name, workers: 0, present: 0 };
        });

        const today = new Date().toISOString().split('T')[0];
        const todayLogs = (logs || []).filter((l: any) => l.date === today);

        todayLogs.forEach((log: any) => {
            const siteId = log.workers?.site_id;
            if (siteId && siteMap[siteId] && log.check_in_time) {
                siteMap[siteId].present++;
            }
        });

        (workers || []).forEach((w: any) => {
            if (w.site_id && siteMap[w.site_id]) {
                siteMap[w.site_id].workers++;
            }
        });

        setSiteStats(Object.values(siteMap).filter(s => s.workers > 0));

        // Totals
        const totalPresent = sortedStats.reduce((sum, d) => sum + d.present, 0);
        const totalExpensesVal = sortedStats.reduce((sum, d) => sum + d.expenses, 0);
        const totalOvertime = sortedStats.reduce((sum, d) => sum + d.overtime, 0);

        setTotals({
            totalWorkers: workers?.length || 0,
            avgPresent: Math.round(totalPresent / days),
            totalExpenses: totalExpensesVal,
            totalOvertimeHours: totalOvertime
        });

        setLoading(false);
    };

    const maxPresent = Math.max(...dailyStats.map(d => d.present), 1);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        📊 Analytics Dashboard
                    </h1>
                    <p className="text-sm text-slate-400">Attendance trends and insights</p>
                </div>
                <div className="flex gap-2">
                    {(['7', '14', '30'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${period === p
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                }`}>
                            {p} Days
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="👷" label="Total Workers" value={totals.totalWorkers} color="from-blue-500 to-cyan-500" />
                <StatCard icon="📊" label="Avg Present/Day" value={totals.avgPresent} color="from-green-500 to-emerald-500" />
                <StatCard icon="💰" label="Total Expenses" value={`₹${totals.totalExpenses.toLocaleString()}`} color="from-amber-500 to-orange-500" />
                <StatCard icon="⏰" label="Overtime Hours" value={totals.totalOvertimeHours} color="from-purple-500 to-violet-500" />
            </div>

            {/* Attendance Chart */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 lg:p-6">
                <h3 className="text-white font-semibold mb-4">📈 Attendance Trend</h3>
                <div className="h-64 flex items-end gap-1 lg:gap-2 overflow-x-auto pb-4">
                    {dailyStats.map((day, idx) => (
                        <div key={day.date} className="flex flex-col items-center min-w-[40px] lg:min-w-[60px]">
                            <div className="relative w-full flex items-end justify-center h-48 gap-0.5">
                                {/* Present bar */}
                                <div
                                    className="w-4 lg:w-6 bg-gradient-to-t from-green-600 to-green-400 rounded-t transition-all hover:opacity-80"
                                    style={{ height: `${(day.present / maxPresent) * 100}%`, minHeight: day.present > 0 ? '8px' : '0' }}
                                    title={`Present: ${day.present}`}
                                />
                                {/* Half-day bar */}
                                {day.halfDay > 0 && (
                                    <div
                                        className="w-4 lg:w-6 bg-gradient-to-t from-yellow-600 to-yellow-400 rounded-t transition-all hover:opacity-80"
                                        style={{ height: `${(day.halfDay / maxPresent) * 100}%`, minHeight: '8px' }}
                                        title={`Half Day: ${day.halfDay}`}
                                    />
                                )}
                            </div>
                            <span className="text-[10px] lg:text-xs text-slate-500 mt-2 transform -rotate-45 lg:rotate-0">
                                {new Date(day.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="flex gap-4 mt-2 text-xs">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded" />
                        <span className="text-slate-400">Present</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded" />
                        <span className="text-slate-400">Half Day</span>
                    </div>
                </div>
            </div>

            {/* Expense Chart */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 lg:p-6">
                <h3 className="text-white font-semibold mb-4">💰 Daily Expenses</h3>
                <div className="h-32 flex items-end gap-1 lg:gap-2 overflow-x-auto pb-4">
                    {dailyStats.map(day => {
                        const maxExp = Math.max(...dailyStats.map(d => d.expenses), 1);
                        return (
                            <div key={day.date} className="flex flex-col items-center min-w-[40px] lg:min-w-[60px]">
                                <div
                                    className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t transition-all hover:opacity-80"
                                    style={{ height: `${(day.expenses / maxExp) * 100}%`, minHeight: day.expenses > 0 ? '4px' : '0' }}
                                    title={`₹${day.expenses.toLocaleString()}`}
                                />
                                <span className="text-[10px] text-slate-500 mt-1">
                                    {day.expenses > 0 ? `₹${(day.expenses / 1000).toFixed(0)}k` : '-'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Site-wise Stats */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                    <h3 className="font-semibold text-white">📍 Site-wise Attendance (Today)</h3>
                </div>
                <div className="p-4 space-y-3">
                    {siteStats.length === 0 ? (
                        <p className="text-center text-slate-500 py-4">No site data available</p>
                    ) : (
                        siteStats.map(site => (
                            <div key={site.site_id} className="bg-black/20 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-white font-medium">{site.site_name}</span>
                                    <span className="text-cyan-400 font-bold">{site.present}/{site.workers}</span>
                                </div>
                                <div className="w-full bg-black/30 rounded-full h-2">
                                    <div
                                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all"
                                        style={{ width: `${site.workers > 0 ? (site.present / site.workers) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
    return (
        <div className="relative overflow-hidden bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4">
            <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-10`} />
            <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{icon}</span>
                    <span className="text-xs text-slate-400">{label}</span>
                </div>
                <p className="text-2xl font-bold text-white">{value}</p>
            </div>
        </div>
    );
}
