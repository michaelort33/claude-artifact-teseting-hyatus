-- Create the review_rewards_summary view if it doesn't exist
-- This view aggregates reward data for the admin summary dashboard

-- Drop the view if it exists (to recreate with latest structure)
DROP VIEW IF EXISTS review_rewards_summary;

-- Create the summary view with proper grouping and totals
CREATE VIEW review_rewards_summary AS
WITH
    method_totals AS (
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
            ) as total_awarded_amount,
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
            ) as total_paid_amount
        FROM review_rewards
        WHERE
            status IN ('awarded', 'paid')
        GROUP BY
            payment_method
    ),
    grand_totals AS (
        SELECT
            'TOTAL' as payment_method,
            SUM(total_submissions) as total_submissions,
            SUM(awarded_count) as awarded_count,
            SUM(paid_count) as paid_count,
            SUM(total_awarded_amount) as total_awarded_amount,
            SUM(total_paid_amount) as total_paid_amount
        FROM method_totals
    )
SELECT *
FROM method_totals
UNION ALL
SELECT *
FROM grand_totals
ORDER BY
    CASE
        WHEN payment_method = 'TOTAL' THEN 1
        ELSE 0
    END,
    payment_method;

-- Grant access to authenticated users (admins will check via RLS on the underlying table)
GRANT SELECT ON review_rewards_summary TO authenticated;

GRANT SELECT ON review_rewards_summary TO anon;