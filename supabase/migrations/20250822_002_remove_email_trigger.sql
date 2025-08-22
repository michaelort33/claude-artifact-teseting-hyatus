-- Remove the problematic trigger since JavaScript is handling notifications
DROP TRIGGER IF EXISTS on_review_reward_insert ON public.review_rewards;

DROP FUNCTION IF EXISTS notify_admin_on_submission ();