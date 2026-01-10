'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface PaymentBatch {
    id: string;
    start_date: string;
    end_date: string;
    total_wages: number;
    total_expenses: number;
    net_amount: number;
    status: string;
    payment_method: string;
    notes: string | null;
    created_at: string;
}

interface Expense {
    id: string;
    date: string;
    category: string;
    amount: number;
    note: string | null;
    payment_batch_id: string | null;
}

export default function OwnerFinancePage() {
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'overview' | 'expenses' | 'batches'>('overview');
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [batches, setBatches] = useState<PaymentBatch[]>([]);
    const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([]);
    const [stats, setStats] = useState({ totalWages: 0, totalExpenses: 0, netPending: 0 });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [expensesRes, batchesRes, logsRes] = await Promise.all([
                supabase.from('expenses').select('*').is('payment_batch_id', null).order('date', { ascending: false }),
                supabase.from('payment_batches').select('*').order('created_at', { ascending: false }).limit(20),
                supabase.from('attendance_logs').select('*, workers(base_rate)').is('payment_batch_id', null),
            ]);

            const pendingExp = expensesRes.data || [];
            setPendingExpenses(pendingExp);
            setBatches(batchesRes.data || []);

            const totalExpenses = pendingExp.reduce((sum, e) => sum + e.amount, 0);
            const totalWages = (logsRes.data || []).reduce((sum: number, l: any) => {
                const rate = l.workers?.base_rate || 500;
                return sum + (l.status === 'half-day' ? rate / 2 : rate);
            }, 0);

            setStats({ totalWages, totalExpenses, netPending: totalWages - totalExpenses });
        } finally { setLoading(false); }
    };

    const markBatchPaid = async (batchId: string) => {
        await supabase.from('payment_batches').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', batchId);
        loadData();
    };

    const categoryLabels: Record<string, string> = {
        chai_pani: '☕ Chai/Pani', rixa: '🛺 Rixa', food: '🍛 Food', advance: '💵 Advance', other: '📦 Other'
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-slate-800">Financial Control</h1>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">₹{Math.round(stats.totalWages).toLocaleString()}</p>
                    <p className="text-xs text-green-600">Pending Wages</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">₹{stats.totalExpenses.toLocaleString()}</p>
                    <p className="text-xs text-red-600">Pending Expenses</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-white">₹{Math.round(stats.netPending).toLocaleString()}</p>
                    <p className="text-xs text-white/70">Net Payable</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
                <button onClick={() => setTab('overview')} className={`px-4 py-2 rounded-xl text-sm ${tab === 'overview' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>Overview</button>
                <button onClick={() => setTab('expenses')} className={`px-4 py-2 rounded-xl text-sm ${tab === 'expenses' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>
                    Expenses ({pendingExpenses.length})
                </button>
                <button onClick={() => setTab('batches')} className={`px-4 py-2 rounded-xl text-sm ${tab === 'batches' ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>Settlements</button>
            </div>

            {/* Overview */}
            {tab === 'overview' && (
                <div className="bg-white rounded-xl border p-4">
                    <h2 className="font-semibold mb-4">Financial Summary</h2>
                    <p className="text-slate-600">
                        You have <strong>₹{Math.round(stats.netPending).toLocaleString()}</strong> in pending payments to workers.
                    </p>
                    <p className="text-slate-600 mt-2">
                        <strong>{pendingExpenses.length}</strong> expenses logged, <strong>{batches.filter(b => b.status === 'pending').length}</strong> batches pending payment.
                    </p>
                </div>
            )}

            {/* Pending Expenses */}
            {tab === 'expenses' && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="divide-y max-h-96 overflow-y-auto">
                        {pendingExpenses.map(exp => (
                            <div key={exp.id} className="px-4 py-3 flex justify-between items-center">
                                <div>
                                    <p className="font-medium">{categoryLabels[exp.category] || exp.category}</p>
                                    {exp.note && <p className="text-xs text-slate-500">{exp.note}</p>}
                                    <p className="text-xs text-slate-400">{new Date(exp.date).toLocaleDateString('en-IN')}</p>
                                </div>
                                <p className="font-bold text-red-600">-₹{exp.amount}</p>
                            </div>
                        ))}
                        {pendingExpenses.length === 0 && (
                            <div className="text-center py-6 text-slate-400">No pending expenses</div>
                        )}
                    </div>
                </div>
            )}

            {/* Settlement Batches */}
            {tab === 'batches' && (
                <div className="space-y-3">
                    {batches.map(batch => (
                        <div key={batch.id} className="bg-white rounded-xl border p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold">
                                        {new Date(batch.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} -
                                        {new Date(batch.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    </p>
                                    <p className="text-sm text-slate-500">{batch.payment_method}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs ${batch.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {batch.status === 'paid' ? '✓ Paid' : 'Pending'}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                                <div><span className="text-slate-500">Wages:</span> <span className="text-green-600">+₹{batch.total_wages}</span></div>
                                <div><span className="text-slate-500">Exp:</span> <span className="text-red-600">-₹{batch.total_expenses}</span></div>
                                <div><span className="text-slate-500">Net:</span> <span className="font-bold">₹{batch.net_amount}</span></div>
                            </div>
                            {batch.status === 'pending' && (
                                <button onClick={() => markBatchPaid(batch.id)} className="mt-3 w-full py-2 bg-green-600 text-white rounded-xl text-sm">
                                    Mark as Paid
                                </button>
                            )}
                        </div>
                    ))}
                    {batches.length === 0 && (
                        <div className="text-center py-6 text-slate-400 bg-white rounded-xl border">No settlements yet</div>
                    )}
                </div>
            )}
        </div>
    );
}
