-- TEST ONLY: historical-prefix gates on freshly reset disposable databases.
-- Never use as an operator rollback: signup_reliability.sql preserves data.
DROP TRIGGER on_auth_user_signup_webhook ON auth.users;
DROP FUNCTION public.dispatch_signup_webhook();
DROP FUNCTION public.apply_signup_referral(uuid,text);
DROP FUNCTION public.get_signup_webhook_secret();
DROP FUNCTION public.claim_signup_email(uuid,uuid,boolean);
DROP FUNCTION public.confirm_signup_email(uuid,uuid,text);
DROP TABLE public.signup_processing;
DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261101003300','20261101003400');
DROP EXTENSION IF EXISTS pg_net;
