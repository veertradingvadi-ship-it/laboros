'use client';

import { createContext, useContext } from 'react';

// Gujarati translations for owner pages
export const ownerTranslations = {
    en: {
        ownerPanel: 'Owner Panel',
        dashboard: 'Dashboard',
        sites: 'Sites',
        workers: 'Workers',
        staff: 'Staff',
        tasks: 'Tasks',
        audit: 'Audit',
        finance: 'Finance',
        back: 'Back',
        logout: 'Logout',
    },
    gu: {
        ownerPanel: 'માલિક પેનલ',
        dashboard: 'ડેશબોર્ડ',
        sites: 'સાઇટ્સ',
        workers: 'કામદારો',
        staff: 'સ્ટાફ',
        tasks: 'કાર્યો',
        audit: 'ઓડિટ',
        finance: 'નાણાં',
        back: 'પાછા',
        logout: 'લોગઆઉટ',
    }
};

// Language context for owner pages
export const OwnerLangContext = createContext<{
    lang: 'en' | 'gu';
    setLang: (l: 'en' | 'gu') => void;
    t: typeof ownerTranslations['en']
}>({
    lang: 'gu',
    setLang: () => { },
    t: ownerTranslations.gu
});

export const useOwnerLang = () => useContext(OwnerLangContext);
