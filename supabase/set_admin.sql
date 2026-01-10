-- PERMANENT ADMIN ROLE ENFORCEMENT
-- This script ensures veertrading.vadi@gmail.com is ALWAYS admin

-- 1. Set admin role for this email (run once)
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'veertrading.vadi@gmail.com';

-- 2. Create trigger to PREVENT changing this user's role
CREATE OR REPLACE FUNCTION protect_admin_role()
RETURNS TRIGGER AS $$
BEGIN
    -- If trying to update the permanent admin's role to something other than admin
    IF OLD.email = 'veertrading.vadi@gmail.com' AND NEW.role != 'admin' THEN
        RAISE EXCEPTION 'Cannot change role of permanent admin';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_protect_admin_role ON profiles;

-- Create trigger
CREATE TRIGGER trigger_protect_admin_role
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION protect_admin_role();

-- 3. Function to auto-assign admin role on signup (if email matches)
CREATE OR REPLACE FUNCTION auto_assign_admin_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email = 'veertrading.vadi@gmail.com' THEN
        NEW.role := 'admin';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_assign_admin ON profiles;

-- Create trigger
CREATE TRIGGER trigger_auto_assign_admin
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION auto_assign_admin_role();

-- Verify
SELECT id, email, role FROM profiles WHERE email = 'veertrading.vadi@gmail.com';
