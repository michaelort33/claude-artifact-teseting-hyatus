-- Secure the review_rewards_summary view
-- Since this is a view used only by admins, we'll add appropriate security

-- Option 1: If you want to keep it as a view but only accessible via admin authentication
-- Drop and recreate the view with security definer (runs with creator's privileges)
DROP VIEW IF EXISTS review_rewards_summary;

CREATE OR REPLACE VIEW review_rewards_summary
WITH (security_invoker = false) -- This makes it security definer
    AS
SELECT
    payment_method,
    COUNT(*) as total_submissions,
    COUNT(
        CASE
            WHEN status = 'awarded' THEN 1
        END
    ) as awarded_count,
    COUNT(
        CASE
            WHEN status = 'paid' THEN 1
        END
    ) as paid_count,
    COALESCE(
        SUM(
            CASE
                WHEN status IN ('awarded', 'paid') THEN award_amount
            END
        ),
        0
    ) as total_awarded_amount,
    COALESCE(
        SUM(
            CASE
                WHEN status = 'paid' THEN award_amount
            END
        ),
        0
    ) as total_paid_amount
FROM review_rewards
GROUP BY
    payment_method
UNION ALL
SELECT
    'TOTAL' as payment_method,
    COUNT(*) as total_submissions,
    COUNT(
        CASE
            WHEN status = 'awarded' THEN 1
        END
    ) as awarded_count,
    COUNT(
        CASE
            WHEN status = 'paid' THEN 1
        END
    ) as paid_count,
    COALESCE(
        SUM(
            CASE
                WHEN status IN ('awarded', 'paid') THEN award_amount
            END
        ),
        0
    ) as total_awarded_amount,
    COALESCE(
        SUM(
            CASE
                WHEN status = 'paid' THEN award_amount
            END
        ),
        0
    ) as total_paid_amount
FROM review_rewards;

-- Option 2: Create a function instead that checks for admin access
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
AS $$
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Check if user is admin (you can add more specific checks here)
    IF NOT EXISTS (
        SELECT 1 FROM admins 
        WHERE email = auth.jwt() ->> 'email'
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    -- Return the summary data
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

-- Grant execute permission to authenticated users (they still need to be admin)
GRANT
EXECUTE ON FUNCTION get_review_rewards_summary () TO authenticated;

-- Add a comment explaining the security model
COMMENT ON VIEW review_rewards_summary IS 'Summary view of review rewards - access restricted to admin users only';