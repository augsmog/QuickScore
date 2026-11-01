-- Disposable native PG17 only. Transport/config changes roll back.
BEGIN;
CREATE TEMP TABLE signup_dispatch_probe (LIKE auth.users INCLUDING DEFAULTS);
ALTER TABLE signup_dispatch_probe ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE TRIGGER signup_dispatch_probe AFTER INSERT ON signup_dispatch_probe
FOR EACH ROW EXECUTE FUNCTION public.dispatch_signup_webhook();
CREATE TEMP TABLE signup_dispatch_calls (url text, headers jsonb, body jsonb);
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pg_temp.signup_dispatch_calls VALUES (url, headers, body);
  RETURN 1;
END;
$$;
SELECT set_config('app.settings.supabase_url', 'http://signup.invalid', true);
INSERT INTO vault.decrypted_secrets VALUES
('signup_webhook_secret', 'disposable-test-value'),
('signup_webhook_service_jwt', 'disposable-test-value');
INSERT INTO signup_dispatch_probe(id,email,raw_user_meta_data,raw_app_meta_data)
VALUES ('00000000-0000-0000-0000-000000000074', 'test@example.invalid', '{"referred_by":"test"}', '{"provider":"email"}');
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_temp.signup_dispatch_calls WHERE
    url = 'http://signup.invalid/functions/v1/on-user-signup'
    AND body->'record'->'user_metadata' = '{"referred_by":"test"}'::jsonb
    AND body->'record'->'app_metadata' = '{"provider":"email"}'::jsonb
    AND headers->>'x-webhook-secret' = 'disposable-test-value') <> 1 THEN
    RAISE EXCEPTION 'configured transport payload mismatch';
  END IF;
END $$;
SELECT set_config('app.settings.supabase_url', '', true);
INSERT INTO signup_dispatch_probe DEFAULT VALUES;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_temp.signup_dispatch_calls) <> 1 THEN
    RAISE EXCEPTION 'missing configuration dispatched';
  END IF;
END $$;
SELECT set_config('app.settings.supabase_url', 'http://signup.invalid', true);
-- OTHERS excludes these two conditions unless listed explicitly.
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = '57014'; END $$;
INSERT INTO signup_dispatch_probe DEFAULT VALUES;
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = 'P0004'; END $$;
INSERT INTO signup_dispatch_probe DEFAULT VALUES;
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb, body jsonb)
RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'transport failed'; END $$;
INSERT INTO signup_dispatch_probe DEFAULT VALUES;
ALTER TABLE vault.decrypted_secrets RENAME TO unavailable_secrets;
INSERT INTO signup_dispatch_probe DEFAULT VALUES;
DROP FUNCTION net.http_post(text,jsonb,jsonb);
INSERT INTO signup_dispatch_probe DEFAULT VALUES;
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_temp.signup_dispatch_probe) <> 7 THEN
    RAISE EXCEPTION 'dispatch prevented insert';
  END IF;
END $$;
ROLLBACK;
