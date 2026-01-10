'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Worker, AttendanceLog } from '@/lib/supabase';

type UserRole = 'admin' | 'owner' | 'manager' | 'accountant';

export default function WorkersPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<UserRole>('manager');
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [currentDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Modals
    const [editWorker, setEditWorker] = useState<Worker | null>(null);
    const [deleteWorker, setDeleteWorker] = useState<Worker | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);

    // Form fields
    const [editName, setEditName] = useState('');
    const [editRate, setEditRate] = useState('');
    const [editCategory, setEditCategory] = useState('');
    const [newName, setNewName] = useState('');
    const [newRate, setNewRate] = useState('500');
    const [newCategory, setNewCategory] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            setUserRole((profile?.role as UserRole) || 'manager');

            const [workersRes, logsRes] = await Promise.all([
                supabase.from('workers').select('*').eq('is_active', true).order('name'),
                supabase.from('attendance_logs').select('*').eq('date', currentDate),
            ]);

            setWorkers(workersRes.data || []);
            setTodayLogs(logsRes.data || []);
        } catch (err) {
            console.error('Load error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Permission checks
    const canEdit = ['admin', 'owner'].includes(userRole);
    const canDelete = ['admin', 'owner'].includes(userRole);
    const canAdd = ['admin', 'owner'].includes(userRole);
    const canCheckInOut = ['admin', 'owner', 'manager'].includes(userRole);

    const getWorkerStatus = (workerId: string) => {
        const log = todayLogs.find(l => l.worker_id === workerId);
        if (!log) return 'absent';
        if (log.status === 'half-day') return 'half';
        if (log.check_in_time && !log.check_out_time) return 'present';
        if (log.check_out_time) return 'left';
        return 'absent';
    };

    const getWorkerLog = (workerId: string) => todayLogs.find(l => l.worker_id === workerId);

    const manualCheckIn = async (worker: Worker) => {
        if (!canCheckInOut) return;
        setIsProcessing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('attendance_logs').upsert({
                worker_id: worker.id, date: currentDate, status: 'present',
                check_in_time: new Date().toISOString(), marked_by: user.id,
            }, { onConflict: 'worker_id,date' });
            setSuccessMessage(`${worker.name} checked IN`);
            loadData();
            setTimeout(() => setSuccessMessage(null), 2000);
        } catch { setError('Failed'); setTimeout(() => setError(null), 2000); }
        finally { setIsProcessing(false); }
    };

    const manualCheckOut = async (worker: Worker) => {
        if (!canCheckInOut) return;
        setIsProcessing(true);
        try {
            await supabase.from('attendance_logs')
                .update({ check_out_time: new Date().toISOString() })
                .eq('worker_id', worker.id).eq('date', currentDate);
            setSuccessMessage(`${worker.name} checked OUT`);
            loadData();
            setTimeout(() => setSuccessMessage(null), 2000);
        } catch { setError('Failed'); setTimeout(() => setError(null), 2000); }
        finally { setIsProcessing(false); }
    };

    const openEditModal = (worker: Worker) => {
        if (!canEdit) return;
        setEditWorker(worker);
        setEditName(worker.name);
        setEditRate(worker.base_rate.toString());
        setEditCategory(worker.category || '');
    };

    const saveEdit = async () => {
        if (!editWorker || !editName.trim() || !canEdit) return;
        setIsProcessing(true);
        try {
            await supabase.from('workers').update({
                name: editName.trim(),
                base_rate: parseFloat(editRate) || 500,
                category: editCategory || null,
            }).eq('id', editWorker.id);
            setSuccessMessage('Worker updated');
            setEditWorker(null);
            loadData();
            setTimeout(() => setSuccessMessage(null), 2000);
        } catch { setError('Update failed'); setTimeout(() => setError(null), 2000); }
        finally { setIsProcessing(false); }
    };

    // HARD DELETE - removes worker AND all attendance logs
    const confirmDelete = async () => {
        if (!deleteWorker || !canDelete) return;
        setIsProcessing(true);
        try {
            // First delete all attendance logs for this worker
            await supabase.from('attendance_logs').delete().eq('worker_id', deleteWorker.id);
            // Then delete the worker
            await supabase.from('workers').delete().eq('id', deleteWorker.id);

            setSuccessMessage('Worker deleted permanently');
            setDeleteWorker(null);
            loadData();
            setTimeout(() => setSuccessMessage(null), 2000);
        } catch { setError('Delete failed'); setTimeout(() => setError(null), 2000); }
        finally { setIsProcessing(false); }
    };

    const addWorker = async () => {
        if (!newName.trim() || !canAdd) return;
        if (workers.find(w => w.name.toLowerCase() === newName.toLowerCase())) {
            setError('Worker already exists!'); setTimeout(() => setError(null), 2000); return;
        }
        setIsProcessing(true);
        try {
            await supabase.from('workers').insert({
                name: newName.trim(),
                base_rate: parseFloat(newRate) || 500,
                category: newCategory || null,
                is_active: true,
                consent_date: new Date().toISOString(),
            });
            setSuccessMessage('Worker added');
            setShowAddModal(false);
            setNewName(''); setNewRate('500'); setNewCategory('');
            loadData();
            setTimeout(() => setSuccessMessage(null), 2000);
        } catch { setError('Failed'); setTimeout(() => setError(null), 2000); }
        finally { setIsProcessing(false); }
    };

    const filteredWorkers = workers.filter(w => w.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    const stats = {
        total: workers.length,
        present: workers.filter(w => getWorkerStatus(w.id) === 'present').length,
        left: workers.filter(w => getWorkerStatus(w.id) === 'left').length,
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/30 to-slate-900">
            {/* Header */}
            <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10" />
                <div className="relative px-4 py-4 backdrop-blur-xl border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <button onClick={() => router.push('/dashboard')} className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">←</button>
                        <h1 className="text-xl font-bold text-white">Workers</h1>
                        {canAdd ? (
                            <button onClick={() => setShowAddModal(true)} className="w-10 h-10 rounded-xl bg-cyan-500 flex items-center justify-center text-white font-bold">+</button>
                        ) : <div className="w-10" />}
                    </div>
                </div>
            </div>

            {/* Role Badge */}
            {!canEdit && (
                <div className="mx-4 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-center">
                    <p className="text-yellow-400 text-sm">👁️ View Only Mode - {userRole} cannot edit workers</p>
                </div>
            )}

            {/* Stats */}
            <div className="p-4 grid grid-cols-3 gap-3">
                <div className="bg-white/5 backdrop-blur-xl rounded-xl p-3 text-center border border-white/10">
                    <p className="text-2xl font-bold text-white">{stats.total}</p>
                    <p className="text-white/40 text-xs">Total</p>
                </div>
                <div className="bg-green-500/10 backdrop-blur-xl rounded-xl p-3 text-center border border-green-500/20">
                    <p className="text-2xl font-bold text-green-400">{stats.present}</p>
                    <p className="text-green-400/70 text-xs">Present</p>
                </div>
                <div className="bg-orange-500/10 backdrop-blur-xl rounded-xl p-3 text-center border border-orange-500/20">
                    <p className="text-2xl font-bold text-orange-400">{stats.left}</p>
                    <p className="text-orange-400/70 text-xs">Left</p>
                </div>
            </div>

            {/* Search */}
            <div className="px-4 mb-4">
                <input type="text" placeholder="🔍 Search worker..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-white placeholder-white/40" />
            </div>

            {/* Workers List */}
            <div className="px-4 pb-4 space-y-3">
                {filteredWorkers.length === 0 ? (
                    <p className="text-center text-white/40 py-8">No workers found</p>
                ) : filteredWorkers.map(worker => {
                    const status = getWorkerStatus(worker.id);
                    const log = getWorkerLog(worker.id);

                    return (
                        <div key={worker.id} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
                            <div className="p-4 flex items-center gap-3">
                                <div className="w-14 h-14 rounded-full bg-white/10 overflow-hidden flex-shrink-0 border-2 border-white/20">
                                    {worker.photo_url ? <img src={worker.photo_url} alt="" className="w-full h-full object-cover" />
                                        : <span className="flex items-center justify-center h-full text-white text-xl font-bold">{worker.name.charAt(0)}</span>}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-white truncate">{worker.name}</h3>
                                        {worker.face_descriptor && <span className="text-xs text-cyan-400">🤖</span>}
                                    </div>
                                    <p className="text-white/40 text-sm">{worker.category || 'Worker'} • ₹{worker.base_rate}/day</p>
                                    {log && (
                                        <p className="text-white/30 text-xs mt-1">
                                            IN: {new Date(log.check_in_time || '').toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                            {log.check_out_time && ` → OUT: ${new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                        </p>
                                    )}
                                </div>

                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${status === 'present' ? 'bg-green-500/20 text-green-400' :
                                        status === 'left' ? 'bg-orange-500/20 text-orange-400' :
                                            status === 'half' ? 'bg-purple-500/20 text-purple-400' :
                                                'bg-white/10 text-white/50'
                                    }`}>
                                    {status === 'present' ? 'IN' : status === 'left' ? 'OUT' : status === 'half' ? 'HALF' : 'ABSENT'}
                                </span>
                            </div>

                            {/* Actions - role-based */}
                            <div className="border-t border-white/5 p-2 flex gap-2">
                                {canCheckInOut && status === 'absent' && (
                                    <button onClick={() => manualCheckIn(worker)} disabled={isProcessing}
                                        className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-medium disabled:opacity-50">✓ Check IN</button>
                                )}
                                {canCheckInOut && status === 'present' && (
                                    <button onClick={() => manualCheckOut(worker)} disabled={isProcessing}
                                        className="flex-1 py-2 bg-orange-500/20 text-orange-400 rounded-xl text-sm font-medium disabled:opacity-50">↩ Check OUT</button>
                                )}
                                {(status === 'left' || status === 'half') && (
                                    <span className="flex-1 py-2 text-center text-white/30 text-sm">Done today</span>
                                )}
                                {canEdit && <button onClick={() => openEditModal(worker)} className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-xl text-sm">✏️</button>}
                                {canDelete && <button onClick={() => setDeleteWorker(worker)} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-xl text-sm">🗑️</button>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900/95 backdrop-blur-xl rounded-3xl p-6 max-w-md w-full border border-white/10">
                        <h2 className="text-xl font-bold text-white mb-4">Add Worker</h2>
                        <div className="space-y-4">
                            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full Name"
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40" autoFocus />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} placeholder="Rate ₹"
                                    className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white" />
                                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                                    className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white">
                                    <option value="" className="bg-slate-800">Category</option>
                                    <option value="Charcoal Burner" className="bg-slate-800">Charcoal Burner</option>
                                    <option value="Wood Cutter" className="bg-slate-800">Wood Cutter</option>
                                    <option value="Loader" className="bg-slate-800">Loader</option>
                                    <option value="Helper" className="bg-slate-800">Helper</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 bg-white/10 text-white rounded-xl">Cancel</button>
                            <button onClick={addWorker} disabled={!newName.trim() || isProcessing}
                                className="flex-1 py-3 bg-cyan-500 text-white rounded-xl font-medium disabled:opacity-50">Add</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editWorker && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900/95 backdrop-blur-xl rounded-3xl p-6 max-w-md w-full border border-white/10">
                        <h2 className="text-xl font-bold text-white mb-4">Edit Worker</h2>
                        <div className="space-y-4">
                            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name"
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white" />
                            <input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} placeholder="Rate ₹"
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white" />
                            <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white">
                                <option value="" className="bg-slate-800">Category</option>
                                <option value="Charcoal Burner" className="bg-slate-800">Charcoal Burner</option>
                                <option value="Wood Cutter" className="bg-slate-800">Wood Cutter</option>
                                <option value="Loader" className="bg-slate-800">Loader</option>
                                <option value="Helper" className="bg-slate-800">Helper</option>
                            </select>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setEditWorker(null)} className="flex-1 py-3 bg-white/10 text-white rounded-xl">Cancel</button>
                            <button onClick={saveEdit} disabled={!editName.trim() || isProcessing}
                                className="flex-1 py-3 bg-cyan-500 text-white rounded-xl font-medium disabled:opacity-50">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm - HARD DELETE */}
            {deleteWorker && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900/95 backdrop-blur-xl rounded-3xl p-6 max-w-sm w-full text-center border border-red-500/30">
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Delete Permanently?</h2>
                        <p className="text-white/60 mb-2">Remove <strong className="text-white">{deleteWorker.name}</strong>?</p>
                        <p className="text-red-400/80 text-sm mb-6">This will delete ALL attendance records for this worker!</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteWorker(null)} className="flex-1 py-3 bg-white/10 text-white rounded-xl">Cancel</button>
                            <button onClick={confirmDelete} disabled={isProcessing}
                                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium disabled:opacity-50">Delete Forever</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toasts */}
            {successMessage && <div className="fixed bottom-8 left-4 right-4 p-4 bg-green-500 text-white rounded-xl text-center z-50 font-medium">{successMessage}</div>}
            {error && <div className="fixed bottom-8 left-4 right-4 p-4 bg-red-500 text-white rounded-xl text-center z-50">{error}</div>}
        </div>
    );
}
