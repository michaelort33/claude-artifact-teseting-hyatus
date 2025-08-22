-- Enable the pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a trigger function that calls the Edge Function
CREATE OR REPLACE FUNCTION notify_admin_on_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function using pg_net extension (no auth needed if JWT is disabled)
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

-- Create the trigger
CREATE OR REPLACE TRIGGER on_review_reward_insert
  AFTER INSERT ON public.review_rewards
  FOR EACH ROW EXECUTE FUNCTION notify_admin_on_submission();