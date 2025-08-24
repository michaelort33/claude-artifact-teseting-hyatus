-- This SQL marks the existing migrations as applied in Supabase migration history
-- Run this directly in the Supabase SQL editor to sync migration history

-- Mark migrations as applied (adjust timestamps as needed)
INSERT INTO
    supabase_migrations.schema_migrations (version, inserted_at)
VALUES (
        '20250115_add_other_payment_method',
        NOW()
    ),
    (
        '20250116_add_paid_status_and_award_amount',
        NOW()
    ) ON CONFLICT (version) DO NOTHING;