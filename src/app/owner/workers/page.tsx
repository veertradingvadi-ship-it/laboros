'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Worker } from '@/lib/supabase';

export default function OwnerWorkersPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [search, setSearch] = useState('');
    const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
    const [workerLogs, setWorkerLogs] = useState<any[]>([]);

    useEffect(() => { loadWorkers(); }, []);

    const loadWorkers = async () => {
        try {
            const { data } = await supabase.from('workers').select('*').order('name');
            setWorkers(data || []);
        } finally { setLoading(false); }
    };

    const loadWorkerLogs = async (workerId: string) => {
        const { data } = await supabase.from('attendance_logs')
            .select('*')
            .eq('worker_id', workerId)
            .order('date', { ascending: false })
            .limit(30);
        setWorkerLogs(data || []);
    };

    const toggleWorkerStatus = async (worker: Worker) => {
        await supabase.from('workers').update({ is_active: !worker.is_active }).eq('id', worker.id);
        loadWorkers();
    };

    const forceReEnroll = async (workerId: string) => {
        await supabase.from('workers').update({ face_descriptor: null }).eq('id', workerId);
        loadWorkers();
        setSelectedWorker(null);
    };

    const filtered = workers.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800">Worker Registry</h1>
                <span className="text-sm text-slate-500">{workers.length} total</span>
            </div>

            <input type="text" placeholder="🔍 Search workers..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full px-4 py-2 border rounded-xl" />

            <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="text-left py-2 px-3">Name</th>
                            <th className="text-left py-2 px-3">Rate</th>
                            <th className="text-left py-2 px-3">Face</th>
                            <th className="text-left py-2 px-3">Status</th>
                            <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(worker => (
                            <tr key={worker.id} className="border-b hover:bg-slate-50">
                                <td className="py-2 px-3 font-medium">{worker.name}</td>
                                <td className="py-2 px-3">₹{worker.base_rate}</td>
                                <td className="py-2 px-3">
                                    <span className={`px-2 py-0.5 rounded text-xs ${worker.face_descriptor?.length ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {worker.face_descriptor?.length ? '✓ Enrolled' : '✗ None'}
                                    </span>
                                </td>
                                <td className="py-2 px-3">
                                    <span className={`px-2 py-0.5 rounded text-xs ${worker.is_active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {worker.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="py-2 px-3">
                                    <button onClick={() => { setSelectedWorker(worker); loadWorkerLogs(worker.id); }}
                                        className="text-blue-600 hover:underline text-xs mr-2">View</button>
                                    <button onClick={() => toggleWorkerStatus(worker)}
                                        className="text-slate-500 hover:underline text-xs">{worker.is_active ? 'Disable' : 'Enable'}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Worker Detail Modal */}
            {selectedWorker && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold">{selectedWorker.name}</h2>
                            <button onClick={() => setSelectedWorker(null)} className="text-2xl text-slate-400">×</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-3 rounded-xl">
                                    <p className="text-xs text-slate-500">Daily Rate</p>
                                    <p className="text-xl font-bold">₹{selectedWorker.base_rate}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-xl">
                                    <p className="text-xs text-slate-500">Face Enrolled</p>
                                    <p className="text-xl font-bold">{selectedWorker.face_descriptor?.length ? 'Yes' : 'No'}</p>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold mb-2">Recent Attendance ({workerLogs.length})</h3>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {workerLogs.slice(0, 10).map(log => (
                                        <div key={log.id} className="flex justify-between text-sm py-1 border-b">
                                            <span>{new Date(log.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                            <span className={log.status === 'present' ? 'text-green-600' : 'text-slate-400'}>{log.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => forceReEnroll(selectedWorker.id)} className="flex-1 py-2 bg-orange-500 text-white rounded-xl text-sm">
                                    Force Re-Enroll Face
                                </button>
                                <button onClick={() => toggleWorkerStatus(selectedWorker)} className="flex-1 py-2 bg-slate-200 rounded-xl text-sm">
                                    {selectedWorker.is_active ? 'Disable Worker' : 'Enable Worker'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
