-- Enable RLS on review_rewards table if not already enabled
ALTER TABLE review_rewards ENABLE ROW LEVEL SECURITY;

-- Create policies for review_rewards table

-- Policy for users to insert their own submissions
CREATE POLICY "Users can insert their own submissions" ON review_rewards FOR
INSERT
    TO authenticated
WITH
    CHECK (
        auth.uid () = user_id
        OR user_id IS NULL
    );

-- Policy for users to view their own submissions
CREATE POLICY "Users can view their own submissions" ON review_rewards FOR
SELECT TO authenticated USING (
        auth.uid () = user_id
        OR user_id IS NULL
    );

-- Policy for admin users to view all submissions
CREATE POLICY "Admins can view all submissions" ON review_rewards FOR
SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM admins
            WHERE
                email = auth.jwt () ->> 'email'
        )
    );

-- Policy for admin users to update all submissions
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

-- Enable RLS on admins table
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Only admins can view the admins table
CREATE POLICY "Only admins can view admins" ON admins FOR
SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM admins a
            WHERE
                a.email = auth.jwt () ->> 'email'
        )
    );

-- Anonymous access for public submissions (no auth required)
CREATE POLICY "Anonymous users can insert submissions" ON review_rewards FOR
INSERT
    TO anon
WITH
    CHECK (user_id IS NULL);

-- Anonymous users can view submissions without user_id
CREATE POLICY "Anonymous users can view anonymous submissions" ON review_rewards FOR
SELECT TO anon USING (user_id IS NULL);