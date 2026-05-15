#!/usr/bin/env bash
#
# F01 Preview Integration Tests
#
# Run end-to-end curl tests against the Vercel preview deployment for the
# qurban/f01-auth-multi-user branch. Bypasses Vercel Deployment Protection
# via the `x-vercel-protection-bypass` header.
#
# Usage:
#   1. cp scripts/.env.test.local.example scripts/.env.test.local
#   2. Fill in PREVIEW_URL, VERCEL_BYPASS_TOKEN, HOPY_PHONE, HOPY_PIN.
#   3. bash scripts/test-f01-preview.sh
#
# Exit code: 0 if all tests pass, 1 if any fail.
#
# Test matrix (per Milestone D acceptance):
#   #1  legacy fallback     (bogus telepon + master.pin_hash PIN)
#   #2  multi-user login    (Hopy telepon + PIN)
#   #3  SA can list anggota
#   #4  SA creates dummy BENDAHARA
#   #5  dummy BENDAHARA can log in
#   #6  BENDAHARA blocked from /api/pengaturan/anggota (403)
#   #7  BENDAHARA can access /api/transaksi (existing SKM, session-only)
#   #8  /api/nonexistent → 404 (middleware passes, handler missing)
#   #9  logout + re-login as SA
#   #10 cookie attributes (HttpOnly, Secure, SameSite=Lax, Max-Age=43200)
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.test.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Copy scripts/.env.test.local.example to scripts/.env.test.local and fill values."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

for var in PREVIEW_URL VERCEL_BYPASS_TOKEN HOPY_PHONE HOPY_PIN; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var not set in $ENV_FILE"
    exit 1
  fi
done

PREVIEW_URL="${PREVIEW_URL%/}"

# ─── temp files ──────────────────────────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
SA_COOKIES="$TMP_DIR/sa.cookies"
BENDAHARA_COOKIES="$TMP_DIR/bendahara.cookies"
BODY_FILE="$TMP_DIR/body"
HEADERS_FILE="$TMP_DIR/headers"
trap 'rm -rf "$TMP_DIR"' EXIT

# Working state shared by do_request → tests
status=""
body=""
headers=""

# ─── helpers ─────────────────────────────────────────────────────────────────

# do_request <method> <path> [<curl-args>...]
# Sets $status, $body, $headers. Includes the bypass header automatically.
do_request() {
  local method="$1"; shift
  local path="$1"; shift
  status="$(curl -s -o "$BODY_FILE" -D "$HEADERS_FILE" \
    -w '%{http_code}' \
    -X "$method" \
    -H "x-vercel-protection-bypass: $VERCEL_BYPASS_TOKEN" \
    "$@" \
    "$PREVIEW_URL$path")"
  body="$(cat "$BODY_FILE" 2>/dev/null || echo "")"
  headers="$(cat "$HEADERS_FILE" 2>/dev/null || echo "")"
}

PASS=0
FAIL=0

pass() {
  echo "  ✓ $1"
  PASS=$((PASS+1))
}

fail() {
  echo "  ✗ $1"
  FAIL=$((FAIL+1))
}

assert_status() {
  local expected="$1" name="$2"
  if [[ "$status" == "$expected" ]]; then
    pass "$name (status $status)"
  else
    fail "$name — expected $expected, got $status"
    echo "      body: ${body:0:300}"
  fi
}

assert_status_in() {
  # assert_status_in "200|201|204" "name"
  local allowed="$1" name="$2"
  if [[ "$status" =~ ^($allowed)$ ]]; then
    pass "$name (status $status)"
  else
    fail "$name — expected one of $allowed, got $status"
    echo "      body: ${body:0:300}"
  fi
}

assert_body_contains() {
  local needle="$1" name="$2"
  if [[ "$body" == *"$needle"* ]]; then
    pass "$name"
  else
    fail "$name — '$needle' not in body"
    echo "      body: ${body:0:300}"
  fi
}

assert_header_contains() {
  local needle="$1" name="$2"
  if [[ "$headers" == *"$needle"* ]]; then
    pass "$name"
  else
    fail "$name — '$needle' not in headers"
  fi
}

# ─── go ──────────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════════"
echo "  F01 Preview Integration Tests"
echo "  URL: $PREVIEW_URL"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ============================================================================
# Test #2 — multi-user login (run first so we have SA cookie for #3, #4)
# ============================================================================
echo "[#2] SA multi-user login — POST /api/auth/login"
do_request POST /api/auth/login \
  -H "Content-Type: application/json" \
  -c "$SA_COOKIES" \
  --data-raw "{\"telepon\":\"$HOPY_PHONE\",\"pin\":\"$HOPY_PIN\"}"
