-- Roll back the proposed activation retention views.
DROP VIEW IF EXISTS public.organizer_contest_players;
DROP VIEW IF EXISTS public.retention_cohorts;
DROP TABLE IF EXISTS public.analytics_cohort_exclusions;
