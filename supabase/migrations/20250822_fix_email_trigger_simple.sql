-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_review_reward_insert ON public.review_rewards;

DROP FUNCTION IF EXISTS notify_admin_on_submission ();

-- Create a simpler trigger function
CREATE OR REPLACE FUNCTION notify_admin_on_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function directly without authentication
  -- Since this is called from within the database, we can bypass JWT
  PERFORM net.http_post(
    url := 'https://dugjgmwlzyjillkemzhz.supabase.co/functions/v1/send-admin-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER on_review_reward_insert
  AFTER INSERT ON public.review_rewards
  FOR EACH ROW EXECUTE FUNCTION notify_admin_on_submission();