assert_status 200 "#2 login 200"
assert_body_contains '"ok":true' "#2 envelope ok=true"
assert_body_contains 'SUPER_ADMIN' "#2 peran=SUPER_ADMIN"

if [[ -f "$SA_COOKIES" ]] && grep -q "skm_session" "$SA_COOKIES"; then
  pass "#2 SA cookie captured"
else
  fail "#2 SA cookie NOT captured"
fi
echo ""

# ============================================================================
# Test #10 — cookie attributes (use #2 response headers)
# ============================================================================
echo "[#10] Cookie attributes — HttpOnly, Secure, SameSite=Lax, Max-Age"
# Pull just the skm_session Set-Cookie line for attribute inspection.
# Per RFC 6265bis, cookie attribute names AND SameSite values are
# case-insensitive. Next.js cookies API emits `SameSite=lax` (lowercase)
# because its TypeScript types accept only 'lax'|'strict'|'none' lowercase.
# Browsers handle any case identically — we normalize to lowercase before
# checking. Apply same convention to HttpOnly / Secure / Max-Age for
# consistency (Decision #16 in HANDOFF_SPRINT_F01.md).
set_cookie_line="$(printf '%s' "$headers" | grep -i '^set-cookie:.*skm_session' | head -1 || true)"
if [[ -n "$set_cookie_line" ]]; then
  sc_lower="$(printf '%s' "$set_cookie_line" | tr '[:upper:]' '[:lower:]')"
  [[ "$sc_lower" == *httponly* ]]      && pass "#10 HttpOnly"        || fail "#10 HttpOnly missing"
  [[ "$sc_lower" == *secure* ]]        && pass "#10 Secure"          || fail "#10 Secure missing (prod requires Secure)"
  [[ "$sc_lower" == *samesite=lax* ]]  && pass "#10 SameSite=Lax"    || fail "#10 SameSite=Lax missing"
  [[ "$sc_lower" == *max-age=43200* ]] && pass "#10 Max-Age=43200 (12h)" || fail "#10 Max-Age=43200 missing"
else
  fail "#10 no Set-Cookie: skm_session header in login response"
fi
echo ""

# ============================================================================
# Test #1 — legacy fallback (bogus telepon + Hopy PIN matches master.pin_hash)
# ============================================================================
echo "[#1] Legacy fallback — POST /api/auth/login {bogus_telepon, HOPY_PIN}"
do_request POST /api/auth/login \
  -H "Content-Type: application/json" \
  --data-raw "{\"telepon\":\"628000000000\",\"pin\":\"$HOPY_PIN\"}"
case "$status" in
  200)
    assert_body_contains '"id":"LEGACY"' "#1 legacy fallback engaged (user_id=LEGACY)"
    assert_body_contains 'SUPER_ADMIN' "#1 legacy peran=SUPER_ADMIN"
    ;;
  401)
    pass "#1 legacy fallback disabled (401) — QURBAN_LEGACY_LOGIN_ENABLED=false"
    ;;
  *)
    fail "#1 unexpected status $status (want 200 if legacy enabled, 401 if disabled)"
    echo "      body: ${body:0:300}"
    ;;
esac
echo ""

# ============================================================================
# Test #3 — SA access /api/pengaturan/anggota
# ============================================================================
echo "[#3] SA GET /api/pengaturan/anggota"
do_request GET /api/pengaturan/anggota -b "$SA_COOKIES"
assert_status 200 "#3 list anggota"
assert_body_contains '"ok":true' "#3 ok=true"
echo ""

# ============================================================================
# Test #4 — create dummy BENDAHARA via U2
# ============================================================================
echo "[#4] Create dummy BENDAHARA — POST /api/pengaturan/anggota"
# Unique telepon per run; 628 + 10-digit epoch fits ^628\d{8,12}$.
TEST_TELEPON="628$(date +%s)"
TEST_INITIAL_PIN="4729"   # strong: not sequential / all-same / blocklist
TEST_NAMA="Test BENDAHARA $(date +%s)"

do_request POST /api/pengaturan/anggota \
  -H "Content-Type: application/json" \
  -b "$SA_COOKIES" \
  --data-raw "{\"nama\":\"$TEST_NAMA\",\"telepon\":\"$TEST_TELEPON\",\"peran\":\"BENDAHARA\",\"initial_pin\":\"$TEST_INITIAL_PIN\"}"
