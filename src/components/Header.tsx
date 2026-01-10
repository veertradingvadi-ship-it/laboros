'use client';

import { COMPANY_NAME, LOGO_URL, THEME_COLOR } from '@/lib/config';
import Link from 'next/link';

interface HeaderProps {
    userName?: string;
    onLogout?: () => void;
}

export default function Header({ userName, onLogout }: HeaderProps) {
    const themeClass = THEME_COLOR === 'orange' ? 'from-orange-500 to-orange-600' :
        THEME_COLOR === 'blue' ? 'from-blue-500 to-blue-600' :
            THEME_COLOR === 'green' ? 'from-green-500 to-green-600' :
                'from-slate-600 to-slate-700';

    return (
        <header className={`bg-gradient-to-r ${themeClass} text-white shadow-lg`}>
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                <Link href="/dashboard" className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        {LOGO_URL !== '/logo.png' ? (
                            <img src={LOGO_URL} alt={COMPANY_NAME} className="w-6 h-6 object-contain" />
                        ) : (
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        )}
                    </div>
                    <span className="font-bold text-lg">{COMPANY_NAME}</span>
                </Link>

                <div className="flex items-center gap-4">
                    {userName && (
                        <span className="text-sm text-white/80 hidden sm:block">
                            {userName}
                        </span>
                    )}
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                            title="Logout"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
