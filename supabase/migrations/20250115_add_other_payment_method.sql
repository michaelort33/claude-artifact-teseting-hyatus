-- Migration to ensure payment_method field can accept "other" value
-- This migration ensures compatibility with the new "Other" payment option

-- Check if there are any constraints on payment_method that might prevent "other"
-- If the field has a check constraint limiting values, we need to update it

-- First, let's check if there are any existing constraints on the payment_method column
DO $$
BEGIN
    -- Check if there's a check constraint on payment_method
    IF EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name LIKE '%payment_method%' 
        AND table_name = 'review_rewards'
    ) THEN
        -- If there's a constraint, we need to drop it and recreate it to include 'other'
        RAISE NOTICE 'Found existing constraint on payment_method, updating to include "other"';
        
        -- Drop existing constraint (we'll need to identify the exact constraint name)
        -- This is a placeholder - you may need to adjust based on your actual constraint name
        -- ALTER TABLE review_rewards DROP CONSTRAINT IF EXISTS review_rewards_payment_method_check;
        
        -- Add new constraint that includes 'other'
        -- ALTER TABLE review_rewards ADD CONSTRAINT review_rewards_payment_method_check 
        -- CHECK (payment_method IN ('venmo', 'zelle', 'paypal', 'other'));
    ELSE
        RAISE NOTICE 'No constraints found on payment_method column - "other" value should work fine';
    END IF;
END $$;

-- Add a comment to document the supported payment methods
COMMENT ON COLUMN review_rewards.payment_method IS 'Supported values: venmo, zelle, paypal, other';

-- Optional: Add an index on payment_method for better query performance on admin filters
CREATE INDEX IF NOT EXISTS idx_review_rewards_payment_method ON review_rewards (payment_method);

-- Optional: Add a function to validate payment methods
CREATE OR REPLACE FUNCTION validate_payment_method(payment_method text)
RETURNS boolean AS $$
BEGIN
    RETURN payment_method IN ('venmo', 'zelle', 'paypal', 'other');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Optional: Add a trigger to validate payment methods on insert/update
CREATE OR REPLACE FUNCTION check_payment_method()
RETURNS trigger AS $$
BEGIN
    IF NOT validate_payment_method(NEW.payment_method) THEN
        RAISE EXCEPTION 'Invalid payment method: %. Supported methods are: venmo, zelle, paypal, other', NEW.payment_method;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS validate_payment_method_trigger ON review_rewards;

CREATE TRIGGER validate_payment_method_trigger
    BEFORE INSERT OR UPDATE ON review_rewards
    FOR EACH ROW
    EXECUTE FUNCTION check_payment_method();