assert_status 200 "#4 create BENDAHARA"
assert_body_contains '"peran":"BENDAHARA"' "#4 peran=BENDAHARA"

# Extract dummy id for #5 login + cleanup
DUMMY_ID="$(printf '%s' "$body" | sed -n 's/.*"id":"\(ANG-[^"]*\)".*/\1/p' | head -1)"
if [[ -n "$DUMMY_ID" ]]; then
  pass "#4 dummy id captured: $DUMMY_ID"
else
  fail "#4 could not extract dummy id from response"
fi
echo ""

# ============================================================================
# Test #5 — login as dummy BENDAHARA
# ============================================================================
echo "[#5] Login dummy BENDAHARA — POST /api/auth/login"
do_request POST /api/auth/login \
  -H "Content-Type: application/json" \
  -c "$BENDAHARA_COOKIES" \
  --data-raw "{\"telepon\":\"$TEST_TELEPON\",\"pin\":\"$TEST_INITIAL_PIN\"}"
assert_status 200 "#5 BENDAHARA login"
assert_body_contains '"peran":"BENDAHARA"' "#5 peran=BENDAHARA"
echo ""

# ============================================================================
# Test #6 — BENDAHARA blocked from /api/pengaturan/anggota → 403
# ============================================================================
echo "[#6] BENDAHARA blocked from /api/pengaturan/anggota"
do_request GET /api/pengaturan/anggota -b "$BENDAHARA_COOKIES"
assert_status 403 "#6 expect 403 FORBIDDEN_ROLE"
assert_body_contains 'FORBIDDEN_ROLE' "#6 code=FORBIDDEN_ROLE"
echo ""

# ============================================================================
# Test #7 — BENDAHARA can access existing SKM /api/transaksi (session-only)
# ============================================================================
echo "[#7] BENDAHARA accesses existing SKM /api/transaksi"
do_request GET /api/transaksi -b "$BENDAHARA_COOKIES"
# Middleware passes session-only routes through. Handler may return 200 (list)
# or any 2xx. We assert it's NOT 401/403 to confirm middleware behavior.
case "$status" in
  401|403)
    fail "#7 middleware should have let BENDAHARA through to /api/transaksi (got $status)"
    echo "      body: ${body:0:300}"
    ;;
  *)
    pass "#7 middleware lets BENDAHARA through (status $status)"
    ;;
esac
echo ""

# ============================================================================
# Test #8 — random non-existent API route → 404 (middleware passes through)
# ============================================================================
echo "[#8] Random API /api/nonexistent-foo-bar"
do_request GET /api/nonexistent-foo-bar -b "$SA_COOKIES"
assert_status 404 "#8 random API → 404 (Next handler missing)"
echo ""

# ============================================================================
# Test #9 — logout BENDAHARA, re-login as SA
# ============================================================================
echo "[#9] Logout BENDAHARA"
do_request POST /api/auth/logout -b "$BENDAHARA_COOKIES" -c "$BENDAHARA_COOKIES"
assert_status 200 "#9 logout 200"
assert_body_contains '"logged_out":true' "#9 logged_out=true"

echo "[#9b] Re-login as SA"
do_request POST /api/auth/login \
  -H "Content-Type: application/json" \
  -c "$SA_COOKIES" \
  --data-raw "{\"telepon\":\"$HOPY_PHONE\",\"pin\":\"$HOPY_PIN\"}"
assert_status 200 "#9b SA re-login"
assert_body_contains 'SUPER_ADMIN' "#9b SA peran restored"
echo ""

# ============================================================================
# Cleanup — deactivate the dummy created in #4 (best-effort)
# ============================================================================
if [[ -n "${DUMMY_ID:-}" ]]; then
  echo "[cleanup] Deactivate dummy $DUMMY_ID"
  do_request POST "/api/pengaturan/anggota/$DUMMY_ID/deactivate" -b "$SA_COOKIES"
  if [[ "$status" == "200" ]]; then
    echo "  ✓ dummy deactivated"
  else
    echo "  ⚠ cleanup did not return 200 (status $status). Manual deactivate may be needed:"
    echo "     $DUMMY_ID"
  fi
fi
echo ""

# ─── summary ─────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo "════════════════════════════════════════════════════════════════════"
echo "  Summary: $PASS / $TOTAL pass, $FAIL fail"
echo "════════════════════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
