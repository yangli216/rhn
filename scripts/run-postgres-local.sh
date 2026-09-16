#!/usr/bin/env bash
set -euo pipefail

rhn_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rhn_env_file="${RHN_POSTGRES_ENV_FILE:-$rhn_project_root/.env.postgres.local}"
if [[ -f "$rhn_env_file" ]]; then
  set -a
  source "$rhn_env_file"
  set +a
fi
: "${RHN_DB_URL:?Configure RHN_DB_URL in .env.postgres.local}"
: "${RHN_DB_USER:?Configure RHN_DB_USER in .env.postgres.local}"
: "${RHN_DB_PASSWORD:?Configure RHN_DB_PASSWORD in .env.postgres.local}"
rhn_port="${RHN_SERVER_PORT:-18087}"
if lsof -nP -iTCP:"$rhn_port" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Port $rhn_port is already in use." >&2
  exit 1
fi
(cd "$rhn_project_root/backend" && mvn -DskipTests package)
rhn_artifact="$rhn_project_root/backend/rhn-app/target/rhn-application-0.1.0-SNAPSHOT.jar"
rhn_digest="$(shasum -a 256 "$rhn_artifact" | awk '{print substr($1, 1, 16)}')"
rhn_runtime="$rhn_project_root/backend/target/runtime/rhn-application-$rhn_digest.jar"
mkdir -p "$(dirname "$rhn_runtime")"
if [[ ! -f "$rhn_runtime" ]]; then
  cp "$rhn_artifact" "$rhn_runtime"
fi
rhn_java="${JAVA_HOME:+$JAVA_HOME/bin/}java"
exec "$rhn_java" -jar "$rhn_runtime" --spring.profiles.active=postgres-local --server.port="$rhn_port" "$@"
