-- Optimize review_rewards table performance
-- Add indexes to improve query performance and reduce timeouts

-- Add index on created_at for ORDER BY performance
CREATE INDEX IF NOT EXISTS idx_review_rewards_created_at ON review_rewards (created_at DESC);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_review_rewards_status ON review_rewards (status);

-- Add index on payment_method for filtering
CREATE INDEX IF NOT EXISTS idx_review_rewards_payment_method ON review_rewards (payment_method);

-- Add composite index for common query patterns (status + created_at)
CREATE INDEX IF NOT EXISTS idx_review_rewards_status_created_at ON review_rewards (status, created_at DESC);

-- Add composite index for payment method filtering
CREATE INDEX IF NOT EXISTS idx_review_rewards_payment_method_created_at ON review_rewards (
    payment_method,
    created_at DESC
);

-- Add index on payment_handle for search functionality
CREATE INDEX IF NOT EXISTS idx_review_rewards_payment_handle ON review_rewards (payment_handle);

-- Add index on user_id for RLS performance
CREATE INDEX IF NOT EXISTS idx_review_rewards_user_id ON review_rewards (user_id);

-- Optimize the is_admin function to use an index
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins (email);

-- Add partial indexes for common status values to improve performance
CREATE INDEX IF NOT EXISTS idx_review_rewards_pending ON review_rewards (created_at DESC)
WHERE
    status IS NULL
    OR status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_rewards_awarded ON review_rewards (created_at DESC)
WHERE
    status = 'awarded';

CREATE INDEX IF NOT EXISTS idx_review_rewards_paid ON review_rewards (created_at DESC)
WHERE
    status = 'paid';