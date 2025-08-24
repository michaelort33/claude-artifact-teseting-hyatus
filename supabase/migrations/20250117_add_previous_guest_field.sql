-- Add previous_guest field to review_rewards table
ALTER TABLE review_rewards
ADD COLUMN previous_guest boolean DEFAULT false;

-- Add index for previous_guest field for better query performance
CREATE INDEX idx_review_rewards_previous_guest ON review_rewards (previous_guest);

-- Update the summary view to include previous guest data
DROP VIEW IF EXISTS review_rewards_summary;

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
            ) as total_paid_amount,
            0 as sort_order
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
            SUM(total_paid_amount) as total_paid_amount,
            1 as sort_order
        FROM method_totals
    )
SELECT
    payment_method,
    total_submissions,
    awarded_count,
    paid_count,
    total_awarded_amount,
    total_paid_amount
FROM (
        SELECT *
        FROM method_totals
        UNION ALL
        SELECT *
        FROM overall_total
    ) combined
ORDER BY sort_order, payment_method;

-- Grant permissions
GRANT SELECT ON review_rewards_summary TO authenticated;

GRANT SELECT ON review_rewards_summary TO anon;