'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsInstalled(true);
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            // Show after 3 seconds if not dismissed before
            const dismissed = localStorage.getItem('pwa-prompt-dismissed');
            if (!dismissed) {
                setTimeout(() => setShowPrompt(true), 3000);
            }
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setIsInstalled(true);
        }
        setShowPrompt(false);
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-prompt-dismissed', 'true');
    };

    if (!showPrompt || isInstalled) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-[999] animate-slide-up lg:left-auto lg:right-6 lg:w-80">
            <div className="bg-gradient-to-r from-cyan-500/90 to-blue-500/90 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/20">
                <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl">
                        📱
                    </div>
                    <div className="flex-1">
                        <h3 className="text-white font-bold">Install LaborOS</h3>
                        <p className="text-white/80 text-sm">Add to home screen for full-screen experience</p>
                    </div>
                </div>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 py-2 text-white/70 text-sm hover:text-white"
                    >
                        Not Now
                    </button>
                    <button
                        onClick={handleInstall}
                        className="flex-1 py-2 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-white/90"
                    >
                        Install App
                    </button>
                </div>
            </div>
        </div>
    );
}
