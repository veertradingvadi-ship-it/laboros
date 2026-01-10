'use client';

import { useEffect, useState } from 'react';
import { COMPANY_NAME, ADMIN_EMAIL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export default function AdminSettingsPage() {
    const [saved, setSaved] = useState(false);
    const [locationEnabled, setLocationEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const { data } = await supabase
            .from('system_settings')
            .select('*')
            .eq('key', 'location_check_enabled')
            .single();

        if (data) {
            setLocationEnabled(data.value === 'true');
        }
        setLoading(false);
    };

    const handleLocationToggle = async () => {
        const newValue = !locationEnabled;
        setLocationEnabled(newValue);

        // Try to update or insert
        const { error } = await supabase
            .from('system_settings')
            .upsert({
                key: 'location_check_enabled',
                value: newValue.toString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        if (error) {
            console.error('Save error:', error);
            // Revert on error
            setLocationEnabled(!newValue);
        }
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-xl font-bold text-white">Settings</h1>
                <p className="text-sm text-slate-400">System configuration and preferences</p>
            </div>

            {saved && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <span>✅</span> Settings saved successfully!
                </div>
            )}

            {/* 🆕 Location Settings */}
            <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-cyan-500/30 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                    <span>📍</span> Location & GPS Settings
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl">
                        <div>
                            <p className="text-white font-medium">GPS Location Check</p>
                            <p className="text-xs text-slate-400">Require workers to be at site location for scanning</p>
                        </div>
                        <button
                            onClick={handleLocationToggle}
                            disabled={loading}
                            className={`w-14 h-8 rounded-full transition-all relative ${locationEnabled
                                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                                    : 'bg-slate-600'
                                }`}
                        >
                            <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all shadow-lg ${locationEnabled ? 'right-1' : 'left-1'
                                }`} />
                        </button>
                    </div>
                    <div className={`p-4 rounded-xl ${locationEnabled ? 'bg-green-500/10 border border-green-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}>
                        {locationEnabled ? (
                            <p className="text-green-400 text-sm flex items-center gap-2">
                                <span>🔒</span> GPS check is <strong>ENABLED</strong> - Workers must be at site to scan
                            </p>
                        ) : (
                            <p className="text-orange-400 text-sm flex items-center gap-2">
                                <span>🔓</span> GPS check is <strong>DISABLED</strong> - Workers can scan from anywhere
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Company Info */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                    <span>🏢</span> Company Information
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 ml-1 mb-1 block">Company Name</label>
                        <input type="text" value={COMPANY_NAME} disabled
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-slate-300 cursor-not-allowed" />
                        <p className="text-[10px] text-slate-500 mt-1 ml-1">Set via NEXT_PUBLIC_COMPANY_NAME env variable</p>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ml-1 mb-1 block">Admin Email (Permanent)</label>
                        <input type="text" value={ADMIN_EMAIL} disabled
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-slate-300 cursor-not-allowed" />
                        <p className="text-[10px] text-slate-500 mt-1 ml-1">This email always has admin access</p>
                    </div>
                </div>
            </div>

            {/* Role Permissions */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-white/5">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <span>👥</span> Role Permissions
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-black/20">
                            <tr>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Feature</th>
                                <th className="px-6 py-4 text-center text-slate-400 font-medium">Admin</th>
                                <th className="px-6 py-4 text-center text-slate-400 font-medium">Owner</th>
                                <th className="px-6 py-4 text-center text-slate-400 font-medium">Manager</th>
                                <th className="px-6 py-4 text-center text-slate-400 font-medium">Accountant</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[
                                { feature: 'Admin Panel', admin: true, owner: false, manager: false, accountant: false },
                                { feature: 'Owner Panel', admin: true, owner: true, manager: false, accountant: false },
                                { feature: 'Scanner', admin: true, owner: true, manager: true, accountant: false },
                                { feature: 'Workers', admin: true, owner: true, manager: true, accountant: false },
                                { feature: 'Khata (Edit)', admin: true, owner: true, manager: true, accountant: false },
                                { feature: 'Reports (View)', admin: true, owner: true, manager: true, accountant: true },
                                { feature: 'Delete Workers', admin: true, owner: true, manager: false, accountant: false },
                            ].map(row => (
                                <tr key={row.feature} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">{row.feature}</td>
                                    <td className="px-6 py-4 text-center text-lg">{row.admin ? '✅' : '❌'}</td>
                                    <td className="px-6 py-4 text-center text-lg">{row.owner ? '✅' : '❌'}</td>
                                    <td className="px-6 py-4 text-center text-lg">{row.manager ? '✅' : '❌'}</td>
                                    <td className="px-6 py-4 text-center text-lg">{row.accountant ? '✅' : '❌'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Scanner Settings */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                    <span>📷</span> Scanner Settings
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 ml-1 mb-1 block">Face Match Threshold</label>
                        <input type="number" defaultValue="0.5" step="0.05" min="0.3" max="0.7"
                            className="w-full md:w-32 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors" />
                        <p className="text-[10px] text-slate-500 mt-1 ml-1">Lower = stricter matching (0.3-0.7)</p>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 ml-1 mb-1 block">Scan Cooldown (seconds)</label>
                        <input type="number" defaultValue="3" min="1" max="10"
                            className="w-full md:w-32 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors" />
                    </div>
                </div>
            </div>

            {/* System Info */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-6 flex items-center gap-2">
                    <span>ℹ️</span> System Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Version</span>
                        <span className="text-white font-mono">LaborOS v1.0.0</span>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Framework</span>
                        <span className="text-white font-mono">Next.js 14</span>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Database</span>
                        <span className="text-white font-mono">Supabase PostgreSQL</span>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <span className="text-slate-400 block text-xs uppercase tracking-wider mb-1">Face Recognition</span>
                        <span className="text-white font-mono">face-api.js</span>
                    </div>
                </div>
            </div>

            <button onClick={handleSave}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-transform w-full md:w-auto">
                Save All Settings
            </button>
        </div>
    );
}
