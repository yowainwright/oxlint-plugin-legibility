#!/bin/sh

set -eu

managed_hook_marker="legibility-managed-hook"

is_unmanaged_hook() {
  hook_path="$1"
  [ -f "$hook_path" ] && ! grep -Fq "$managed_hook_marker" "$hook_path"
}

install_pre_commit_hook() {
  pre_commit_path="$hooks_directory/pre-commit"
  if is_unmanaged_hook "$pre_commit_path"; then
    return 0
  fi

  cat >"$pre_commit_path" <<'HOOK'
#!/bin/sh
# legibility-managed-hook

set -eu

repo_root="$(git rev-parse --show-toplevel)"
nub_path="$repo_root/node_modules/.bin/nub"

if [ ! -x "$nub_path" ]; then
  echo "Nub is not installed at $nub_path. Run nub install first." >&2
  exit 1
fi

"$nub_path" run validate
HOOK
  chmod 755 "$pre_commit_path"
}

install_commit_msg_hook() {
  commit_msg_path="$hooks_directory/commit-msg"
  if is_unmanaged_hook "$commit_msg_path"; then
    return 0
  fi

  cat >"$commit_msg_path" <<'HOOK'
#!/bin/sh
# legibility-managed-hook

set -eu

commit_msg_file="$1"
commit_msg="$(head -n 1 "$commit_msg_file")"

if ! printf '%s\n' "$commit_msg" | grep -Eq '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)([(][^)]+[)])?: .+'; then
  echo 'Invalid commit message format' >&2
  echo 'Expected format: <type>(<scope>): <message>' >&2
  echo 'Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert' >&2
  echo "Received: $commit_msg" >&2
  exit 1
fi
HOOK
  chmod 755 "$commit_msg_path"
}

install_post_merge_hook() {
  post_merge_path="$hooks_directory/post-merge"
  if is_unmanaged_hook "$post_merge_path"; then
    return 0
  fi

  cat >"$post_merge_path" <<'HOOK'
#!/bin/sh
# legibility-managed-hook

set -eu

changed_files="$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD || true)"
dependency_pattern='^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$'

if ! printf '%s\n' "$changed_files" | grep -Eq "$dependency_pattern"; then
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel)"
nub_path="$repo_root/node_modules/.bin/nub"

if [ ! -x "$nub_path" ]; then
  echo "Nub is not installed at $nub_path. Run nub install first." >&2
  exit 1
fi

echo "Dependencies changed; running nub install --frozen-lockfile"
"$nub_path" install --frozen-lockfile
HOOK
  chmod 755 "$post_merge_path"
}

ci="${CI:-}"
if [ "$ci" = "true" ] || [ "$ci" = "1" ]; then
  exit 0
fi

hooks_directory="$(git rev-parse --git-path hooks 2>/dev/null || true)"
if [ -z "$hooks_directory" ]; then
  exit 0
fi

mkdir -p "$hooks_directory"
install_pre_commit_hook
install_commit_msg_hook
install_post_merge_hook
