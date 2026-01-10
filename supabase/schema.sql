-- =============================================
-- LaborOS Database Schema (FIXED)
-- Run this in Supabase SQL Editor
-- =============================================

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Owners can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Managers can view site workers" ON workers;
DROP POLICY IF EXISTS "Managers can insert workers" ON workers;
DROP POLICY IF EXISTS "Managers can update workers" ON workers;
DROP POLICY IF EXISTS "Managers can insert attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Managers can view attendance" ON attendance_logs;
DROP POLICY IF EXISTS "Users can create access requests" ON access_requests;
DROP POLICY IF EXISTS "Users can view own requests" ON access_requests;
DROP POLICY IF EXISTS "Owners can update requests" ON access_requests;
DROP POLICY IF EXISTS "Can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Anyone can view sites" ON sites;
DROP POLICY IF EXISTS "Managers can manage closings" ON daily_closings;

-- Drop existing tables if they exist (for clean reset)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS access_requests CASCADE;
DROP TABLE IF EXISTS daily_closings CASCADE;
DROP TABLE IF EXISTS attendance_logs CASCADE;
DROP TABLE IF EXISTS workers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS sites CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. SITES TABLE
-- =============================================
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius_meters INTEGER DEFAULT 200,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert a sample site (Mumbai coordinates)
INSERT INTO sites (id, name, latitude, longitude, radius_meters, address) VALUES
('11111111-1111-1111-1111-111111111111', 'Main Charcoal Site', 19.0760, 72.8777, 200, 'Mumbai, India');

-- =============================================
-- 2. PROFILES TABLE
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('admin', 'owner', 'manager', 'accountant')) NOT NULL DEFAULT 'manager',
  assigned_site_id UUID REFERENCES sites(id),
  phone TEXT,
  selfie_url TEXT, -- Stores first-time login selfie for verification
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. WORKERS TABLE
-- =============================================
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  photo_url TEXT,
  face_descriptor FLOAT8[],
  base_rate DECIMAL(10, 2) NOT NULL DEFAULT 500,
  category TEXT,
  site_id UUID REFERENCES sites(id),
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  consent_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. ATTENDANCE LOGS TABLE
-- =============================================
CREATE TABLE attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT CHECK (status IN ('present', 'absent', 'half-day')) DEFAULT 'present',
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  proof_url TEXT,           -- Visual proof photo URL
  proof_out_url TEXT,       -- Check-out proof photo URL
  gps_lat DECIMAL(10, 8),
  gps_long DECIMAL(11, 8),
  gps_accuracy FLOAT,       -- GPS accuracy in meters
  is_flagged BOOLEAN DEFAULT false,  -- Spoofing flag
  ip_address TEXT,
  marked_by UUID,
  payment_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, date)
);

-- =============================================
-- 5. DAILY CLOSINGS TABLE (Evening Tally)
-- =============================================
CREATE TABLE daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  site_id UUID REFERENCES sites(id),
  manager_id UUID REFERENCES auth.users(id),
  system_count INTEGER NOT NULL DEFAULT 0,
  notebook_count INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT CHECK (status IN ('MATCHED', 'MISMATCH')) DEFAULT 'MATCHED',
  closing_time TIMESTAMPTZ DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, date)
);

-- =============================================
-- 6. ACCESS REQUESTS TABLE
-- =============================================
CREATE TABLE access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  requested_site_id UUID REFERENCES sites(id),
  current_lat DECIMAL(10, 8),
  current_long DECIMAL(11, 8),
  status TEXT CHECK (status IN ('PENDING', 'APPROVED', 'DENIED')) DEFAULT 'PENDING',
  approved_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 7. AUDIT LOGS TABLE
-- =============================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ENABLE RLS ON ALL TABLES
-- =============================================
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SIMPLE RLS POLICIES (NO RECURSION)
-- =============================================

-- SITES: Allow all authenticated users to read
CREATE POLICY "Allow read sites" ON sites FOR SELECT TO authenticated USING (true);

-- PROFILES: Allow users to read/update their own profile
CREATE POLICY "Allow read own profile" ON profiles FOR SELECT TO authenticated 
  USING (auth.uid() = id);
  
CREATE POLICY "Allow update own profile" ON profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id);

-- WORKERS: Allow all authenticated users full access (simplified)
CREATE POLICY "Allow all workers access" ON workers FOR ALL TO authenticated USING (true);

-- ATTENDANCE: Allow all authenticated users full access
CREATE POLICY "Allow all attendance access" ON attendance_logs FOR ALL TO authenticated USING (true);

-- DAILY CLOSINGS: Allow all authenticated users full access
CREATE POLICY "Allow all closings access" ON daily_closings FOR ALL TO authenticated USING (true);

-- ACCESS REQUESTS: Allow all authenticated users full access
CREATE POLICY "Allow all access requests" ON access_requests FOR ALL TO authenticated USING (true);

-- AUDIT LOGS: Allow insert and read for authenticated users
CREATE POLICY "Allow audit log access" ON audit_logs FOR ALL TO authenticated USING (true);

-- =============================================
-- TRIGGER: Auto-create profile on user signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, assigned_site_id)
  VALUES (
    new.id, 
    new.email, 
    'owner',  -- Default to owner for first user
    '11111111-1111-1111-1111-111111111111'  -- Default site
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- DONE! Now create a user in Supabase Auth
-- =============================================

-- =============================================
-- 8. EXPENSES TABLE (Kharcha - Daily Deductions)
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT CHECK (category IN ('chai_pani', 'rixa', 'food', 'advance', 'other')) NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  payment_batch_id UUID, -- NULL until settled
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 9. PAYMENT BATCHES TABLE (10-Day Settlements)
-- =============================================
CREATE TABLE IF NOT EXISTS payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_wages INTEGER NOT NULL DEFAULT 0,
  total_expenses INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('paytm', 'cash', 'bank', 'other')) DEFAULT 'cash',
  status TEXT CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- Add payment_batch_id to attendance_logs if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance_logs' AND column_name = 'payment_batch_id') THEN
    ALTER TABLE attendance_logs ADD COLUMN payment_batch_id UUID REFERENCES payment_batches(id);
  END IF;
END $$;

-- RLS for expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow expense access" ON expenses FOR ALL TO authenticated USING (true);

-- RLS for payment_batches
ALTER TABLE payment_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow payment batch access" ON payment_batches FOR ALL TO authenticated USING (true);

-- =============================================
-- INDEX for faster queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_batch ON expenses(payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_payment_batches_status ON payment_batches(status);
CREATE INDEX IF NOT EXISTS idx_attendance_batch ON attendance_logs(payment_batch_id);
