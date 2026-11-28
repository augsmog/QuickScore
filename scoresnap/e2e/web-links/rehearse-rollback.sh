# Apply both proposed web files to a throwaway local PostgreSQL, roll back, apply again, run the server suites,
# and check the rollback leaves earlier members alone. Usage (as root, PostgreSQL 16 or 17 installed):
#   bash e2e/web-links/rehearse-rollback.sh "$PWD"      (from scoresnap/)
# Touches nothing hosted. Written for the Linux container it was used in (runs the server as user postgres).
set -euo pipefail
app=$1; here=$app/e2e/web-links
export PATH="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1):$PATH"
work=$(mktemp -d "${TMPDIR:-/tmp}/reh-XXXXXX"); port=54778; url="postgresql://postgres@127.0.0.1:$port/postgres"
as_pg() { runuser -u postgres -- "$@"; }
trap 'as_pg pg_ctl -D "$work/db" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
mkdir -p "$work/sql" && cp -R "$app/supabase/migrations" "$app/supabase/proposed" "$app/supabase/rollbacks" "$app/supabase/schema-drift/offline-bootstrap.sql" "$here/stubs.sql" "$work/sql/"
sed -i -E 's/, MAINTAIN//g; s/MAINTAIN, //g' "$work"/sql/migrations/*.sql "$work"/sql/proposed/*.sql "$work"/sql/rollbacks/*.sql
chown -R postgres "$work"; chmod 755 "$work"
as_pg initdb -D "$work/db" -U postgres -A trust >/dev/null
as_pg pg_ctl -D "$work/db" -l "$work/server.log" -o "-k $work -h 127.0.0.1 -p $port" -w start >/dev/null
q() { psql "$url" -X -q -v ON_ERROR_STOP=1 "$@"; }
q -f "$work/sql/offline-bootstrap.sql" >/dev/null 2>&1; q -f "$work/sql/stubs.sql" >/dev/null 2>&1
for m in "$work"/sql/migrations/*.sql; do q -f "$m" >/dev/null 2>&1; done
for p in 20261031230000_restore_game_settings 20261101020000_owner_discovery 20261101190000_owner_invite_snapshot 20261128000000_web_player_links; do q -f "$work/sql/proposed/$p.sql" >/dev/null 2>&1; done
state() { printf "purge:%s " "$(q -Atc "select substr(md5(prosrc),1,8) from pg_proc where proname='purge_account'")"; q -Atc "select md5(prosrc) from pg_proc where oid='public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)'::regprocedure" | tr '\n' ' '; q -Atc "select count(*) from pg_proc where proname='finalize_window'"; }
echo "before:        $(state)"
q -f "$work/sql/proposed/20261128010000_web_score_rules.sql" >/dev/null; echo "applied:       $(state)"
q -f "$app/supabase/tests/web-score-rules.sql" | grep -c 'PASS: web score rules'
q -f "$work/sql/rollbacks/20261128010000_web_score_rules.sql" >/dev/null; echo "rolled back:   $(state)"
q -f "$work/sql/proposed/20261128010000_web_score_rules.sql" >/dev/null; echo "applied again: $(state)"
q -f "$app/supabase/tests/web-score-rules.sql" | grep -c 'PASS: web score rules'
for t in m4b-api m3-acl m5-security guest-write-guard legacy-compatibility web-player-links web-review-findings; do f="$app/supabase/tests/$t.sql"; [ -f "$f" ] && { q -f "$f" >"$work/t.log" 2>&1 && echo "ok $t" || { echo "FAILED $t"; tail -3 "$work/t.log"; }; }; done
# Finding 6: a viewer and a scorer who were there before must survive the rollback; ones a code or link made must not.
q -f "$app/e2e/web-links/seed.sql" >/dev/null
C=72000000-0000-4000-8000-000000000001
q -c "insert into auth.users(id,is_anonymous) values('7a000000-0000-4000-8000-000000000001',false),('7a000000-0000-4000-8000-000000000002',true),('7a000000-0000-4000-8000-000000000003',false);
insert into public.contest_memberships(contest_id,user_id,role,player_id,status) values('$C','7a000000-0000-4000-8000-000000000001','viewer',null,'approved'),('$C','7a000000-0000-4000-8000-000000000003','scorer',null,'approved');
insert into public.round_scorer_scopes(contest_id,round_id,group_id,user_id,status) select a.contest_id,a.round_id,a.group_id,'7a000000-0000-4000-8000-000000000003','approved' from public.round_player_assignments a where a.contest_id='$C' limit 1;"
code=$(q -Atc "select invite_code from public.contests where id='$C'")
printf '%s\n' "begin; set local role authenticated; set local request.jwt.claims='{\"sub\":\"7a000000-0000-4000-8000-000000000002\",\"is_anonymous\":true,\"role\":\"authenticated\"}'; select 'watch by code: '||(public.watch_code('$code')->>'status'); commit;" | q -At
q -f "$work/sql/rollbacks/20261128010000_web_score_rules.sql" >/dev/null; q -f "$work/sql/rollbacks/20261128000000_web_player_links.sql" >/dev/null && echo "both rolled back: $(state)"
q -Atc "select role||' '||case user_id when '7a000000-0000-4000-8000-000000000001' then 'there-before' when '7a000000-0000-4000-8000-000000000003' then 'there-before' else 'made-by-code' end||' -> '||status from public.contest_memberships where contest_id='$C' and user_id::text like '7a%' order by user_id"
q -Atc "select 'old scorer scopes still approved: '||count(*) from public.round_scorer_scopes where user_id='7a000000-0000-4000-8000-000000000003' and status='approved'"
q -Atc "select 'leftover new tables: '||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('player_links','player_link_members','group_card_hosts','score_flags','contest_finalizations','card_reopens','watch_code_members')"
