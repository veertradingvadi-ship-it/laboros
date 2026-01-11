'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Webcam from 'react-webcam';
import { supabase, Worker, AttendanceLog } from '@/lib/supabase';
import { loadFaceModels, areModelsLoaded, detectFaceFromBase64, detectFaceBox, FaceBox, findBestMatch, descriptorToArray, WorkerWithDescriptor, HeadPose } from '@/lib/face-utils';
import { checkImageQuality, averageDescriptors } from '@/lib/face-quality';

type ViewMode = 'camera' | 'workers' | 'history';

interface RecentScan {
    workerId: string;
    workerName: string;
    action: 'IN' | 'OUT' | 'SKIP';
    time: string;
}

const guj: Record<string, string> = {
    'Attendance Scanner': 'હાજરી સ્કેનર',
    'Camera': 'કેમેરા', 'Workers': 'કામદાર', 'History': 'ઇતિહાસ',
    'Present': 'હાજર', 'Left': 'ગયા', 'Absent': 'ગેરહાજર',
    'CHECK IN': 'ચેક ઇન', 'CHECK OUT': 'ચેક આઉટ',
    'Ready': 'તૈયાર', 'Scanning...': 'સ્કેન...', 'Show face': 'ચહેરો બતાવો',
    'Search worker...': 'કામદાર શોધો...', 'New Worker': 'નવો કામદાર',
    'Name': 'નામ', 'Cancel': 'રદ કરો', 'Register': 'નોંધણી',
    'No scans yet': 'હજુ સુધી સ્કેન નથી', 'Already scanned': 'પહેલેથી સ્કેન થયેલ',
    'Day completed': 'દિવસ પૂર્ણ', 'AI Ready': 'AI તૈયાર',
};

