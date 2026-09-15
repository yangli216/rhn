#!/usr/bin/env bash
set -euo pipefail
rhn_preview_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Use this branch’s backend port. Run the frontend on 15176 in a second terminal.
export RHN_SERVER_PORT="${RHN_ANALYTICS_PORT:-${RHN_SERVER_PORT:-${RHN_PORT:-18086}}}"
export RHN_INSTANCE_ID="analytics-preview-${RHN_SERVER_PORT}"
export RHN_ANALYTICS_PILOT_ENABLED=true
export RHN_ANALYTICS_ENABLED=true
export RHN_ID_WORKER_ID="${RHN_ID_WORKER_ID:-6}"
exec "$rhn_preview_root/scripts/run-oracle-local.sh" --rhn.eventing.outbox.enabled=false "$@"
