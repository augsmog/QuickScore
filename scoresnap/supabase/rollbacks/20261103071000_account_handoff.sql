-- Rollback for proposed/20261103071000_account_handoff.sql. Refuse to discard
-- any history or capability receipts; run only on an empty disposable schema.
BEGIN;
LOCK TABLE public.account_round_history, public.account_handoffs IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.account_round_history)
     OR EXISTS (SELECT 1 FROM public.account_handoffs) THEN
    RAISE EXCEPTION 'account handoff rollback refused: stored history or receipts exist';
  END IF;
END;
$$;
DROP POLICY IF EXISTS account_history_insert ON public.account_round_history;
DROP POLICY IF EXISTS account_history_read ON public.account_round_history;
DROP TABLE IF EXISTS public.account_round_history;
DROP FUNCTION IF EXISTS public.claim_account_handoff(text,uuid);
DROP FUNCTION IF EXISTS public.prepare_account_handoff(text);
DROP TABLE IF EXISTS public.account_handoffs;
COMMIT;
