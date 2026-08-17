-- Recreate just enough of Supabase to test our policies honestly:
-- an auth.users table, the auth.uid() function, and the anon/authenticated/
-- service_role roles with the same grants Supabase gives them.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase reads the user id out of the request JWT claims.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on sequences to service_role, authenticated;

-- Real Supabase connects as a NON-superuser 'authenticator' role and then
-- SET ROLE's to anon/authenticated/service_role. Testing as postgres (a
-- superuser) is not faithful and hides bugs. Model it properly.
do $$ begin create role authenticator noinherit login password 'x'; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public, auth to authenticator;
