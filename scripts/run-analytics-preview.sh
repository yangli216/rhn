#!/usr/bin/env bash
set -euo pipefail
rhn_preview_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Defaults to 8080; in an isolated worktree sandbox set RHN_ANALYTICS_PORT (e.g. 18086) and run the frontend with the matching RHN_FRONTEND_PORT/RHN_API_TARGET.
export RHN_SERVER_PORT="${RHN_ANALYTICS_PORT:-${RHN_SERVER_PORT:-${RHN_PORT:-8080}}}"
export RHN_INSTANCE_ID="analytics-preview-${RHN_SERVER_PORT}"
export RHN_ANALYTICS_PILOT_ENABLED=true
export RHN_ANALYTICS_ENABLED=true
export RHN_ID_WORKER_ID="${RHN_ID_WORKER_ID:-6}"
exec "$rhn_preview_root/scripts/run-oracle-local.sh" --rhn.eventing.outbox.enabled=false "$@"
