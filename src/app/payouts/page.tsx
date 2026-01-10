'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Worker } from '@/lib/supabase';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { THEME_COLOR } from '@/lib/config';

interface PayoutRow {
    worker: Worker;
    daysWorked: number;
    halfDays: number;
    baseWage: number;
    overtime: number;
    totalWage: number;
    isEdited: boolean;
}

export default function PayoutsPage() {
    const router = useRouter();
    const [payoutRows, setPayoutRows] = useState<PayoutRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRate, setEditRate] = useState<string>('');

    // Get current pay period (last 15 days)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const themeClass = THEME_COLOR === 'orange' ? 'bg-orange-500' :
        THEME_COLOR === 'blue' ? 'bg-blue-500' :
            THEME_COLOR === 'green' ? 'bg-green-500' :
                'bg-slate-600';

    useEffect(() => {
        loadPayoutData();
    }, []);

    const loadPayoutData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            // Get all workers
            const { data: workers, error: workersError } = await supabase
                .from('workers')
                .select('*')
                .eq('is_active', true);

            if (workersError) throw workersError;

            // Get attendance logs for the period
            const { data: logs, error: logsError } = await supabase
                .from('attendance_logs')
                .select('*')
                .gte('date', startDate)
                .lte('date', endDate);

            if (logsError) throw logsError;

            // Calculate payouts for each worker
            const rows: PayoutRow[] = (workers || []).map(worker => {
                const workerLogs = (logs || []).filter(log => log.worker_id === worker.id);
                const presentDays = workerLogs.filter(log => log.status === 'present').length;
                const halfDays = workerLogs.filter(log => log.status === 'half-day').length;

                const effectiveDays = presentDays + (halfDays * 0.5);
                const baseWage = effectiveDays * worker.base_rate;
                const overtime = 0;

                return {
                    worker,
                    daysWorked: presentDays,
                    halfDays,
                    baseWage,
                    overtime,
                    totalWage: baseWage + overtime,
                    isEdited: false,
                };
            }).filter(row => row.daysWorked > 0 || row.halfDays > 0);

            setPayoutRows(rows);

        } catch (err) {
            console.error('Payout load error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEditRate = async (workerId: string) => {
        const newRate = parseFloat(editRate);
        if (isNaN(newRate) || newRate <= 0) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const row = payoutRows.find(r => r.worker.id === workerId);
            if (!row) return;

            const oldRate = row.worker.base_rate;

            // Update worker rate
            await supabase
                .from('workers')
                .update({ base_rate: newRate })
                .eq('id', workerId);

            // Log the audit
            await supabase.from('audit_logs').insert({
                table_name: 'workers',
                record_id: workerId,
                action: 'UPDATE_RATE',
                old_values: { base_rate: oldRate },
                new_values: { base_rate: newRate },
                changed_by: user.id,
            });

            // Update local state
            setPayoutRows(prev => prev.map(r => {
                if (r.worker.id === workerId) {
                    const effectiveDays = r.daysWorked + (r.halfDays * 0.5);
                    const newBaseWage = effectiveDays * newRate;
                    return {
                        ...r,
                        worker: { ...r.worker, base_rate: newRate },
                        baseWage: newBaseWage,
                        totalWage: newBaseWage + r.overtime,
                        isEdited: true,
                    };
                }
                return r;
            }));

            setEditingId(null);
            setEditRate('');

        } catch (err) {
            console.error('Edit rate error:', err);
        }
    };

    const totalWages = payoutRows.reduce((sum, row) => sum + row.totalWage, 0);

    const handleProcessPayouts = async () => {
        setProcessing(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            alert('Payouts processed successfully!');
            router.push('/dashboard');
        } catch (err) {
            console.error('Process error:', err);
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header />

            <main className="pb-24 px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
                        <p className="text-gray-500 text-sm">Period: {startDate} to {endDate}</p>
                    </div>
                    <div className={`px-4 py-2 ${themeClass} text-white rounded-xl`}>
                        <p className="text-xs opacity-80">Total</p>
                        <p className="text-xl font-bold">₹{totalWages.toFixed(0)}</p>
                    </div>
                </div>

                {/* Workers Table */}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Worker</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Days</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Rate</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {payoutRows.map((row) => (
                                    <tr key={row.worker.id} className={row.isEdited ? 'bg-yellow-50' : ''}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                                    <span className="text-gray-600 font-semibold text-sm">
                                                        {row.worker.name.charAt(0)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 text-sm">{row.worker.name}</p>
                                                    {row.isEdited && (
                                                        <span className="text-xs text-yellow-600">Edited</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-gray-900">{row.daysWorked}</span>
                                            {row.halfDays > 0 && (
                                                <span className="text-gray-400 text-xs ml-1">+{row.halfDays}½</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {editingId === row.worker.id ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        value={editRate}
                                                        onChange={(e) => setEditRate(e.target.value)}
                                                        className="w-20 px-2 py-1 text-sm border rounded"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => handleEditRate(row.worker.id)}
                                                        className="text-green-600 text-sm font-medium"
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingId(null); setEditRate(''); }}
                                                        className="text-red-600 text-sm font-medium"
                                                    >
                                                        ✗
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditingId(row.worker.id);
                                                        setEditRate(row.worker.base_rate.toString());
                                                    }}
                                                    className="text-gray-900 hover:text-orange-600"
                                                >
                                                    ₹{row.worker.base_rate}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                            ₹{row.totalWage.toFixed(0)}
                                        </td>
                                    </tr>
                                ))}

                                {payoutRows.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                            No payout data for this period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Summary */}
                <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
                    <div className="flex justify-between py-3">
                        <span className="font-bold text-gray-900">Total Payout</span>
                        <span className="font-bold text-xl text-gray-900">₹{totalWages.toFixed(0)}</span>
                    </div>
                </div>

                {/* Process Button */}
                <button
                    onClick={handleProcessPayouts}
                    disabled={processing || payoutRows.length === 0}
                    className={`w-full py-4 ${themeClass} text-white font-semibold rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
                >
                    {processing ? (
                        <>
                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Process Payouts
                        </>
                    )}
                </button>
            </main>

            <BottomNav />
        </div>
    );
}
