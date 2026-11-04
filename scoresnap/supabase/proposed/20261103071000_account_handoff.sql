-- AUG-84: a guest proves possession before changing identities. Never accept a
-- caller-supplied guest UUID at claim time. Tokens are hashed and expire in 24h.
-- Conflict rule: ANY existing account membership wins (even revoked/pending).
-- Transfer membership in place: round IDs, player IDs, scores and receipts stay
-- unchanged. This never replays a guest outbox as a different account.
CREATE TABLE public.account_handoffs (
 token_hash bytea PRIMARY KEY,
 guest_id uuid NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
 target_id uuid REFERENCES auth.users ON DELETE CASCADE,
 result jsonb
);
ALTER TABLE public.account_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_handoffs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_handoffs FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.prepare_account_handoff(p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='GUEST_REQUIRED'; END IF;
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_HANDOFF'; END IF;
 INSERT INTO public.account_handoffs(token_hash,guest_id)
 VALUES(sha256(convert_to(p_token,'UTF8')),auth.uid())
 ON CONFLICT(guest_id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=now()+interval '24 hours'
 WHERE public.account_handoffs.target_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='GUEST_ALREADY_HANDED_OFF'; END IF;
END $$;

CREATE FUNCTION public.claim_account_handoff(p_token text, p_target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE h public.account_handoffs; cid uuid; m public.contest_memberships;
 transferred integer := 0; conflicts integer := 0; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL OR uid IS DISTINCT FROM p_target OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ACCOUNT_REQUIRED'; END IF;
 IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_HANDOFF'; END IF;
 SELECT * INTO h FROM public.account_handoffs WHERE token_hash=sha256(convert_to(p_token,'UTF8')) FOR UPDATE;
 IF h.guest_id IS NULL OR h.guest_id=uid OR (h.target_id IS NOT NULL AND h.target_id<>uid) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='INVALID_HANDOFF'; END IF;
 -- Return the exact durable receipt even after expiry if this account consumed it.
 IF h.target_id=uid THEN RETURN h.result; END IF;
 IF h.expires_at<=now() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='EXPIRED_HANDOFF'; END IF;
 -- Same contest lock as host approval/revocation/write_score, in stable order.
 FOR cid IN SELECT c.id FROM public.contests c WHERE EXISTS (
  SELECT 1 FROM public.contest_memberships g WHERE g.contest_id=c.id AND g.user_id=h.guest_id
 ) OR EXISTS(SELECT 1 FROM public.contest_join_requests r WHERE r.contest_id=c.id AND r.requester=h.guest_id AND r.status='pending') ORDER BY c.id FOR UPDATE LOOP
  SELECT * INTO m FROM public.contest_memberships WHERE contest_id=cid AND user_id=h.guest_id FOR UPDATE;
  IF m.user_id IS NULL OR m.status<>'approved' THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.contest_memberships a WHERE a.contest_id=cid AND a.user_id=uid)
     OR EXISTS(SELECT 1 FROM public.contests c WHERE c.id=cid AND c.owner_id=uid) THEN
   -- Preserve the account's authorization; revoke the replaced guest capability.
   UPDATE public.contest_memberships SET status='revoked',updated_at=now() WHERE contest_id=cid AND user_id=h.guest_id;
   conflicts := conflicts+1;
  ELSE
   UPDATE public.contest_memberships SET user_id=uid,updated_at=now() WHERE contest_id=cid AND user_id=h.guest_id;
   transferred := transferred+1;
  END IF;
  UPDATE public.contest_players SET user_id=CASE WHEN EXISTS(
   SELECT 1 FROM public.contest_memberships a WHERE a.contest_id=cid AND a.user_id=uid AND a.player_id=public.contest_players.id AND a.status='approved'
  ) THEN uid ELSE NULL END WHERE contest_id=cid AND user_id=h.guest_id;
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=cid;
 END LOOP;
 -- Pending requests do not confer access. Keep them pending, account request wins.
 FOR cid IN SELECT c.id FROM public.contests c WHERE EXISTS (
  SELECT 1 FROM public.contest_join_requests r WHERE r.contest_id=c.id AND r.requester=h.guest_id AND r.status='pending'
 ) ORDER BY c.id FOR UPDATE LOOP
  IF EXISTS(SELECT 1 FROM public.contest_join_requests r WHERE r.contest_id=cid AND r.requester=uid AND r.status='pending') THEN
   UPDATE public.contest_join_requests SET status='rejected',decided_at=now() WHERE contest_id=cid AND requester=h.guest_id AND status='pending';
  ELSE
   UPDATE public.contest_join_requests SET requester=uid WHERE contest_id=cid AND requester=h.guest_id AND status='pending';
  END IF;
 END LOOP;
 h.result := jsonb_build_object('transferred',transferred,'conflicts',conflicts);
 UPDATE public.account_handoffs SET target_id=uid,result=h.result WHERE guest_id=h.guest_id;
 RETURN h.result;
END $$;
REVOKE ALL ON FUNCTION public.prepare_account_handoff(text),public.claim_account_handoff(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_account_handoff(text),public.claim_account_handoff(text,uuid) TO authenticated;

-- Private history snapshots grant no live authorization. First account copy wins.
CREATE TABLE public.account_round_history (
 user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 local_id text NOT NULL CHECK(length(local_id) BETWEEN 1 AND 200),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot ? 'id' AND snapshot->>'id'=local_id),
 PRIMARY KEY(user_id,local_id)
);
ALTER TABLE public.account_round_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_round_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_round_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.account_round_history TO authenticated;
CREATE POLICY account_history_read ON public.account_round_history FOR SELECT TO authenticated
 USING(user_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
CREATE POLICY account_history_insert ON public.account_round_history FOR INSERT TO authenticated
 WITH CHECK(user_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
