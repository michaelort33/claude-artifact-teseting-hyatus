-- Fix the security issue with review_rewards_summary view
-- Add security_invoker clause as required by Supabase

-- Drop existing view
DROP VIEW IF EXISTS review_rewards_summary;

-- Create view with proper column names and aggregation and security_invoker
CREATE VIEW review_rewards_summary
WITH (security_invoker = on) AS
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
            COALESCE(
                SUM(
                    CASE
                        WHEN status IN ('awarded', 'paid') THEN COALESCE(
                            award_amount,
                            CASE
                                WHEN id <= 95 THEN 20
                                ELSE 10
                            END
                        )
                        ELSE 0
                    END
                ),
                0
            ) as total_awarded_amount,
            COALESCE(
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
                ),
                0
            ) as total_paid_amount
        FROM review_rewards
        GROUP BY
            payment_method
    ),
    overall_total AS (
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
FROM overall_total
ORDER BY
    CASE
        WHEN payment_method = 'TOTAL' THEN 1
        ELSE 0
    END,
    payment_method;

-- Grant permissions
GRANT SELECT ON review_rewards_summary TO authenticated;

GRANT SELECT ON review_rewards_summary TO anon;