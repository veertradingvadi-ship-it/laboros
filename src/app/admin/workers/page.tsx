'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Webcam from 'react-webcam';
import * as faceUtils from '@/lib/face-utils';
import { FaceDetectionResult } from '@/lib/face-utils';

interface Worker {
    id: string;
    name: string;
    worker_number: string | null;
    photo_url: string | null;
    face_descriptor: number[] | null;
    base_rate: number;
    category: string | null;
    shift_id: number | null;
    incharge_id: string | null;
    is_active: boolean;
    created_at: string;
}

interface Shift {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

interface Incharge {
    id: string;
    email: string;
    full_name: string | null;
}

type ScanStep = 'INIT' | 'LOADING_MODELS' | 'SCANNING_CENTER' | 'SCANNING_LEFT' | 'SCANNING_RIGHT' | 'COMPLETED';

export default function AdminWorkersPage() {
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [incharges, setIncharges] = useState<Incharge[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [search, setSearch] = useState('');
    const [shiftFilter, setShiftFilter] = useState<number | 'all'>('all');
    const [inchargeFilter, setInchargeFilter] = useState<string | 'all'>('all');

    // Notifications ("Pop")
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Edit/Add Mode
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
    const [showAddWorker, setShowAddWorker] = useState(false);
    const [newWorker, setNewWorker] = useState<{
        name: string;
        worker_number: string;
        base_rate: number;
        category: string;
        shift_id: number | null;
        incharge_id: string | null;
        photo_url: string;
        face_descriptor: number[] | null;
    }>({ name: '', worker_number: '', base_rate: 400, category: 'Unskilled', shift_id: null, incharge_id: null, photo_url: '', face_descriptor: null });

    // Face Scan State
    const webcamRef = useRef<Webcam>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [scanStep, setScanStep] = useState<ScanStep>('INIT');
    const [scanError, setScanError] = useState<string | null>(null);
    const [scanProgress, setScanProgress] = useState(0);
    const [collectedDescriptors, setCollectedDescriptors] = useState<Float32Array[]>([]);
    const scanningInterval = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadWorkers();
        loadShifts();
        loadIncharges();
    }, []);

    // Cleanup scanning on unmount or modal close
    useEffect(() => {
        return () => stopScanning();
    }, []);

