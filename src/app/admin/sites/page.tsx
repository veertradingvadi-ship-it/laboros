'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Site {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    address: string | null;
    is_active: boolean;
    created_at: string;
}

export default function AdminSitesPage() {
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newSite, setNewSite] = useState({ name: '', latitude: '', longitude: '', radius_meters: '200', address: '' });
    const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const [editingSite, setEditingSite] = useState<Site | null>(null);

    useEffect(() => { loadSites(); }, []);

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

    const loadSites = async () => {
        const { data, error } = await supabase.from('sites').select('*').order('name');
        if (error) {
            console.error('Error loading sites:', error);
            showNotification('error', 'Failed to load sites');
        }
        setSites(data || []);
        setLoading(false);
    };

    const handleSaveSite = async () => {
        if (!newSite.name || !newSite.latitude || !newSite.longitude) {
            showNotification('error', 'Name, latitude, and longitude are required');
            return;
        }

        const siteData = {
            name: newSite.name,
            latitude: parseFloat(newSite.latitude),
            longitude: parseFloat(newSite.longitude),
            radius_meters: parseInt(newSite.radius_meters) || 200,
            address: newSite.address || null,
            is_active: true,
        };

        try {
            let result;
            if (editingSite) {
                result = await supabase.from('sites').update(siteData).eq('id', editingSite.id);
            } else {
                result = await supabase.from('sites').insert(siteData);
            }

            if (result.error) {
                console.error('Save error:', result.error);
                showNotification('error', `Failed to save: ${result.error.message}`);
                return;
            }

            showNotification('success', editingSite ? 'Site updated successfully!' : 'Site created successfully!');
            setShowAdd(false);
            setEditingSite(null);
            setNewSite({ name: '', latitude: '', longitude: '', radius_meters: '200', address: '' });
            loadSites();
        } catch (err: any) {
            console.error('Save exception:', err);
            showNotification('error', `Error: ${err.message}`);
        }
    };

    const startEdit = (site: Site) => {
        setEditingSite(site);
        setNewSite({
            name: site.name,
            latitude: site.latitude.toString(),
            longitude: site.longitude.toString(),
            radius_meters: site.radius_meters.toString(),
            address: site.address || ''
        });
        setShowAdd(true);
    };

    const toggleActive = async (siteId: string, current: boolean) => {
        const { error } = await supabase.from('sites').update({ is_active: !current }).eq('id', siteId);
        if (error) {
            showNotification('error', `Failed to toggle: ${error.message}`);
            return;
        }
        showNotification('success', `Site ${current ? 'disabled' : 'enabled'}`);
        loadSites();
    };

    const deleteSite = async (siteId: string) => {
        if (!confirm('Delete this site? This cannot be undone.')) return;
        const { error } = await supabase.from('sites').delete().eq('id', siteId);
        if (error) {
            showNotification('error', `Failed to delete: ${error.message}`);
            return;
        }
        showNotification('success', 'Site deleted');
        loadSites();
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
                <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-slide-up ${notification.type === 'success'
                        ? 'bg-slate-900/90 border-green-500/30 text-green-400'
                        : 'bg-slate-900/90 border-red-500/30 text-red-400'
                    }`}>
                    <span className="text-2xl">{notification.type === 'success' ? '✓' : '⚠️'}</span>
                    <span className="font-medium">{notification.message}</span>
                </div>
            )}

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-white">Sites ({sites.length})</h1>
                    <p className="text-sm text-slate-400">Manage work locations and geofencing</p>
                </div>
                <button onClick={() => setShowAdd(true)}
                    className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl hover:from-teal-400 hover:to-emerald-400 hover:shadow-lg hover:shadow-teal-500/20 transition-all font-medium">
                    + Add Site
                </button>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-black/20 border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Name</th>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Location</th>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Radius</th>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Status</th>
                                <th className="px-6 py-4 text-right text-slate-400 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {sites.map(site => (
                                <tr key={site.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                        <span className="text-xl">📍</span>
                                        {site.name}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-slate-300 font-mono text-xs">
                                            {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)}
                                        </div>
                                        {site.address && <div className="text-slate-500 text-xs mt-1 truncate max-w-[200px]">{site.address}</div>}
                                    </td>
                                    <td className="px-6 py-4 text-slate-300">{site.radius_meters}m</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${site.is_active
                                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                            : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                            {site.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-3">
                                        <button onClick={() => toggleActive(site.id, site.is_active)}
                                            className="text-cyan-400 hover:text-cyan-300 text-xs font-medium hover:underline transition-colors">
                                            {site.is_active ? 'Disable' : 'Enable'}
                                        </button>
                                        <button onClick={() => startEdit(site)}
                                            className="text-blue-400 hover:text-blue-300 text-xs font-medium hover:underline transition-colors">
                                            Edit
                                        </button>
                                        <button onClick={() => deleteSite(site.id)}
                                            className="text-red-400 hover:text-red-300 text-xs font-medium hover:underline transition-colors">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {sites.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                    <span className="text-3xl mb-3">📍</span>
                    <p>No sites configured. Add your first site!</p>
                </div>
            )}

            {showAdd && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="font-bold text-xl text-white mb-6">{editingSite ? 'Edit Site' : 'Add New Site'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Site Name <span className="text-red-500">*</span></label>
                                <input type="text" placeholder="e.g. Main Factory" value={newSite.name}
                                    onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Latitude <span className="text-red-500">*</span></label>
                                    <input type="number" placeholder="23.48..." value={newSite.latitude}
                                        onChange={(e) => setNewSite({ ...newSite, latitude: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" step="0.00001" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Longitude <span className="text-red-500">*</span></label>
                                    <input type="number" placeholder="69.50..." value={newSite.longitude}
                                        onChange={(e) => setNewSite({ ...newSite, longitude: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" step="0.00001" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Geofence Radius (Meters)</label>
                                <input type="number" placeholder="200" value={newSite.radius_meters}
                                    onChange={(e) => setNewSite({ ...newSite, radius_meters: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Address (Optional)</label>
                                <input type="text" placeholder="Full address..." value={newSite.address}
                                    onChange={(e) => setNewSite({ ...newSite, address: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={() => { setShowAdd(false); setEditingSite(null); setNewSite({ name: '', latitude: '', longitude: '', radius_meters: '200', address: '' }); }}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveSite}
                                className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-teal-500/20 hover:scale-[1.02] transition-transform">
                                {editingSite ? 'Update Site' : 'Create Site'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
