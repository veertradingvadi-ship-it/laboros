import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { COMPANY_NAME, APP_DESCRIPTION, THEME_COLOR } from '@/lib/config';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: `${COMPANY_NAME} - Workforce Management`,
    description: APP_DESCRIPTION,
    manifest: '/manifest.json',
    icons: {
        icon: '/favicon.ico',
        apple: '/logo.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: COMPANY_NAME,
    },
};

export const viewport: Viewport = {
    themeColor: THEME_COLOR === 'orange' ? '#f97316' :
        THEME_COLOR === 'blue' ? '#3b82f6' :
            THEME_COLOR === 'green' ? '#22c55e' : '#64748b',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="/favicon.ico" sizes="any" />
                <link rel="apple-touch-icon" href="/logo.png" />
                <meta name="mobile-web-app-capable" content="yes" />
            </head>
            <body className={`${inter.className} antialiased`}>
                <Providers>
                    <div className={`min-h-screen theme-${THEME_COLOR}`}>
                        {children}
                    </div>
                </Providers>
            </body>
        </html>
    );
}
