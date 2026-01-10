'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { COMPANY_NAME } from '@/lib/config';

interface Worker {
    id: string;
    name: string;
    worker_number: string | null;
    base_rate: number;
    category: string | null;
    photo_url: string | null;
}

interface AttendanceRecord {
    date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    status: string;
    overtime_hours: number;
}

interface PayslipData {
    worker: Worker;
    attendance: AttendanceRecord[];
    daysPresent: number;
    daysHalfDay: number;
    daysAbsent: number;
    overtimeHours: number;
    basicPay: number;
    overtimePay: number;
    totalPay: number;
}

export default function PayslipsPage() {
    const [loading, setLoading] = useState(true);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [selectedWorker, setSelectedWorker] = useState<string>('');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 9); // Last 10 days
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [payslip, setPayslip] = useState<PayslipData | null>(null);
    const [generating, setGenerating] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const OVERTIME_RATE_MULTIPLIER = 1.5; // Overtime is 1.5x

    useEffect(() => { loadWorkers(); }, []);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const loadWorkers = async () => {
        const { data } = await supabase.from('workers').select('id, name, worker_number, base_rate, category, photo_url').eq('is_active', true).order('name');
        setWorkers(data || []);
        if (data && data.length > 0) {
            setSelectedWorker(data[0].id);
        }
        setLoading(false);
    };

    const generatePayslip = async () => {
        if (!selectedWorker) return;

        setGenerating(true);
        const worker = workers.find(w => w.id === selectedWorker);
        if (!worker) {
            setGenerating(false);
            return;
        }

        // Get attendance for date range
        const { data: attendance } = await supabase
            .from('attendance_logs')
            .select('date, check_in_time, check_out_time, status, overtime_hours')
            .eq('worker_id', selectedWorker)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        const records = attendance || [];

        // Calculate stats
        let daysPresent = 0;
        let daysHalfDay = 0;
        let overtimeHours = 0;

        records.forEach(r => {
            if (r.check_in_time) {
                if (r.status === 'half-day') {
                    daysHalfDay++;
                } else {
                    daysPresent++;
                }
            }
            if (r.overtime_hours) {
                overtimeHours += r.overtime_hours;
            }
        });

        // Calculate total working days in range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const daysAbsent = totalDays - daysPresent - daysHalfDay;

        // Calculate pay
        const dailyRate = worker.base_rate;
        const basicPay = (daysPresent * dailyRate) + (daysHalfDay * dailyRate * 0.5);
        const hourlyRate = dailyRate / 8; // Assuming 8-hour workday
        const overtimePay = overtimeHours * hourlyRate * OVERTIME_RATE_MULTIPLIER;
        const totalPay = basicPay + overtimePay;

        setPayslip({
            worker,
            attendance: records,
            daysPresent,
            daysHalfDay,
            daysAbsent,
            overtimeHours,
            basicPay,
            overtimePay,
            totalPay
        });

        setGenerating(false);
        setNotification({ type: 'success', message: 'Payslip generated!' });
    };

    const printPayslip = () => {
        if (!payslip) return;

        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payslip - ${payslip.worker.name}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                    .company { font-size: 24px; font-weight: bold; color: #333; }
                    .title { font-size: 18px; color: #666; margin-top: 10px; }
                    .worker-info { display: flex; gap: 20px; margin-bottom: 30px; background: #f5f5f5; padding: 20px; border-radius: 8px; }
                    .worker-photo { width: 80px; height: 80px; border-radius: 8px; object-fit: cover; background: #ddd; }
                    .worker-details { flex: 1; }
                    .worker-name { font-size: 20px; font-weight: bold; }
                    .worker-id { color: #666; }
                    .period { background: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 30px; }
                    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
                    .stat { background: #f9f9f9; padding: 15px; border-radius: 8px; text-align: center; }
                    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
                    .stat-label { font-size: 12px; color: #666; }
                    .pay-section { border: 2px solid #333; border-radius: 8px; overflow: hidden; }
                    .pay-row { display: flex; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid #eee; }
                    .pay-row:last-child { border-bottom: none; }
                    .pay-row.total { background: #333; color: white; font-weight: bold; font-size: 18px; }
                    .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
                    @media print { body { padding: 20px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company">${COMPANY_NAME}</div>
                    <div class="title">WORKER PAYSLIP</div>
                </div>

                <div class="worker-info">
                    ${payslip.worker.photo_url ? `<img src="${payslip.worker.photo_url}" class="worker-photo" />` : '<div class="worker-photo"></div>'}
                    <div class="worker-details">
                        <div class="worker-name">${payslip.worker.name}</div>
                        <div class="worker-id">ID: ${payslip.worker.worker_number || 'N/A'}</div>
                        <div class="worker-id">Category: ${payslip.worker.category || 'General'}</div>
                        <div class="worker-id">Daily Rate: ₹${payslip.worker.base_rate}</div>
                    </div>
                </div>

                <div class="period">
                    <strong>Pay Period:</strong> ${new Date(startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} 
                    to ${new Date(endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>

                <div class="summary">
                    <div class="stat">
                        <div class="stat-value" style="color: green;">${payslip.daysPresent}</div>
                        <div class="stat-label">Days Present</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" style="color: orange;">${payslip.daysHalfDay}</div>
                        <div class="stat-label">Half Days</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" style="color: red;">${payslip.daysAbsent}</div>
                        <div class="stat-label">Days Absent</div>
                    </div>
                </div>

                <div class="pay-section">
                    <div class="pay-row">
                        <span>Basic Pay (${payslip.daysPresent} days × ₹${payslip.worker.base_rate})</span>
                        <span>₹${(payslip.daysPresent * payslip.worker.base_rate).toLocaleString()}</span>
                    </div>
                    <div class="pay-row">
                        <span>Half Day Pay (${payslip.daysHalfDay} × ₹${payslip.worker.base_rate / 2})</span>
                        <span>₹${(payslip.daysHalfDay * payslip.worker.base_rate / 2).toLocaleString()}</span>
                    </div>
                    <div class="pay-row">
                        <span>Overtime Pay (${payslip.overtimeHours} hrs × ₹${Math.round((payslip.worker.base_rate / 8) * OVERTIME_RATE_MULTIPLIER)})</span>
                        <span>₹${Math.round(payslip.overtimePay).toLocaleString()}</span>
                    </div>
                    <div class="pay-row total">
                        <span>Total Payable</span>
                        <span>₹${Math.round(payslip.totalPay).toLocaleString()}</span>
                    </div>
                </div>

                <div class="footer">
                    Generated on ${new Date().toLocaleString('en-IN')} | ${COMPANY_NAME}
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 300);
        }
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
            <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    🧾 Payslip Generator
                </h1>
                <p className="text-sm text-slate-400">Auto-calculate and print worker wages</p>
            </div>

            {/* Generator Controls */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 lg:p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Select Worker</label>
                        <select
                            value={selectedWorker}
                            onChange={(e) => setSelectedWorker(e.target.value)}
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white"
                        >
                            {workers.map(w => (
                                <option key={w.id} value={w.id} className="bg-slate-900">
                                    {w.name} ({w.worker_number || 'No ID'})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block mb-1">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={generatePayslip}
                            disabled={generating}
                            className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium disabled:opacity-50"
                        >
                            {generating ? 'Generating...' : '📊 Generate Payslip'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Payslip Preview */}
            {payslip && (
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-semibold text-white">Payslip Preview</h3>
                        <button
                            onClick={printPayslip}
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-medium"
                        >
                            🖨️ Print / Download
                        </button>
                    </div>

                    {/* Worker Info */}
                    <div className="p-4 lg:p-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-16 h-16 rounded-xl bg-white/10 overflow-hidden">
                                {payslip.worker.photo_url ? (
                                    <img src={payslip.worker.photo_url} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl">👷</div>
                                )}
                            </div>
                            <div>
                                <p className="text-white font-bold text-lg">{payslip.worker.name}</p>
                                <p className="text-slate-400 text-sm">{payslip.worker.worker_number || 'No ID'} • {payslip.worker.category || 'General'}</p>
                                <p className="text-cyan-400 text-sm">₹{payslip.worker.base_rate}/day</p>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-green-400">{payslip.daysPresent}</p>
                                <p className="text-xs text-slate-400">Present</p>
                            </div>
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-yellow-400">{payslip.daysHalfDay}</p>
                                <p className="text-xs text-slate-400">Half Day</p>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-red-400">{payslip.daysAbsent}</p>
                                <p className="text-xs text-slate-400">Absent</p>
                            </div>
                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
                                <p className="text-2xl font-bold text-purple-400">{payslip.overtimeHours}</p>
                                <p className="text-xs text-slate-400">OT Hours</p>
                            </div>
                        </div>

                        {/* Pay Breakdown */}
                        <div className="bg-black/20 rounded-xl overflow-hidden">
                            <div className="flex justify-between p-4 border-b border-white/5">
                                <span className="text-slate-300">Basic Pay ({payslip.daysPresent} days)</span>
                                <span className="text-white font-medium">₹{(payslip.daysPresent * payslip.worker.base_rate).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between p-4 border-b border-white/5">
                                <span className="text-slate-300">Half Day Pay ({payslip.daysHalfDay} days)</span>
                                <span className="text-white font-medium">₹{(payslip.daysHalfDay * payslip.worker.base_rate / 2).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between p-4 border-b border-white/5">
                                <span className="text-slate-300">Overtime Pay ({payslip.overtimeHours} hrs)</span>
                                <span className="text-white font-medium">₹{Math.round(payslip.overtimePay).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between p-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/20">
                                <span className="text-white font-bold">Total Payable</span>
                                <span className="text-2xl font-bold text-cyan-400">₹{Math.round(payslip.totalPay).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!payslip && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                    <span className="text-4xl block mb-4">🧾</span>
                    <p className="text-white font-medium mb-2">Select a worker and date range</p>
                    <p className="text-sm text-slate-400">Click "Generate Payslip" to calculate wages</p>
                </div>
            )}
        </div>
    );
}
