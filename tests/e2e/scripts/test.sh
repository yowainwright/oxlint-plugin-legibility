#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/oxlint-legibility-e2e.XXXXXX")"
OUTPUT_FILE="$WORK_DIR/oxlint.json"
TARGET_FILE="$WORK_DIR/readability.ts"
CONFIG_FILE="tests/fixtures/oxlint/default/oxlint.config.ts"
OXLINT_BIN="node_modules/.bin/oxlint"

cleanup() {
  rm -rf "$WORK_DIR"
}

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  if [[ -f "$OUTPUT_FILE" ]]; then
    cat "$OUTPUT_FILE"
  fi
  exit 1
}

assert_file_exists() {
  local file="$1"
  local label="$2"

  if [[ -f "$file" ]]; then
    pass "$label"
    return
  fi

  printf 'Expected file: %s\n' "$file"
  fail "$label"
}

assert_output_contains() {
  local expected="$1"
  local label="$2"

  if grep -Fq "$expected" "$OUTPUT_FILE"; then
    pass "$label"
    return
  fi

  fail "$label"
}

assert_plugin_imports() {
  if node --input-type=module <<'NODE'; then
const pluginModule = await import("oxlint-plugin-legibility");
const plugin = pluginModule.default;
const hasRule = Boolean(plugin?.rules?.["max-function-parameters"]);
const hasPreset = Boolean(plugin?.configs?.recommended);
process.exit(hasRule && hasPreset ? 0 : 1);
NODE
    pass "installed package imports"
    return
  fi

  fail "installed package imports"
}

write_target_file() {
  cat >"$TARGET_FILE" <<'TS'
export function read(first, second, third, fourth, fifth) {
  return first + second + third + fourth + fifth;
}
TS
}

assert_oxlint_reports_plugin_rule() {
  if "$OXLINT_BIN" --disable-nested-config --config "$CONFIG_FILE" --format json "$TARGET_FILE" >"$OUTPUT_FILE" 2>&1; then
    fail "oxlint reports plugin diagnostics"
  fi

  assert_output_contains "legibility(max-function-parameters)" "oxlint reports plugin rule id"
}

trap cleanup EXIT

assert_file_exists "$OXLINT_BIN" "oxlint binary exists"
assert_file_exists "$CONFIG_FILE" "oxlint fixture config exists"
assert_plugin_imports
write_target_file
assert_oxlint_reports_plugin_rule
