'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Expense {
    id: string;
    date: string;
    category: string;
    description: string | null;
    amount: number;
    created_by: string;
    created_at: string;
}

export default function AdminFinancePage() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });
    const [stats, setStats] = useState({ total: 0, byCategory: {} as Record<string, number> });

    useEffect(() => { loadExpenses(); }, [dateRange]);

    const loadExpenses = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('expenses')
            .select('*')
            .gte('date', dateRange.start)
            .lte('date', dateRange.end)
            .order('date', { ascending: false });

        const expensesData = data || [];
        setExpenses(expensesData);

        const byCategory: Record<string, number> = {};
        let total = 0;
        expensesData.forEach(e => {
            total += e.amount;
            byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
        });
        setStats({ total, byCategory });
        setLoading(false);
    };

    const deleteExpense = async (id: string) => {
        if (!confirm('Delete this expense?')) return;
        await supabase.from('expenses').delete().eq('id', id);
        loadExpenses();
    };

    const categoryColors: Record<string, string> = {
        'Material': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        'Labor': 'bg-green-500/10 text-green-400 border border-green-500/20',
        'Transport': 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20',
        'Food': 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
        'Other': 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-white">Finance & Expenses</h1>
                    <p className="text-sm text-slate-400">View all expense records</p>
                </div>
                <div className="flex gap-2 items-center bg-white/5 border border-white/10 rounded-xl p-1.5 self-start md:self-auto">
                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                        className="bg-transparent border-none text-white text-xs focus:ring-0 outline-none px-2" />
                    <span className="text-slate-500 text-xs">to</span>
                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                        className="bg-transparent border-none text-white text-xs focus:ring-0 outline-none px-2" />
                </div>
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-br from-amber-600/20 to-orange-800/20 border border-amber-500/30 rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full -mr-10 -mt-10" />
                <div className="relative z-10">
                    <p className="text-sm text-amber-200/80 uppercase tracking-widest font-medium">Total Expenses</p>
                    <p className="text-4xl font-bold mt-1 text-white">₹{stats.total.toLocaleString()}</p>
                    <div className="flex flex-wrap gap-3 mt-6">
                        {Object.entries(stats.byCategory).map(([cat, amt]) => (
                            <span key={cat} className="bg-black/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-medium border border-white/10 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${categoryColors[cat]?.split(' ')[0].replace('/10', '') || 'bg-slate-400'}`} />
                                {cat}: <span className="text-white/90">₹{amt.toLocaleString()}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-black/20 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Date</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Category</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Description</th>
                                    <th className="px-6 py-4 text-right text-slate-400 font-medium">Amount</th>
                                    <th className="px-6 py-4 text-right text-slate-400 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {expenses.map(exp => (
                                    <tr key={exp.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 text-slate-300 font-mono text-xs">{new Date(exp.date).toLocaleDateString('en-IN')}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${categoryColors[exp.category] || categoryColors['Other']}`}>
                                                {exp.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 text-xs">{exp.description || '-'}</td>
                                        <td className="px-6 py-4 text-right font-medium text-white">₹{exp.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => deleteExpense(exp.id)}
                                                className="text-red-400 hover:text-red-300 text-xs font-medium hover:underline transition-colors">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {expenses.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <span className="text-2xl mb-2">💰</span>
                            <p>No expenses in this period</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
