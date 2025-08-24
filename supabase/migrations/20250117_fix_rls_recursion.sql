-- Fix infinite recursion in RLS policies
-- The issue is that the admins table policy references itself

-- First, drop all existing policies to start clean
DROP POLICY IF EXISTS "Only admins can view admins" ON admins;

DROP POLICY IF EXISTS "Admins can view all submissions" ON review_rewards;

DROP POLICY IF EXISTS "Admins can update all submissions" ON review_rewards;

DROP POLICY IF EXISTS "Users can insert their own submissions" ON review_rewards;

DROP POLICY IF EXISTS "Users can view their own submissions" ON review_rewards;

DROP POLICY IF EXISTS "Anonymous users can insert submissions" ON review_rewards;

DROP POLICY IF EXISTS "Anonymous users can view anonymous submissions" ON review_rewards;

-- Fix for admins table: Use auth.jwt() directly without recursive check
CREATE POLICY "Admins can view admins table" ON admins FOR
SELECT TO authenticated USING (true);
-- All authenticated users can read the admins table (it's just emails)

-- Alternative if you want more restriction:
-- USING (auth.jwt() ->> 'email' = email); -- Users can only see their own entry

-- Fix for review_rewards: Check admin status without causing recursion
-- Create a simple function to check admin status
CREATE OR REPLACE FUNCTION is_admin(user_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM admins 
        WHERE email = user_email
    );
$$;

-- Now create policies using the function
CREATE POLICY "Users can insert their own submissions" ON review_rewards FOR
INSERT
    TO authenticated
WITH
    CHECK (
        auth.uid () = user_id
        OR user_id IS NULL
    );

CREATE POLICY "Users can view their own submissions" ON review_rewards FOR
SELECT TO authenticated USING (auth.uid () = user_id);

CREATE POLICY "Admins can view all submissions" ON review_rewards FOR
SELECT TO authenticated USING (
        is_admin (auth.jwt () ->> 'email')
    );

CREATE POLICY "Admins can update all submissions" ON review_rewards FOR
UPDATE TO authenticated USING (
    is_admin (auth.jwt () ->> 'email')
)
WITH
    CHECK (
        is_admin (auth.jwt () ->> 'email')
    );

CREATE POLICY "Anonymous users can insert submissions" ON review_rewards FOR
INSERT
    TO anon
WITH
    CHECK (user_id IS NULL);

CREATE POLICY "Anonymous users can view anonymous submissions" ON review_rewards FOR
SELECT TO anon USING (user_id IS NULL);