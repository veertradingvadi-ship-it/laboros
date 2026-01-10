'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { COMPANY_NAME, LOGO_URL } from '@/lib/config';

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        // Check if user is logged in, redirect accordingly
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                router.replace('/dashboard');
            } else {
                router.replace('/login');
            }
        };
        checkAuth();
    }, [router]);

    // Show loading while checking auth
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
            <div className="text-center">
                {LOGO_URL && (
                    <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-white/10 p-3 animate-pulse">
                        <img src={LOGO_URL} alt="" className="w-full h-full object-contain" />
                    </div>
                )}
                <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
                    {COMPANY_NAME}
                </h1>
                <div className="w-8 h-8 border-3 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto mt-6" />
            </div>
        </div>
    );
}
