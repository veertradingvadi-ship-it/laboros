-- =============================================
-- SUPABASE STORAGE BUCKET SETUP
-- Run this in SQL Editor to create the bucket
-- =============================================

-- Note: Create bucket manually in Supabase Dashboard > Storage
-- Bucket name: daily-scans
-- Public: Yes (for easy access)

-- Add columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance_logs' AND column_name = 'proof_url') THEN
    ALTER TABLE attendance_logs ADD COLUMN proof_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance_logs' AND column_name = 'proof_out_url') THEN
    ALTER TABLE attendance_logs ADD COLUMN proof_out_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance_logs' AND column_name = 'gps_accuracy') THEN
    ALTER TABLE attendance_logs ADD COLUMN gps_accuracy FLOAT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attendance_logs' AND column_name = 'is_flagged') THEN
    ALTER TABLE attendance_logs ADD COLUMN is_flagged BOOLEAN DEFAULT false;
  END IF;
END $$;

-- =============================================
-- AUTO-CLEANUP: Delete old photos after 6 months
-- =============================================

-- Enable pg_cron extension (run as superuser)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the cleanup function
CREATE OR REPLACE FUNCTION delete_old_evidence_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Nullify old proof URLs in attendance_logs
  UPDATE attendance_logs 
  SET proof_url = NULL, proof_out_url = NULL
  WHERE date < CURRENT_DATE - INTERVAL '180 days'
    AND (proof_url IS NOT NULL OR proof_out_url IS NOT NULL);
  
  -- Note: Actual file deletion from storage.objects 
  -- requires a separate edge function or manual cleanup
  -- Files in 'daily-scans' bucket older than 6 months
  -- can be deleted via Supabase Dashboard or edge function
  
  RAISE NOTICE 'Cleaned up evidence photos older than 180 days';
END;
$$;

-- Schedule the cleanup (run daily at 3 AM)
-- Note: pg_cron must be enabled first
-- SELECT cron.schedule('cleanup-old-photos', '0 3 * * *', 'SELECT delete_old_evidence_photos()');

-- =============================================
-- Storage Policy for daily-scans bucket
-- =============================================

-- Run these in Supabase Dashboard > Storage > Policies
-- Or via SQL:

-- Allow authenticated users to upload
-- INSERT policy: authenticated users can upload to daily-scans
-- SELECT policy: anyone can view (public bucket)
-- DELETE policy: only service role can delete
