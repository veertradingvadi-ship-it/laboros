'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Profile {
    id: string;
    email: string;
    role: string;
    phone: string | null;
    assigned_site_id: string | null;
}

interface Site {
    id: string;
    name: string;
}

export default function OwnerStaffPage() {
    const [loading, setLoading] = useState(true);
    const [staff, setStaff] = useState<Profile[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [selectedStaff, setSelectedStaff] = useState<Profile | null>(null);
    const [newSiteId, setNewSiteId] = useState('');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const [staffRes, sitesRes] = await Promise.all([
                supabase.from('profiles').select('*').in('role', ['manager', 'accountant']).order('email'),
                supabase.from('sites').select('id, name'),
            ]);
            setStaff(staffRes.data || []);
            setSites(sitesRes.data || []);
        } finally { setLoading(false); }
    };

    const updateRole = async (staffId: string, newRole: string) => {
        await supabase.from('profiles').update({ role: newRole }).eq('id', staffId);
        loadData();
    };

    const assignSite = async () => {
        if (!selectedStaff || !newSiteId) return;
        await supabase.from('profiles').update({ assigned_site_id: newSiteId }).eq('id', selectedStaff.id);
        setSelectedStaff(null);
        setNewSiteId('');
        loadData();
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>;
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>

            <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="text-left py-2 px-3">Email</th>
                            <th className="text-left py-2 px-3">Role</th>
                            <th className="text-left py-2 px-3">Site</th>
                            <th className="text-left py-2 px-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {staff.map(s => (
                            <tr key={s.id} className="border-b">
                                <td className="py-2 px-3">{s.email}</td>
                                <td className="py-2 px-3">
                                    <select value={s.role} onChange={e => updateRole(s.id, e.target.value)}
                                        className="px-2 py-1 border rounded text-xs">
                                        <option value="manager">Manager</option>
                                        <option value="accountant">Accountant</option>
                                    </select>
                                </td>
                                <td className="py-2 px-3 text-xs">
                                    {sites.find(site => site.id === s.assigned_site_id)?.name || 'Unassigned'}
                                </td>
                                <td className="py-2 px-3">
                                    <button onClick={() => setSelectedStaff(s)} className="text-blue-600 text-xs hover:underline">
                                        Assign Site
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {staff.length === 0 && (
                            <tr><td colSpan={4} className="text-center py-6 text-slate-400">No staff members</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Assign Site Modal */}
            {selectedStaff && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-sm p-5">
                        <h2 className="font-bold mb-4">Assign Site to {selectedStaff.email}</h2>
                        <select value={newSiteId} onChange={e => setNewSiteId(e.target.value)}
                            className="w-full px-3 py-2 border rounded-xl mb-4">
                            <option value="">Select Site</option>
                            {sites.map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                        <div className="flex gap-3">
                            <button onClick={() => setSelectedStaff(null)} className="flex-1 py-2 border rounded-xl">Cancel</button>
                            <button onClick={assignSite} disabled={!newSiteId} className="flex-1 py-2 bg-blue-600 text-white rounded-xl disabled:opacity-50">Assign</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
