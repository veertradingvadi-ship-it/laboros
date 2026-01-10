'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface DailyClosing {
    id: string;
    date: string;
    site_id: string;
    expected_workers: number;
    scanned_workers: number;
    status: string;
    notes: string | null;
    closed_by: string;
    sites?: { name: string };
}

export default function AdminAuditPage() {
    const [closings, setClosings] = useState<DailyClosing[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'OK' | 'MISMATCH'>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showSettings, setShowSettings] = useState(false);
    const [dateRange, setDateRange] = useState<'all' | '7' | '30' | '90'>('all');
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => { loadClosings(); }, [dateRange]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const loadClosings = async () => {
        setLoading(true);
        let query = supabase
            .from('daily_closings')
            .select('*, sites(name)')
            .order('date', { ascending: false });

        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            query = query.gte('date', startDate.toISOString().split('T')[0]);
        }

        const { data } = await query.limit(500);
        setClosings(data || []);
        setLoading(false);
        setSelectedIds(new Set());
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === filteredClosings.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredClosings.map(c => c.id)));
        }
    };

    const deleteSelected = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Delete ${selectedIds.size} audit log entries? This cannot be undone.`)) return;

        const { error } = await supabase
            .from('daily_closings')
            .delete()
            .in('id', Array.from(selectedIds));

        if (!error) {
            setNotification({ type: 'success', message: `Deleted ${selectedIds.size} entries` });
            loadClosings();
        } else {
            setNotification({ type: 'error', message: error.message });
        }
    };

    const deleteOldEntries = async (days: number) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        if (!confirm(`Delete all entries older than ${days} days?`)) return;

        const { error } = await supabase
            .from('daily_closings')
            .delete()
            .lt('date', cutoffDate.toISOString().split('T')[0]);

        if (!error) {
            setNotification({ type: 'success', message: `Cleaned up old entries` });
            loadClosings();
        } else {
            setNotification({ type: 'error', message: error.message });
        }
    };

    const exportAuditLog = () => {
        const headers = ['Date', 'Site', 'Expected', 'Scanned', 'Status', 'Notes'];
        const rows = filteredClosings.map(c => [
            c.date,
            c.sites?.name || '-',
            c.expected_workers,
            c.scanned_workers,
            c.status,
            c.notes || ''
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
        const link = document.createElement("a");
        link.href = encodeURI(csvContent);
        link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setNotification({ type: 'success', message: 'Audit log exported' });
    };

    const filteredClosings = closings.filter(c => filter === 'all' || c.status === filter);

    const stats = {
        total: closings.length,
        ok: closings.filter(c => c.status === 'OK').length,
        mismatch: closings.filter(c => c.status === 'MISMATCH').length,
    };

    return (
        <div className="space-y-6 relative">
            {/* Toast */}
            {notification && (
                <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 ${notification.type === 'success'
                    ? 'bg-slate-900/90 border-green-500/30 text-green-400'
                    : 'bg-slate-900/90 border-red-500/30 text-red-400'
                    }`}>
                    <span className="text-2xl">{notification.type === 'success' ? '✓' : '⚠️'}</span>
                    <span className="font-medium">{notification.message}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-white">📋 Audit Log</h1>
                    <p className="text-sm text-slate-400">Daily closing records and mismatches</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportAuditLog}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-cyan-400 hover:bg-white/10"
                    >
                        📥 Export
                    </button>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-400 hover:bg-white/10"
                    >
                        ⚙️ Settings
                    </button>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                    <h3 className="text-white font-medium">Log Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 block mb-2">Date Range</label>
                            <select
                                value={dateRange}
                                onChange={(e) => setDateRange(e.target.value as any)}
                                className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                            >
                                <option value="all" className="bg-slate-900">All Time</option>
                                <option value="7" className="bg-slate-900">Last 7 Days</option>
                                <option value="30" className="bg-slate-900">Last 30 Days</option>
                                <option value="90" className="bg-slate-900">Last 90 Days</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-2">Cleanup Old Data</label>
                            <div className="flex gap-2">
                                <button onClick={() => deleteOldEntries(30)} className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm hover:bg-red-500/20">
                                    30+ days
                                </button>
                                <button onClick={() => deleteOldEntries(60)} className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm hover:bg-red-500/20">
                                    60+ days
                                </button>
                                <button onClick={() => deleteOldEntries(90)} className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm hover:bg-red-500/20">
                                    90+ days
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button onClick={() => setFilter('all')}
                    className={`p-4 rounded-xl border transition-all duration-200 text-center ${filter === 'all'
                        ? 'bg-slate-700/50 border-slate-600 text-white shadow-lg shadow-slate-900/20'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-sm opacity-70">Total Closings</p>
                </button>
                <button onClick={() => setFilter('OK')}
                    className={`p-4 rounded-xl border transition-all duration-200 text-center ${filter === 'OK'
                        ? 'bg-green-500/20 border-green-500/50 text-green-400 shadow-lg shadow-green-900/20'
                        : 'bg-white/5 border-white/10 text-green-700/70 hover:bg-green-500/10 hover:text-green-400'}`}>
                    <p className="text-2xl font-bold">{stats.ok}</p>
                    <p className="text-sm opacity-70">OK</p>
                </button>
                <button onClick={() => setFilter('MISMATCH')}
                    className={`p-4 rounded-xl border transition-all duration-200 text-center ${filter === 'MISMATCH'
                        ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-lg shadow-red-900/20'
                        : 'bg-white/5 border-white/10 text-red-700/70 hover:bg-red-500/10 hover:text-red-400'}`}>
                    <p className="text-2xl font-bold">{stats.mismatch}</p>
                    <p className="text-sm opacity-70">Mismatches</p>
                </button>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-white">{selectedIds.size} selected</span>
                    <button
                        onClick={deleteSelected}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
                    >
                        🗑️ Delete Selected
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-black/20 border-b border-white/5">
                                <tr>
                                    <th className="px-4 py-4 text-left">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size === filteredClosings.length && filteredClosings.length > 0}
                                            onChange={selectAll}
                                            className="w-4 h-4 rounded"
                                        />
                                    </th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Date</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Site</th>
                                    <th className="px-6 py-4 text-center text-slate-400 font-medium">Expected</th>
                                    <th className="px-6 py-4 text-center text-slate-400 font-medium">Scanned</th>
                                    <th className="px-6 py-4 text-center text-slate-400 font-medium">Status</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredClosings.map(closing => (
                                    <tr key={closing.id} className={`transition-colors hover:bg-white/5 ${closing.status === 'MISMATCH' ? 'bg-red-500/5' : ''}`}>
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(closing.id)}
                                                onChange={() => toggleSelect(closing.id)}
                                                className="w-4 h-4 rounded"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-medium text-white">{new Date(closing.date).toLocaleDateString('en-IN')}</td>
                                        <td className="px-6 py-4 text-slate-300">{closing.sites?.name || '-'}</td>
                                        <td className="px-6 py-4 text-center text-slate-300">{closing.expected_workers}</td>
                                        <td className="px-6 py-4 text-center text-slate-300">{closing.scanned_workers}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${closing.status === 'OK'
                                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                {closing.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-xs italic">{closing.notes || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredClosings.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <span className="text-2xl mb-2">📋</span>
                            <p>No records found</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
