'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Worker } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

interface Stats {
    activeSites: number;
    totalPresent: number;
    burnRate: number;
    pendingAlerts: number;
    totalWorkers: number;
    todayExpenses: number;
}

export default function OwnerDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'live' | 'closings'>('overview');
    const [stats, setStats] = useState<Stats>({
        activeSites: 0, totalPresent: 0, burnRate: 0,
        pendingAlerts: 0, totalWorkers: 0, todayExpenses: 0
    });
    const [recentLogs, setRecentLogs] = useState<any[]>([]);
    const [closings, setClosings] = useState<any[]>([]);
    const [pendingRequests, setPendingRequests] = useState(0);

    const currentDate = new Date().toISOString().split('T')[0];

    useEffect(() => {
        loadData();

        // Real-time subscriptions
        const logsChannel = supabase
            .channel('owner_logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => loadData())
            .subscribe();

        const requestsChannel = supabase
            .channel('owner_requests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, () => loadPendingRequests())
            .subscribe();

        loadPendingRequests();

        return () => {
            supabase.removeChannel(logsChannel);
            supabase.removeChannel(requestsChannel);
        };
    }, []);

    const loadPendingRequests = async () => {
        const { count } = await supabase
            .from('access_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING');
        setPendingRequests(count || 0);
    };

    const loadData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (profile?.role !== 'owner' && profile?.role !== 'admin') {
                router.push('/dashboard');
                return;
            }

            const [sitesRes, workersRes, logsRes, closingsRes, expensesRes] = await Promise.all([
                supabase.from('sites').select('id').eq('is_active', true),
                supabase.from('workers').select('*').eq('is_active', true),
                supabase.from('attendance_logs').select('*, workers(name, base_rate, photo_url)').eq('date', currentDate),
                supabase.from('daily_closings').select('*').order('date', { ascending: false }).limit(7),
                supabase.from('expenses').select('*').eq('date', currentDate),
            ]);

            const workers = workersRes.data || [];
            const logs = logsRes.data || [];
            const expenses = expensesRes.data || [];

            const presentCount = logs.filter((l: any) => l.check_in_time).length;
            const burnRate = logs.reduce((sum: number, log: any) => {
                const rate = log.workers?.base_rate || 500;
                return sum + (log.status === 'half-day' ? rate / 2 : rate);
            }, 0);

            const mismatchCount = (closingsRes.data || []).filter((c: any) => c.status === 'MISMATCH').length;

            setStats({
                activeSites: sitesRes.data?.length || 0,
                totalPresent: presentCount,
                burnRate,
                pendingAlerts: mismatchCount,
                totalWorkers: workers.length,
                todayExpenses: expenses.reduce((sum: number, e: any) => sum + e.amount, 0),
            });
            setRecentLogs(logs);
            setClosings(closingsRes.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
                <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'tasks', label: 'Team Tasks', icon: '📝' },
        { id: 'live', label: 'Live Feed', icon: '📷' },
        { id: 'closings', label: 'Closings', icon: '📋' },
    ];

    return (
        <div className="space-y-4">
            {/* Stats Overview */}
            {pendingRequests > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-orange-400 text-sm">{pendingRequests} Pending Access Requests</span>
                    <button onClick={() => router.push('/admin/access-requests')} className="px-3 py-1 bg-orange-500 text-white rounded-lg text-xs">
                        View
                    </button>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-[#1e293b] text-white/60 hover:text-white border border-white/5'
                            }`}>
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Main Content */}
            <div>
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
                            <OwnerStatCard icon="📍" label="Sites" value={stats.activeSites} gradient="from-blue-500 to-cyan-600" />
                            <OwnerStatCard icon="👷" label="Present" value={stats.totalPresent} gradient="from-green-500 to-emerald-600" />
                            <OwnerStatCard icon="💰" label="Burn Rate" value={`₹${stats.burnRate.toLocaleString()}`} gradient="from-amber-500 to-orange-600" />
                            <OwnerStatCard icon="👥" label="Workers" value={stats.totalWorkers} gradient="from-purple-500 to-violet-600" />
                            <OwnerStatCard icon="💵" label="Expenses" value={`₹${stats.todayExpenses.toLocaleString()}`} gradient="from-pink-500 to-rose-600" />
                            <OwnerStatCard icon="⚠️" label="Alerts" value={stats.pendingAlerts} gradient={stats.pendingAlerts > 0 ? "from-red-500 to-rose-600" : "from-slate-500 to-slate-600"} />
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 lg:p-6">
                            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                                <span>⚡</span> Quick Actions
                            </h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <ActionButton icon="👷" label="Workers" onClick={() => router.push('/owner/workers')} />
                                <ActionButton icon="📍" label="Sites" onClick={() => router.push('/owner/sites')} />
                                <ActionButton icon="📋" label="Audit" onClick={() => router.push('/owner/audit')} />
                                <ActionButton icon="💰" label="Finance" onClick={() => router.push('/owner/finance')} />
                            </div>
                        </div>

                        {/* Today's Attendance - Mobile Cards */}
                        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                                <h2 className="font-semibold text-white">Today's Attendance</h2>
                                <span className="text-xs text-slate-400">{recentLogs.length} entries</span>
                            </div>

                            {/* Mobile View */}
                            <div className="lg:hidden p-4 space-y-3 max-h-[400px] overflow-y-auto">
                                {recentLogs.map(log => (
                                    <div key={log.id} className="bg-black/20 rounded-xl p-3 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                                            {log.proof_url ? (
                                                <img src={log.proof_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                                    {log.workers?.name?.[0] || '?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{log.workers?.name || 'Unknown'}</p>
                                            <p className="text-xs text-slate-400">
                                                {log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                {log.check_out_time && ` → ${new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${log.check_out_time ? 'bg-blue-500/20 text-blue-400' :
                                            log.check_in_time ? 'bg-green-500/20 text-green-400' :
                                                'bg-slate-500/20 text-slate-400'
                                            }`}>
                                            {log.check_out_time ? 'Left' : log.check_in_time ? 'Present' : 'Absent'}
                                        </span>
                                    </div>
                                ))}
                                {recentLogs.length === 0 && (
                                    <p className="text-center text-slate-500 py-8">No attendance yet today</p>
                                )}
                            </div>

                            {/* Desktop View: Table */}
                            <div className="hidden lg:block overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-black/20 text-slate-400">
                                        <tr>
                                            <th className="text-left py-3 px-4">Photo</th>
                                            <th className="text-left py-3 px-4">Worker</th>
                                            <th className="text-left py-3 px-4">Check In</th>
                                            <th className="text-left py-3 px-4">Check Out</th>
                                            <th className="text-left py-3 px-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {recentLogs.map(log => (
                                            <tr key={log.id} className="hover:bg-white/5 text-white">
                                                <td className="py-3 px-4">
                                                    {log.proof_url ? (
                                                        <img src={log.proof_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center text-slate-400">📷</div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">{log.workers?.name || 'Unknown'}</td>
                                                <td className="py-3 px-4">{log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                                <td className="py-3 px-4">{log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                                <td className="py-3 px-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${log.check_out_time ? 'bg-blue-500/20 text-blue-400' :
                                                        log.check_in_time ? 'bg-green-500/20 text-green-400' :
                                                            'bg-slate-500/20 text-slate-400'
                                                        }`}>
                                                        {log.check_out_time ? 'Left' : log.check_in_time ? 'Present' : 'Absent'}
                                                    </span>
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
                        <span className="text-4xl block mb-4">👁️</span>
                        <p className="text-white font-medium mb-4">Monitor Accountant Activities</p>
                        <p className="text-sm text-slate-400 mb-6">See what your team did & assign new tasks</p>
                        <button
                            onClick={() => router.push('/owner/tasks')}
                            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium hover:from-amber-400 hover:to-orange-400"
                        >
                            Open Task Monitor →
                        </button>
                    </div>
                )}

                {activeTab === 'live' && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 lg:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-white flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                Live Verification Feed
                            </h2>
                            <span className="text-xs text-slate-400">Today's Scans</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 lg:gap-3">
                            {recentLogs.filter((l: any) => l.proof_url).map((log: any) => (
                                <div key={log.id} className="relative group aspect-square">
                                    <img
                                        src={log.proof_url}
                                        alt={log.workers?.name}
                                        className="w-full h-full object-cover rounded-xl"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-2">
                                        <p className="text-white text-xs font-medium truncate">{log.workers?.name}</p>
                                        <p className="text-white/70 text-[10px]">
                                            {log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {recentLogs.filter((l: any) => l.proof_url).length === 0 && (
                                <div className="col-span-full text-center py-12 text-slate-500">
                                    <span className="text-4xl block mb-2">📷</span>
                                    No proof photos yet today
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'closings' && (
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-white/10">
                            <h2 className="font-semibold text-white">Daily Closings</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            {closings.length === 0 ? (
                                <p className="text-center text-slate-500 py-8">No closings recorded yet</p>
                            ) : (
                                closings.map(c => (
                                    <div key={c.id} className="bg-black/20 rounded-xl p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{c.status === 'MATCHED' ? '✅' : c.status === 'MISMATCH' ? '❌' : '⏳'}</span>
                                            <div>
                                                <p className="text-white font-medium">
                                                    {new Date(c.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    System: {c.system_count} | Notebook: {c.notebook_count}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${c.status === 'MATCHED' ? 'bg-green-500/20 text-green-400' :
                                            c.status === 'MISMATCH' ? 'bg-red-500/20 text-red-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                                            }`}>{c.status}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


function OwnerStatCard({ icon, label, value, gradient }: { icon: string; label: string; value: string | number; gradient: string }) {
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

function ActionButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className="flex items-center gap-2 p-3 lg:p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 hover:border-white/20 transition text-sm text-white">
            <span className="text-lg lg:text-xl">{icon}</span>
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}
