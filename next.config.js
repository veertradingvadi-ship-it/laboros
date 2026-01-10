/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        domains: ['*.supabase.co'],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.supabase.co',
            },
        ],
    },
    // Suppress face-api.js static analysis warnings
    experimental: {
        serverComponentsExternalPackages: ['@vladmandic/face-api'],
    },
    // Fix face-api.js SSR issues
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals = config.externals || [];
            config.externals.push('@vladmandic/face-api');
        }
        // Suppress dynamic import warnings
        config.module = config.module || {};
        config.module.exprContextCritical = false;
        return config;
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;

