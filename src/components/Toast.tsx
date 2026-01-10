'use client';

import { useEffect, useState, createContext, useContext, ReactNode } from 'react';

interface Toast {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface ToastContextType {
    showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        // Return a no-op if context not available (fallback)
        return { showToast: console.log };
    }
    return context;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, type, message }]);

        // Auto dismiss after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Toast Container - Fixed position, consistent across all pages */}
            <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div key={toast.id}
                        className={`pointer-events-auto px-5 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-slide-up backdrop-blur-xl transition-all ${toast.type === 'success'
                                ? 'bg-green-900/90 border-green-500/30 text-green-400'
                                : toast.type === 'error'
                                    ? 'bg-red-900/90 border-red-500/30 text-red-400'
                                    : 'bg-blue-900/90 border-blue-500/30 text-blue-400'
                            }`}>
                        <span className="text-xl">
                            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠️' : 'ℹ️'}
                        </span>
                        <span className="font-medium text-sm">{toast.message}</span>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
