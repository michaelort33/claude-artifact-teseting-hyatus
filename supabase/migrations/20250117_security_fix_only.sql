-- Security fix for review_rewards_summary view and tables
-- This migration only applies security policies without modifying existing structure

-- Enable RLS on review_rewards table (safe to run multiple times)
ALTER TABLE review_rewards ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert their own submissions" ON review_rewards;

DROP POLICY IF EXISTS "Users can view their own submissions" ON review_rewards;

DROP POLICY IF EXISTS "Admins can view all submissions" ON review_rewards;

DROP POLICY IF EXISTS "Admins can update all submissions" ON review_rewards;

DROP POLICY IF EXISTS "Anonymous users can insert submissions" ON review_rewards;

DROP POLICY IF EXISTS "Anonymous users can view anonymous submissions" ON review_rewards;

-- Create RLS policies for review_rewards
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
        EXISTS (
            SELECT 1
            FROM admins
            WHERE
                email = auth.jwt () ->> 'email'
        )
    );

CREATE POLICY "Admins can update all submissions" ON review_rewards FOR
UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM admins
        WHERE
            email = auth.jwt () ->> 'email'
    )
)
WITH
    CHECK (
        EXISTS (
            SELECT 1
            FROM admins
            WHERE
                email = auth.jwt () ->> 'email'
        )
    );

-- Allow anonymous submissions
CREATE POLICY "Anonymous users can insert submissions" ON review_rewards FOR
INSERT
    TO anon
WITH
    CHECK (user_id IS NULL);

CREATE POLICY "Anonymous users can view anonymous submissions" ON review_rewards FOR
SELECT TO anon USING (user_id IS NULL);

-- Add the new admin user if not exists
INSERT INTO
    public.admins (email)
VALUES ('aahim7406@gmail.com') ON CONFLICT (email) DO NOTHING;

-- Enable RLS on admins table
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Drop and recreate admin table policy
DROP POLICY IF EXISTS "Only admins can view admins" ON admins;

CREATE POLICY "Only admins can view admins" ON admins FOR
SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM admins a
            WHERE
                a.email = auth.jwt () ->> 'email'
        )
    );

-- For the view, we can't enable RLS directly, but we can document it's admin-only
COMMENT ON VIEW review_rewards_summary IS 'Summary view of review rewards - intended for admin access only via authenticated admin users';