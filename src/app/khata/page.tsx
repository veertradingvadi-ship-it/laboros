'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Worker } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

interface Expense {
    id: string;
    date: string;
    category: string;
    amount: number;
    note: string | null;
    payment_batch_id: string | null;
    created_at: string;
}

interface DailyClosing {
    id: string;
    date: string;
    system_count: number;
    notebook_count: number;
    difference: number;
    notes: string | null;
    status: 'MATCHED' | 'MISMATCH';
}

const categoryLabels: Record<string, { en: string; gu: string; icon: string; color: string }> = {
    chai_pani: { en: 'Chai/Pani', gu: 'ચા/પાણી', icon: '☕', color: 'bg-orange-50 border-orange-200' },
    rixa: { en: 'Rixa/Travel', gu: 'રીક્ષા', icon: '🛺', color: 'bg-blue-50 border-blue-200' },
    food: { en: 'Food', gu: 'ભોજન', icon: '🍛', color: 'bg-green-50 border-green-200' },
    advance: { en: 'Advance', gu: 'એડવાન્સ', icon: '💵', color: 'bg-purple-50 border-purple-200' },
    other: { en: 'Other', gu: 'અન્ય', icon: '📦', color: 'bg-slate-50 border-slate-200' },
};

export default function KhataPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [lang, setLang] = useState<'en' | 'gu'>('en');
    const [activeTab, setActiveTab] = useState<'ledger' | 'closing' | 'history'>('ledger');

    const [workers, setWorkers] = useState<Worker[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [todayAttendance, setTodayAttendance] = useState<any[]>([]);
    const [pastClosings, setPastClosings] = useState<DailyClosing[]>([]);

    const [showAddExpense, setShowAddExpense] = useState(false);
    const [newExpense, setNewExpense] = useState({ category: 'chai_pani', amount: '', note: '' });

    const [notebookCount, setNotebookCount] = useState('');
    const [closingNote, setClosingNote] = useState('');
    const [showMismatch, setShowMismatch] = useState(false);
    const [mismatchData, setMismatchData] = useState({ system: 0, notebook: 0 });

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const currentDate = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            const [workersRes, expensesRes, attendanceRes, closingsRes] = await Promise.all([
                supabase.from('workers').select('*').eq('is_active', true),
                supabase.from('expenses').select('*').is('payment_batch_id', null).order('date', { ascending: false }),
                supabase.from('attendance_logs').select('*').eq('date', currentDate),
                supabase.from('daily_closings').select('*').order('date', { ascending: false }).limit(10),
            ]);

            setWorkers(workersRes.data || []);
            setExpenses(expensesRes.data || []);
            setTodayAttendance(attendanceRes.data || []);
            setPastClosings(closingsRes.data || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const systemCount = todayAttendance.filter(a => a.check_in_time).length;
    const totalWages = todayAttendance.reduce((sum, log) => {
        const worker = workers.find(w => w.id === log.worker_id);
        const rate = worker?.base_rate || 500;
        return sum + (log.status === 'half-day' ? rate / 2 : rate);
    }, 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netPayable = totalWages - totalExpenses;

    const addExpense = async () => {
        if (!newExpense.amount || parseInt(newExpense.amount) <= 0) { setError('Enter valid amount'); return; }
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('expenses').insert({
                category: newExpense.category,
                amount: parseInt(newExpense.amount),
                note: newExpense.note || null,
                date: currentDate,
                created_by: user.id,
            });
            setSuccess('Expense added!');
            setNewExpense({ category: 'chai_pani', amount: '', note: '' });
            setShowAddExpense(false);
            loadData();
            setTimeout(() => setSuccess(null), 2000);
        } catch { setError('Failed'); setTimeout(() => setError(null), 2000); }
    };

    const verifyAndCloseDay = async () => {
        const notebook = parseInt(notebookCount);
        if (isNaN(notebook) || notebook < 0) { setError('Enter valid count'); return; }
        const difference = systemCount - notebook;
        if (difference !== 0 && !closingNote.trim()) {
            setMismatchData({ system: systemCount, notebook });
            setShowMismatch(true);
            return;
        }
        await submitClosing(notebook, difference);
    };

    const submitClosing = async (notebook: number, difference: number) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('daily_closings').upsert({
                date: currentDate,
                manager_id: user.id,
                system_count: systemCount,
                notebook_count: notebook,
                difference,
                notes: closingNote || null,
                status: difference === 0 ? 'MATCHED' : 'MISMATCH',
                closing_time: new Date().toISOString(),
            }, { onConflict: 'site_id,date' });
            setSuccess(difference === 0 ? `✓ Perfect Match! (${systemCount}/${notebook})` : `Closing saved with note`);
            setShowMismatch(false);
            setNotebookCount('');
            setClosingNote('');
            loadData();
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) { console.error(err); setError('Closing failed'); setTimeout(() => setError(null), 2000); }
    };

    const t = (text: string) => {
        const tr: Record<string, string> = {
            'Khata Ledger': 'ખાતા લેજર', 'Ledger': 'લેજર', 'Day Closing': 'દિવસ બંધ',
            'History': 'ઇતિહાસ', 'Wages Due': 'બાકી વેતન', 'Expenses': 'ખર્ચ',
            'Net Payable': 'ચૂકવવાપાત્ર', 'Add Expense': 'ખર્ચ ઉમેરો', 'Today': 'આજે',
            'Evening Tally': 'સાંજની ગણતરી', 'Notebook Count': 'નોટબુક ગણતરી',
            'How many worked today?': 'આજે કેટલાએ કામ કર્યું?', 'Any notes?': 'કોઈ નોંધ?',
            'Verify & Close': 'ચકાસો અને બંધ', 'System Count': 'સિસ્ટમ ગણતરી',
            'Mismatch!': 'મેળ નથી!', 'Add note to explain': 'સમજાવવા નોંધ ઉમેરો',
            'Submit': 'સબમિટ', 'Cancel': 'રદ', 'Past Closings': 'પાછલા બંધ',
        };
        return lang === 'gu' ? (tr[text] || text) : text;
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header - Classic Professional */}
            <header className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10 shadow-sm">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-slate-600 hover:text-slate-800">
                        <span>←</span>
                        <span className="text-sm">Back</span>
                    </button>
                    <h1 className="text-lg font-bold text-slate-800">{t('Khata Ledger')}</h1>
                    <button onClick={() => setLang(l => l === 'en' ? 'gu' : 'en')}
                        className="px-3 py-1 bg-slate-100 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200">
                        {lang === 'gu' ? 'EN' : 'ગુ'}
                    </button>
                </div>
            </header>

            {/* Tabs - Classic Style */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-lg mx-auto flex">
                    {(['ledger', 'closing', 'history'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
                                ? 'text-blue-600 border-blue-600 bg-blue-50/50'
                                : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
                                }`}>
                            {tab === 'ledger' ? `💰 ${t('Ledger')}` : tab === 'closing' ? `📋 ${t('Day Closing')}` : `📜 ${t('History')}`}
                        </button>
                    ))}
                </div>
            </div>

            <main className="p-4 max-w-lg mx-auto">
                {/* === LEDGER TAB === */}
                {activeTab === 'ledger' && (
                    <>
                        {/* Summary Cards - Classic */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-white border border-green-200 rounded-xl p-3 text-center shadow-sm">
                                <p className="text-xl font-bold text-green-600">₹{Math.round(totalWages).toLocaleString()}</p>
                                <p className="text-xs text-green-600/80 font-medium">{t('Wages Due')}</p>
                            </div>
                            <div className="bg-white border border-red-200 rounded-xl p-3 text-center shadow-sm">
                                <p className="text-xl font-bold text-red-600">₹{totalExpenses.toLocaleString()}</p>
                                <p className="text-xs text-red-600/80 font-medium">{t('Expenses')}</p>
                            </div>
                            <div className="bg-slate-800 rounded-xl p-3 text-center shadow-sm">
                                <p className="text-xl font-bold text-white">₹{Math.round(netPayable).toLocaleString()}</p>
                                <p className="text-xs text-white/70 font-medium">{t('Net Payable')}</p>
                            </div>
                        </div>

                        <button onClick={() => setShowAddExpense(true)}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium mb-4 shadow-sm transition-colors flex items-center justify-center gap-2">
                            <span>💸</span> {t('Add Expense')}
                        </button>

                        {/* Recent Expenses - Classic Card */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                                <h2 className="font-semibold text-slate-700">{t("Today")}'s {t('Expenses')}</h2>
                            </div>
                            {expenses.length === 0 ? (
                                <p className="text-center text-slate-400 py-8 text-sm">No expenses</p>
                            ) : (
                                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                                    {expenses.slice(0, 8).map(exp => (
                                        <div key={exp.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${categoryLabels[exp.category]?.color || 'bg-slate-100'}`}>
                                                    {categoryLabels[exp.category]?.icon}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-700">{lang === 'gu' ? categoryLabels[exp.category]?.gu : categoryLabels[exp.category]?.en}</p>
                                                    {exp.note && <p className="text-xs text-slate-400">{exp.note}</p>}
                                                </div>
                                            </div>
                                            <p className="font-bold text-red-600 text-sm">-₹{exp.amount}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* === DAY CLOSING TAB === */}
                {activeTab === 'closing' && (
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <h2 className="text-lg font-bold mb-4 text-center text-slate-800">{t('Evening Tally')}</h2>

                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-center">
                            <p className="text-sm text-blue-600 mb-1 font-medium">{t('System Count')}</p>
                            <p className="text-4xl font-bold text-blue-700">{systemCount}</p>
                            <p className="text-xs text-blue-500">workers scanned today</p>
                        </div>

                        <div className="mb-4">
                            <label className="text-sm text-slate-600 mb-2 block font-medium">{t('Notebook Count')}</label>
                            <input type="number" value={notebookCount} onChange={(e) => setNotebookCount(e.target.value)}
                                placeholder={t('How many worked today?')}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg text-center text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" />
                        </div>

                        <div className="mb-4">
                            <label className="text-sm text-slate-600 mb-2 block font-medium">{t('Any notes?')}</label>
                            <textarea value={closingNote} onChange={(e) => setClosingNote(e.target.value)}
                                placeholder="Fuel used, issues, remarks..."
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none" rows={2} />
                        </div>

                        <button onClick={verifyAndCloseDay} disabled={!notebookCount}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors shadow-sm">
                            ✓ {t('Verify & Close')}
                        </button>

                        {currentHour < 16 && (
                            <p className="text-xs text-orange-500 text-center mt-3 font-medium">⚠️ Usually done after 4 PM</p>
                        )}
                    </div>
                )}

                {/* === HISTORY TAB === */}
                {activeTab === 'history' && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                            <h2 className="font-semibold text-slate-700">{t('Past Closings')}</h2>
                        </div>
                        {pastClosings.length === 0 ? (
                            <p className="text-center text-slate-400 py-8 text-sm">No history</p>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {pastClosings.map(c => (
                                    <div key={c.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${c.status === 'MATCHED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                {c.status === 'MATCHED' ? '✓' : '!'}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">{new Date(c.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}</p>
                                                <p className="text-xs text-slate-400">{c.system_count}/{c.notebook_count}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === 'MATCHED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {c.difference === 0 ? 'Match' : `${c.difference > 0 ? '+' : ''}${c.difference}`}
                                            </span>
                                            {c.notes && <p className="text-xs text-slate-400 mt-1 max-w-[120px] truncate">{c.notes}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Add Expense Modal - Classic */}
            {showAddExpense && (
                <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
                    <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 shadow-xl">
                        <h2 className="text-lg font-bold mb-4 text-slate-800">{t('Add Expense')}</h2>
                        <div className="grid grid-cols-5 gap-2 mb-4">
                            {Object.entries(categoryLabels).map(([key, val]) => (
                                <button key={key} onClick={() => setNewExpense(e => ({ ...e, category: key }))}
                                    className={`p-2 rounded-xl text-center transition-all border-2 ${newExpense.category === key ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                    <span className="text-xl block">{val.icon}</span>
                                    <p className="text-[10px] text-slate-600 mt-1 font-medium">{lang === 'gu' ? val.gu : val.en}</p>
                                </button>
                            ))}
                        </div>
                        <input type="number" placeholder="Amount (₹)" value={newExpense.amount}
                            onChange={(e) => setNewExpense(ex => ({ ...ex, amount: e.target.value }))}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-3 text-lg text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" autoFocus />
                        <input type="text" placeholder="Note (optional)" value={newExpense.note}
                            onChange={(e) => setNewExpense(ex => ({ ...ex, note: e.target.value }))}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl mb-4 text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" />
                        <div className="flex gap-3">
                            <button onClick={() => setShowAddExpense(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('Cancel')}</button>
                            <button onClick={addExpense} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors">Add</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mismatch Modal - Classic */}
            {showMismatch && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
                        <div className="text-center mb-4">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span className="text-3xl">⚠️</span>
                            </div>
                            <h2 className="text-xl font-bold text-red-600">{t('Mismatch!')}</h2>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-center">
                            <p className="text-sm text-slate-600">App says: <strong className="text-blue-600">{mismatchData.system}</strong></p>
                            <p className="text-sm text-slate-600">You wrote: <strong className="text-red-600">{mismatchData.notebook}</strong></p>
                            <p className="text-lg font-bold mt-2 text-slate-800">Difference: {mismatchData.system - mismatchData.notebook}</p>
                        </div>
                        <p className="text-sm text-slate-600 mb-2 font-medium">{t('Add note to explain')}:</p>
                        <textarea value={closingNote} onChange={(e) => setClosingNote(e.target.value)}
                            placeholder="Why is there a difference?"
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl mb-4 text-slate-800 bg-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none" rows={3} autoFocus />
                        <div className="flex gap-3">
                            <button onClick={() => setShowMismatch(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 transition-colors">{t('Cancel')}</button>
                            <button onClick={() => submitClosing(mismatchData.notebook, mismatchData.system - mismatchData.notebook)}
                                disabled={!closingNote.trim()}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors">
                                {t('Submit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {success && <div className="fixed bottom-4 left-4 right-4 bg-green-500 text-white py-3 px-4 rounded-xl text-center z-50 shadow-lg font-medium">{success}</div>}
            {error && <div className="fixed bottom-4 left-4 right-4 bg-red-500 text-white py-3 px-4 rounded-xl text-center z-50 shadow-lg font-medium">{error}</div>}
        </div>
    );
}
