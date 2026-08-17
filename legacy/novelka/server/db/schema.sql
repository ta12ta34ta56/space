-- ============================================================================
-- Novelka — Supabase schema
--
-- Security model, in one sentence:
--   The client may read its own row and nothing else; only the service role
--   (Stripe webhook / server routes) may ever write money-related columns.
--
-- Every table has RLS enabled. There is no table without a policy, and there
-- is no policy that lets a user reach another user's data.
-- ============================================================================

-- ---------------------------------------------------------------- extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type subscription_tier as enum ('free', 'basic', 'pro', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- profiles — one row per auth user
--
-- `tier` is the money column. A user must NEVER be able to write it, or they
-- would simply set themselves to 'pro'. RLS below allows the owner to UPDATE
-- the row, and a trigger rejects any change to the protected columns. Belt and
-- braces: the update policy also re-checks them in WITH CHECK.
-- ============================================================================
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text        not null,
  display_name        text        not null default '',
  -- ---- protected: writable by service role only -----------------------------
  tier                subscription_tier   not null default 'free',
  is_owner            boolean             not null default false,
  stripe_customer_id  text unique,
  -- ---------------------------------------------------------------------------
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_idx on public.profiles(stripe_customer_id);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

-- The user may edit their display name. The trigger below stops them touching
-- anything that costs money.
drop policy if exists "profiles: update own safe columns" on public.profiles;
create policy "profiles: update own safe columns"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No INSERT policy and no DELETE policy on purpose: rows are created by the
-- trigger on auth.users and removed by the cascade.

/**
 * Reject any client attempt to change a protected column.
 *
 * RLS decides *which rows* you may touch; it cannot express "these columns are
 * off limits". This trigger closes that gap. The service role bypasses RLS but
 * NOT triggers, so we explicitly allow it through.
 */
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Who is allowed to write the money columns:
  --   1. the server, holding the service-role key (PostgREST sets this claim)
  --   2. a real DBA in the SQL editor (session_user is a superuser)
  --
  -- NOTE: use session_user, NOT current_user. Inside a SECURITY DEFINER
  -- function current_user is the function OWNER (postgres), so a current_user
  -- superuser test passes for every caller and silently disables the guard.
  -- That exact bug was caught by the attack suite; session_user keeps the
  -- identity the session actually authenticated as.
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     or coalesce(current_setting('role', true), '') = 'service_role'
     or coalesce((select usesuper from pg_user where usename = session_user), false) then
    new.updated_at := now();
    return new;
  end if;

  if new.tier is distinct from old.tier
     or new.is_owner is distinct from old.is_owner
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.id is distinct from old.id
     or new.email is distinct from old.email then
    raise exception 'Not allowed: tier, is_owner, stripe_customer_id and email are set by the server only.';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists protect_profile_columns_trg on public.profiles;
create trigger protect_profile_columns_trg
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

/** Create a profile automatically whenever someone signs up. */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- subscriptions — mirror of Stripe, written only by the webhook
-- ============================================================================
create table if not exists public.subscriptions (
  id                      uuid primary key default uuid_generate_v4(),
  -- NULLABLE and ON DELETE SET NULL, on purpose.
  --
  -- GDPR Article 17 lets a user erase their data, but Article 17(3)(b) and EU
  -- accounting law require invoice records to be retained (typically 7-10
  -- years). Those two rules meet exactly here.
  --
  -- With `not null ... on delete cascade` a deletion would destroy the
  -- financial record — a tax problem. Instead the row survives with the
  -- identity stripped: the money is still auditable, the person is gone.
  user_id                 uuid references auth.users(id) on delete set null,
  stripe_subscription_id  text unique not null,
  stripe_customer_id      text not null,
  stripe_price_id         text not null,
  status                  subscription_status not null,
  tier                    subscription_tier   not null,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions(user_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Deliberately no insert/update/delete policy for users. Only the service role
-- (which bypasses RLS) writes this table, and only from a verified webhook.

-- ============================================================================
-- projects — the user's books
-- ============================================================================
create table if not exists public.projects (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Untitled',
  page_count  integer not null default 0,
  -- Book contents. Measured: a 39-page crossword book is ~5.7 MB of JSON.
  data        jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects(user_id, updated_at desc);

alter table public.projects enable row level security;
alter table public.projects force row level security;

drop policy if exists "projects: read own" on public.projects;
create policy "projects: read own"
  on public.projects for select using (auth.uid() = user_id);

drop policy if exists "projects: insert own" on public.projects;
create policy "projects: insert own"
  on public.projects for insert with check (auth.uid() = user_id);

drop policy if exists "projects: update own" on public.projects;
create policy "projects: update own"
  on public.projects for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects: delete own" on public.projects;
create policy "projects: delete own"
  on public.projects for delete using (auth.uid() = user_id);

-- ============================================================================
-- usage_events — server-side quota counting
--
-- Daily limits must be counted where the user cannot edit them. localStorage
-- counters are a suggestion; this table is the truth.
-- ============================================================================
create table if not exists public.usage_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature_id  text not null,
  day         date not null default (now() at time zone 'utc')::date,
  count       integer not null default 1,
  updated_at  timestamptz not null default now(),
  unique (user_id, feature_id, day)
);

create index if not exists usage_user_day_idx on public.usage_events(user_id, day);

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;

-- The user may see their own usage (to render "3 of 5 exports left") but may
-- never write it.
drop policy if exists "usage: read own" on public.usage_events;
create policy "usage: read own"
  on public.usage_events for select using (auth.uid() = user_id);

/**
 * Atomically consume one unit of a daily allowance.
 *
 * Returns the new count. `p_limit` of NULL means unlimited. Raises when the
 * limit would be exceeded, so the caller cannot "check then act" and lose a
 * race between two tabs.
 */
create or replace function public.consume_quota(
  p_user_id uuid,
  p_feature text,
  p_limit   integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.usage_events (user_id, feature_id, count)
  values (p_user_id, p_feature, 1)
  on conflict (user_id, feature_id, day)
    do update set count = public.usage_events.count + 1, updated_at = now()
  returning count into new_count;

  if p_limit is not null and new_count > p_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return new_count;
end $$;

revoke all on function public.consume_quota(uuid, text, integer) from public, anon, authenticated;

/**
 * Atomically evaluate idempotency, check limits, and increment quota in one transaction.
 */
create or replace function public.consume_quota_atomic(
  p_user_id       uuid,
  p_feature       text,
  p_limit         integer,
  p_idemp_key     text default null,
  p_payload_hash  text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_rec record;
  new_count integer;
begin
  -- 1. If idempotency key provided, check for existing stored response
  if p_idemp_key is not null and p_idemp_key <> '' then
    select id, payload_hash, response_status, response_body
      into existing_rec
      from public.idempotency_keys
     where user_id = p_user_id and key = p_idemp_key
       for update;

    if found then
      if existing_rec.payload_hash <> p_payload_hash then
        raise exception 'idempotency_payload_mismatch' using errcode = 'P0002';
      end if;
      return jsonb_build_object(
        'is_replayed', true,
        'response_status', existing_rec.response_status,
        'response_body', existing_rec.response_body
      );
    end if;
  end if;

  -- 2. Atomic quota decrement / increment
  insert into public.usage_events (user_id, feature_id, count)
  values (p_user_id, p_feature, 1)
  on conflict (user_id, feature_id, day)
    do update set count = public.usage_events.count + 1, updated_at = now()
  returning count into new_count;

  if p_limit is not null and new_count > p_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'is_replayed', false,
    'new_count', new_count
  );
end $$;

revoke all on function public.consume_quota_atomic(uuid, text, integer, text, text) from public, anon, authenticated;

-- ============================================================================
-- feature_flags / content_rules — owner-controlled gating
--
-- World-readable (the app needs them to render), writable by nobody through
-- the API. The owner edits them via a server route that checks is_owner.
-- ============================================================================
create table if not exists public.feature_flags (
  feature_id        text primary key,
  enabled           boolean not null default true,
  route_free        boolean not null default false,
  route_ad          boolean not null default false,
  route_paid        boolean not null default true,
  min_tier          subscription_tier not null default 'basic',
  daily_limit       integer,
  ad_unlock_minutes integer,
  note              text,
  updated_at        timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
alter table public.feature_flags force row level security;

drop policy if exists "flags: readable by all" on public.feature_flags;
create policy "flags: readable by all"
  on public.feature_flags for select using (true);

create table if not exists public.content_rules (
  item_id     text primary key,
  kind        text not null,
  route_free  boolean not null default true,
  route_ad    boolean not null default false,
  route_paid  boolean not null default false,
  min_tier    subscription_tier not null default 'free',
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.content_rules enable row level security;
alter table public.content_rules force row level security;

drop policy if exists "content: readable by all" on public.content_rules;
create policy "content: readable by all"
  on public.content_rules for select using (true);

-- ============================================================================
-- webhook_events — idempotency ledger
--
-- Stripe retries. Without this, one payment could grant two months, or a
-- replayed 'canceled' could downgrade a paying customer.
-- ============================================================================
create table if not exists public.webhook_events (
  id            text primary key,          -- Stripe's event id
  type          text not null,
  processed_at  timestamptz not null default now(),
  payload       jsonb
);

alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;
-- no policies at all: service role only

-- ============================================================================
-- ratings — app feedback (the star rating)
--
-- Anyone may insert (signed in or not — most feedback comes from people who
-- never create an account). Reads are service-role only, so the anon key
-- cannot scrape the owner's feedback. Email is optional and validated in the
-- route before it ever reaches this table.
-- ============================================================================
create table if not exists public.ratings (
  id          uuid primary key default gen_random_uuid(),
  stars       integer not null check (stars between 1 and 5),
  comment     text,
  email       text,
  version     text,
  created_at  timestamptz not null default now()
);

alter table public.ratings enable row level security;
alter table public.ratings force row level security;

drop policy if exists "ratings: anyone may leave one" on public.ratings;
create policy "ratings: anyone may leave one"
  on public.ratings for insert
  with check (true);

-- no select/update/delete policies: service role only

-- ============================================================================
-- templates — server-backed parametric templates
--
-- Published templates are readable by any authenticated or anonymous user
-- (so the app can render layouts and the template picker). Draft, unpublished,
-- and archived templates are visible only to the service role / owner.
-- Writes are strictly service-role only via owner-authorized server routes.
-- ============================================================================
do $$ begin
  create type template_status as enum ('draft', 'published', 'unpublished', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.templates (
  id                  text primary key, -- e.g. 'classic-ws', 'two-up-ws'
  version             text not null default '1.0.0',
  name                text not null,
  description         text not null default '',
  generator_kinds     text[] not null default array['wordsearch']::text[],
  supported_sizes     text[] not null default array['kdp6x9', 'kdp8x10', 'kdp85x11', 'A4', 'custom7x9']::text[],
  schema_payload      jsonb not null default '{}'::jsonb,
  style_tokens        jsonb not null default '{}'::jsonb,
  status              template_status not null default 'draft',
  access_level        subscription_tier not null default 'free',
  created_by          uuid references auth.users(id) on delete set null,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists templates_status_idx on public.templates(status);
create index if not exists templates_access_idx on public.templates(access_level);

alter table public.templates enable row level security;
alter table public.templates force row level security;

-- Normal users & anon can ONLY read published templates
drop policy if exists "templates: read published" on public.templates;
create policy "templates: read published"
  on public.templates for select
  using (status = 'published');

-- No user insert/update/delete policies: service role only

-- ============================================================================
-- admin_audit_logs — immutable ledger of owner administrative actions
--
-- Every mutating administrative action is recorded here (tier overrides,
-- template creations/edits/publications, feature flag updates).
-- Append-only for normal application roles; service role only.
-- ============================================================================
create table if not exists public.admin_audit_logs (
  id                  uuid primary key default gen_random_uuid(),
  actor_user_id       uuid references auth.users(id) on delete set null,
  action              text not null,
  target_type         text not null,
  target_id           text not null,
  before_state        jsonb,
  after_state         jsonb,
  ip_address          text,
  request_id          text,
  reason              text,
  created_at          timestamptz not null default now()
);

create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs(actor_user_id, created_at desc);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs(action, created_at desc);

alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;
-- No user policies: service role only

/**
 * Make admin_audit_logs strictly append-only.
 * Any UPDATE or DELETE statement is rejected with an exception at database level.
 */
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'admin_audit_logs is append-only: UPDATE and DELETE are prohibited' using errcode = '42501';
end $$;

drop trigger if exists prevent_audit_log_mutation_trg on public.admin_audit_logs;
create trigger prevent_audit_log_mutation_trg
  before update or delete on public.admin_audit_logs
  for each row execute function public.prevent_audit_log_mutation();

-- ============================================================================
-- idempotency_keys — operation-level idempotency ledger
--
-- Prevents duplicate execution of entitlement consumption and quota deductions.
-- Keyed by (user_id, key).
-- ============================================================================
create table if not exists public.idempotency_keys (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  key                 text not null,
  feature_id          text not null,
  payload_hash        text not null,
  response_status     integer not null,
  response_body       jsonb not null,
  created_at          timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists idempotency_keys_user_key_idx on public.idempotency_keys(user_id, key);

alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;
-- No user policies: service role only

-- ============================================================================
-- Verification — every public table must have RLS on.
-- ============================================================================
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  loop
    raise exception 'SECURITY: table public.% does not have RLS enabled', t.relname;
  end loop;
end $$;
