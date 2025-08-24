-- Add paid status and award amount to review_rewards table

-- Add award_amount column with default values
ALTER TABLE review_rewards
ADD COLUMN IF NOT EXISTS award_amount DECIMAL(10, 2);

-- Set default award amounts based on ID
UPDATE review_rewards
SET
    award_amount = CASE
        WHEN id <= 95 THEN 20.00
        ELSE 10.00
    END
WHERE
    award_amount IS NULL;

-- Add paid_at timestamp
ALTER TABLE review_rewards
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
WITH
    TIME ZONE;

-- Update status check constraint to include 'paid'
-- First, drop existing constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'review_rewards_status_check' 
        AND table_name = 'review_rewards'
        AND constraint_type = 'CHECK'
    ) THEN
        ALTER TABLE review_rewards DROP CONSTRAINT review_rewards_status_check;
    END IF;
END $$;

-- Add new constraint that includes 'paid' status
ALTER TABLE review_rewards
ADD CONSTRAINT review_rewards_status_check CHECK (
    status IN (
        'pending',
        'awarded',
        'rejected',
        'paid'
    )
);

-- Update trigger function to validate payment methods (including 'other')
CREATE OR REPLACE FUNCTION check_payment_method()
RETURNS trigger AS $$
BEGIN
    IF NEW.payment_method NOT IN ('venmo', 'zelle', 'paypal', 'other') THEN
        RAISE EXCEPTION 'Invalid payment method: %. Supported methods are: venmo, zelle, paypal, other', NEW.payment_method;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create index on paid_at for performance
CREATE INDEX IF NOT EXISTS idx_review_rewards_paid_at ON review_rewards (paid_at);

-- Create a view for summary statistics
CREATE OR REPLACE VIEW review_rewards_summary AS
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

-- Add comment to document the new fields
COMMENT ON COLUMN review_rewards.award_amount IS 'Amount awarded for the review ($20 for ID <= 95, $10 for others)';

COMMENT ON COLUMN review_rewards.paid_at IS 'Timestamp when the reward was marked as fully paid';