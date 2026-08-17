\set ON_ERROR_STOP 0
\pset pager off
\echo ''
\echo '=============================================================='
\echo 'Acting as the ATTACKER (authenticated, own valid JWT)'
\echo '=============================================================='
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

\echo ''
\echo '--- T1: read another user''s profile  (must be 0 rows) ---'
select count(*) as rows_visible from public.profiles
 where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '--- T2: read ALL profiles  (must show only own = 1) ---'
select count(*) as rows_visible from public.profiles;

\echo ''
\echo '--- T3: read the victim''s book  (must be 0 rows) ---'
select count(*) as rows_visible from public.projects
 where user_id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '--- T4: SELF-UPGRADE to pro  (must ERROR) ---'
update public.profiles set tier = 'pro'
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- T5: make self owner  (must ERROR) ---'
update public.profiles set is_owner = true
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- T6: steal the victim''s stripe customer id  (must ERROR) ---'
update public.profiles set stripe_customer_id = 'cus_victim'
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- T7: downgrade the victim  (must affect 0 rows) ---'
update public.profiles set display_name = 'hacked'
 where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '--- T8: change own display name  (SHOULD SUCCEED) ---'
update public.profiles set display_name = 'Legit Rename'
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- T9: forge a subscription row  (must ERROR) ---'
insert into public.subscriptions
  (user_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, status, tier)
values
  ('22222222-2222-2222-2222-222222222222','sub_fake','cus_fake','price_fake','active','enterprise');

\echo ''
\echo '--- T10: read the victim''s subscriptions  (must be 0 rows) ---'
select count(*) as rows_visible from public.subscriptions;

\echo ''
\echo '--- T11: erase own usage to reset the daily quota  (must ERROR/0) ---'
delete from public.usage_events where user_id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- T12: insert fake usage  (must ERROR) ---'
insert into public.usage_events (user_id, feature_id, count)
values ('22222222-2222-2222-2222-222222222222','export_pdf',-999);

\echo ''
\echo '--- T13: open a paid feature to everyone  (must ERROR) ---'
update public.feature_flags set route_free = true, min_tier = 'free'
 where feature_id = 'export_pdf';

\echo ''
\echo '--- T14: raise own daily limit  (must ERROR) ---'
update public.feature_flags set daily_limit = 999999 where feature_id = 'export_pdf';

\echo ''
\echo '--- T15: call consume_quota directly to grant себе a free pass (must ERROR) ---'
select public.consume_quota('22222222-2222-2222-2222-222222222222','export_pdf', 999999);

\echo ''
\echo '--- T16: read the webhook ledger  (must ERROR/0) ---'
select count(*) from public.webhook_events;

\echo ''
\echo '--- T17: insert a project owned by the victim  (must ERROR) ---'
insert into public.projects (user_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'planted');

\echo ''
\echo '--- T18: delete the victim''s project  (must affect 0 rows) ---'
delete from public.projects where user_id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '--- T19: create own project  (SHOULD SUCCEED) ---'
insert into public.projects (user_id, name) values
  ('22222222-2222-2222-2222-222222222222', 'My own book');

\echo ''
\echo '--- T29: attacker reads published templates (SHOULD SUCCEED = 1) ---'
select count(*) as templates_visible from public.templates;

\echo ''
\echo '--- T30: attacker tries to read draft template (must be 0 rows) ---'
select count(*) as draft_visible from public.templates where id = 'draft-experiment-ws';

\echo ''
\echo '--- T31: attacker tries to insert/publish a template (must ERROR) ---'
insert into public.templates (id, name, status) values ('attacker-ws', 'Hacked Template', 'published');

\echo ''
\echo '--- T32: attacker tries to read admin audit logs (must ERROR/0) ---'
select count(*) from public.admin_audit_logs;

\echo ''
\echo '--- T33: attacker tries to insert into admin audit logs (must ERROR) ---'
insert into public.admin_audit_logs (action, target_type, target_id) values ('fake.action', 'user', '1111');

\echo ''
\echo '--- T37: update admin audit logs (must ERROR - immutable) ---'
update public.admin_audit_logs set action = 'tampered' where target_id = '1111';

\echo ''
\echo '--- T38: delete from admin audit logs (must ERROR - immutable) ---'
delete from public.admin_audit_logs where target_id = '1111';

\echo ''
\echo '--- T34: attacker tries to write idempotency keys directly (must ERROR) ---'
insert into public.idempotency_keys (user_id, key, feature_id, payload_hash, response_status, response_body)
values ('22222222-2222-2222-2222-222222222222', 'k1', 'export', 'h1', 200, '{}'::jsonb);

reset role;
\echo ''
\echo '=============================================================='
\echo 'Acting as an ANONYMOUS visitor (not logged in)'
\echo '=============================================================='
set role anon;
select set_config('request.jwt.claim.sub', '', false);

\echo ''
\echo '--- T20: anon reads profiles  (must be 0 rows) ---'
select count(*) as rows_visible from public.profiles;

\echo ''
\echo '--- T21: anon reads projects  (must be 0 rows) ---'
select count(*) as rows_visible from public.projects;

\echo ''
\echo '--- T22: anon reads feature flags  (SHOULD work - app needs them) ---'
select count(*) as flags_visible from public.feature_flags;

\echo ''
\echo '--- T35: anon reads published templates (SHOULD SUCCEED = 1) ---'
select count(*) as published_templates from public.templates;

\echo ''
\echo '--- T36: anon reads draft template (must be 0 rows) ---'
select count(*) as anon_draft from public.templates where id = 'draft-experiment-ws';

reset role;
\echo ''
\echo '=============================================================='
\echo 'Acting as the SERVER (service_role) — the webhook'
\echo '=============================================================='
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);

\echo ''
\echo '--- T23: server grants pro after a verified payment  (SHOULD SUCCEED) ---'
update public.profiles set tier = 'pro'
 where id = '22222222-2222-2222-2222-222222222222';
select id, tier from public.profiles
 where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '--- T24: server sees every row  (SHOULD be 2) ---'
select count(*) as all_profiles from public.profiles;

reset role;

\echo ''
\echo '=============================================================='
\echo 'GDPR: erasure must not destroy financial records'
\echo '=============================================================='
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', false);

\echo ''
\echo '--- T25: anonymise a subscription (SHOULD SUCCEED) ---'
insert into public.subscriptions
  (user_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, status, tier)
values ('11111111-1111-1111-1111-111111111111','sub_gdpr','cus_gdpr','price_pro','active','pro')
on conflict do nothing;
update public.subscriptions
   set user_id = null, stripe_customer_id = 'deleted'
 where stripe_subscription_id = 'sub_gdpr';

\echo ''
\echo '--- T26: the financial row survives with no owner (SHOULD be 1) ---'
select count(*) as orphaned_but_kept from public.subscriptions
 where stripe_subscription_id = 'sub_gdpr' and user_id is null;

\echo ''
\echo '--- T27/T28 (auth.users deletion) need admin rights and are covered by
--- run-rls-tests.sh's dedicated GDPR section, which runs as postgres.

reset role;