export default function ScannerComponent() {
    const router = useRouter();
    const webcamRef = useRef<Webcam>(null);

    const [loading, setLoading] = useState(true);
    const [cameraReady, setCameraReady] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('camera');
    const [lang, setLang] = useState<'en' | 'gu'>('gu'); // Default Gujarati for managers

    const [workers, setWorkers] = useState<Worker[]>([]);
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [scanStatus, setScanStatus] = useState('Ready');
    const [lastScannedId, setLastScannedId] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(false);

    const [showRegister, setShowRegister] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [capturedDescriptor, setCapturedDescriptor] = useState<Float32Array | null>(null);
    const [newWorkerName, setNewWorkerName] = useState('');
    const [newWorkerRate, setNewWorkerRate] = useState('500');

    // Auto-detect multi-angle enrollment
    const [enrollCapturedPoses, setEnrollCapturedPoses] = useState<{ center: boolean; left: boolean; right: boolean }>({ center: false, left: false, right: false });
    const [enrollDescriptors, setEnrollDescriptors] = useState<Float32Array[]>([]);
    const [enrollImages, setEnrollImages] = useState<string[]>([]);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollProgress, setEnrollProgress] = useState(0); // 0-100
    const [currentPoseGuide, setCurrentPoseGuide] = useState<string>('Look straight');

    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [successType, setSuccessType] = useState<'in' | 'out' | 'info'>('in');
    const [error, setError] = useState<string | null>(null);
    const [faceBox, setFaceBox] = useState<FaceBox | null>(null);

    // Early checkout confirmation state
    const [earlyCheckoutConfirm, setEarlyCheckoutConfirm] = useState<{ workerId: string; workerName: string; hours: number; expires: number } | null>(null);

    // Speech deduplication to prevent repeating
    const [lastSpokenText, setLastSpokenText] = useState<string>('');
    const lastSpokenTimeRef = { current: 0 };

    const setShowEarlyCheckoutConfirm = (data: { workerId: string; workerName: string; hours: number }) => {
        setEarlyCheckoutConfirm({ ...data, expires: Date.now() + 30000 }); // 30 second timeout
    };

    const currentDate = new Date().toISOString().split('T')[0];
    const t = (text: string) => lang === 'gu' && guj[text] ? guj[text] : text;

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            // Prevent repeating the same message within 5 seconds
            const now = Date.now();
            if (text === lastSpokenText && now - lastSpokenTimeRef.current < 5000) {
                return; // Skip duplicate
            }
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 1.0; // Faster speech
            speechSynthesis.speak(u);
            setLastSpokenText(text);
            lastSpokenTimeRef.current = now;
        }
    };

    useEffect(() => {
        const init = async () => {
            await loadFaceModels();
            setModelsReady(areModelsLoaded());
            await loadData();
        };
        init();

        // Stop camera when page is hidden (tab switch, minimize, leave app)
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Page is hidden - stop camera
                const video = webcamRef.current?.video;
                if (video && video.srcObject) {
                    const stream = video.srcObject as MediaStream;
                    stream.getTracks().forEach(track => track.stop());
                }
                setCameraReady(false);
                console.log('[CAMERA] Stopped - page hidden');
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup on unmount
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Stop all camera streams
            const video = webcamRef.current?.video;
            if (video && video.srcObject) {
                const stream = video.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (cameraReady && modelsReady && viewMode === 'camera' && !showRegister && !cooldown) {
            const interval = setInterval(performScan, 500); // Fast: scan every 0.5 seconds
            return () => clearInterval(interval);
        }
    }, [cameraReady, modelsReady, viewMode, showRegister, cooldown, workers, todayLogs, lastScannedId]);

    // Real-time face tracking for visual feedback
    useEffect(() => {
        if (!cameraReady || !modelsReady || viewMode !== 'camera') return;

        const trackFace = async () => {
            const video = webcamRef.current?.video;
            if (video) {
                const box = await detectFaceBox(video);
                setFaceBox(box);
            }
        };

        const trackingInterval = setInterval(trackFace, 400); // Reduced to prevent lag
        return () => clearInterval(trackingInterval);
    }, [cameraReady, modelsReady, viewMode]);

    const loadData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }
            const [workersRes, logsRes] = await Promise.all([
                supabase.from('workers').select('*').eq('is_active', true).order('name'),
                supabase.from('attendance_logs').select('*').eq('date', currentDate),
            ]);
            setWorkers(workersRes.data || []);
            setTodayLogs(logsRes.data || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const performScan = useCallback(async () => {
        if (!webcamRef.current || !cameraReady || !modelsReady || isScanning || cooldown) return;
        const screenshot = webcamRef.current.getScreenshot();
        if (!screenshot) return;

        setIsScanning(true);
        setScanStatus('Scanning...');

        try {
            const faceResult = await detectFaceFromBase64(screenshot);
            if (!faceResult) { setScanStatus('Show face'); setIsScanning(false); return; }

            const { descriptor, croppedFace, isFrontalFace } = faceResult;

            // Debug: Check workers with descriptors
            const workersWithDescriptors: WorkerWithDescriptor[] = workers
                .filter(w => w.face_descriptor && w.face_descriptor.length === 128)
                .map(w => ({ id: w.id, name: w.name, face_descriptor: w.face_descriptor, photo_url: w.photo_url, worker_number: w.worker_number }));

            console.log(`[SCAN] Workers loaded: ${workers.length}, With face data: ${workersWithDescriptors.length}`);

            if (workersWithDescriptors.length === 0) {
                console.log('[SCAN] No workers with face descriptors found - showing register');
                setCapturedImage(croppedFace);
                setCapturedDescriptor(descriptor);
                setShowRegister(true);
                setIsScanning(false);
                return;
            }

            const match = await findBestMatch(descriptor, workersWithDescriptors, 0.55); // Balanced threshold

            if (match) {
                console.log(`[SCAN] ✓ Matched: ${match.worker.name} (${(match.similarity * 100).toFixed(0)}%)`);
                if (lastScannedId === match.worker.id) { setScanStatus('Wait...'); setIsScanning(false); return; }
                await handleWorkerScan(match.worker.id, match.worker.name);
            } else {
                // No match found - DO NOT auto-register to prevent duplicates
                // User must manually add workers through admin panel
                console.log('[SCAN] ✗ No match found - prompting admin registration');
                setScanStatus('Unknown face - Register via Admin');
                speak('Face not recognized. Please register this worker through admin panel.');
                showFeedback('Unknown Face\n\nRegister via Admin Panel', 'info');
                startCooldown('unknown');
            }
        } catch (err) { console.error('[SCAN] Error:', err); setScanStatus('Error'); }
        finally { setIsScanning(false); }
    }, [cameraReady, modelsReady, isScanning, cooldown, workers, todayLogs, lastScannedId]);

    const handleWorkerScan = async (workerId: string, workerName: string) => {
        // Check if there's a pending early checkout confirmation for this worker
        if (earlyCheckoutConfirm && earlyCheckoutConfirm.workerId === workerId && Date.now() < earlyCheckoutConfirm.expires) {
            // Confirmed early checkout
            showFeedback(`${workerName}\n✓ Early checkout confirmed!`, 'out');
            speak(`${workerName}, early checkout confirmed.`);
            await performCheckOut(workerId, workerName, earlyCheckoutConfirm.hours);
            setEarlyCheckoutConfirm(null);
            return;
        }

        // Clear expired confirmation
        if (earlyCheckoutConfirm && Date.now() >= earlyCheckoutConfirm.expires) {
            setEarlyCheckoutConfirm(null);
        }

        const existingLog = todayLogs.find(l => l.worker_id === workerId);

        if (!existingLog) {
            // First scan of the day - Check In
            await performCheckIn(workerId, workerName);
        } else if (!existingLog.check_out_time) {
            // Already checked in - Calculate time since check-in
            const checkInTime = new Date(existingLog.check_in_time!).getTime();
            const msSince = Date.now() - checkInTime;
            const minsSince = Math.round(msSince / 60000);
            const hoursSince = msSince / 3600000;

            // Format time properly (minutes vs hours)
            const timeAgo = hoursSince >= 1
                ? `${Math.floor(hoursSince)} hour${Math.floor(hoursSince) > 1 ? 's' : ''} ${minsSince % 60} min`
                : `${minsSince} minute${minsSince !== 1 ? 's' : ''}`;

            if (hoursSince < 1) {
                // Less than 1 hour - Don't allow checkout, show warning
                showFeedback(`${workerName}\n⚠️ Checked in ${timeAgo} ago\nToo early for checkout`, 'info');
                speak(`${workerName}, you already checked in ${minsSince} minutes ago. Too early to check out. This may affect your salary.`);
                addRecentScan(workerId, workerName, 'SKIP');
                startCooldown(workerId);
            } else if (hoursSince < 4) {
                // 1-4 hours - Early checkout warning
                showFeedback(`${workerName}\n⚠️ Only ${Math.floor(hoursSince)}h worked\nCheckout may affect salary!`, 'info');
                speak(`${workerName}, you worked only ${Math.floor(hoursSince)} hours. Early checkout may affect your salary. Scan again to confirm checkout.`);
                // Set a flag to allow checkout on next scan within 30 seconds
                setShowEarlyCheckoutConfirm({ workerId, workerName, hours: hoursSince });
                startCooldown(workerId);
            } else {
                // 4+ hours - Normal checkout
                await performCheckOut(workerId, workerName, hoursSince);
            }
        } else {
            // Already checked out today
            showFeedback(`${workerName}\n✓ ${t('Day completed')}`, 'info');
            speak(`${workerName}, your day is already completed.`);
            startCooldown(workerId);
        }
    };

    const performCheckIn = async (workerId: string, workerName?: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('attendance_logs').upsert({
                worker_id: workerId, date: currentDate, status: 'present',
                check_in_time: new Date().toISOString(), marked_by: user.id,
            }, { onConflict: 'worker_id,date' });

            const worker = workers.find(w => w.id === workerId);
            const name = workerName || worker?.name || 'Worker';
            showFeedback(`${name}\n✓ ${t('CHECK IN')}`, 'in');
            speak(`${name}, ચેક ઇન થયું`); // Gujarati: Check in done
            addRecentScan(workerId, name, 'IN');
            loadData(); startCooldown(workerId);
        } catch { setError('Check-in failed'); setTimeout(() => setError(null), 2000); }
    };

    const performCheckOut = async (workerId: string, workerName: string, hours?: number) => {
        try {
            await supabase.from('attendance_logs').update({
                check_out_time: new Date().toISOString(),
            }).eq('worker_id', workerId).eq('date', currentDate);

            const duration = hours ? ` • ${Math.floor(hours)}h` : '';
            showFeedback(`${workerName}\n✓ ${t('CHECK OUT')}${duration}`, 'out');
            speak(`${workerName}, ચેક આઉટ થયું`); // Gujarati: Check out done
            addRecentScan(workerId, workerName, 'OUT');
            loadData(); startCooldown(workerId);
        } catch { setError('Check-out failed'); setTimeout(() => setError(null), 2000); }
    };

    const manualCheckIn = async (workerId: string) => {
        const worker = workers.find(w => w.id === workerId);
        await performCheckIn(workerId, worker?.name);
        setViewMode('camera');
    };
    const manualCheckOut = async (workerId: string) => {
        const worker = workers.find(w => w.id === workerId);
        const log = todayLogs.find(l => l.worker_id === workerId);
        const hours = log?.check_in_time ? (Date.now() - new Date(log.check_in_time).getTime()) / 3600000 : undefined;
        await performCheckOut(workerId, worker?.name || 'Worker', hours);
        setViewMode('camera');
    };

    const showFeedback = (message: string, type: 'in' | 'out' | 'info') => {
        setSuccessMessage(message); setSuccessType(type);
        setTimeout(() => setSuccessMessage(null), 8000); // Display for 8 seconds
    };

    const addRecentScan = (workerId: string, workerName: string, action: 'IN' | 'OUT' | 'SKIP') => {
        setRecentScans(prev => [{ workerId, workerName, action, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, ...prev.slice(0, 9)]);
    };

    const startCooldown = (workerId: string) => {
        setLastScannedId(workerId); setCooldown(true);
        setTimeout(() => { setCooldown(false); setLastScannedId(null); setScanStatus('Ready'); }, 10000); // 10 second cooldown
    };

    // Simple single-photo enrollment (fast registration)
    const startEnrollment = async () => {
        if (!webcamRef.current) return;

        // Capture single photo immediately
        const screenshot = webcamRef.current.getScreenshot();
        if (!screenshot) {
            setScanStatus('Camera error');
            return;
        }

        const faceResult = await detectFaceFromBase64(screenshot);
        if (!faceResult) {
            setScanStatus('No face - try again');
            speak('No face detected, try again');
            return;
        }

        // Set captured data and show registration form directly
        setCapturedImage(faceResult.croppedFace);
        setCapturedDescriptor(faceResult.descriptor);
        setEnrollProgress(100); // Skip multi-angle, go straight to form
        setShowRegister(true);
        speak('Enter name');
    };

    // Auto-detect and capture poses during enrollment
    const autoDetectEnrollment = async () => {
        if (!webcamRef.current || !modelsReady || !isEnrolling) return;

        const screenshot = webcamRef.current.getScreenshot();
        if (!screenshot) return;

        const faceResult = await detectFaceFromBase64(screenshot);
        if (!faceResult) return;

        const { descriptor, croppedFace, headPose } = faceResult;

        // Check which poses are still needed
        const poses = enrollCapturedPoses;
        let captured = false;
        let newGuide = currentPoseGuide;

        // Auto-capture based on detected pose
        if (headPose === 'center' && !poses.center) {
            setEnrollCapturedPoses(prev => ({ ...prev, center: true }));
            setEnrollDescriptors(prev => [...prev, descriptor]);
            setEnrollImages(prev => [...prev, croppedFace]);
            captured = true;
            speak('Good! Now turn left');
            newGuide = 'Turn your head LEFT';
        } else if (headPose === 'left' && !poses.left && poses.center) {
            setEnrollCapturedPoses(prev => ({ ...prev, left: true }));
            setEnrollDescriptors(prev => [...prev, descriptor]);
            captured = true;
            speak('Good! Now turn right');
            newGuide = 'Turn your head RIGHT';
        } else if (headPose === 'right' && !poses.right && poses.center) {
            setEnrollCapturedPoses(prev => ({ ...prev, right: true }));
            setEnrollDescriptors(prev => [...prev, descriptor]);
            captured = true;
        }

        // Update progress
        const capturedCount = [poses.center, poses.left, poses.right].filter(Boolean).length + (captured ? 1 : 0);
        setEnrollProgress(Math.round(capturedCount / 3 * 100));
        setCurrentPoseGuide(newGuide);

        // Check if all 3 poses captured
        const allCaptured = (poses.center || (headPose === 'center' && !poses.center)) &&
            (poses.left || (headPose === 'left' && !poses.left)) &&
            (poses.right || (headPose === 'right' && !poses.right));

        // If we have at least center + one side, complete enrollment
        if (capturedCount >= 2 || (enrollDescriptors.length >= 2 && captured)) {
            setTimeout(() => {
                const allDescs = [...enrollDescriptors];
                if (captured) allDescs.push(descriptor);

                if (allDescs.length >= 2) {
                    const avgDescriptor = averageDescriptors(allDescs);
                    setCapturedDescriptor(avgDescriptor);
                    setCapturedImage(enrollImages[0] || croppedFace);
                    setEnrollProgress(100);
                    setCurrentPoseGuide('Done! Enter name');
                    speak('Done! Enter name');
                }
            }, 500);
        }
    };

    // Run auto-detect during enrollment
    useEffect(() => {
        if (!isEnrolling || enrollProgress >= 100) return;
        const interval = setInterval(autoDetectEnrollment, 500);
        return () => clearInterval(interval);
    }, [isEnrolling, enrollCapturedPoses, enrollDescriptors, enrollProgress]);

    const resetEnrollment = () => {
        setIsEnrolling(false);
        setEnrollCapturedPoses({ center: false, left: false, right: false });
        setEnrollDescriptors([]);
        setEnrollImages([]);
        setEnrollProgress(0);
        setCurrentPoseGuide('Look straight');
        setShowRegister(false);
        setCapturedImage(null);
        setCapturedDescriptor(null);
        setNewWorkerName('');
        setNewWorkerRate('500');
    };

    const registerWorker = async () => {
        if (!newWorkerName.trim() || !capturedDescriptor) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Check for duplicate face
            const workersWithFaces: WorkerWithDescriptor[] = workers
                .filter(w => w.face_descriptor?.length === 128)
                .map(w => ({ id: w.id, name: w.name, face_descriptor: w.face_descriptor, photo_url: w.photo_url }));

            const duplicate = await findBestMatch(capturedDescriptor, workersWithFaces, 0.5);
            if (duplicate) {
                setError(`Face already registered as ${duplicate.worker.name}`);
                speak(`Already registered as ${duplicate.worker.name}`);
                setTimeout(() => setError(null), 3000);
                resetRegister();
                return;
            }

            const { data: newWorker } = await supabase.from('workers').insert({
                name: newWorkerName.trim(), photo_url: capturedImage,
                face_descriptor: descriptorToArray(capturedDescriptor),
                base_rate: parseFloat(newWorkerRate) || 500,
                consent_date: new Date().toISOString(), is_active: true,
            }).select().single();
            if (newWorker) { await performCheckIn(newWorker.id, newWorkerName.trim()); resetRegister(); loadData(); }
        } catch { setError('Registration failed'); setTimeout(() => setError(null), 2000); }
    };

    const resetRegister = () => { setShowRegister(false); setCapturedImage(null); setCapturedDescriptor(null); setNewWorkerName(''); setNewWorkerRate('500'); };

    const presentCount = todayLogs.filter(l => l.check_in_time && !l.check_out_time).length;
    const leftCount = todayLogs.filter(l => l.check_out_time).length;
    const absentCount = workers.length - todayLogs.filter(l => l.check_in_time).length;
    const filteredWorkers = workers.filter(w => w.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const getWorkerStatus = (workerId: string) => {
        const log = todayLogs.find(l => l.worker_id === workerId);
        if (!log) return { status: 'absent', label: t('Absent'), color: 'from-gray-500 to-gray-600' };
        if (log.check_out_time) return { status: 'left', label: t('Left'), color: 'from-blue-500 to-blue-600' };
        return { status: 'present', label: t('Present'), color: 'from-green-500 to-green-600' };
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-cyan-400">Loading Scanner...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900">
            {/* Futuristic Header */}
            <header className="relative px-4 py-3 bg-black/40 backdrop-blur-xl border-b border-cyan-500/20">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5" />
                <div className="relative flex items-center justify-between">
                    <button onClick={() => router.push('/dashboard')} className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition">
                        ←
                    </button>
                    <div className="text-center">
                        <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                            {t('Attendance Scanner')}
                        </h1>
                        <p className="text-xs text-cyan-400/80">{modelsReady ? `⚡ ${t('AI Ready')}` : '○ Loading...'}</p>
                    </div>
                    <button onClick={() => setLang(l => l === 'en' ? 'gu' : 'en')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${lang === 'gu' ? 'bg-cyan-500 text-white' : 'bg-white/10 text-white/60 border border-white/10'}`}>
                        {lang === 'gu' ? 'EN' : 'ગુ'}
                    </button>
                </div>
            </header>

            {/* Tab Navigation - Glowing */}
            <nav className="flex bg-black/30 backdrop-blur border-b border-cyan-500/10">
                {(['camera', 'workers', 'history'] as ViewMode[]).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)}
                        className={`flex-1 py-3 text-sm font-medium transition-all relative ${viewMode === mode ? 'text-cyan-400' : 'text-white/50 hover:text-white/70'}`}>
                        {mode === 'camera' ? `📷 ${t('Camera')}` : mode === 'workers' ? `👷 ${t('Workers')} (${workers.length})` : `📋 ${t('History')}`}
                        {viewMode === mode && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-cyan-400 to-purple-400 rounded-full" />}
                    </button>
                ))}
            </nav>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative">
                {/* CAMERA VIEW */}
                {viewMode === 'camera' && (
                    <div className="h-full flex flex-col">
                        <div className="flex-1 relative bg-black">
                            <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
                                videoConstraints={{ facingMode: 'user' }}
                                onUserMedia={() => setCameraReady(true)}
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{ transform: 'scaleX(-1)' }} />

                            {/* Scan Status - Glowing */}
                            <div className="absolute top-4 left-4 right-4">
                                <div className={`px-4 py-2 rounded-xl text-center text-sm font-medium backdrop-blur-sm transition-all ${isScanning ? 'bg-cyan-500/80 text-white shadow-lg shadow-cyan-500/30' : faceBox ? 'bg-green-500/80 text-white' : 'bg-black/60 text-white/80 border border-white/10'}`}>
                                    {faceBox ? (isScanning ? t('Scanning...') : '✓ Face Detected') : t(scanStatus)}
                                </div>
                            </div>

                            {/* Dynamic Face Tracking Box */}
                            {faceBox ? (
                                <div
                                    className="absolute border-2 border-cyan-400 rounded-xl transition-all duration-150 pointer-events-none shadow-lg shadow-cyan-400/30"
                                    style={{
                                        left: `${100 - faceBox.x - faceBox.width}%`,
                                        top: `${faceBox.y}%`,
                                        width: `${faceBox.width}%`,
                                        height: `${faceBox.height}%`,
                                    }}
                                >
                                    {/* Corner accents */}
                                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl" />
                                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-400 rounded-tr" />
                                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-400 rounded-bl" />
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400 rounded-br" />
                                </div>
                            ) : (
                                /* Static guide when no face detected */
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-44 h-52 rounded-3xl border-2 border-dashed border-white/20 flex items-center justify-center">
                                        <span className="text-white/40 text-sm">{t('Show face')}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Stats Bar - Gradient Cards */}
                        <div className="bg-black/40 backdrop-blur-xl px-3 py-3 flex gap-2 border-t border-cyan-500/20">
                            <div className="flex-1 bg-gradient-to-br from-green-500/20 to-green-600/10 border border-green-500/30 rounded-xl py-2 text-center">
                                <p className="text-2xl font-bold text-green-400">{presentCount}</p>
                                <p className="text-xs text-green-400/70">{t('Present')}</p>
                            </div>
                            <div className="flex-1 bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 rounded-xl py-2 text-center">
                                <p className="text-2xl font-bold text-blue-400">{leftCount}</p>
                                <p className="text-xs text-blue-400/70">{t('Left')}</p>
                            </div>
                            <div className="flex-1 bg-gradient-to-br from-gray-500/20 to-gray-600/10 border border-gray-500/30 rounded-xl py-2 text-center">
                                <p className="text-2xl font-bold text-gray-400">{absentCount}</p>
                                <p className="text-xs text-gray-400/70">{t('Absent')}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* WORKERS LIST */}
                {viewMode === 'workers' && (
                    <div className="h-full flex flex-col">
                        <div className="p-3 bg-black/30">
                            <input type="text" placeholder={`🔍 ${t('Search worker...')}`} value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white/5 border border-cyan-500/20 rounded-xl text-white placeholder-white/40 text-sm focus:border-cyan-500/50 focus:outline-none transition" />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {filteredWorkers.map(worker => {
                                const { status, label, color } = getWorkerStatus(worker.id);
                                const log = todayLogs.find(l => l.worker_id === worker.id);
                                return (
                                    <div key={worker.id} className="flex items-center justify-between px-4 py-3 border-b border-white/5 hover:bg-white/5 transition">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500/30 to-purple-500/30 rounded-full flex items-center justify-center text-white font-medium border border-cyan-500/20">
                                                {worker.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-white font-medium text-sm">{worker.name}</p>
                                                <p className="text-white/40 text-xs">
                                                    {log?.check_in_time && new Date(log.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    {log?.check_out_time && ` → ${new Date(log.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs text-white bg-gradient-to-r ${color}`}>{label}</span>
                                            {status === 'absent' && <button onClick={() => manualCheckIn(worker.id)} className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg text-xs font-medium">IN</button>}
                                            {status === 'present' && <button onClick={() => manualCheckOut(worker.id)} className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-xs font-medium">OUT</button>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* HISTORY */}
                {viewMode === 'history' && (
                    <div className="h-full overflow-y-auto">
                        {recentScans.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-white/40">
                                <div className="text-4xl mb-2">📋</div>
                                <p>{t('No scans yet')}</p>
                            </div>
                        ) : recentScans.map((scan, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg bg-gradient-to-br ${scan.action === 'IN' ? 'from-green-500 to-green-600' : scan.action === 'OUT' ? 'from-blue-500 to-blue-600' : 'from-orange-500 to-orange-600'}`}>
                                        {scan.action === 'IN' ? '→' : scan.action === 'OUT' ? '←' : '⚠'}
                                    </div>
                                    <div><p className="text-white font-medium text-sm">{scan.workerName}</p><p className="text-white/40 text-xs">{scan.time}</p></div>
                                </div>
                                <span className={`px-2.5 py-1 rounded-lg text-xs text-white bg-gradient-to-r ${scan.action === 'IN' ? 'from-green-500 to-green-600' : scan.action === 'OUT' ? 'from-blue-500 to-blue-600' : 'from-orange-500 to-orange-600'}`}>
                                    {scan.action}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Success Overlay */}
                {successMessage && (
                    <div className={`absolute inset-0 flex items-center justify-center z-30 ${successType === 'in' ? 'bg-gradient-to-br from-green-600/95 to-green-700/95' : successType === 'out' ? 'bg-gradient-to-br from-blue-600/95 to-blue-700/95' : 'bg-gradient-to-br from-orange-500/95 to-orange-600/95'}`}>
                        <div className="text-center text-white">
                            <div className="text-6xl mb-3">{successType === 'in' ? '✓' : successType === 'out' ? '←' : 'ℹ'}</div>
                            <p className="text-2xl font-bold whitespace-pre-line">{successMessage}</p>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="absolute bottom-4 left-4 right-4 z-40">
                        <div className="bg-red-500 text-white text-center py-2 px-4 rounded-xl text-sm">{error}</div>
                    </div>
                )}

                {/* Simple Registration Modal */}
                {showRegister && (
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 max-w-sm w-full border border-cyan-500/20">

                            {/* Photo Captured - enter name */}
                            <div className="text-center mb-4">
                                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-green-500/50 overflow-hidden">
                                    {capturedImage ? (
                                        <img src={capturedImage} alt="Face" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-3xl text-white">👤</span>
                                    )}
                                </div>
                                <h2 className="text-lg font-bold text-white">New Worker</h2>
                                <p className="text-green-400/80 text-xs">Photo captured</p>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Full Name</label>
                                    <input type="text" placeholder="e.g. Rahul Kumar" value={newWorkerName} onChange={(e) => setNewWorkerName(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500/50 focus:outline-none transition-colors placeholder:text-white/20" autoFocus />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Daily Rate (₹)</label>
                                    <input type="number" placeholder="500" value={newWorkerRate} onChange={(e) => setNewWorkerRate(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500/50 focus:outline-none transition-colors placeholder:text-white/20" />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={resetEnrollment} className="flex-1 py-3 bg-white/10 border border-white/10 text-white rounded-xl hover:bg-white/20 transition-colors">{t('Cancel')}</button>
                                <button onClick={registerWorker} disabled={!newWorkerName.trim()}
                                    className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:shadow-none transition-all hover:scale-[1.02]">
                                    {t('Register')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
