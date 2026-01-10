'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, Worker, AttendanceLog } from '@/lib/supabase';

interface DashboardData {
    workers: Worker[];
    todayLogs: AttendanceLog[];
    sites: any[];
    expenses: any[];
    loading: boolean;
    refresh: () => Promise<void>;
}

const DashboardContext = createContext<DashboardData | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [todayLogs, setTodayLogs] = useState<AttendanceLog[]>([]);
    const [sites, setSites] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const currentDate = new Date().toISOString().split('T')[0];

    const loadData = async () => {
        try {
            const [workersRes, logsRes, sitesRes, expensesRes] = await Promise.all([
                supabase.from('workers').select('*').order('name'),
                supabase.from('attendance_logs').select('*, workers(name, photo_url)').eq('date', currentDate).order('check_in_time', { ascending: false }),
                supabase.from('sites').select('*').order('name'),
                supabase.from('expenses').select('*').eq('date', currentDate).order('created_at', { ascending: false }),
            ]);

            setWorkers(workersRes.data || []);
            setTodayLogs(logsRes.data || []);
            setSites(sitesRes.data || []);
            setExpenses(expensesRes.data || []);
        } catch (err) {
            console.error('Error loading dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        // Single channel for all real-time updates (Better performance)
        const channel = supabase
            .channel('dashboard-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => {
                console.log('Workers changed'); loadData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
                console.log('Attendance changed'); loadData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
                console.log('Expenses changed'); loadData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, () => {
                console.log('Sites changed'); loadData();
            })
            .subscribe((status) => {
                console.log('Realtime status:', status);
                if (status === 'SUBSCRIBED') {
                    // console.log('Ready for updates');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <DashboardContext.Provider value={{ workers, todayLogs, sites, expenses, loading, refresh: loadData }}>
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboardData() {
    const context = useContext(DashboardContext);
    if (!context) {
        // Return safe defaults
        return {
            workers: [], todayLogs: [], sites: [], expenses: [], loading: false, refresh: async () => { },
        };
    }
    return context;
}

// Quick stats hook
export function useDashboardStats() {
    const { workers, todayLogs, expenses } = useDashboardData();

    const presentCount = todayLogs.filter(l => l.check_in_time && !l.check_out_time).length;
    const leftCount = todayLogs.filter(l => l.check_out_time).length;
    // Active workers who have NOT checked in yet = Absent
    const absentCount = workers.filter(w => w.is_active).length - todayLogs.filter(l => l.check_in_time).length;

    // Sum amount (handle nulls)
    const todayExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    return {
        totalWorkers: workers.length,
        activeWorkers: workers.filter(w => w.is_active).length,
        presentCount,
        leftCount,
        absentCount: Math.max(0, absentCount), // Ensure non-negative
        todayExpenses,
    };
}
