-- Rollback for proposed/20261127031500_quick_settle_completion_rpc.sql. Drops only what that file
-- created. Loses the completion records collected since the apply; nothing else.
BEGIN;
DROP FUNCTION IF EXISTS public.record_quick_settle_completion(uuid,uuid,uuid);
DROP TABLE IF EXISTS public.quick_settle_completion_operations;
DROP TABLE IF EXISTS public.first_round_finishes;
NOTIFY pgrst, 'reload schema';
COMMIT;
