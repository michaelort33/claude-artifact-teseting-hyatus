# claude-artifact-teseting-hyatus
testing claude artifacts

## Multi-user accounts and per-user submissions

This app now supports user signup/signin using Supabase Auth, and associates each submission with the authenticated user's ID. Signed-in users can view their own history under "My Submissions" on the main page.

### Supabase setup

1. Auth: Enable email/password provider in Supabase Auth.
2. Table changes for `review_rewards`:
   - Add a nullable `user_id uuid` column that references `auth.users`.
   - Example SQL:
```
alter table public.review_rewards
add column if not exists user_id uuid references auth.users(id) on delete set null;
```
3. Row Level Security (RLS): Ensure RLS is enabled on `review_rewards`. Add policies:
   - Allow anonymous inserts for public submissions (optional, if you allow non-logged-in submissions):
```
create policy "Anyone can create a submission" on public.review_rewards
for insert to anon using (true) with check (true);
```
   - If you require login to submit, replace the above with:
```
create policy "Logged-in users can insert own submission" on public.review_rewards
for insert to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
   - Allow each authenticated user to read only their own rows:
```
create policy "Users can read own submissions" on public.review_rewards
for select to authenticated using (user_id = auth.uid());
```
   - Admin access (optional): create a Postgres role or use service key to bypass RLS for the admin dashboard, or create an additional policy for a specific admin email/role.

4. If you switched to "login required" to submit, also add a trigger to auto-fill `user_id` on insert to prevent client tampering:
```
create or replace function public.set_user_id()
returns trigger as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_user_id on public.review_rewards;
create trigger trg_set_user_id before insert on public.review_rewards
for each row execute function public.set_user_id();
```

### Frontend changes

- Added sign in/sign up modal in `index.html` with email/password auth.
- Added "Sign In" link (top-right) that toggles to "<email> • Sign Out" when logged in.
- Submissions include `user_id` if a user is authenticated.
- Added "My Submissions" section visible only when logged in.

### Notes

- If email confirmation is enabled, users must confirm before appearing signed in.
- The admin dashboard (`admin.html`) continues to query `review_rewards` and is intended to be used with an admin account or a service role that can read all rows under RLS.

## Claims app (parallel app at /claim)

This app provides a reservation-based claims flow with its own account concept. Users sign in with email + reservation ID and can submit/view claims. Accessible at `/claim/`.

### Database schema

```sql
-- Claim accounts (links an auth user to a reservation id)
create table if not exists public.claim_accounts (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  reservation_id text not null,
  created_at timestamptz default now(),
  unique(email, reservation_id)
);

-- Claims
create table if not exists public.claims (
  id bigint primary key generated always as identity,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  reservation_id text not null,
  description text not null,
  amount_requested numeric(10,2) default 0,
  resolution_amount numeric(10,2),
  status text default 'open' check (status in ('open','resolved')),
  image_urls jsonb default '[]'::jsonb,
  expected_resolution_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists claims_user_id_idx on public.claims(user_id);
create index if not exists claim_accounts_user_idx on public.claim_accounts(user_id);
```

### RLS policies

```sql
alter table public.claim_accounts enable row level security;
alter table public.claims enable row level security;

-- claim_accounts: users can upsert their own row (by email+reservation)
drop policy if exists "claim_accounts_insert" on public.claim_accounts;
create policy "claim_accounts_insert" on public.claim_accounts for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "claim_accounts_select" on public.claim_accounts;
create policy "claim_accounts_select" on public.claim_accounts for select to authenticated using (auth.uid() = user_id);

drop policy if exists "claim_accounts_update" on public.claim_accounts;
create policy "claim_accounts_update" on public.claim_accounts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- claims: users manage their own claims
drop policy if exists "claims_insert" on public.claims;
create policy "claims_insert" on public.claims for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "claims_select" on public.claims;
create policy "claims_select" on public.claims for select to authenticated using (auth.uid() = user_id);

drop policy if exists "claims_update" on public.claims;
create policy "claims_update" on public.claims for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Optional: admin policies (match your admin email(s))
drop policy if exists "claims_admin_select" on public.claims;
create policy "claims_admin_select" on public.claims for select to authenticated using (auth.jwt() ->> 'email' = any (array['michaelort@hyatus.com']));

drop policy if exists "claims_admin_update" on public.claims;
create policy "claims_admin_update" on public.claims for update to authenticated using (auth.jwt() ->> 'email' = any (array['michaelort@hyatus.com'])) with check (auth.jwt() ->> 'email' = any (array['michaelort@hyatus.com']));
```

### Admin handling

- Extend `admin.html` to list and resolve claims by setting `resolution_amount` and switching `status` to `resolved`.
- Resolution logic: if admin enters an amount (can match or differ from requested), save it and mark `status='resolved'`.

### Frontend

- New `claim/index.html` handles:
  - Sign-in with email + reservation ID + password.
  - Magic link flow when reservation ID is unknown; prompts to set password and enter reservation ID once.
  - Create a claim with description, optional images, requested amount.
  - Shows timeline toward a 14-day expected resolution date.

## 📧 Email Notifications Setup

Get notified when new review rewards are submitted!

**Note:** The site is now deployed at `https://feedback.hyatus.com/`

### Important Domain Configuration:
- For SendGrid: Verify `feedback.hyatus.com` domain or use `notifications@feedback.hyatus.com` as sender
- For Resend: Add `feedback.hyatus.com` to your verified domains
- All email links now point to `https://feedback.hyatus.com/admin.html`

### Option 1: Netlify Functions (Recommended for Netlify hosting)

1. **Install SendGrid:**
   ```bash
   cd netlify/functions
   npm install
   ```

2. **Set Environment Variables in Netlify Dashboard:**
   - `SENDGRID_API_KEY`: Your SendGrid API key
   - `ADMIN_EMAIL`: Email to receive notifications

3. **Update the function call in index.html:**
   ```javascript
   // Replace the sendAdminNotification function with:
   return fetch('/.netlify/functions/notify-admin', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(submission)
   });
   ```

### Option 2: Supabase Edge Functions

1. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy send-admin-notification
   ```

2. **Set Secrets:**
   ```bash
   supabase secrets set RESEND_API_KEY=your_resend_api_key
   supabase secrets set ADMIN_EMAIL=michaelort@hyatus.com
   ```

3. **Enable the Database Trigger:**
   Run the migration in `supabase/migrations/add_email_trigger.sql`

### Option 3: Client-side with EmailJS (Quick setup)

1. Sign up at [EmailJS](https://www.emailjs.com) (free tier available)
2. Add the EmailJS script to index.html before closing `</body>`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
   ```
3. Configure the service in the sendAdminNotification function (see comments in code)
