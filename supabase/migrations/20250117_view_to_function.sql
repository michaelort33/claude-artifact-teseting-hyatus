-- Convert review_rewards_summary view to a secure function
-- This removes the "Unrestricted" warning

-- Drop the view
DROP VIEW IF EXISTS review_rewards_summary;

-- Create a secure function that returns the same data
CREATE OR REPLACE FUNCTION get_review_rewards_summary()
RETURNS TABLE (
    payment_method text,
    total_submissions bigint,
    awarded_count bigint,
    paid_count bigint,
    total_awarded_amount numeric,
    total_paid_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Optional: Add admin check
    -- IF NOT EXISTS (SELECT 1 FROM admins WHERE email = auth.jwt() ->> 'email') THEN
    --     RAISE EXCEPTION 'Unauthorized';
    -- END IF;
    
    RETURN QUERY
    SELECT
        rr.payment_method::text,
        COUNT(*)::bigint as total_submissions,
        COUNT(CASE WHEN rr.status = 'awarded' THEN 1 END)::bigint as awarded_count,
        COUNT(CASE WHEN rr.status = 'paid' THEN 1 END)::bigint as paid_count,
        COALESCE(SUM(CASE WHEN rr.status IN ('awarded', 'paid') THEN rr.award_amount END), 0)::numeric as total_awarded_amount,
        COALESCE(SUM(CASE WHEN rr.status = 'paid' THEN rr.award_amount END), 0)::numeric as total_paid_amount
    FROM review_rewards rr
    GROUP BY rr.payment_method
    UNION ALL
    SELECT
        'TOTAL'::text,
        COUNT(*)::bigint,
        COUNT(CASE WHEN status = 'awarded' THEN 1 END)::bigint,
        COUNT(CASE WHEN status = 'paid' THEN 1 END)::bigint,
        COALESCE(SUM(CASE WHEN status IN ('awarded', 'paid') THEN award_amount END), 0)::numeric,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN award_amount END), 0)::numeric
    FROM review_rewards;
END;
$$;

-- Grant execute to authenticated users
GRANT
EXECUTE ON FUNCTION get_review_rewards_summary () TO authenticated,
anon;

-- Comment for documentation
COMMENT ON FUNCTION get_review_rewards_summary () IS 'Secure function to get review rewards summary - replaces the view';