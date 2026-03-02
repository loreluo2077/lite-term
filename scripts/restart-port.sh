#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-5173}"

if [[ ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Error: port must be a number, got '$PORT'" >&2
  exit 1
fi

if [[ $# -ge 2 ]]; then
  START_CMD=("${@:2}")
else
  START_CMD=("pnpm" "dev")
fi

find_listen_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | sort -u
    return
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u
    return
  fi

  return 0
}

collect_pids_as_line() {
  (find_listen_pids || true) | awk 'NF {printf("%s%s", sep, $1); sep=" "}'
}

PIDS="$(collect_pids_as_line)"

if [[ -n "${PIDS}" ]]; then
  echo "Found process(es) listening on port ${PORT}: ${PIDS}"
  echo "Sending SIGTERM..."
  kill ${PIDS} 2>/dev/null || true
  sleep 1

  REMAINING="$(collect_pids_as_line)"
  if [[ -n "${REMAINING}" ]]; then
    echo "Still alive after SIGTERM, sending SIGKILL: ${REMAINING}"
    kill -9 ${REMAINING} 2>/dev/null || true
    sleep 1
  fi

  FINAL="$(collect_pids_as_line)"
  if [[ -n "${FINAL}" ]]; then
    echo "Warning: port ${PORT} is still occupied by: ${FINAL}" >&2
    exit 1
  fi
else
  echo "No listening process found on port ${PORT}."
fi

echo "Restarting app with command: ${START_CMD[*]}"
exec "${START_CMD[@]}"
