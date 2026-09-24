#!/usr/bin/env bash
# Stop hook: run lint and typecheck at the end of every agent turn.
# Failure -> exit 2, the output goes back to the agent, which fixes it before stopping.
# If this turn already was a continuation forced by this hook and it still fails,
# exit 1: the failure stays visible in the transcript and the loop ends.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 1

input=$(cat)
already_active=$(printf '%s' "$input" | node -e '
  let data = "";
  process.stdin.on("data", (chunk) => { data += chunk; });
  process.stdin.on("end", () => {
    try { process.stdout.write(JSON.parse(data).stop_hook_active === true ? "yes" : "no"); }
    catch { process.stdout.write("no"); }
  });
')

output=$(pnpm lint 2>&1 && pnpm typecheck 2>&1)
status=$?
if [ "$status" -eq 0 ]; then
  exit 0
fi

printf '%s\n' "$output" >&2
if [ "$already_active" = "yes" ]; then
  echo "pnpm lint or pnpm typecheck still fails after a hook-driven retry." >&2
  exit 1
fi
echo "pnpm lint or pnpm typecheck failed. Fix every error before you stop." >&2
exit 2