    // Auto-dismiss notification
    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
    };

    const loadWorkers = async () => {
        const { data, error } = await supabase.from('workers').select('*').order('name');
        if (error) {
            console.error('Error loading workers:', error);
            showNotification('error', 'Failed to load workers');
        }
        setWorkers(data || []);
        setLoading(false);
    };

    const loadShifts = async () => {
        const { data } = await supabase.from('shifts').select('*').eq('is_active', true).order('start_time');
        setShifts(data || []);
    };

    const loadIncharges = async () => {
        // Get all managers who can be incharges
        const { data } = await supabase.from('profiles').select('id, email, full_name').eq('role', 'manager');
        setIncharges(data || []);
    };

    // Generate next Worker ID automatically
    const generateNextWorkerId = (): string => {
        const existingIds = workers
            .map(w => w.worker_number)
            .filter(Boolean)
            .map(id => {
                const match = id?.match(/LBR-(\d+)/);
                return match ? parseInt(match[1]) : 0;
            });
        const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
        const nextNum = maxId + 1;
        return `LBR-${nextNum.toString().padStart(4, '0')}`;
    };

    const handleSaveWorker = async () => {
        if (!newWorker.name) {
            showNotification('error', 'Please enter a worker name');
            return;
        }

        // Auto-generate Worker ID if not set
        const workerId = newWorker.worker_number || generateNextWorkerId();

        const workerData = {
            name: newWorker.name,
            worker_number: workerId,
            base_rate: newWorker.base_rate,
            category: newWorker.category,
            shift_id: newWorker.shift_id || null,
            incharge_id: newWorker.incharge_id || null,
            photo_url: newWorker.photo_url || null,
            face_descriptor: newWorker.face_descriptor || null,
            is_active: true
        };

        try {
            let result;
            if (editingWorker) {
                result = await supabase.from('workers').update(workerData).eq('id', editingWorker.id);
            } else {
                result = await supabase.from('workers').insert(workerData);
            }

            // Check for Supabase errors
            if (result.error) {
                console.error('Supabase save error:', result.error);
                showNotification('error', `Database error: ${result.error.message}`);
                return;
            }

            showNotification('success', editingWorker ? 'Worker updated!' : `Worker added! ID: ${workerId}`);
            setShowAddWorker(false);
            resetForm();
            loadWorkers();
        } catch (err: any) {
            console.error('Save exception:', err);
            showNotification('error', `Error: ${err.message}`);
        }
    };

    const deleteWorker = async (workerId: string) => {
        if (!confirm('Are you sure you want to delete this worker? This cannot be undone.')) return;

        const { error } = await supabase.from('workers').delete().eq('id', workerId);
        if (error) {
            showNotification('error', `Delete failed: ${error.message}`);
        } else {
            showNotification('success', 'Worker deleted');
            loadWorkers();
        }
    };

    const toggleActive = async (workerId: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from('workers')
            .update({ is_active: !currentStatus })
            .eq('id', workerId);

        if (error) {
            showNotification('error', `Update failed: ${error.message}`);
        } else {
            showNotification('success', currentStatus ? 'Worker deactivated' : 'Worker activated');
            loadWorkers();
        }
    };

    const resetForm = () => {
        setEditingWorker(null);
        setNewWorker({ name: '', worker_number: '', base_rate: 400, category: 'Unskilled', shift_id: null, incharge_id: null, photo_url: '', face_descriptor: null });
        stopScanning();
        setScanStep('INIT');
    };

    const startEdit = (worker: Worker) => {
        setEditingWorker(worker);
        setNewWorker({
            name: worker.name,
            worker_number: worker.worker_number || '',
            base_rate: worker.base_rate,
            category: worker.category || 'Unskilled',
            shift_id: worker.shift_id || null,
            incharge_id: worker.incharge_id || null,
            photo_url: worker.photo_url || '',
            face_descriptor: worker.face_descriptor
        });
        setShowAddWorker(true);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setNewWorker(prev => ({ ...prev, photo_url: base64String }));
            showNotification('success', '✓ Photo uploaded successfully');
        };
        reader.readAsDataURL(file);
    };

    // --- Face Registration Logic ---

    const startFaceRegistration = async () => {
        setScanStep('LOADING_MODELS');
        setScanError(null);
        setCollectedDescriptors([]);
        setScanProgress(0);

        try {
            await faceUtils.loadFaceModels();
            setScanStep('SCANNING_CENTER');
            startScanningLoop();
        } catch (err) {
            setScanError('Failed to load Face AI models');
            showNotification('error', 'Failed to load Face AI models');
            setScanStep('INIT');
        }
    };

    const stopScanning = () => {
        if (scanningInterval.current) {
            clearInterval(scanningInterval.current);
            scanningInterval.current = null;
        }
    };

    const startScanningLoop = () => {
        stopScanning();
        let frameCount = 0;

        scanningInterval.current = setInterval(async () => {
            if (!webcamRef.current) return;
            await processFrame();
        }, 500); // Check every 500ms
    };

    // Use a Ref to track step inside interval
    const stepRef = useRef<ScanStep>('INIT');
    useEffect(() => { stepRef.current = scanStep; }, [scanStep]);

    const descriptorsRef = useRef<Float32Array[]>([]);
    useEffect(() => { descriptorsRef.current = collectedDescriptors; }, [collectedDescriptors]);

    const processFrame = async () => {
        const currentStep = stepRef.current;
        if (currentStep === 'COMPLETED' || currentStep === 'INIT' || currentStep === 'LOADING_MODELS') return;

        const imageSrc = webcamRef.current?.getScreenshot();
        if (!imageSrc) return;

        const result = await faceUtils.detectFaceFromBase64(imageSrc);

        if (!result) {
            return;
        }

        // Logic based on Step
        let validCapture = false;

        // Relaxed detection thresholds for better usability
        if (currentStep === 'SCANNING_CENTER') {
            // Accept any frontal-ish face for center
            if (result.isFrontalFace || (result.faceAngle > -15 && result.faceAngle < 15)) {
                validCapture = true;
                setScanError(null);
            } else {
                setScanError('Look at the camera');
            }
        } else if (currentStep === 'SCANNING_LEFT') {
            // Accept if head is turned left at all
            if (result.headPose === 'left' || result.faceAngle < -5) {
                validCapture = true;
                setScanError(null);
            } else {
                setScanError('Turn head slightly LEFT');
            }
        } else if (currentStep === 'SCANNING_RIGHT') {
            // Accept if head is turned right at all
            if (result.headPose === 'right' || result.faceAngle > 5) {
                validCapture = true;
                setScanError(null);
            } else {
                setScanError('Turn head slightly RIGHT');
            }
        }

        if (validCapture) {
            // Capture this descriptor
            const newDescriptors = [...descriptorsRef.current, result.descriptor];
            setCollectedDescriptors(newDescriptors);

            // Console log for debug
            console.log(`Captured ${currentStep}`);

            // Transition
            if (currentStep === 'SCANNING_CENTER') {
                // Save Center Image as the Profile Photo
                setNewWorker(prev => ({ ...prev, photo_url: result.croppedFace }));
                setScanStep('SCANNING_LEFT');
                setScanProgress(33);
            } else if (currentStep === 'SCANNING_LEFT') {
                setScanStep('SCANNING_RIGHT');
                setScanProgress(66);
            } else if (currentStep === 'SCANNING_RIGHT') {
                // Done
                setScanProgress(100);
                finishRegistration(newDescriptors);
            }
        }
    };

    const finishRegistration = (descriptors: Float32Array[]) => {
        stopScanning();
        setScanStep('COMPLETED');

        // Average descriptors
        if (descriptors.length > 0) {
            const numDescriptors = descriptors.length;
            const vectorSize = descriptors[0].length;
            const avgDescriptor = new Float32Array(vectorSize);

            for (let i = 0; i < vectorSize; i++) {
                let sum = 0;
                for (let j = 0; j < numDescriptors; j++) {
                    sum += descriptors[j][i];
                }
                avgDescriptor[i] = sum / numDescriptors;
            }

            setNewWorker(prev => ({
                ...prev,
                face_descriptor: Array.from(avgDescriptor)
            }));

            showNotification('success', 'Face Scan Complete!');
        }
    };

    const exportCSV = () => {
        if (filteredWorkers.length === 0) {
            showNotification('error', 'No workers to export');
            return;
        }
        // Include ALL worker details in CSV
        const headers = ['Worker ID', 'Name', 'Category', 'Base Rate', 'Shift', 'Incharge', 'Status', 'Created Date', 'Has Face ID', 'Photo URL'];
        const rows = filteredWorkers.map(w => [
            w.worker_number || '-',
            `"${w.name}"`, // Quote name to handle commas
            w.category || '-',
            w.base_rate.toString(),
            shifts.find(s => s.id === w.shift_id)?.name || '-',
            incharges.find(i => i.id === w.incharge_id)?.full_name || incharges.find(i => i.id === w.incharge_id)?.email || '-',
            w.is_active ? 'Active' : 'Inactive',
            new Date(w.created_at).toLocaleDateString('en-IN'),
            w.face_descriptor ? 'Yes' : 'No',
            w.photo_url || '-'
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `workers_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification('success', `Exported ${filteredWorkers.length} workers`);
    };

    const exportPDF = () => {
        // Create a printable HTML document
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Workers List - ${new Date().toLocaleDateString('en-IN')}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #333; color: white; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    .status-active { color: green; }
                    .status-inactive { color: red; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <h1>Workers List</h1>
                <p>Generated: ${new Date().toLocaleString('en-IN')}</p>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Rate (₹)</th>
                            <th>Shift</th>
                            <th>Incharge</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredWorkers.map(w => `
                            <tr>
                                <td>${w.worker_number || '-'}</td>
                                <td>${w.name}</td>
                                <td>${w.category || '-'}</td>
                                <td>₹${w.base_rate}</td>
                                <td>${shifts.find(s => s.id === w.shift_id)?.name || '-'}</td>
                                <td>${incharges.find(i => i.id === w.incharge_id)?.full_name || incharges.find(i => i.id === w.incharge_id)?.email || '-'}</td>
                                <td class="${w.is_active ? 'status-active' : 'status-inactive'}">${w.is_active ? 'Active' : 'Inactive'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="margin-top: 20px; color: #888; font-size: 12px;">Total: ${filteredWorkers.length} workers</p>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
            printWindow.print();
        }
        showNotification('success', 'PDF opened for printing');
    };

    const generateIDCards = async () => {
        showNotification('success', 'Generating ID Cards...');

        // Create a page with multiple ID cards
        const cardContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Worker ID Cards</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                    .cards-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
                    .id-card { 
                        width: 340px; height: 200px; 
                        background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                        border-radius: 12px; padding: 16px; color: white;
                        display: flex; gap: 12px; page-break-inside: avoid;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    }
                    .photo { width: 80px; height: 100px; background: #475569; border-radius: 8px; overflow: hidden; }
                    .photo img { width: 100%; height: 100%; object-fit: cover; }
                    .info { flex: 1; }
                    .name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
                    .worker-id { font-size: 14px; color: #22d3ee; font-weight: bold; }
                    .detail { font-size: 12px; color: #94a3b8; margin-top: 8px; }
                    .company { position: absolute; bottom: 12px; right: 16px; font-size: 10px; color: #64748b; }
                    @media print { 
                        body { background: white; }
                        .id-card { box-shadow: none; border: 1px solid #ddd; }
                    }
                </style>
            </head>
            <body>
                <h2 style="color: #333; margin-bottom: 20px;">Worker ID Cards</h2>
                <div class="cards-grid">
                    ${filteredWorkers.filter(w => w.is_active).map(w => `
                        <div class="id-card" style="position: relative;">
                            <div class="photo">
                                ${w.photo_url ? `<img src="${w.photo_url}" alt="${w.name}" />` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">👤</div>'}
                            </div>
                            <div class="info">
                                <div class="name">${w.name}</div>
                                <div class="worker-id">${w.worker_number || 'N/A'}</div>
                                <div class="detail">Category: ${w.category || 'N/A'}</div>
                                <div class="detail">Shift: ${shifts.find(s => s.id === w.shift_id)?.name || 'Not Assigned'}</div>
                                <div class="detail">Rate: ₹${w.base_rate}/day</div>
                            </div>
                            <div class="company">Labour Management System</div>
                        </div>
                    `).join('')}
                </div>
                <p style="margin-top: 20px; color: #888; font-size: 12px;">Generated: ${new Date().toLocaleString('en-IN')}</p>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(cardContent);
            printWindow.document.close();
            setTimeout(() => printWindow.print(), 500);
        }
    };

    const filteredWorkers = workers.filter(w => {
        const matchesFilter = filter === 'all' || (filter === 'active' ? w.is_active : !w.is_active);
        const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase()) ||
            (w.worker_number && w.worker_number.toLowerCase().includes(search.toLowerCase()));
        return matchesFilter && matchesSearch;
    });

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
                <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-slide-up ${notification.type === 'success'
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
                    <h1 className="text-xl font-bold text-white">Workers ({workers.length})</h1>
                    <p className="text-sm text-slate-400">Manage all registered workers</p>
                </div>
                <div className="flex gap-3">
                    {/* Export Dropdown */}
                    <div className="relative group">
                        <button className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-cyan-400 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex items-center gap-2">
                            <span>⬇</span> Export
                        </button>
                        <div className="absolute right-0 mt-1 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                            <button onClick={exportCSV} className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 rounded-t-xl flex items-center gap-2">
                                📄 Export CSV
                            </button>
                            <button onClick={exportPDF} className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 flex items-center gap-2">
                                📑 Export PDF
                            </button>
                            <button onClick={generateIDCards} className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 rounded-b-xl flex items-center gap-2">
                                🪪 Generate ID Cards
                            </button>
                        </div>
                    </div>
                    <button onClick={() => setShowAddWorker(true)}
                        className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl hover:from-teal-400 hover:to-emerald-400 hover:shadow-lg hover:shadow-teal-500/20 transition-all font-medium">
                        + Add Worker
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="relative w-full md:w-64">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                    <input type="text" placeholder="Search by name or number..." value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-black/30 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    {(['all', 'active', 'inactive'] as const).map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${filter === f
                                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}>
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Workers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWorkers.map(worker => (
                    <div key={worker.id} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 transition-all hover:bg-white/10 group">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-full bg-slate-800 overflow-hidden border-2 border-slate-700 group-hover:border-cyan-500/50 transition-colors">
                                {worker.photo_url ? (
                                    <img src={worker.photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-500 text-xl">👷</div>
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-white group-hover:text-cyan-400 transition-colors">{worker.name}</h3>
                                {worker.worker_number && (
                                    <span className="inline-block bg-slate-800 text-cyan-400 text-xs px-2 py-0.5 rounded border border-slate-700 font-mono mb-1">
                                        #{worker.worker_number}
                                    </span>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm text-slate-400">₹{worker.base_rate}/day</span>
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${worker.is_active
                                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                        {worker.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => startEdit(worker)} className="text-slate-400 hover:text-white">✏️</button>
                        </div>
                        <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                            <button onClick={() => toggleActive(worker.id, worker.is_active)}
                                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${worker.is_active
                                    ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                                    : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>
                                {worker.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => deleteWorker(worker.id)}
                                className="px-4 py-2 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredWorkers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <span className="text-3xl mb-3">🔍</span>
                    <p>No workers found</p>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showAddWorker && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold text-xl text-white mb-6">{editingWorker ? 'Edit Worker' : 'Add New Worker'}</h3>

                        <div className="space-y-4">
                            {/* Photo Registration Options */}
                            {!newWorker.photo_url && scanStep === 'INIT' ? (
                                <div className="flex gap-3 justify-center mb-4">
                                    <button onClick={() => fileInputRef.current?.click()}
                                        className="flex-1 py-4 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-colors flex flex-col items-center gap-2">
                                        <span className="text-2xl">📁</span>
                                        <span className="text-sm font-medium">Upload Photo</span>
                                    </button>
                                    <button onClick={startFaceRegistration}
                                        className="flex-1 py-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all flex flex-col items-center gap-2">
                                        <span className="text-2xl">📸</span>
                                        <span className="text-sm font-medium">Live Camera</span>
                                    </button>
                                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                                </div>
                            ) : scanStep !== 'INIT' && scanStep !== 'COMPLETED' ? (
                                /* Live Camera Scanning */
                                <div className="mb-4">
                                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border-2 border-cyan-500/30">
                                        <Webcam ref={webcamRef}
                                            screenshotFormat="image/jpeg"
                                            videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
                                            className="w-full h-full object-cover"
                                            style={{ transform: 'scaleX(-1)' }} />
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            {scanStep === 'LOADING_MODELS' && <div className="bg-black/60 text-cyan-400 px-4 py-2 rounded-xl font-bold">Loading AI...</div>}
                                            {scanStep === 'SCANNING_CENTER' && <div className="w-32 h-32 border-2 border-dashed border-white/50 rounded-full flex items-center justify-center text-white text-sm">Look Center</div>}
                                            {scanStep === 'SCANNING_LEFT' && <div className="bg-black/60 text-white px-4 py-2 rounded-xl font-bold animate-bounce">⬅ Turn Left</div>}
                                            {scanStep === 'SCANNING_RIGHT' && <div className="bg-black/60 text-white px-4 py-2 rounded-xl font-bold animate-bounce">Turn Right ➡</div>}
                                        </div>
                                        {scanError && <div className="absolute bottom-4 left-4 right-4 bg-red-500 text-white text-center py-2 rounded-xl text-sm">{scanError}</div>}
                                    </div>
                                    <div className="mt-3 bg-white/10 h-2 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${scanProgress}%` }} />
                                    </div>
                                    <p className="text-center text-white/60 text-xs mt-2">Move your head: Center → Left → Right</p>
                                    <button onClick={() => { stopScanning(); setScanStep('INIT'); }} className="w-full mt-3 py-2 text-red-400 text-sm hover:underline">Cancel Scan</button>
                                </div>
                            ) : (
                                /* Photo Preview */
                                <div className="flex justify-center mb-4">
                                    <div className="relative">
                                        <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-green-500/50 overflow-hidden">
                                            <img src={newWorker.photo_url} className="w-full h-full object-cover" />
                                        </div>
                                        <button onClick={() => { setNewWorker({ ...newWorker, photo_url: '', face_descriptor: null }); setScanStep('INIT'); }}
                                            className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-sm hover:bg-red-600">×</button>
                                    </div>
                                </div>
                            )}

                            {newWorker.photo_url && (
                                <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-lg text-xs text-center font-bold">
                                    ✓ {newWorker.face_descriptor ? 'Face Registered with AI' : 'Photo Added'}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Full Name <span className="text-red-500">*</span></label>
                                    <input type="text" placeholder="Worker Name" value={newWorker.name}
                                        onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Worker # / ID</label>
                                    <input type="text" placeholder="e.g. W-001" value={newWorker.worker_number}
                                        onChange={(e) => setNewWorker({ ...newWorker, worker_number: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Base Rate (₹)</label>
                                    <input type="number" placeholder="400" value={newWorker.base_rate}
                                        onChange={(e) => setNewWorker({ ...newWorker, base_rate: parseInt(e.target.value) || 0 })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Category</label>
                                <select value={newWorker.category} onChange={(e) => setNewWorker({ ...newWorker, category: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors">
                                    <option value="Unskilled" className="bg-slate-900">Unskilled</option>
                                    <option value="Skilled" className="bg-slate-900">Skilled</option>
                                    <option value="Semi-Skilled" className="bg-slate-900">Semi-Skilled</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Shift 🕐</label>
                                    <select value={newWorker.shift_id || ''}
                                        onChange={(e) => setNewWorker({ ...newWorker, shift_id: e.target.value ? parseInt(e.target.value) : null })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors">
                                        <option value="" className="bg-slate-900">No Shift</option>
                                        {shifts.map(shift => (
                                            <option key={shift.id} value={shift.id} className="bg-slate-900">
                                                {shift.name} ({shift.start_time} - {shift.end_time})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Incharge 👤</label>
                                    <select value={newWorker.incharge_id || ''}
                                        onChange={(e) => setNewWorker({ ...newWorker, incharge_id: e.target.value || null })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors">
                                        <option value="" className="bg-slate-900">No Incharge</option>
                                        {incharges.map(incharge => (
                                            <option key={incharge.id} value={incharge.id} className="bg-slate-900">
                                                {incharge.full_name || incharge.email}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {!newWorker.photo_url && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div onClick={startFaceRegistration} className="p-4 border-2 border-dashed border-white/10 rounded-xl text-center cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group">
                                        <span className="block text-2xl mb-1 group-hover:scale-110 transition-transform">🤳</span>
                                        <span className="text-sm text-cyan-400 font-bold block">Auto Scan</span>
                                        <span className="text-[10px] text-slate-500">Rec. for Face ID</span>
                                    </div>
                                    <div onClick={() => fileInputRef.current?.click()} className="p-4 border-2 border-dashed border-white/10 rounded-xl text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group">
                                        <span className="block text-2xl mb-1 group-hover:scale-110 transition-transform">📁</span>
                                        <span className="text-sm text-blue-400 font-bold block">Upload Photo</span>
                                        <span className="text-[10px] text-slate-500">From Gallery</span>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => { setShowAddWorker(false); resetForm(); }}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5 transition-colors">
                                Cancel
                            </button>
                            {scanStep === 'INIT' || scanStep === 'COMPLETED' ? (
                                <button onClick={handleSaveWorker}
                                    disabled={!newWorker.name}
                                    className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-teal-500/20 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100">
                                    {editingWorker ? 'Update Worker' : 'Save Worker'}
                                </button>
                            ) : (
                                <div className="flex-1"></div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
