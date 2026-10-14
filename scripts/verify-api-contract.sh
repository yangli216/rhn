#!/usr/bin/env bash
# Single source for the API contract check shared by CI and verify-scope.sh.
# Starts a temporary test-profile service on a dedicated port, compares its runtime OpenAPI with
# docs/api/openapi.json as canonical JSON, and regenerates TypeScript into the diagnostics directory
# to compare with frontend/src/shared/api/generated.ts. The working tree is never modified.
#
# Usage: scripts/verify-api-contract.sh [diagnostics-directory]
#   RHN_CONTRACT_PORT=18080        dedicated port; an occupied port fails instead of being reclaimed
#   RHN_CONTRACT_SKIP_PACKAGE=1    reuse an already packaged backend jar
set -euo pipefail

rhn_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rhn_out="$(mkdir -p "${1:-$rhn_root/artifacts}" && cd "${1:-$rhn_root/artifacts}" && pwd)"
rhn_port="${RHN_CONTRACT_PORT:-18080}"
rhn_pid=""

cleanup() {
  if [[ -n "$rhn_pid" ]]; then kill "$rhn_pid" 2>/dev/null || true; wait "$rhn_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT

if (exec 3<>"/dev/tcp/127.0.0.1/$rhn_port") 2>/dev/null; then
  echo "Port $rhn_port is already in use; set RHN_CONTRACT_PORT to a free dedicated port." >&2
  exit 1
fi

if [[ "${RHN_CONTRACT_SKIP_PACKAGE:-0}" != 1 ]]; then
  echo "Packaging backend (tests skipped)..."
  if ! (cd "$rhn_root/backend" && mvn --batch-mode -q -DskipTests package) > "$rhn_out/api-contract-package.log" 2>&1; then
    tail -n 40 "$rhn_out/api-contract-package.log" >&2
    echo "Backend packaging failed; see $rhn_out/api-contract-package.log" >&2
    exit 1
  fi
fi
rhn_jar="$(find "$rhn_root/backend/rhn-app/target" -maxdepth 1 -name 'rhn-application-*.jar' ! -name '*.original' | head -n 1)"
if [[ -z "$rhn_jar" ]]; then echo "Packaged backend jar not found under backend/rhn-app/target" >&2; exit 1; fi

echo "Starting temporary test service on port $rhn_port..."
(cd "$rhn_root/backend" && exec java -jar "$rhn_jar" --spring.profiles.active=test \
  --spring.config.additional-location=file:src/test/resources/application-test.yml \
  --server.port="$rhn_port" --management.health.redis.enabled=false) > "$rhn_out/api-contract-app.log" 2>&1 &
rhn_pid=$!
for _ in $(seq 1 120); do
  if curl --fail --silent "http://localhost:$rhn_port/v3/api-docs" -o "$rhn_out/api-contract-runtime.json"; then break; fi
  if ! kill -0 "$rhn_pid" 2>/dev/null; then
    tail -n 60 "$rhn_out/api-contract-app.log" >&2
    echo "Application exited before OpenAPI became available" >&2
    exit 1
  fi
  sleep 1
done
if [[ ! -s "$rhn_out/api-contract-runtime.json" ]]; then
  echo "OpenAPI endpoint did not become available within 120 seconds; see $rhn_out/api-contract-app.log" >&2
  exit 1
fi
cleanup
rhn_pid=""

# Runtime schema ordering may vary, so compare canonical JSON; generated TS is compared textually.
rhn_openapi_status=0
python3 - "$rhn_root/docs/api/openapi.json" "$rhn_out" <<'PY' || rhn_openapi_status=$?
import json, sys
from pathlib import Path
committed, out = Path(sys.argv[1]), Path(sys.argv[2])
canonical = lambda path: json.dumps(json.loads(path.read_text(encoding="utf-8")), ensure_ascii=False, sort_keys=True, indent=2) + "\n"
(out / "api-contract-committed.canonical.json").write_text(canonical(committed), encoding="utf-8")
(out / "api-contract-runtime.canonical.json").write_text(canonical(out / "api-contract-runtime.json"), encoding="utf-8")
PY
if [[ "$rhn_openapi_status" -ne 0 ]]; then echo "Failed to canonicalize OpenAPI documents" >&2; exit 1; fi
diff -u "$rhn_out/api-contract-committed.canonical.json" "$rhn_out/api-contract-runtime.canonical.json" \
  > "$rhn_out/api-contract-openapi.diff" || rhn_openapi_status=$?
if [[ "$rhn_openapi_status" -gt 1 ]]; then echo "Failed to compare canonical OpenAPI contracts" >&2; exit "$rhn_openapi_status"; fi

# Regenerate from the committed OpenAPI document into diagnostics, never over the checked-in file.
(cd "$rhn_root/frontend" && npx --no-install openapi-typescript ../docs/api/openapi.json \
  -o "$rhn_out/api-contract-generated.ts") > "$rhn_out/api-contract-generate.log" 2>&1
rhn_generated_status=0
diff -u "$rhn_root/frontend/src/shared/api/generated.ts" "$rhn_out/api-contract-generated.ts" \
  > "$rhn_out/api-contract-generated.diff" || rhn_generated_status=$?
if [[ "$rhn_generated_status" -gt 1 ]]; then echo "Failed to compare generated TypeScript contract" >&2; exit "$rhn_generated_status"; fi

if [[ "$rhn_openapi_status" -ne 0 ]]; then
  head -n 80 "$rhn_out/api-contract-openapi.diff" >&2
  echo "docs/api/openapi.json differs from the runtime contract. Refresh it from /v3/api-docs, then run npm run api:generate in frontend/." >&2
fi
if [[ "$rhn_generated_status" -ne 0 ]]; then
  head -n 40 "$rhn_out/api-contract-generated.diff" >&2
  echo "frontend/src/shared/api/generated.ts is stale; run npm run api:generate in frontend/." >&2
fi
if [[ "$rhn_openapi_status" -ne 0 || "$rhn_generated_status" -ne 0 ]]; then
  echo "Committed API contract is out of sync. Diagnostics: $rhn_out" >&2
  exit 1
fi
echo "API contract in sync: runtime OpenAPI equals docs/api/openapi.json; generated.ts is current."
