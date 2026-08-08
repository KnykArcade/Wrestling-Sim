#!/usr/bin/env bash

set -u

log() {
  printf '[Wrestling Sim] %s\n' "$1"
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  log "The repository could not be found, so automatic startup stopped."
  exit 1
}
cd "$repo_root" || exit 1

previous_lock="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"
current_branch="$(git branch --show-current 2>/dev/null || true)"
worktree_state="$(git status --porcelain 2>/dev/null || true)"

if [ "$current_branch" = "main" ] && [ -z "$worktree_state" ]; then
  log "Checking GitHub for the latest main version..."
  if git fetch --quiet origin main; then
    if git merge-base --is-ancestor HEAD origin/main; then
      if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
        git merge --ff-only --quiet origin/main
        log "Updated safely to the latest main version."
      else
        log "This Codespace already has the latest main version."
      fi
    else
      log "Automatic update skipped because this Codespace has commits that are not on GitHub main."
    fi
  else
    log "GitHub could not be reached. Starting the version already in this Codespace."
  fi
elif [ "$current_branch" = "main" ]; then
  log "Automatic update skipped because this Codespace contains uncommitted changes. Nothing was removed."
else
  log "Automatic update skipped because this Codespace is on branch '${current_branch:-detached}'."
fi

current_lock="$(git rev-parse HEAD:package-lock.json 2>/dev/null || true)"
dependencies_missing=false
if [ ! -f node_modules/.package-lock.json ]; then
  dependencies_missing=true
fi

if [ "${WRESTLING_SIM_SKIP_DEPENDENCY_INSTALL:-0}" != "1" ] && { [ "$dependencies_missing" = true ] || [ "$previous_lock" != "$current_lock" ]; }; then
  log "Preparing the game dependencies..."
  npm ci --no-audit --no-fund
fi

if [ "${WRESTLING_SIM_SKIP_SERVER:-0}" = "1" ]; then
  exit 0
fi

server_pid_file="/tmp/wrestling-sim-vite.pid"
server_log_file="/tmp/wrestling-sim-vite.log"

if [ -f "$server_pid_file" ]; then
  server_pid="$(cat "$server_pid_file" 2>/dev/null || true)"
  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    log "The game is already running on port 5173."
    exit 0
  fi
  rm -f "$server_pid_file"
fi

log "Starting the game. Codespaces will open the preview automatically."
nohup npm run dev -- --host 0.0.0.0 --port 5173 >"$server_log_file" 2>&1 &
printf '%s\n' "$!" > "$server_pid_file"
