'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface DailyTask {
    id: string;
    task_name: string;
    is_preset: boolean;
    is_completed: boolean;
    completed_at: string | null;
    notes: string;
    date: string;
    user_id: string;
    created_at: string;
}

const PRESET_TASKS = [
    { name: 'Review today\'s attendance', icon: '📋' },
    { name: 'Verify expense entries', icon: '💰' },
    { name: 'Check daily closing match', icon: '✅' },
    { name: 'Update payment records', icon: '💵' },
    { name: 'Generate daily report', icon: '📊' },
    { name: 'Review pending settlements', icon: '📝' },
    { name: 'Check worker overtime hours', icon: '⏰' },
    { name: 'Verify material expenses', icon: '🧱' },
    { name: 'Update site-wise summary', icon: '📍' },
    { name: 'Cross-check bank deposits', icon: '🏦' },
    { name: 'Review contractor payments', icon: '🤝' },
    { name: 'Prepare weekly summary (if Friday)', icon: '📅' },
];

export default function AccountantTasksPage() {
    const [tasks, setTasks] = useState<DailyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTask, setNewTask] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [userId, setUserId] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (userId) loadTasks();
    }, [selectedDate, userId]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setUserId(user.id);
        }
    };

    const loadTasks = async () => {
        if (!userId) return;

        const { data, error } = await supabase
            .from('accountant_tasks')
            .select('*')
            .eq('date', selectedDate)
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error && error.code === '42P01') {
            // Table doesn't exist yet - show notification
            setNotification({ type: 'error', message: 'Please run the SQL to create accountant_tasks table' });
            setLoading(false);
            return;
        }

        // If no tasks for today, initialize with presets
        if (!data || data.length === 0) {
            await initializePresetTasks();
        } else {
            setTasks(data);
        }
        setLoading(false);
    };

    const initializePresetTasks = async () => {
        if (!userId) return;

        const presetInserts = PRESET_TASKS.map(task => ({
            task_name: task.name,
            is_preset: true,
            is_completed: false,
            date: selectedDate,
            user_id: userId,
            notes: ''
        }));

        const { data, error } = await supabase
            .from('accountant_tasks')
            .insert(presetInserts)
            .select();

        if (!error && data) {
            setTasks(data);
        }
    };

    const toggleTask = async (taskId: string, completed: boolean) => {
        const { error } = await supabase
            .from('accountant_tasks')
            .update({
                is_completed: !completed,
                completed_at: !completed ? new Date().toISOString() : null
            })
            .eq('id', taskId);

        if (!error) {
            setTasks(tasks.map(t => t.id === taskId
                ? { ...t, is_completed: !completed, completed_at: !completed ? new Date().toISOString() : null }
                : t
            ));
        }
    };

    const addCustomTask = async () => {
        if (!newTask.trim() || !userId) return;

        const { data, error } = await supabase
            .from('accountant_tasks')
            .insert({
                task_name: newTask.trim(),
                is_preset: false,
                is_completed: true, // Custom tasks are marked as done when added
                completed_at: new Date().toISOString(),
                date: selectedDate,
                user_id: userId,
                notes: ''
            })
            .select()
            .single();

        if (!error && data) {
            setTasks([...tasks, data]);
            setNewTask('');
            setNotification({ type: 'success', message: 'Activity logged!' });
        }
    };

    const deleteTask = async (taskId: string) => {
        const { error } = await supabase
            .from('accountant_tasks')
            .delete()
            .eq('id', taskId);

        if (!error) {
            setTasks(tasks.filter(t => t.id !== taskId));
        }
    };

    const completedCount = tasks.filter(t => t.is_completed).length;
    const presetTasks = tasks.filter(t => t.is_preset);
    const customTasks = tasks.filter(t => !t.is_preset);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

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
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        📝 Daily Tasks
                    </h1>
                    <p className="text-sm text-slate-400">Track your daily activities</p>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                    />
                </div>
            </div>

            {/* Progress Card */}
            <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-medium">Today's Progress</h3>
                    <span className="text-2xl font-bold text-cyan-400">{completedCount}/{tasks.length}</span>
                </div>
                <div className="w-full bg-black/30 rounded-full h-3">
                    <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%` }}
                    />
                </div>
            </div>

            {/* Daily Checklist */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-semibold text-white">📋 Daily Checklist</h3>
                    <span className="text-xs text-slate-400">{presetTasks.filter(t => t.is_completed).length}/{presetTasks.length} done</span>
                </div>
                <div className="divide-y divide-white/5">
                    {presetTasks.map((task, idx) => (
                        <div key={task.id} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                            <button
                                onClick={() => toggleTask(task.id, task.is_completed)}
                                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${task.is_completed
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-white/20 hover:border-cyan-500'
                                    }`}
                            >
                                {task.is_completed && '✓'}
                            </button>
                            <div className="flex-1">
                                <span className={`${task.is_completed ? 'line-through text-slate-500' : 'text-white'}`}>
                                    {PRESET_TASKS[idx]?.icon} {task.task_name}
                                </span>
                                {task.completed_at && (
                                    <span className="text-xs text-slate-500 ml-2">
                                        Done at {new Date(task.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Activity Log - Custom Tasks */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10">
                    <h3 className="font-semibold text-white">📝 Activity Log</h3>
                    <p className="text-xs text-slate-400">Record what you did throughout the day</p>
                </div>

                {/* Add Activity Input */}
                <div className="p-4 border-b border-white/10">
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={newTask}
                            onChange={(e) => setNewTask(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addCustomTask()}
                            placeholder="What did you just complete? e.g. 'Verified 50 worker entries'"
                            className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none placeholder:text-white/30"
                        />
                        <button
                            onClick={addCustomTask}
                            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium hover:from-cyan-400 hover:to-blue-400"
                        >
                            + Log
                        </button>
                    </div>
                </div>

                {/* Activity List */}
                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                    {customTasks.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            <span className="text-3xl block mb-2">📝</span>
                            <p>No activities logged yet today</p>
                            <p className="text-xs mt-1">Type what you did and press Enter</p>
                        </div>
                    ) : (
                        customTasks.map(task => (
                            <div key={task.id} className="flex items-start gap-4 p-4 hover:bg-white/5 group">
                                <span className="text-green-400 mt-1">✓</span>
                                <div className="flex-1">
                                    <p className="text-white">{task.task_name}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Logged at {new Date(task.completed_at || task.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <button
                                    onClick={() => deleteTask(task.id)}
                                    className="text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    🗑️
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-400">{completedCount}</p>
                    <p className="text-xs text-slate-400">Completed</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-orange-400">{tasks.length - completedCount}</p>
                    <p className="text-xs text-slate-400">Pending</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-cyan-400">{customTasks.length}</p>
                    <p className="text-xs text-slate-400">Activities</p>
                </div>
            </div>
        </div>
    );
}
