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
}

export default function OwnerSitesPage() {
    const [loading, setLoading] = useState(true);
    const [sites, setSites] = useState<Site[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [newSite, setNewSite] = useState({ name: '', latitude: '', longitude: '', radius: '200', address: '' });
    const [editSite, setEditSite] = useState<Site | null>(null);

    useEffect(() => { loadSites(); }, []);

    const loadSites = async () => {
        const { data } = await supabase.from('sites').select('*').order('name');
        setSites(data || []);
        setLoading(false);
    };

    const addSite = async () => {
        if (!newSite.name || !newSite.latitude || !newSite.longitude) return;
        await supabase.from('sites').insert({
            name: newSite.name,
            latitude: parseFloat(newSite.latitude),
            longitude: parseFloat(newSite.longitude),
            radius_meters: parseInt(newSite.radius) || 200,
            address: newSite.address || null,
        });
        setNewSite({ name: '', latitude: '', longitude: '', radius: '200', address: '' });
        setShowAdd(false);
        loadSites();
    };

    const updateSite = async () => {
        if (!editSite) return;
        await supabase.from('sites').update({
            name: editSite.name,
            latitude: editSite.latitude,
            longitude: editSite.longitude,
            radius_meters: editSite.radius_meters,
            address: editSite.address,
        }).eq('id', editSite.id);
        setEditSite(null);
        loadSites();
    };

    const toggleSite = async (site: Site) => {
        await supabase.from('sites').update({ is_active: !site.is_active }).eq('id', site.id);
        loadSites();
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-800">Site Management</h1>
                <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">
                    + Add Site
                </button>
            </div>

            <div className="grid gap-4">
                {sites.map(site => (
                    <div key={site.id} className="bg-white rounded-xl border p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-bold text-lg">{site.name}</h3>
                                <p className="text-sm text-slate-500">{site.address || 'No address'}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    📍 {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)} • {site.radius_meters}m radius
                                </p>
                            </div>
                            <span className={`px-2 py-1 rounded text-xs ${site.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                {site.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => setEditSite(site)} className="px-3 py-1 bg-slate-100 rounded text-sm">Edit</button>
                            <button onClick={() => toggleSite(site)} className="px-3 py-1 bg-slate-100 rounded text-sm">
                                {site.is_active ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                    </div>
                ))}
                {sites.length === 0 && (
                    <div className="text-center py-12 text-slate-400">No sites yet. Add your first site!</div>
                )}
            </div>

            {/* Add Site Modal */}
            {showAdd && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-5">
                        <h2 className="font-bold text-lg mb-4">Add New Site</h2>
                        <div className="space-y-3">
                            <input type="text" placeholder="Site Name" value={newSite.name}
                                onChange={e => setNewSite(s => ({ ...s, name: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl" />
                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" placeholder="Latitude" value={newSite.latitude}
                                    onChange={e => setNewSite(s => ({ ...s, latitude: e.target.value }))}
                                    className="w-full px-3 py-2 border rounded-xl" step="any" />
                                <input type="number" placeholder="Longitude" value={newSite.longitude}
                                    onChange={e => setNewSite(s => ({ ...s, longitude: e.target.value }))}
                                    className="w-full px-3 py-2 border rounded-xl" step="any" />
                            </div>
                            <input type="number" placeholder="Radius (meters)" value={newSite.radius}
                                onChange={e => setNewSite(s => ({ ...s, radius: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl" />
                            <input type="text" placeholder="Address (optional)" value={newSite.address}
                                onChange={e => setNewSite(s => ({ ...s, address: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-xl" />
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border rounded-xl">Cancel</button>
                            <button onClick={addSite} className="flex-1 py-2 bg-blue-600 text-white rounded-xl">Add Site</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Site Modal */}
            {editSite && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-5">
                        <h2 className="font-bold text-lg mb-4">Edit Site</h2>
                        <div className="space-y-3">
                            <input type="text" placeholder="Site Name" value={editSite.name}
                                onChange={e => setEditSite(s => s ? { ...s, name: e.target.value } : null)}
                                className="w-full px-3 py-2 border rounded-xl" />
                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" placeholder="Latitude" value={editSite.latitude}
                                    onChange={e => setEditSite(s => s ? { ...s, latitude: parseFloat(e.target.value) } : null)}
                                    className="w-full px-3 py-2 border rounded-xl" step="any" />
                                <input type="number" placeholder="Longitude" value={editSite.longitude}
                                    onChange={e => setEditSite(s => s ? { ...s, longitude: parseFloat(e.target.value) } : null)}
                                    className="w-full px-3 py-2 border rounded-xl" step="any" />
                            </div>
                            <input type="number" placeholder="Radius (meters)" value={editSite.radius_meters}
                                onChange={e => setEditSite(s => s ? { ...s, radius_meters: parseInt(e.target.value) } : null)}
                                className="w-full px-3 py-2 border rounded-xl" />
                            <input type="text" placeholder="Address" value={editSite.address || ''}
                                onChange={e => setEditSite(s => s ? { ...s, address: e.target.value } : null)}
                                className="w-full px-3 py-2 border rounded-xl" />
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setEditSite(null)} className="flex-1 py-2 border rounded-xl">Cancel</button>
                            <button onClick={updateSite} className="flex-1 py-2 bg-blue-600 text-white rounded-xl">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
