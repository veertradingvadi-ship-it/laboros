'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const TABLES_TO_BACKUP = [
    'profiles',
    'workers',
    'sites',
    'shifts',
    'attendance_logs',
    'expenses',
    'daily_closings',
    'access_requests',
    'accountant_tasks'
];

export default function BackupPage() {
    const [loading, setLoading] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const exportBackup = async () => {
        setLoading(true);
        setProgress(0);
        setStatus('Starting backup...');

        const backup: Record<string, any[]> = {
            _meta: [{
                version: '1.0',
                created_at: new Date().toISOString(),
                tables: TABLES_TO_BACKUP
            }]
        };

        try {
            for (let i = 0; i < TABLES_TO_BACKUP.length; i++) {
                const table = TABLES_TO_BACKUP[i];
                setStatus(`Backing up ${table}...`);
                setProgress(Math.round(((i + 1) / TABLES_TO_BACKUP.length) * 100));

                const { data, error } = await supabase.from(table).select('*');

                if (error) {
                    console.warn(`Skipping ${table}: ${error.message}`);
                    backup[table] = [];
                } else {
                    backup[table] = data || [];
                }
            }

            // Create and download file
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `laboros_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setStatus('Backup complete!');
            showNotification('success', `Backup saved! ${Object.keys(backup).length - 1} tables exported.`);
        } catch (err: any) {
            showNotification('error', `Backup failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setRestoring(true);
        setProgress(0);
        setStatus('Reading backup file...');

        try {
            const text = await file.text();
            const backup = JSON.parse(text);

            if (!backup._meta) {
                throw new Error('Invalid backup file format');
            }

            const tables = Object.keys(backup).filter(k => k !== '_meta');

            for (let i = 0; i < tables.length; i++) {
                const table = tables[i];
                const rows = backup[table];
                setStatus(`Restoring ${table} (${rows.length} records)...`);
                setProgress(Math.round(((i + 1) / tables.length) * 100));

                if (rows.length === 0) continue;

                // Upsert data (insert or update)
                const { error } = await supabase.from(table).upsert(rows, {
                    onConflict: 'id',
                    ignoreDuplicates: false
                });

                if (error) {
                    console.warn(`Error restoring ${table}: ${error.message}`);
                }
            }

            setStatus('Restore complete!');
            showNotification('success', `Restored ${tables.length} tables from backup!`);
        } catch (err: any) {
            showNotification('error', `Restore failed: ${err.message}`);
        } finally {
            setRestoring(false);
            e.target.value = ''; // Reset file input
        }
    };

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
                    💾 Database Backup & Restore
                </h1>
                <p className="text-sm text-slate-400">Export all data or restore from a backup file</p>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                <p className="text-yellow-400 text-sm flex items-start gap-2">
                    <span className="text-lg">⚠️</span>
                    <span>
                        <strong>Important:</strong> Always create a backup before making major changes.
                        Restoring will overwrite existing data with matching IDs.
                    </span>
                </p>
            </div>

            {/* Export Section */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center text-2xl">
                        📤
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-bold text-lg">Export Backup</h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Download all database tables as a JSON file. Includes: workers, sites, shifts, attendance, expenses, and more.
                        </p>

                        <div className="mt-4">
                            <button
                                onClick={exportBackup}
                                disabled={loading}
                                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Exporting...
                                    </>
                                ) : (
                                    <>📥 Create Backup</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Import Section */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-2xl">
                        📥
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-bold text-lg">Restore from Backup</h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Upload a previously exported backup file to restore data. Existing records with same IDs will be updated.
                        </p>

                        <div className="mt-4">
                            <label className={`px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-medium cursor-pointer inline-flex items-center gap-2 ${restoring ? 'opacity-50 pointer-events-none' : ''}`}>
                                {restoring ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Restoring...
                                    </>
                                ) : (
                                    <>📤 Upload Backup File</>
                                )}
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    disabled={restoring}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Progress */}
            {(loading || restoring) && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm">{status}</span>
                        <span className="text-cyan-400 font-bold">{progress}%</span>
                    </div>
                    <div className="w-full bg-black/30 rounded-full h-2">
                        <div
                            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Tables Info */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h4 className="text-white font-medium mb-3">Tables included in backup:</h4>
                <div className="flex flex-wrap gap-2">
                    {TABLES_TO_BACKUP.map(table => (
                        <span key={table} className="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-lg text-sm">
                            {table}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
