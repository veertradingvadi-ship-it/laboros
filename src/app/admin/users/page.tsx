'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface User {
    id: string;
    email: string;
    role: string;
    phone: string | null;
    assigned_site_id: string | null;
    created_at: string;
}

interface Site {
    id: string;
    name: string;
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddUser, setShowAddUser] = useState(false);
    const [newUser, setNewUser] = useState({ email: '', password: '', role: 'manager', assigned_site_id: '' });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => { loadData(); }, []);

    const [editingUser, setEditingUser] = useState<User | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersRes, sitesRes] = await Promise.all([
                supabase.from('profiles').select('*').order('created_at', { ascending: false }),
                supabase.from('sites').select('id, name'),
            ]);

            if (usersRes.error) throw new Error(`Profiles Error: ${usersRes.error.message}`);
            if (sitesRes.error) throw new Error(`Sites Error: ${sitesRes.error.message}`);

            setUsers(usersRes.data || []);
            setSites(sitesRes.data || []);
        } catch (err: any) {
            console.error('Data load error:', err);
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveUser = async () => {
        if (!newUser.email || (!editingUser && !newUser.password)) {
            setError('Email and password required');
            return;
        }
        try {
            if (editingUser) {
                // Update existing user profile
                await supabase.from('profiles').update({
                    role: newUser.role,
                    assigned_site_id: newUser.assigned_site_id || null,
                }).eq('id', editingUser.id);
                setSuccess('User updated successfully');
            } else {
                // Create new user
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email: newUser.email,
                    password: newUser.password,
                });
                if (signUpError) throw signUpError;

                if (data.user) {
                    await supabase.from('profiles').insert({
                        id: data.user.id,
                        email: newUser.email,
                        role: newUser.role,
                        assigned_site_id: newUser.assigned_site_id || null,
                    });
                }
                setSuccess('User created successfully');
            }

            setShowAddUser(false);
            setEditingUser(null);
            setNewUser({ email: '', password: '', role: 'manager', assigned_site_id: '' });
            loadData();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const startEdit = (user: User) => {
        setEditingUser(user);
        setNewUser({
            email: user.email,
            password: '', // Password not editable directly here for security
            role: user.role,
            assigned_site_id: user.assigned_site_id || ''
        });
        setShowAddUser(true);
    };

    const updateRole = async (userId: string, newRole: string) => {
        // Protect admin email
        const user = users.find(u => u.id === userId);
        if (user?.email === 'veertrading.vadi@gmail.com') {
            setError('Cannot change permanent admin role');
            return;
        }
        await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
        loadData();
        setSuccess('Role updated');
    };

    const deleteUser = async (userId: string) => {
        const user = users.find(u => u.id === userId);
        if (user?.email === 'veertrading.vadi@gmail.com') {
            setError('Cannot delete permanent admin');
            return;
        }
        if (!confirm('Delete this user?')) return;
        await supabase.from('profiles').delete().eq('id', userId);
        loadData();
        setSuccess('User deleted');
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-white">Users & Staff</h1>
                    <p className="text-sm text-slate-400">Manage system users and their roles</p>
                </div>
                <button onClick={() => setShowAddUser(true)}
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:from-cyan-500 hover:to-blue-500 hover:shadow-lg hover:shadow-cyan-500/20 transition-all font-medium">
                    + Add User
                </button>
            </div>

            {/* Messages */}
            {error && <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">{error}</div>}
            {success && <div className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-sm">{success}</div>}



            {/* Users Table */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-black/20 border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Email</th>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Role</th>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Site</th>
                                <th className="px-6 py-4 text-left text-slate-400 font-medium">Created</th>
                                <th className="px-6 py-4 text-right text-slate-400 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-xs text-white/70 border border-white/10">
                                            {user.email.charAt(0).toUpperCase()}
                                        </div>
                                        {user.email}
                                    </td>
                                    <td className="px-6 py-4">
                                        <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value)}
                                            className="px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-sm text-slate-300 focus:border-cyan-500 outline-none transition-colors"
                                            disabled={user.email === 'veertrading.vadi@gmail.com'}>
                                            <option value="admin">Admin</option>
                                            <option value="owner">Owner</option>
                                            <option value="manager">Manager</option>
                                            <option value="accountant">Accountant</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">
                                        {sites.find(s => s.id === user.assigned_site_id)?.name || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                        {new Date(user.created_at).toLocaleDateString('en-IN')}
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => startEdit(user)}
                                            className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs transition-colors">
                                            Edit
                                        </button>
                                        {user.email !== 'veertrading.vadi@gmail.com' && (
                                            <button onClick={() => deleteUser(user.id)}
                                                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs transition-colors">
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit User Modal */}
            {showAddUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="font-bold text-xl text-white mb-6">{editingUser ? 'Edit User' : 'Add New User'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Email Address</label>
                                <input type="email" placeholder="user@example.com" value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    disabled={!!editingUser}
                                    className={`w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20 ${editingUser ? 'opacity-50 cursor-not-allowed' : ''}`} />
                            </div>
                            {!editingUser && (
                                <div>
                                    <label className="text-xs text-slate-400 ml-1 mb-1 block">Password</label>
                                    <input type="password" placeholder="••••••••" value={newUser.password}
                                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors placeholder:text-white/20" />
                                </div>
                            )}
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Role</label>
                                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors">
                                    <option value="manager" className="bg-slate-900">Manager</option>
                                    <option value="owner" className="bg-slate-900">Owner</option>
                                    <option value="accountant" className="bg-slate-900">Accountant</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ml-1 mb-1 block">Assigned Site (Optional)</label>
                                <select value={newUser.assigned_site_id} onChange={(e) => setNewUser({ ...newUser, assigned_site_id: e.target.value })}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyan-500 outline-none transition-colors">
                                    <option value="" className="bg-slate-900">No Site Assignment</option>
                                    {sites.map(site => (
                                        <option key={site.id} value={site.id} className="bg-slate-900">{site.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button onClick={() => { setShowAddUser(false); setEditingUser(null); setNewUser({ email: '', password: '', role: 'manager', assigned_site_id: '' }); }}
                                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 hover:bg-white/5 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSaveUser}
                                className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-transform">
                                {editingUser ? 'Update User' : 'Create User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
