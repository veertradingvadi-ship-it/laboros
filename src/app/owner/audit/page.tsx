'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AuditLog {
    id: string;
    table_name: string;
    record_id: string;
    action: string;
    old_values: any;
    new_values: any;
    changed_by: string;
    created_at: string;
}

interface DailyClosing {
    id: string;
    date: string;
    system_count: number;
    notebook_count: number;
    difference: number;
    notes: string | null;
    status: string;
}

export default function OwnerAuditPage() {
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'closings' | 'changes'>('closings');
    const [closings, setClosings] = useState<DailyClosing[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [selectedClosing, setSelectedClosing] = useState<DailyClosing | null>(null);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [closingsRes, auditRes] = await Promise.all([
                supabase.from('daily_closings').select('*').order('date', { ascending: false }).limit(30),
                supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
            ]);
            setClosings(closingsRes.data || []);
            setAuditLogs(auditRes.data || []);
        } finally { setLoading(false); }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-slate-800">Audit & Review</h1>

            {/* Tabs */}
            <div className="flex gap-2">
                <button onClick={() => setTab('closings')}
                    className={`px-4 py-2 rounded-xl text-sm ${tab === 'closings' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>
                    📋 Daily Closings
                </button>
                <button onClick={() => setTab('changes')}
                    className={`px-4 py-2 rounded-xl text-sm ${tab === 'changes' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>
                    📝 Change Log
                </button>
            </div>

            {/* Closings Tab */}
            {tab === 'closings' && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left py-2 px-3">Date</th>
                                <th className="text-left py-2 px-3">System</th>
                                <th className="text-left py-2 px-3">Notebook</th>
                                <th className="text-left py-2 px-3">Diff</th>
                                <th className="text-left py-2 px-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {closings.map(c => (
                                <tr key={c.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedClosing(c)}>
                                    <td className="py-2 px-3">{new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                    <td className="py-2 px-3">{c.system_count}</td>
                                    <td className="py-2 px-3">{c.notebook_count}</td>
                                    <td className="py-2 px-3 font-mono">
                                        <span className={c.difference !== 0 ? 'text-red-600' : 'text-green-600'}>
                                            {c.difference > 0 ? '+' : ''}{c.difference}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3">
                                        <span className={`px-2 py-0.5 rounded text-xs ${c.status === 'MATCHED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {c.status === 'MATCHED' ? '✓ Match' : '✗ Mismatch'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {closings.length === 0 && (
                                <tr><td colSpan={5} className="text-center py-6 text-slate-400">No closings yet</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Change Log Tab */}
            {tab === 'changes' && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="divide-y max-h-96 overflow-y-auto">
                        {auditLogs.map(log => (
                            <div key={log.id} className="px-4 py-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className={`px-2 py-0.5 rounded text-xs mr-2 ${log.action === 'UPDATE' ? 'bg-amber-100 text-amber-700' : log.action === 'INSERT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {log.action}
                                        </span>
                                        <span className="text-sm font-medium">{log.table_name}</span>
                                    </div>
                                    <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString('en-IN')}</span>
                                </div>
                                {log.old_values && (
                                    <p className="text-xs text-slate-500 mt-1">Old: {JSON.stringify(log.old_values).slice(0, 100)}</p>
                                )}
                                {log.new_values && (
                                    <p className="text-xs text-slate-600 mt-1">New: {JSON.stringify(log.new_values).slice(0, 100)}</p>
                                )}
                            </div>
                        ))}
                        {auditLogs.length === 0 && (
                            <div className="text-center py-6 text-slate-400">No changes logged</div>
                        )}
                    </div>
                </div>
            )}

            {/* Closing Detail Modal */}
            {selectedClosing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-5">
                        <div className="flex justify-between items-start mb-4">
                            <h2 className="font-bold text-lg">Closing Details</h2>
                            <button onClick={() => setSelectedClosing(null)} className="text-2xl text-slate-400">×</button>
                        </div>
                        <div className="space-y-3">
                            <div className="bg-slate-50 p-3 rounded-xl">
                                <p className="text-sm text-slate-500">Date</p>
                                <p className="font-bold">{new Date(selectedClosing.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-blue-50 p-3 rounded-xl text-center">
                                    <p className="text-2xl font-bold text-blue-700">{selectedClosing.system_count}</p>
                                    <p className="text-xs text-blue-600">System</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl text-center">
                                    <p className="text-2xl font-bold">{selectedClosing.notebook_count}</p>
                                    <p className="text-xs text-slate-500">Notebook</p>
                                </div>
                                <div className={`p-3 rounded-xl text-center ${selectedClosing.difference === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                    <p className={`text-2xl font-bold ${selectedClosing.difference === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {selectedClosing.difference > 0 ? '+' : ''}{selectedClosing.difference}
                                    </p>
                                    <p className="text-xs">Difference</p>
                                </div>
                            </div>
                            {selectedClosing.notes && (
                                <div className="bg-amber-50 p-3 rounded-xl">
                                    <p className="text-xs text-amber-600 mb-1">Manager's Note:</p>
                                    <p className="text-sm">{selectedClosing.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
