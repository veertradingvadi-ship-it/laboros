'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Worker } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

export default function ReportsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState('');
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedWorker, setSelectedWorker] = useState<string>('all');
    const [exporting, setExporting] = useState(false);

    // Stats
    const [stats, setStats] = useState({ totalDays: 0, totalPresent: 0, totalHalfDay: 0, totalWages: 0 });

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (!loading) loadReports();
    }, [startDate, endDate, selectedWorker, loading]);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role || 'manager');

        const { data: workersData } = await supabase.from('workers').select('*').eq('is_active', true).order('name');
        setWorkers(workersData || []);
        setLoading(false);
    };

    const loadReports = async () => {
        let query = supabase
            .from('attendance_logs')
            .select('*, workers(id, name, photo_url, base_rate, category)')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: false });

        if (selectedWorker !== 'all') {
            query = query.eq('worker_id', selectedWorker);
        }

        const { data } = await query;
        setLogs(data || []);

        // Calculate stats
        const totalPresent = (data || []).filter(l => l.status === 'present').length;
        const totalHalfDay = (data || []).filter(l => l.status === 'half-day').length;
        const totalWages = (data || []).reduce((sum, l) => {
            const rate = l.workers?.base_rate || 500;
            return sum + (l.status === 'half-day' ? rate / 2 : rate);
        }, 0);

        const dates = new Set((data || []).map(l => l.date));

        setStats({ totalDays: dates.size, totalPresent, totalHalfDay, totalWages });
    };

    const exportToCSV = () => {
        setExporting(true);
        try {
            // Create CSV content
            const headers = ['Date', 'Worker Name', 'Category', 'Status', 'Check In', 'Check Out', 'Rate', 'Amount'];
            const rows = logs.map(log => [
                log.date,
                log.workers?.name || 'Unknown',
                log.workers?.category || '-',
                log.status === 'half-day' ? 'Half Day' : 'Present',
                log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
                log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
                `₹${log.workers?.base_rate || 500}`,
                `₹${log.status === 'half-day' ? (log.workers?.base_rate || 500) / 2 : (log.workers?.base_rate || 500)}`
            ]);

            // Add summary row
            rows.push([]);
            rows.push(['SUMMARY', '', '', '', '', '', '', '']);
            rows.push(['Total Days', stats.totalDays, '', '', '', '', '', '']);
            rows.push(['Total Present', stats.totalPresent, '', '', '', '', '', '']);
            rows.push(['Total Half Day', stats.totalHalfDay, '', '', '', '', '', '']);
            rows.push(['Total Wages', '', '', '', '', '', '', `₹${stats.totalWages}`]);

            const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');

            // Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `attendance_${startDate}_to_${endDate}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export error:', err);
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/30 to-slate-900">
            {/* Header */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10" />
                <div className="relative px-4 py-4 backdrop-blur-xl border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <button onClick={() => router.push('/dashboard')} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">←</button>
                        <h1 className="text-xl font-bold text-white">Reports & Export</h1>
                        <div className="w-10" />
                    </div>
                </div>
            </div>

            <div className="p-4 max-w-4xl mx-auto space-y-4">
                {/* Filters */}
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
                    <h3 className="text-white font-medium mb-3">📅 Select Date Range</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="text-white/50 text-xs block mb-1">From</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white" />
                        </div>
                        <div>
                            <label className="text-white/50 text-xs block mb-1">To</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white" />
                        </div>
                        <div>
                            <label className="text-white/50 text-xs block mb-1">Worker</label>
                            <select value={selectedWorker} onChange={(e) => setSelectedWorker(e.target.value)}
                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white">
                                <option value="all" className="bg-slate-800">All Workers</option>
                                {workers.map(w => <option key={w.id} value={w.id} className="bg-slate-800">{w.name}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button onClick={exportToCSV} disabled={exporting || logs.length === 0}
                                className="w-full py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-medium disabled:opacity-50">
                                {exporting ? 'Exporting...' : '📥 Export CSV'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Date Buttons */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                    <button onClick={() => { setStartDate(new Date().toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); }}
                        className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm whitespace-nowrap">Today</button>
                    <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setStartDate(d.toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); }}
                        className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm whitespace-nowrap">Last 7 Days</button>
                    <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setStartDate(d.toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); }}
                        className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm whitespace-nowrap">Last 30 Days</button>
                    <button onClick={() => { const d = new Date(); setStartDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); }}
                        className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm whitespace-nowrap">This Month</button>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-white/10 text-center">
                        <p className="text-2xl font-bold text-cyan-400">{stats.totalDays}</p>
                        <p className="text-white/50 text-xs">Days</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-green-500/20 text-center">
                        <p className="text-2xl font-bold text-green-400">{stats.totalPresent}</p>
                        <p className="text-white/50 text-xs">Full Days</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-purple-500/20 text-center">
                        <p className="text-2xl font-bold text-purple-400">{stats.totalHalfDay}</p>
                        <p className="text-white/50 text-xs">Half Days</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-xl rounded-xl p-3 border border-yellow-500/20 text-center">
                        <p className="text-xl font-bold text-yellow-400">₹{stats.totalWages.toLocaleString()}</p>
                        <p className="text-white/50 text-xs">Total</p>
                    </div>
                </div>

                {/* Attendance Logs */}
                <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                        <h3 className="text-white font-bold">Attendance Records ({logs.length})</h3>
                    </div>
                    <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                        {logs.length === 0 ? (
                            <p className="p-8 text-center text-white/40">No records found for selected period</p>
                        ) : logs.map((log) => (
                            <div key={log.id} className="p-3 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                                    {log.workers?.photo_url ? <img src={log.workers.photo_url} alt="" className="w-full h-full object-cover" />
                                        : <span className="flex items-center justify-center h-full text-white">{log.workers?.name?.charAt(0) || '?'}</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium text-sm truncate">{log.workers?.name || 'Unknown'}</p>
                                    <p className="text-white/40 text-xs">
                                        {new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} •
                                        {log.check_in_time && ` In: ${new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                        {log.check_out_time && ` → Out: ${new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className={`px-2 py-1 rounded-lg text-xs ${log.status === 'half-day' ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'}`}>
                                        {log.status === 'half-day' ? 'HALF' : 'FULL'}
                                    </span>
                                    <p className="text-white/40 text-xs mt-1">₹{log.status === 'half-day' ? (log.workers?.base_rate || 500) / 2 : log.workers?.base_rate || 500}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Worker Summary */}
                {selectedWorker === 'all' && logs.length > 0 && (
                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
                        <div className="p-4 border-b border-white/10">
                            <h3 className="text-white font-bold">Worker Summary</h3>
                        </div>
                        <div className="p-4 space-y-2">
                            {workers.map(worker => {
                                const workerLogs = logs.filter(l => l.worker_id === worker.id);
                                if (workerLogs.length === 0) return null;

                                const fullDays = workerLogs.filter(l => l.status === 'present').length;
                                const halfDays = workerLogs.filter(l => l.status === 'half-day').length;
                                const total = fullDays * worker.base_rate + halfDays * (worker.base_rate / 2);

                                return (
                                    <div key={worker.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden">
                                                {worker.photo_url ? <img src={worker.photo_url} alt="" className="w-full h-full object-cover" />
                                                    : <span className="flex items-center justify-center h-full text-white text-xs">{worker.name.charAt(0)}</span>}
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-medium">{worker.name}</p>
                                                <p className="text-white/40 text-xs">{fullDays} full + {halfDays} half days</p>
                                            </div>
                                        </div>
                                        <p className="text-yellow-400 font-medium">₹{total.toLocaleString()}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
