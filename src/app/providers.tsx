'use client';

import { DashboardProvider } from '@/lib/dashboard-context';
import { NotificationProvider } from '@/lib/notification-context';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ToastProvider } from '@/components/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <DashboardProvider>
            <NotificationProvider>
                <ToastProvider>
                    {children}
                    <InstallPrompt />
                </ToastProvider>
            </NotificationProvider>
        </DashboardProvider>
    );
}
