'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Webcam from 'react-webcam';
import { supabase, Worker, AttendanceLog } from '@/lib/supabase';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { THEME_COLOR } from '@/lib/config';

type VerifyStep = 'blind_entry' | 'mismatch_review' | 'audio_record' | 'photo_capture' | 'complete';

interface TodayAttendance {
    worker: Worker;
    log: AttendanceLog;
}

export default function VerifyPage() {
    const router = useRouter();
    const webcamRef = useRef<Webcam>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);

    const [step, setStep] = useState<VerifyStep>('blind_entry');
    const [notebookCount, setNotebookCount] = useState<string>('');
    const [systemCount, setSystemCount] = useState<number>(0);
    const [todayAttendance, setTodayAttendance] = useState<TodayAttendance[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [selfieData, setSelfieData] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentDate = new Date().toISOString().split('T')[0];

    const themeClass = THEME_COLOR === 'orange' ? 'bg-orange-500 hover:bg-orange-600' :
        THEME_COLOR === 'blue' ? 'bg-blue-500 hover:bg-blue-600' :
            THEME_COLOR === 'green' ? 'bg-green-500 hover:bg-green-600' :
                'bg-slate-600 hover:bg-slate-700';

    useEffect(() => {
        loadTodayAttendance();
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const loadTodayAttendance = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            // Get today's attendance with worker details
            const { data: logs, error: logsError } = await supabase
                .from('attendance_logs')
                .select('*, workers(*)')
                .eq('date', currentDate)
                .eq('status', 'present');

            if (logsError) throw logsError;

            const attendance = (logs || []).map(log => ({
                worker: log.workers as Worker,
                log: log as AttendanceLog,
            }));

            setTodayAttendance(attendance);
            setSystemCount(attendance.length);

        } catch (err) {
            console.error('Load error:', err);
            setError('Failed to load attendance data');
        } finally {
            setLoading(false);
        }
    };

    const handleBlindSubmit = () => {
        const notebook = parseInt(notebookCount, 10);
        if (isNaN(notebook) || notebook < 0) {
            setError('Please enter a valid number');
            return;
        }

        if (notebook === systemCount) {
            // Match! Skip to audio recording
            setStep('audio_record');
        } else {
            // Mismatch - force manual review
            setStep('mismatch_review');
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                setAudioBlob(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            // Auto-stop after 10 seconds
            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    stopRecording();
                }
            }, 10000);

        } catch (err) {
            console.error('Recording error:', err);
            setError('Microphone access denied');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const capturePhoto = () => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
                // Add timestamp overlay
                const timestamp = new Date().toLocaleString('en-IN');
                setSelfieData(imageSrc);
            }
        }
    };

    const handleFinalSubmit = async () => {
        if (!audioBlob || !selfieData) {
            setError('Please complete audio and photo capture');
            return;
        }

        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            // Get user profile for site
            const { data: profile } = await supabase
                .from('profiles')
                .select('assigned_site_id')
                .eq('id', user.id)
                .single();

            // Upload audio to Supabase Storage
            const audioFileName = `audio_${currentDate}_${Date.now()}.webm`;
            const { data: audioUpload, error: audioError } = await supabase.storage
                .from('verifications')
                .upload(audioFileName, audioBlob);

            if (audioError) throw audioError;

            // Upload selfie to Supabase Storage
            const base64Data = selfieData.split(',')[1];
            const selfieFileName = `selfie_${currentDate}_${Date.now()}.jpg`;
            const { data: selfieUpload, error: selfieError } = await supabase.storage
                .from('verifications')
                .upload(selfieFileName, Buffer.from(base64Data, 'base64'), {
                    contentType: 'image/jpeg',
                });

            if (selfieError) throw selfieError;

            // Get public URLs
            const { data: { publicUrl: audioUrl } } = supabase.storage
                .from('verifications')
                .getPublicUrl(audioFileName);

            const { data: { publicUrl: selfieUrl } } = supabase.storage
                .from('verifications')
                .getPublicUrl(selfieFileName);

            // Insert daily closing record
            const { error: closingError } = await supabase
                .from('daily_closings')
                .upsert({
                    date: currentDate,
                    site_id: profile?.assigned_site_id,
                    manager_notebook_count: parseInt(notebookCount, 10),
                    system_count: systemCount,
                    audio_url: audioUrl,
                    selfie_url: selfieUrl,
                    is_verified: true,
                    closed_by: user.id,
                });

            if (closingError) throw closingError;

            setStep('complete');

        } catch (err) {
            console.error('Submit error:', err);
            setError('Failed to submit verification');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <Header />

            <main className="pb-24 px-4 py-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Evening Verification</h1>
                <p className="text-gray-500 mb-6">3-Way verification ceremony</p>

                {/* Progress Steps */}
                <div className="flex items-center justify-between mb-8">
                    {['Blind Entry', 'Audio Proof', 'Photo Proof'].map((label, idx) => {
                        const stepNum = idx + 1;
                        const isComplete =
                            (step === 'audio_record' && idx === 0) ||
                            (step === 'photo_capture' && idx <= 1) ||
                            (step === 'complete');
                        const isCurrent =
                            (step === 'blind_entry' && idx === 0) ||
                            (step === 'mismatch_review' && idx === 0) ||
                            (step === 'audio_record' && idx === 1) ||
                            (step === 'photo_capture' && idx === 2);

                        return (
                            <div key={label} className="flex flex-col items-center">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${isComplete ? 'bg-green-500 text-white' :
                                        isCurrent ? `${THEME_COLOR === 'orange' ? 'bg-orange-500' : THEME_COLOR === 'blue' ? 'bg-blue-500' : 'bg-slate-600'} text-white` :
                                            'bg-gray-200 text-gray-500'
                                    }`}>
                                    {isComplete ? '✓' : stepNum}
                                </div>
                                <span className="text-xs mt-1 text-gray-500">{label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-xl text-sm">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
                    </div>
                )}

                {/* Step: Blind Entry */}
                {step === 'blind_entry' && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Blind Entry</h2>
                            <p className="text-gray-500 text-sm mt-1">
                                Enter the count from your physical notebook
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                How many workers attended today?
                            </label>
                            <input
                                type="number"
                                value={notebookCount}
                                onChange={(e) => setNotebookCount(e.target.value)}
                                className="w-full px-4 py-4 text-3xl font-bold text-center border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
                                placeholder="0"
                                min="0"
                            />
                            <p className="text-center text-gray-400 text-sm mt-2">
                                System count is hidden until you submit
                            </p>
                        </div>

                        <button
                            onClick={handleBlindSubmit}
                            disabled={!notebookCount}
                            className={`w-full py-4 ${themeClass} text-white font-semibold rounded-xl transition-all disabled:opacity-50`}
                        >
                            Submit Count
                        </button>
                    </div>
                )}

                {/* Step: Mismatch Review */}
                {step === 'mismatch_review' && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Count Mismatch!</h2>
                            <p className="text-gray-500 text-sm mt-1">
                                Your notebook says <span className="font-bold text-red-600">{notebookCount}</span>,
                                but system shows <span className="font-bold text-green-600">{systemCount}</span>
                            </p>
                        </div>

                        <div className="mb-4">
                            <h3 className="font-semibold text-gray-900 mb-3">Review Today&apos;s Attendance:</h3>
                            <div className="max-h-60 overflow-y-auto space-y-2">
                                {todayAttendance.map(({ worker }) => (
                                    <div key={worker.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                                        <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
                                            <span className="text-green-800 font-semibold">
                                                {worker.name.charAt(0)}
                                            </span>
                                        </div>
                                        <span className="text-gray-900">{worker.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setStep('audio_record')}
                            className={`w-full py-4 ${themeClass} text-white font-semibold rounded-xl`}
                        >
                            I&apos;ve Reviewed - Continue
                        </button>
                    </div>
                )}

                {/* Step: Audio Recording */}
                {step === 'audio_record' && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-center mb-6">
                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-100'
                                }`}>
                                <svg className={`w-8 h-8 ${isRecording ? 'text-white' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Audio Proof</h2>
                            <p className="text-gray-500 text-sm mt-1">
                                Record Maistry saying &quot;Sab Sahi Hai&quot;
                            </p>
                        </div>

                        {!audioBlob ? (
                            <div className="text-center">
                                {isRecording && (
                                    <p className="text-2xl font-bold text-red-500 mb-4">
                                        {recordingTime}s / 10s
                                    </p>
                                )}
                                <button
                                    onClick={isRecording ? stopRecording : startRecording}
                                    className={`w-full py-4 ${isRecording ? 'bg-red-500 hover:bg-red-600' : themeClass} text-white font-semibold rounded-xl`}
                                >
                                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-green-800">Audio recorded ({recordingTime} seconds)</span>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setAudioBlob(null); setRecordingTime(0); }}
                                        className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl"
                                    >
                                        Re-record
                                    </button>
                                    <button
                                        onClick={() => setStep('photo_capture')}
                                        className={`flex-1 py-3 ${themeClass} text-white rounded-xl`}
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step: Photo Capture */}
                {step === 'photo_capture' && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-center mb-4">
                            <h2 className="text-xl font-bold text-gray-900">Joint Selfie</h2>
                            <p className="text-gray-500 text-sm">Take a photo with the Maistry</p>
                        </div>

                        {!selfieData ? (
                            <div className="space-y-4">
                                <Webcam
                                    ref={webcamRef}
                                    audio={false}
                                    screenshotFormat="image/jpeg"
                                    videoConstraints={{ facingMode: 'user' }}
                                    className="w-full rounded-xl"
                                />
                                <button
                                    onClick={capturePhoto}
                                    className={`w-full py-4 ${themeClass} text-white font-semibold rounded-xl`}
                                >
                                    📸 Capture Photo
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="relative">
                                    <img src={selfieData} alt="Selfie" className="w-full rounded-xl" />
                                    <div className="absolute bottom-2 left-2 right-2 bg-black/70 text-white text-xs p-2 rounded">
                                        {new Date().toLocaleString('en-IN')}
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSelfieData(null)}
                                        className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl"
                                    >
                                        Retake
                                    </button>
                                    <button
                                        onClick={handleFinalSubmit}
                                        disabled={submitting}
                                        className={`flex-1 py-3 ${themeClass} text-white rounded-xl disabled:opacity-50`}
                                    >
                                        {submitting ? 'Submitting...' : 'Complete ✓'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step: Complete */}
                {step === 'complete' && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
                        <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Complete!</h2>
                        <p className="text-gray-500 mb-6">
                            Today&apos;s attendance has been locked and verified.
                        </p>
                        <button
                            onClick={() => router.push('/payouts')}
                            className={`w-full py-4 ${themeClass} text-white font-semibold rounded-xl`}
                        >
                            Proceed to Payouts →
                        </button>
                    </div>
                )}
            </main>

            <BottomNav />
        </div>
    );
}
