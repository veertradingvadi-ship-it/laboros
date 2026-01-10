'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface AccountantTask {
    id: string;
    task_name: string;
    is_preset: boolean;
    is_completed: boolean;
    completed_at: string | null;
    date: string;
    user_id: string;
    assigned_by: string | null;
    created_at: string;
}

interface Accountant {
    id: string;
    email: string;
    full_name: string | null;
}

export default function OwnerTasksPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [tasks, setTasks] = useState<AccountantTask[]>([]);
    const [accountants, setAccountants] = useState<Accountant[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedAccountant, setSelectedAccountant] = useState<string>('all');
    const [newAssignment, setNewAssignment] = useState('');
    const [assignTo, setAssignTo] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        checkAuth();
        loadAccountants();
    }, []);

    useEffect(() => {
        loadTasks();
    }, [selectedDate, selectedAccountant]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'owner' && profile?.role !== 'admin') {
            router.push('/dashboard');
        }
    };

    const loadAccountants = async () => {
        const { data } = await supabase.from('profiles').select('id, email, full_name').eq('role', 'accountant');
        setAccountants(data || []);
        if (data && data.length > 0) {
            setAssignTo(data[0].id);
        }
    };

    const loadTasks = async () => {
        let query = supabase
            .from('accountant_tasks')
            .select('*')
            .eq('date', selectedDate)
            .order('created_at', { ascending: true });

        if (selectedAccountant !== 'all') {
            query = query.eq('user_id', selectedAccountant);
        }

        const { data, error } = await query;

        if (error && error.code === '42P01') {
            setNotification({ type: 'error', message: 'Table not found. Run the SQL first.' });
        }

        setTasks(data || []);
        setLoading(false);
    };

    const assignTask = async () => {
        if (!newAssignment.trim() || !assignTo) return;

        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase.from('accountant_tasks').insert({
            task_name: `📌 ${newAssignment.trim()}`,
            is_preset: false,
            is_completed: false,
            date: selectedDate,
            user_id: assignTo,
            assigned_by: user?.id,
            notes: ''
        });

        if (!error) {
            setNewAssignment('');
            loadTasks();
            setNotification({ type: 'success', message: 'Task assigned!' });
        } else {
            setNotification({ type: 'error', message: error.message });
        }
    };

    const getAccountantName = (userId: string) => {
        const acc = accountants.find(a => a.id === userId);
        return acc?.full_name || acc?.email || 'Unknown';
    };

    const completedTasks = tasks.filter(t => t.is_completed);
    const pendingTasks = tasks.filter(t => !t.is_completed);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 p-4 lg:p-8">
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-amber-900/10 to-slate-900 pointer-events-none" />

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

            <div className="relative z-10 max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <button onClick={() => router.back()} className="text-slate-400 hover:text-white mb-2">
                            ← Back
                        </button>
                        <h1 className="text-xl font-bold text-white">👁️ Accountant Activity Monitor</h1>
                        <p className="text-sm text-slate-400">See what your accountants did & assign work</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 bg-white/5 border border-white/10 rounded-xl p-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Date</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Accountant</label>
                        <select
                            value={selectedAccountant}
                            onChange={(e) => setSelectedAccountant(e.target.value)}
                            className="px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                        >
                            <option value="all" className="bg-slate-900">All Accountants</option>
                            {accountants.map(acc => (
                                <option key={acc.id} value={acc.id} className="bg-slate-900">
                                    {acc.full_name || acc.email}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Assign New Task */}
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-4">
                    <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                        📌 Assign Work to Accountant
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <select
                            value={assignTo}
                            onChange={(e) => setAssignTo(e.target.value)}
                            className="px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white sm:w-48"
                        >
                            {accountants.map(acc => (
                                <option key={acc.id} value={acc.id} className="bg-slate-900">
                                    {acc.full_name || acc.email}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={newAssignment}
                            onChange={(e) => setNewAssignment(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && assignTask()}
                            placeholder="e.g. Verify all attendance for Site A"
                            className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder:text-white/30"
                        />
                        <button
                            onClick={assignTask}
                            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium"
                        >
                            Assign
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-green-400">{completedTasks.length}</p>
                        <p className="text-xs text-slate-400">Completed</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-orange-400">{pendingTasks.length}</p>
                        <p className="text-xs text-slate-400">Pending</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-cyan-400">{tasks.length}</p>
                        <p className="text-xs text-slate-400">Total</p>
                    </div>
                </div>

                {/* Task List */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-semibold text-white">Activity Log - {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
                    </div>
                    <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                        {tasks.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                <span className="text-4xl block mb-2">📋</span>
                                <p>No activities recorded for this day</p>
                            </div>
                        ) : (
                            tasks.map(task => (
                                <div key={task.id} className="flex items-start gap-4 p-4 hover:bg-white/5">
                                    <span className={task.is_completed ? 'text-green-400' : 'text-orange-400'}>
                                        {task.is_completed ? '✓' : '○'}
                                    </span>
                                    <div className="flex-1">
                                        <p className={`${task.is_completed ? 'text-white' : 'text-orange-300'}`}>
                                            {task.task_name}
                                        </p>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {selectedAccountant === 'all' && (
                                                <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                    {getAccountantName(task.user_id)}
                                                </span>
                                            )}
                                            {task.assigned_by && (
                                                <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                                                    Assigned by Owner
                                                </span>
                                            )}
                                            {task.completed_at && (
                                                <span className="text-xs text-slate-500">
                                                    {new Date(task.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
