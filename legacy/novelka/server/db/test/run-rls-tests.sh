#!/usr/bin/env bash
# ============================================================================
# RLS attack suite.
#
# Spins up a throwaway PostgreSQL, applies schema.sql, and runs every attack a
# malicious signed-in user would actually try. Asserts the exact expected
# outcome for all 24 cases — both the attacks that must fail AND the legitimate
# actions that must still work.
#
#   ./run-rls-tests.sh                     # uses a local temp cluster
#   PGPORT=5433 ./run-rls-tests.sh         # or point at a running one
#
# Requires: a postgres server binary. On a machine with postgres installed this
# is just `psql`/`pg_ctl` on PATH.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCHEMA="$HERE/../schema.sql"
PORT="${PGPORT:-5433}"
SOCK="${PGSOCK:-/tmp}"
DB=gp_rls_test

PSQL_ADMIN=(psql -h "$SOCK" -p "$PORT" -U postgres -q)
PSQL_CLIENT=(psql -h "$SOCK" -p "$PORT" -U authenticator -d "$DB")

echo "→ resetting $DB"
"${PSQL_ADMIN[@]}" -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null 2>&1 || {
  echo "FATAL: cannot reach postgres on $SOCK:$PORT"; exit 1; }

echo "→ applying supabase mock (auth.uid, anon/authenticated/service_role)"
"${PSQL_ADMIN[@]}" -d "$DB" -f "$HERE/00-supabase-mock.sql" >/dev/null 2>&1

echo "→ applying schema.sql"
if ! "${PSQL_ADMIN[@]}" -v ON_ERROR_STOP=1 -d "$DB" -f "$SCHEMA" >/tmp/rls-schema.log 2>&1; then
  echo "FATAL: schema failed to apply"; tail -20 /tmp/rls-schema.log; exit 1
fi

# PostgREST roles need table grants; RLS then narrows them to the right rows.
"${PSQL_ADMIN[@]}" -d "$DB" -c "
  grant select,insert,update,delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant all on all tables in schema public to service_role;
  grant all on all sequences in schema public to authenticated, service_role;" >/dev/null 2>&1

echo "→ seeding a victim and an attacker"
"${PSQL_ADMIN[@]}" -d "$DB" -f "$HERE/01-seed.sql" >/dev/null 2>&1

echo "→ running attacks as the untrusted 'authenticator' role"
OUT=$("${PSQL_CLIENT[@]}" -f "$HERE/02-attack.sql" 2>&1)

pass=0; fail=0
# expect_fail <test-id> : the block must have errored or affected 0 rows
expect_fail() {
  local id="$1"
  local body
  body=$(awk "/--- $id:/{f=1;next} /--- T[0-9]+:/{f=0} f" <<<"$OUT")
  if grep -qE "ERROR:|UPDATE 0|DELETE 0|INSERT 0 0" <<<"$body"; then
    echo "  PASS  $id blocked"; ((pass++))
  else
    echo "  FAIL  $id WAS NOT BLOCKED"; echo "$body" | head -3; ((fail++))
  fi
}
# expect_rows <test-id> <n>
expect_rows() {
  local id="$1" want="$2" body got
  body=$(awk "/--- $id:/{f=1;next} /--- T[0-9]+:/{f=0} f" <<<"$OUT")
  got=$(grep -oE "^ +[0-9]+" <<<"$body" | head -1 | tr -d ' ')
  if [ "${got:-x}" = "$want" ]; then
    echo "  PASS  $id returned $want"; ((pass++))
  else
    echo "  FAIL  $id returned '${got:-none}', expected $want"; ((fail++))
  fi
}
# expect_ok <test-id> : a legitimate action that must succeed
expect_ok() {
  local id="$1" body
  body=$(awk "/--- $id:/{f=1;next} /--- T[0-9]+:/{f=0} f" <<<"$OUT")
  if grep -qE "UPDATE 1|INSERT 0 1" <<<"$body" && ! grep -q "ERROR:" <<<"$body"; then
    echo "  PASS  $id succeeded (as it should)"; ((pass++))
  else
    echo "  FAIL  $id should have succeeded"; echo "$body" | head -3; ((fail++))
  fi
}

echo ""
echo "── isolation: can the attacker see other people's data? ──"
expect_rows T1 0        # another user's profile
expect_rows T2 1        # only own profile
expect_rows T3 0        # victim's book
expect_rows T10 0       # victim's subscriptions
expect_rows T16 0       # webhook ledger

echo ""
echo "── privilege escalation: can they pay themselves? ──"
expect_fail T4          # self-upgrade to pro
expect_fail T5          # make self owner
expect_fail T6          # steal stripe customer id
expect_fail T9          # forge a subscription
expect_fail T13         # open a paid feature to everyone
expect_fail T14         # raise own daily limit
expect_fail T15         # call consume_quota directly

echo ""
echo "── tampering with other users ──"
expect_fail T7          # rename the victim
expect_fail T17         # plant a project on the victim
expect_fail T18         # delete the victim's project

echo ""
echo "── quota evasion ──"
expect_fail T11         # wipe own usage counter
expect_fail T12         # insert fake usage

echo ""
echo "── anonymous visitors ──"
expect_rows T20 0       # profiles hidden
expect_rows T21 0       # projects hidden
expect_rows T22 1       # feature flags readable (the app needs them)

echo ""
echo "── templates & admin audit logs ──"
expect_rows T29 1       # attacker sees only published template
expect_rows T30 0       # draft template hidden from normal user
expect_fail T31         # normal user cannot insert template
expect_fail T32         # normal user cannot read admin audit logs
expect_fail T33         # normal user cannot write admin audit logs
expect_fail T37         # updating audit logs is prohibited
expect_fail T38         # deleting audit logs is prohibited
expect_fail T34         # normal user cannot write idempotency keys directly
expect_rows T35 1       # anon sees published templates
expect_rows T36 0       # anon cannot see draft templates

echo ""
echo "── legitimate actions must still work ──"
expect_ok T8            # rename self
expect_ok T19           # create own project
expect_ok T23           # server grants pro after verified payment
expect_rows T24 2       # server sees all rows

echo ""
echo "── GDPR: erasure must not destroy financial records ──"
GDPR=$("${PSQL_ADMIN[@]}" -d "$DB" -t -A <<'SQL'
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','gdpr@x.com')
  on conflict do nothing;
insert into public.projects (user_id, name) values ('33333333-3333-3333-3333-333333333333','Book');
insert into public.subscriptions (user_id, stripe_subscription_id, stripe_customer_id, stripe_price_id, status, tier)
  values ('33333333-3333-3333-3333-333333333333','sub_g','cus_g','price_pro','active','pro');
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';
select
  (select count(*) from public.subscriptions where stripe_subscription_id='sub_g')::text
  || ',' ||
  (select count(*) from public.subscriptions where stripe_subscription_id='sub_g' and user_id is null)::text
  || ',' ||
  (select count(*) from public.projects where user_id='33333333-3333-3333-3333-333333333333')::text;
SQL
)
GDPR=$(echo "$GDPR" | tr -d '[:space:]' | tail -c 8)
if [ "$GDPR" = "1,1,0" ]; then
  echo "  PASS  invoice retained, anonymised, and the user's books are gone"; ((pass++))
else
  echo "  FAIL  expected 1,1,0 got '$GDPR' (retained,anonymised,projects-left)"; ((fail++))
fi

echo ""
echo "──────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  echo "ALL RLS TESTS PASSED  ($pass checks)"
  exit 0
else
  echo "$pass passed, $fail FAILED"
  exit 1
fi
