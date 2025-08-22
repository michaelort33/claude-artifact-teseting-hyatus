-- Create a trigger function that calls the Edge Function
CREATE OR REPLACE FUNCTION notify_admin_on_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- Call the Edge Function using pg_net extension
  PERFORM net.http_post(
    url := 'https://dugjgmwlzyjillkemzhz.supabase.co/functions/v1/send-admin-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER on_review_reward_created
  AFTER INSERT ON review_rewards
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_on_submission();