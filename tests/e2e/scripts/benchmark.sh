#!/usr/bin/env bash
set -euo pipefail

ITERATIONS="${BENCHMARK_ITERATIONS:-5}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/oxlint-legibility-benchmark.XXXXXX")"
TARGET_DIR="$WORK_DIR/src"
CONFIG_FILE="tests/fixtures/oxlint/strict/oxlint.config.ts"
OXLINT_BIN="node_modules/.bin/oxlint"

cleanup() {
  rm -rf "$WORK_DIR"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  exit 1
}

assert_file_exists() {
  local file="$1"
  local label="$2"

  if [[ -f "$file" ]]; then
    return
  fi

  printf 'Expected file: %s\n' "$file"
  fail "$label"
}

write_workload() {
  mkdir -p "$TARGET_DIR"

  for index in $(seq 1 50); do
    cat > "$TARGET_DIR/readability-$index.ts" <<'TS'
export function read(first, second, third, fourth, fifth) {
  const value = first ? second ? third : fourth : fifth;
  return value;
}
TS
  done
}

run_once() {
  "$OXLINT_BIN" --disable-nested-config --config "$CONFIG_FILE" --format json "$TARGET_DIR" > /dev/null 2>&1 || true
}

benchmark() {
  local start
  local end
  local elapsed

  start="$(node -e 'console.log(Date.now())')"
  for _ in $(seq 1 "$ITERATIONS"); do
    run_once
  done
  end="$(node -e 'console.log(Date.now())')"
  elapsed="$((end - start))"

  printf 'benchmark iterations=%s elapsed_ms=%s\n' "$ITERATIONS" "$elapsed"
}

trap cleanup EXIT

assert_file_exists "$OXLINT_BIN" "oxlint binary exists"
assert_file_exists "$CONFIG_FILE" "oxlint fixture config exists"
write_workload
benchmark
