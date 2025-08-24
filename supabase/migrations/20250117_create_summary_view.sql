-- Create the review_rewards_summary view if it doesn't exist
-- This view aggregates reward data for the admin summary dashboard

-- Drop the view if it exists (to recreate with latest structure)
DROP VIEW IF EXISTS review_rewards_summary;

-- Create the summary view
CREATE VIEW review_rewards_summary AS
SELECT
    payment_method,
    payment_handle,
    COUNT(*) as count,
    SUM(
        CASE
            WHEN status = 'awarded' THEN COALESCE(
                award_amount,
                CASE
                    WHEN id <= 95 THEN 20
                    ELSE 10
                END
            )
            ELSE 0
        END
    ) as awarded_amount,
    SUM(
        CASE
            WHEN status = 'paid' THEN COALESCE(
                award_amount,
                CASE
                    WHEN id <= 95 THEN 20
                    ELSE 10
                END
            )
            ELSE 0
        END
    ) as paid_amount
FROM review_rewards
WHERE
    status IN ('awarded', 'paid')
GROUP BY
    payment_method,
    payment_handle
ORDER BY payment_method, payment_handle;

-- Grant access to authenticated users (admins will check via RLS on the underlying table)
GRANT SELECT ON review_rewards_summary TO authenticated;

GRANT SELECT ON review_rewards_summary TO anon;