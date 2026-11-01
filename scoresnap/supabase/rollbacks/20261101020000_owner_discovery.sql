-- Rollback of the unapplied owner-discovery proposal. No stored data is lost.
BEGIN;
DROP FUNCTION public.list_owned_contests(text);
NOTIFY pgrst, 'reload schema';
COMMIT;
