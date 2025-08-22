# Supabase Edge Functions

## send-admin-notification

This Edge Function sends email notifications to admins when new review rewards are submitted.

### Setup

1. Deploy the function:
```bash
supabase functions deploy send-admin-notification
```

2. Set the required environment variables:
```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set ADMIN_EMAIL=michaelort@hyatus.com
```

3. The function is triggered by the database trigger in `migrations/add_email_trigger.sql`

### Local Development

The TypeScript errors you see locally are false positives. Supabase Edge Functions use Deno, which has a different module system than Node.js. The imports are correct for the Deno runtime.

To suppress these errors in VS Code:
1. Install the Deno extension
2. The `.vscode/settings.json` file will enable Deno for this directory

### Testing

You can test the function locally:
```bash
supabase functions serve send-admin-notification
```

Then make a POST request:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-admin-notification' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"record":{"payment_method":"venmo","payment_handle":"@user123","created_at":"2024-01-20T12:00:00Z"}}'
```
