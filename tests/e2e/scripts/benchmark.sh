#!/usr/bin/env bash
set -euo pipefail

FIXTURES="tests/e2e/fixtures/benchmark"

run_once() {
	local engine="$1"
	local status=0
	local config="$FIXTURES/$engine.config.mjs"
	if [[ "$engine" == "oxlint" ]]; then
		node_modules/.bin/oxlint --disable-nested-config --threads=1 --no-ignore \
			--config "$config" --format json "$BENCHMARK_TARGET_DIR"/*.js || status=$?
	else
		node_modules/.bin/eslint --no-config-lookup --no-ignore \
			--config "$config" --format json "$BENCHMARK_TARGET_DIR"/*.js || status=$?
	fi
	if [[ "$status" -gt 1 ]]; then
		return "$status"
	fi
}

if [[ "$#" -gt 0 ]]; then
	case "$1" in
	oxlint | legibility | unicorn | sonarjs) run_once "$1" ;;
	*)
		printf 'Unknown benchmark: %s\n' "$1" >&2
		exit 1
		;;
	esac
	exit
fi

ITERATIONS="${BENCHMARK_ITERATIONS:-20}"
if [[ ! "$ITERATIONS" =~ ^[1-9][0-9]*$ ]] || [[ "$ITERATIONS" -lt 2 ]]; then
	printf 'BENCHMARK_ITERATIONS must be an integer of at least 2\n' >&2
	exit 1
fi

mkdir -p tmp
WORK_DIR="$(mktemp -d "tmp/oxlint-legibility-benchmark.XXXXXX")"
export BENCHMARK_TARGET_DIR="$WORK_DIR/src"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$BENCHMARK_TARGET_DIR"

for index in $(seq 1 50); do
	cp "$FIXTURES/workload.txt" "$BENCHMARK_TARGET_DIR/readability-$index.js"
done

for engine in oxlint legibility unicorn sonarjs; do
	run_once "$engine" >"$WORK_DIR/$engine.json"
done
node "$FIXTURES/verify.mjs" "$WORK_DIR"

hyperfine --warmup 3 --runs "$ITERATIONS" --time-unit millisecond \
	--export-json "$WORK_DIR/results.json" --export-markdown "$WORK_DIR/results.md" \
	--command-name oxlint-plugin-legibility 'bash tests/e2e/scripts/benchmark.sh oxlint' \
	--command-name eslint-plugin-legibility 'bash tests/e2e/scripts/benchmark.sh legibility' \
	--command-name eslint-plugin-unicorn 'bash tests/e2e/scripts/benchmark.sh unicorn' \
	--command-name eslint-plugin-sonarjs 'bash tests/e2e/scripts/benchmark.sh sonarjs'

cat "$WORK_DIR/results.md"
node "$FIXTURES/verify.mjs" "$WORK_DIR" results
