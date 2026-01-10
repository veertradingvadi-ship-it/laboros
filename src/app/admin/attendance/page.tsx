'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface AttendanceLog {
    id: string;
    worker_id: string;
    date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    hours_worked: number | null;
    workers: { name: string } | null;
}

export default function AdminAttendancePage() {
    const [logs, setLogs] = useState<AttendanceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [stats, setStats] = useState({ present: 0, left: 0, totalHours: 0 });

    useEffect(() => { loadLogs(); }, [selectedDate]);

    const loadLogs = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('attendance_logs')
            .select('*, workers(name)')
            .eq('date', selectedDate)
            .order('check_in_time', { ascending: false });

        const logsData = data || [];
        setLogs(logsData);

        let totalHours = 0;
        logsData.forEach(log => {
            if (log.hours_worked) totalHours += log.hours_worked;
            else if (log.check_in_time && log.check_out_time) {
                totalHours += (new Date(log.check_out_time).getTime() - new Date(log.check_in_time).getTime()) / 3600000;
            }
        });

        setStats({
            present: logsData.filter(l => l.check_in_time && !l.check_out_time).length,
            left: logsData.filter(l => l.check_out_time).length,
            totalHours: Math.round(totalHours * 10) / 10,
        });
        setLoading(false);
    };

    const deleteLog = async (logId: string) => {
        if (!confirm('Delete this attendance log?')) return;
        await supabase.from('attendance_logs').delete().eq('id', logId);
        loadLogs();
    };

    const exportCSV = () => {
        if (logs.length === 0) return;

        const headers = ['Worker Name', 'Date', 'Check In', 'Check Out', 'Hours Worked', 'Status'];
        const rows = logs.map(log => [
            log.workers?.name || 'Unknown',
            new Date(log.date).toLocaleDateString(),
            log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString() : '-',
            log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString() : '-',
            log.hours_worked ? log.hours_worked.toFixed(2) : '0',
            log.check_out_time ? 'Checked Out' : 'Present'
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `attendance_logs_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-white">Attendance Logs</h1>
                    <p className="text-sm text-slate-400">View and manage attendance records</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={exportCSV} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-cyan-400 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex items-center gap-2">
                        <span>⬇</span> Export CSV
                    </button>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
                        <span className="text-slate-400 pl-3">📅</span>
                        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent border-none text-white focus:ring-0 outline-none px-2 py-1" />
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-400">{stats.present}</p>
                    <p className="text-sm text-green-500/80 uppercase tracking-widest font-medium text-[10px]">Present</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-blue-400">{stats.left}</p>
                    <p className="text-sm text-blue-500/80 uppercase tracking-widest font-medium text-[10px]">Left</p>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-purple-400">{stats.totalHours}h</p>
                    <p className="text-sm text-purple-500/80 uppercase tracking-widest font-medium text-[10px]">Total Hours</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                </div>
            ) : (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-black/20 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Worker</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Check In</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Check Out</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Hours</th>
                                    <th className="px-6 py-4 text-left text-slate-400 font-medium">Status</th>
                                    <th className="px-6 py-4 text-right text-slate-400 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 font-medium text-white">{log.workers?.name || 'Unknown'}</td>
                                        <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                                            {log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-300 font-mono text-xs">
                                            {log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-slate-300">
                                            {log.hours_worked ? `${log.hours_worked.toFixed(1)}h` : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${log.check_out_time
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                                                {log.check_out_time ? 'Left' : 'Present'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => deleteLog(log.id)}
                                                className="text-red-400 hover:text-red-300 text-xs font-medium hover:underline transition-colors">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {logs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <span className="text-2xl mb-2">📅</span>
                            <p>No attendance for this date</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
