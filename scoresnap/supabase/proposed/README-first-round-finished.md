# First round finished activation candidate

This is a proposed migration only and has not been applied to the live project.

The metric is a server-observed lower bound: it records account owners when a synced contest becomes completed or a published shared round receives its first `ended_at`. Local-only rounds that are never shared or synced are not observable here.

There is no historical backfill. Applying this migration to the live project requires a separate owner yes.
