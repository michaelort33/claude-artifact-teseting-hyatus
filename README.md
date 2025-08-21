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
