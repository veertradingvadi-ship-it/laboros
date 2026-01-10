// White-Label Configuration Engine
// All values are sourced from environment variables for easy client customization

export const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || 'LaborOS';
export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL || '/logo.png';
export const THEME_COLOR = process.env.NEXT_PUBLIC_THEME_COLOR || 'orange';

// PERMANENT ADMIN EMAIL - This email ALWAYS has admin role (cannot be changed)
export const ADMIN_EMAIL = 'veertrading.vadi@gmail.com';

// ORIGINAL FIELD COORDINATES (Default Site)
// 23°28'53"N 69°30'05"E
export const DEFAULT_SITE_COORDINATES = {
    latitude: 23.481389,
    longitude: 69.501389,
    radius: 572, // meters (approx 571.77 rounded up)
};

// Role-based access
export const ROLES = ['admin', 'owner', 'manager', 'accountant'] as const;
export type UserRole = typeof ROLES[number];

// Theme color mapping for Tailwind classes
export const themeColors: Record<string, { primary: string; secondary: string; accent: string }> = {
    orange: {
        primary: 'brand-orange-500',
        secondary: 'brand-orange-600',
        accent: 'brand-orange-400',
    },
    blue: {
        primary: 'brand-blue-500',
        secondary: 'brand-blue-600',
        accent: 'brand-blue-400',
    },
    slate: {
        primary: 'brand-slate-600',
        secondary: 'brand-slate-700',
        accent: 'brand-slate-500',
    },
    green: {
        primary: 'brand-green-500',
        secondary: 'brand-green-600',
        accent: 'brand-green-400',
    },
};

export const getCurrentTheme = () => {
    return themeColors[THEME_COLOR] || themeColors.orange;
};

// App metadata
export const APP_NAME = COMPANY_NAME;
export const APP_DESCRIPTION = `${COMPANY_NAME} - Workforce Management System`;
export const APP_VERSION = '1.0.0';
