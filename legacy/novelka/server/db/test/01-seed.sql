-- ============================================================================
-- ATTACK SUITE
-- Every block below is something a malicious user would actually try from the
-- browser with a valid login. Each must FAIL (or return 0 rows).
-- ============================================================================
\set ON_ERROR_STOP 0
\pset pager off

-- two real users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'victim@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'attacker@example.com')
on conflict do nothing;

-- the victim is a paying customer with a book
update public.profiles set tier = 'pro' where id = '11111111-1111-1111-1111-111111111111';
insert into public.projects (user_id, name, data)
values ('11111111-1111-1111-1111-111111111111', 'Victim secret book', '{"pages":["secret"]}'::jsonb);

-- Free users may export (with watermark) up to 5 PDFs a day; paying users are
-- unlimited. The watermark decision happens server-side on consume.
insert into public.feature_flags (feature_id, enabled, route_free, route_paid, min_tier, daily_limit)
values ('export_pdf', true, true, true, 'basic', 5) on conflict do nothing;

-- Parametric templates: 1 published, 1 draft
insert into public.templates (id, name, status, access_level)
values
  ('classic-ws', 'Classic Word Search', 'published', 'free'),
  ('draft-experiment-ws', 'Draft Experiment', 'draft', 'free')
on conflict (id) do nothing;


