#!/bin/sh

set -eu

usage() {
  echo "Usage: sh scripts/setup.sh [bootstrap|prepare|local-dev] [--dry-run]"
}

setup_git_hooks() {
  case "${CI:-}" in
  true | 1) return 0 ;;
  esac

  if [ "$dry_run" = "1" ]; then
    echo "Would run: sh scripts/hooks.sh"
    return 0
  fi

  sh scripts/hooks.sh
}

select_bash() {
  bash_path="$1"
  if [ ! -x "$bash_path" ]; then
    return 1
  fi

  if ! BASH_ENV=/dev/null "$bash_path" --noprofile --norc -c "[ \"\${BASH_VERSINFO[0]}\" -ge 5 ]"; then
    return 1
  fi

  PATH="${bash_path%/*}:$PATH"
  export PATH
}

find_bash() {
  if select_bash "$(command -v bash 2>/dev/null || true)"; then
    return 0
  fi

  if [ "$(uname -s)" != "Darwin" ]; then
    return 1
  fi

  select_bash /opt/homebrew/bin/bash || select_bash /usr/local/bin/bash
}

setup_bash() {
  if find_bash; then
    return 0
  fi
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "Bash 5 or later is required; automatic Bash provisioning is supported on macOS." >&2
    exit 1
  fi

  mise bootstrap packages apply brew:bash
  if find_bash; then
    return 0
  fi
  mise bootstrap packages upgrade brew:bash
  if ! find_bash; then
    echo "Bash provisioning did not provide Bash 5 or later." >&2
    exit 1
  fi
}

run_bootstrap() {
  if [ "$dry_run" = "1" ]; then
    echo "Would run: mise install node pnpm"
    echo "Would reuse Bash 5+ or provision it on macOS"
    echo "Would run: mise exec -- pnpm install"
    echo "Would run: mise exec -- pnpm run validate"
    return 0
  fi

  if ! command -v mise >/dev/null 2>&1; then
    echo "mise is required to provision development tools. Install mise, then retry." >&2
    exit 1
  fi

  mise install node pnpm
  setup_bash
  mise exec -- pnpm install
  mise exec -- pnpm run validate
}

run_prepare() {
  case "${npm_command:-}" in
  pack | publish) return 0 ;;
  esac

  setup_git_hooks
}

mode="bootstrap"
dry_run=0

if [ "$#" -gt 0 ]; then
  case "$1" in
  bootstrap | prepare | local-dev)
    mode="$1"
    shift
    ;;
  esac
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
  --dry-run)
    dry_run=1
    ;;
  --help | -h)
    usage
    exit 0
    ;;
  *)
    echo "Unknown argument: $1" >&2
    usage >&2
    exit 1
    ;;
  esac
  shift
done

case "$0" in
*/*) script_path=${0%/*} ;;
*) script_path=. ;;
esac

CDPATH=""
cd "$script_path/.."

case "$mode" in
bootstrap) run_bootstrap ;;
prepare) run_prepare ;;
local-dev) setup_git_hooks ;;
esac
