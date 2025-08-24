-- Add new admin user
INSERT INTO
    public.admins (email)
VALUES ('aahim7406@gmail.com') ON CONFLICT (email) DO NOTHING;