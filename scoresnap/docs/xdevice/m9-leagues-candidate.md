# M9 lightweight leagues candidate

This draft adds a host-managed recurring roster for existing synchronized
events. The league stores stable member IDs and maps them to event player IDs.
Linking an event imports only identities already approved for that event.
Event permissions remain independent: a league member can request a mapped
event seat, but only the event host's existing approval path grants access.

League event listings return event metadata to active league members. Names and
per-round hole scores are included only when the caller is the event owner or
has an approved event membership. The response omits account IDs, course data,
game/settlement data, and unmapped event roster details. No season rules or
points are added.

The SQL is under `supabase/proposed/`, outside the active migration chain. It
is intended for disposable CI only while AUG-82/M8 integration and its required
acceptance remain in progress. Do not apply it to a hosted project. The M9
candidate's CI does not prove the required four-phone/TestFlight acceptance;
M9 exit and the dependent M10 work remain gated by the plan.

From `scoresnap/`, the candidate stack check runs:

```sh
supabase db reset
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/proposed/20261103150000_lightweight_leagues.sql
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -X -v ON_ERROR_STOP=1 -f scripts/ci/test-league-candidate.sql
```
