-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_review_reward_insert ON public.review_rewards;

DROP FUNCTION IF EXISTS notify_admin_on_submission ();

-- Create an updated trigger function that uses the service role key
CREATE OR REPLACE FUNCTION notify_admin_on_submission()
RETURNS TRIGGER AS $$
DECLARE
  service_role_key text;
  supabase_url text;
BEGIN
  -- Get the service role key from vault
  SELECT decrypted_secret INTO service_role_key 
  FROM vault.decrypted_secrets 
  WHERE name = 'service_role_key';

  -- Get the Supabase URL  
  SELECT decrypted_secret INTO supabase_url 
  FROM vault.decrypted_secrets 
  WHERE name = 'supabase_url';

  -- Call the Edge Function using pg_net with proper authentication
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-admin-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_review_reward_insert
  AFTER INSERT ON public.review_rewards
  FOR EACH ROW EXECUTE FUNCTION notify_admin_on_submission();

-- Grant necessary permissions
GRANT
EXECUTE ON FUNCTION notify_admin_on_submission () TO postgres,
service_role;