# Day-14 PostHog query pack: logger-sourced metrics

These are read-only HogQL templates for a Day-14 review. Replace `{{start}}`
and `{{end}}` with quoted ISO timestamps in the project's timezone; the range is
half-open (`timestamp >= start AND timestamp < end`). They query the Logs store,
not Product Analytics' `events` table: all four source strings below are emitted
with `posthog.logger.info(...)` in `src/services/posthog-log.ts`.

PostHog documents Logs as a separate log store, with SQL access through a Logs
SQL tab and the `logs` table. Log bodies and attributes are queryable, and the
React Native SDK attaches the current distinct ID as `posthogDistinctId` to each
log. See [Logs](https://posthog.com/docs/logs), [SQL access](https://posthog.com/docs/sql),
[link logs to a person](https://posthog.com/docs/logs/link-person), and
[log-based metrics](https://posthog.com/docs/logs/metrics). The current
[official Logs HogQL schema](https://github.com/PostHog/posthog/blob/master/posthog/hogql/database/schema/logs.py)
defines the query read budgets and the `body`, `attributes`, and `timestamp`
columns used below.

PostHog's current schema caps bytes read by a user HogQL query against Logs at
50,000,000,000 bytes on Free and 150,000,000,000 bytes on Paid/Enterprise. This
is a scan budget, not a row limit; keep the timestamp filter selective and
narrow the window if a query reaches the cap. The [Logs pricing docs](https://posthog.com/docs/logs/pricing)
state that retention is 14 days by default, configurable per service or source;
custom retention applies to newly ingested logs. Confirm the project's current
setting before the report: a Day-14 query must run before relevant records
expire, or use an approved custom retention configuration. The Logs SQL editor's
documented starter query is `SELECT * FROM logs LIMIT 10`. No production query,
insight, dashboard, metric rule, or other PostHog write was created for this pack.

## First scan

Source string: `scorecard scan completed` (`posthog-log.ts`). This counts
completed scan log rows, plus distinct people with a scan in the selected
window. It is not a first-ever scan cohort: the log does not record whether this
was the user's first scan, and expired history cannot establish that. It also
does not mean the scanned scorecard was committed.

```sql
SELECT
  toDate(timestamp) AS day,
  count() AS completed_scan_logs,
  uniqExact(attributes['posthogDistinctId']) AS people_with_completed_scan
FROM logs
WHERE timestamp >= toDateTime('{{start}}')
  AND timestamp < toDateTime('{{end}}')
  AND body = 'scorecard scan completed'
GROUP BY day
ORDER BY day;
```

Store: Logs. It is not a Product Analytics event. The person count is distinct
IDs among retained matching logs, not a lifetime first-scan count.

## Tournament Director entitlement starts

Source strings: `tournament director entitlement started` and
`contest setup saved` (`posthog-log.ts`). The query counts distinct people who
had a setup-saved log in the same reporting window before emitting an
entitlement-start log, split into normal, trial, and intro periods. Normal is
reported as a normal-period entitlement start; this logger does not itself
verify a store transaction or establish revenue.

```sql
WITH organizers AS (
  SELECT
    attributes['posthogDistinctId'] AS distinct_id,
    min(timestamp) AS first_setup_at
  FROM logs
  WHERE timestamp >= toDateTime('{{start}}')
    AND timestamp < toDateTime('{{end}}')
    AND body = 'contest setup saved'
    AND attributes['posthogDistinctId'] != ''
  GROUP BY distinct_id
)
SELECT
  toDate(entitlement.timestamp) AS day,
  entitlement.attributes['period_type'] AS period_type,
  count() AS entitlement_start_logs,
  uniqExact(entitlement.attributes['posthogDistinctId']) AS organizers
FROM logs AS entitlement
INNER JOIN organizers
  ON organizers.distinct_id = entitlement.attributes['posthogDistinctId']
WHERE entitlement.timestamp >= toDateTime('{{start}}')
  AND entitlement.timestamp < toDateTime('{{end}}')
  AND entitlement.timestamp >= organizers.first_setup_at
  AND entitlement.body = 'tournament director entitlement started'
  AND entitlement.attributes['period_type'] IN ('normal', 'trial', 'intro')
GROUP BY day, period_type
ORDER BY day, period_type;
```

Store: Logs for both the entitlement and organizer filter. It is not a Product
Analytics event query. This reports normal/trial/intro starts, not RevenueCat
verified paid conversion or trial-to-paid attribution.

## Supporting funnel strings

Both strings below are logger records, so query them in Logs. These counts are
log rows and distinct people per day, not ordered user-level funnel conversion;
the log records do not include a contest ID to join the two steps reliably.

```sql
SELECT
  toDate(timestamp) AS day,
  body AS step,
  count() AS log_rows,
  uniqExact(attributes['posthogDistinctId']) AS people
FROM logs
WHERE timestamp >= toDateTime('{{start}}')
  AND timestamp < toDateTime('{{end}}')
  AND body IN ('contest setup saved', 'scorecard scores committed')
GROUP BY day, step
ORDER BY day, step;
```

| Source string | Store |
| --- | --- |
| `contest setup saved` | Logs |
| `scorecard scores committed` | Logs |

## Gaps

There is no storage gap for counting these four source strings over retained
logs: PostHog Logs SQL can query log records. The queries cannot establish a
lifetime first-ever scan, join the supporting steps by contest, or verify a
paid store transaction. Those are interpretation/data-contract limits, not
missing product-event mirrors, so no capture-event child is proposed here.
