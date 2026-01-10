'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Shift {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    is_active: boolean;
    created_at: string;
}

export default function AdminShiftsPage() {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingShift, setEditingShift] = useState<Shift | null>(null);
    const [formData, setFormData] = useState({ name: '', start_time: '06:00', end_time: '14:00' });
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => { loadShifts(); }, []);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const loadShifts = async () => {
        const { data, error } = await supabase.from('shifts').select('*').order('start_time');
        if (error) {
            console.error('Error loading shifts:', error);
            setNotification({ type: 'error', message: 'Failed to load shifts. Make sure table exists.' });
        }
        setShifts(data || []);
        setLoading(false);
    };

    const handleSaveShift = async () => {
        if (!formData.name || !formData.start_time || !formData.end_time) {
            setNotification({ type: 'error', message: 'All fields are required' });
            return;
        }

        const shiftData = {
            name: formData.name,
            start_time: formData.start_time,
            end_time: formData.end_time,
            is_active: true
        };

        try {
            let result;
            if (editingShift) {
                result = await supabase.from('shifts').update(shiftData).eq('id', editingShift.id);
            } else {
                result = await supabase.from('shifts').insert(shiftData);
            }

            if (result.error) {
                setNotification({ type: 'error', message: `Error: ${result.error.message}` });
                return;
            }

            setNotification({ type: 'success', message: editingShift ? 'Shift updated!' : 'Shift created!' });
            setShowModal(false);
            setEditingShift(null);
            setFormData({ name: '', start_time: '06:00', end_time: '14:00' });
            loadShifts();
        } catch (err: any) {
            setNotification({ type: 'error', message: err.message });
        }
    };

    const toggleActive = async (shiftId: number, current: boolean) => {
        const { error } = await supabase.from('shifts').update({ is_active: !current }).eq('id', shiftId);
        if (error) {
            setNotification({ type: 'error', message: error.message });
            return;
        }
        setNotification({ type: 'success', message: `Shift ${current ? 'disabled' : 'enabled'}` });
        loadShifts();
    };

    const deleteShift = async (shiftId: number) => {
        if (!confirm('Delete this shift? Workers assigned to this shift will be unassigned.')) return;

        // First unassign workers from this shift
        await supabase.from('workers').update({ shift_id: null }).eq('shift_id', shiftId);

        const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
        if (error) {
            setNotification({ type: 'error', message: error.message });
            return;
        }
        setNotification({ type: 'success', message: 'Shift deleted' });
        loadShifts();
    };

    const openEditModal = (shift: Shift) => {
        setEditingShift(shift);
        setFormData({
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time
        });
        setShowModal(true);
    };

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            {/* Toast Notification */}
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
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        🕐 Shifts ({shifts.length})
                    </h1>
                    <p className="text-sm text-slate-400">Configure work shifts and timings</p>
                </div>
                <button onClick={() => { setEditingShift(null); setFormData({ name: '', start_time: '06:00', end_time: '14:00' }); setShowModal(true); }}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:from-cyan-400 hover:to-blue-400 font-medium">
                    + Add Shift
                </button>
            </div>

            {/* Shifts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {shifts.map(shift => (
                    <div key={shift.id} className={`bg-white/5 backdrop-blur-xl border rounded-2xl p-5 transition-all ${shift.is_active ? 'border-white/10' : 'border-red-500/20 opacity-60'
                        }`}>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white">{shift.name}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded ${shift.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                    }`}>
                                    {shift.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <span className="text-3xl">
                                {shift.name.toLowerCase().includes('morning') ? '🌅' :
                                    shift.name.toLowerCase().includes('evening') ? '🌆' :
                                        shift.name.toLowerCase().includes('night') ? '🌙' : '🕐'}
                            </span>
                        </div>

                        <div className="bg-black/20 rounded-xl p-3 mb-4">
                            <div className="flex items-center justify-between text-sm">
                                <div>
                                    <p className="text-slate-400 text-xs">Start</p>
                                    <p className="text-white font-mono font-bold">{formatTime(shift.start_time)}</p>
                                </div>
                                <span className="text-slate-500">→</span>
                                <div className="text-right">
                                    <p className="text-slate-400 text-xs">End</p>
                                    <p className="text-white font-mono font-bold">{formatTime(shift.end_time)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => toggleActive(shift.id, shift.is_active)}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium ${shift.is_active
                                        ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                        : 'bg-green-500/10 text-green-400 border border-green-500/20'
                                    }`}>
                                {shift.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button onClick={() => openEditModal(shift)}
                                className="flex-1 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-medium">
                                Edit
                            </button>
                            <button onClick={() => deleteShift(shift.id)}
                                className="py-2 px-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium">
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}

                {shifts.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-500">
                        <span className="text-4xl block mb-3">🕐</span>
                        <p>No shifts configured. Add your first shift!</p>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="font-bold text-xl text-white mb-6">
                            {editingShift ? 'Edit Shift' : 'Add New Shift'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Shift Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    placeholder="e.g. Morning, Day, Night"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none placeholder:text-white/20"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Start Time <span className="text-red-500">*</span></label>
                                    <input
                                        type="time"
                                        value={formData.start_time}
                                        onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">End Time <span className="text-red-500">*</span></label>
                                    <input
                                        type="time"
                                        value={formData.end_time}
                                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={() => { setShowModal(false); setEditingShift(null); }}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5">
                                Cancel
                            </button>
                            <button onClick={handleSaveShift}
                                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-bold shadow-lg">
                                {editingShift ? 'Update Shift' : 'Create Shift'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
