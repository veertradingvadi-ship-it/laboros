import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database tables
export interface Site {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
    created_at: string;
}

export interface Profile {
    id: string;
    email: string;
    role: 'admin' | 'owner' | 'manager' | 'accountant';
    assigned_site_id: string | null;
    phone: string | null;
    selfie_url: string | null;
    created_at: string;
}

export interface Worker {
    id: string;
    name: string;
    photo_url: string | null;
    face_descriptor: number[] | null;
    base_rate: number;
    category: string | null;
    site_id: string | null;
    worker_number: string | null;
    is_active: boolean;
    consent_date: string | null;
    created_at: string;
}

export interface AttendanceLog {
    id: string;
    worker_id: string;
    date: string;
    status: 'present' | 'absent' | 'half-day';
    check_in_time: string | null;
    check_out_time: string | null;
    gps_lat: number | null;
    gps_long: number | null;
    ip_address: string | null;
    marked_by: string;
    created_at: string;
}

export interface DailyClosing {
    id: string;
    date: string;
    site_id: string;
    manager_notebook_count: number;
    system_count: number;
    is_match: boolean;
    selfie_url: string | null;
    audio_url: string | null;
    is_verified: boolean;
    closed_by: string;
    created_at: string;
}

export interface AccessRequest {
    id: string;
    user_id: string;
    requested_site_id: string;
    current_lat: number;
    current_long: number;
    status: 'PENDING' | 'APPROVED' | 'DENIED';
    approved_by: string | null;
    expires_at: string | null;
    created_at: string;
}

export interface AuditLog {
    id: string;
    table_name: string;
    record_id: string;
    action: string;
    old_values: Record<string, unknown>;
    new_values: Record<string, unknown>;
    changed_by: string;
    created_at: string;
}
