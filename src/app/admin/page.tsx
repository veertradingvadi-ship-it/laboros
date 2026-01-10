'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Stats {
    totalWorkers: number;
    totalStaff: number;
    totalSites: number;
    todayPresent: number;
    todayExpenses: number;
    pendingSettlements: number;
    mismatches: number;
    totalUsers: number;
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats>({
        totalWorkers: 0, totalStaff: 0, totalSites: 0, todayPresent: 0,
        todayExpenses: 0, pendingSettlements: 0, mismatches: 0, totalUsers: 0
    });
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const currentDate = new Date().toISOString().split('T')[0];

    useEffect(() => { loadStats(); }, []);

    const loadStats = async () => {
        try {
            const [workersRes, profilesRes, sitesRes, logsRes, expensesRes, closingsRes] = await Promise.all([
                supabase.from('workers').select('id', { count: 'exact' }),
                supabase.from('profiles').select('id, role', { count: 'exact' }),
                supabase.from('sites').select('id', { count: 'exact' }),
                supabase.from('attendance_logs').select('*, workers(name)').eq('date', currentDate).order('check_in_time', { ascending: false }),
                supabase.from('expenses').select('amount').eq('date', currentDate),
                supabase.from('daily_closings').select('*').eq('status', 'MISMATCH'),
            ]);

            const staff = (profilesRes.data || []).filter((p: any) => ['admin', 'owner', 'manager', 'accountant'].includes(p.role));
            const logs = logsRes.data || [];
            const expenses = expensesRes.data || [];

            setStats({
                totalWorkers: workersRes.count || 0,
                totalStaff: staff.length,
                totalSites: sitesRes.count || 0,
                todayPresent: logs.filter((l: any) => l.check_in_time).length,
                todayExpenses: expenses.reduce((sum: number, e: any) => sum + e.amount, 0),
                pendingSettlements: 0,
                mismatches: (closingsRes.data || []).length,
                totalUsers: profilesRes.count || 0,
            });
            setRecentLogs(logs.slice(0, 8));
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="space-y-8">
            {/* Colorful Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="👷" value={stats.totalWorkers} label="Total Workers"
                    gradient="from-blue-600/20 to-blue-800/20" border="border-blue-500/30" text="text-blue-400"
                    link="/admin/workers" />

                <StatCard icon="📍" value={stats.totalSites} label="Total Sites"
                    gradient="from-teal-600/20 to-teal-800/20" border="border-teal-500/30" text="text-teal-400"
                    link="/admin/sites" />

                <StatCard icon="👥" value={stats.totalStaff} label="Total Staff"
                    gradient="from-purple-600/20 to-purple-800/20" border="border-purple-500/30" text="text-purple-400"
                    link="/admin/users" />

                <StatCard icon="✅" value={stats.todayPresent} label="Present Today"
                    gradient="from-green-600/20 to-green-800/20" border="border-green-500/30" text="text-green-400"
                    link="/admin/attendance" />

                <StatCard icon="💰" value={`₹${stats.todayExpenses.toLocaleString()}`} label="Today Expenses"
                    gradient="from-amber-600/20 to-amber-800/20" border="border-amber-500/30" text="text-amber-400"
                    link="/admin/finance" />

                <StatCard icon="⚠️" value={stats.mismatches} label="Audit Mismatches"
                    gradient="from-red-600/20 to-red-800/20" border="border-red-500/30" text="text-red-400"
                    link="/admin/audit" />

                <StatCard icon="⚙️" value="Settings" label="Configure System"
                    gradient="from-slate-700/40 to-slate-800/40" border="border-white/10" text="text-slate-300"
                    link="/admin/settings" />

                <StatCard icon="👤" value={stats.totalUsers} label="Total Users"
                    gradient="from-cyan-600/20 to-cyan-800/20" border="border-cyan-500/30" text="text-cyan-400"
                    link="/admin/users" />
            </div>

            {/* Test Role Dashboards */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-2">🧪 Test Role Views</h3>
                <p className="text-sm text-slate-400 mb-6">Switch view to verify role-specific dashboards</p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <Link href="/owner" className="flex flex-col items-center gap-2 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition-all group">
                        <span className="text-2xl group-hover:scale-110 transition-transform">👑</span>
                        <span className="font-medium text-amber-400 text-sm">Owner Panel</span>
                    </Link>
                    <Link href="/dashboard" className="flex flex-col items-center gap-2 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition-all group">
                        <span className="text-2xl group-hover:scale-110 transition-transform">📋</span>
                        <span className="font-medium text-blue-400 text-sm">Manager View</span>
                    </Link>
                    <Link href="/accountant" className="flex flex-col items-center gap-2 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-all group">
                        <span className="text-2xl group-hover:scale-110 transition-transform">📊</span>
                        <span className="font-medium text-purple-400 text-sm">Accountant</span>
                    </Link>
                    <Link href="/scanner" className="flex flex-col items-center gap-2 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl hover:bg-cyan-500/20 transition-all group">
                        <span className="text-2xl group-hover:scale-110 transition-transform">📷</span>
                        <span className="font-medium text-cyan-400 text-sm">Scanner</span>
                    </Link>
                    <Link href="/khata" className="flex flex-col items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-xl hover:bg-green-500/20 transition-all group">
                        <span className="text-2xl group-hover:scale-110 transition-transform">💰</span>
                        <span className="font-medium text-green-400 text-sm">Khata</span>
                    </Link>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Attendance */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h3 className="font-bold text-white">Today's Attendance</h3>
                        <Link href="/admin/attendance" className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors">View All</Link>
                    </div>
                    <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {recentLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                <span className="text-2xl mb-2">💤</span>
                                <p className="text-sm">No activity yet</p>
                            </div>
                        ) : (
                            recentLogs.map((log: any) => (
                                <div key={log.id} className="px-6 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-600 rounded-full flex items-center justify-center text-sm border border-white/10">
                                            {log.workers?.name?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-white">{log.workers?.name || 'Unknown'}</p>
                                            <p className="text-xs text-slate-400 font-mono">
                                                {log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${log.check_out_time
                                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                        : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                                        {log.check_out_time ? 'Left' : 'Present'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions Grid */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                    <h3 className="font-bold text-white mb-6">Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <ActionButton icon="👷" label="Add Worker" href="/admin/workers?action=add"
                            color="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/20" />
                        <ActionButton icon="👤" label="Add User" href="/admin/users?action=add"
                            color="bg-green-600/20 hover:bg-green-600/30 text-green-300 border-green-500/20" />
                        <ActionButton icon="📍" label="Add Site" href="/admin/sites?action=add"
                            color="bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border-teal-500/20" />
                        <ActionButton icon="📊" label="Full Report" href="/admin/attendance"
                            color="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/20" />
                        <ActionButton icon="💰" label="Add Expense" href="/admin/finance"
                            color="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border-amber-500/20" />
                        <ActionButton icon="📋" label="Audit Log" href="/admin/audit"
                            color="bg-red-600/20 hover:bg-red-600/30 text-red-300 border-red-500/20" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, value, label, gradient, border, text, link }: { icon: string; value: string | number; label: string; gradient: string; border: string; text: string; link: string }) {
    return (
        <Link href={link} className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-5 relative overflow-hidden group transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20`}>
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-white/10 transition-colors" />

            <div className="flex items-start justify-between relative z-10">
                <div>
                    <p className={`text-3xl font-bold ${text} tracking-tight`}>{value}</p>
                    <p className="text-sm text-slate-300 mt-1 font-medium">{label}</p>
                </div>
                <span className="text-3xl opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all">{icon}</span>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs text-white/40 group-hover:text-white/70 transition-colors">
                <span>View Details</span>
                <span>→</span>
            </div>
        </Link>
    );
}

function ActionButton({ icon, label, href, color }: { icon: string; label: string; href: string; color: string }) {
    return (
        <Link href={href} className={`${color} border rounded-xl p-4 flex items-center gap-3 transition-all hover:translate-x-1`}>
            <span className="text-xl">{icon}</span>
            <span className="text-sm font-medium">{label}</span>
        </Link>
    );
}
