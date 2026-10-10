#!/usr/bin/env bash
# Explicit scopes; no inference that an arbitrary change is covered by these checks.
set -euo pipefail

rhn_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rhn_scope="${1:-}"
rhn_option=""
rhn_frontend_only=0
rhn_full=0
if [[ $# -gt 0 ]]; then shift; fi
for rhn_arg in "$@"; do
  case "$rhn_arg" in
    --list) rhn_option=--list ;;
    --frontend-only) rhn_frontend_only=1 ;;
    --full) rhn_full=1 ;;
    *) echo "Usage: $0 <scope[,scope...]> [--frontend-only|--full] [--list]" >&2; exit 2 ;;
  esac
done

rhn_plan_frontend_only=""
rhn_plan_full=""
if [[ "$rhn_full" == 1 ]]; then rhn_plan_full=--full; fi
if [[ "$rhn_frontend_only" == 1 ]]; then rhn_plan_frontend_only=--frontend-only; fi
if ! rhn_plan="$(python3 "$rhn_root/scripts/verification-scope-plan.py" "$rhn_scope" ${rhn_plan_frontend_only:+"$rhn_plan_frontend_only"} ${rhn_plan_full:+"$rhn_plan_full"})"; then exit 2; fi
rhn_frontend_tests=()
rhn_backend_classes=()
rhn_coverage=""
while IFS=$'\t' read -r rhn_kind rhn_value; do
  case "$rhn_kind" in
    frontend_only) rhn_frontend_only="$rhn_value" ;;
    frontend) rhn_frontend_tests+=("$rhn_value") ;;
    backend) rhn_backend_classes+=("$rhn_value") ;;
    coverage) rhn_coverage="$rhn_value" ;;
    *) echo "Invalid scope plan" >&2; exit 2 ;;
  esac
done <<< "$rhn_plan"
rhn_backend_tests=""
if [[ "$rhn_frontend_only" == 0 ]]; then rhn_backend_tests="$(IFS=,; echo "${rhn_backend_classes[*]}")"; fi

if [[ "$rhn_option" != --list ]]; then
  rhn_logs="$rhn_root/.runtime/verification/$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$rhn_logs"
  echo "Scope: $rhn_scope; logs: $rhn_logs"
  echo "Coverage: $rhn_coverage"
  python3 "$rhn_root/scripts/verification-scope-plan.py" "$rhn_scope" ${rhn_plan_frontend_only:+"$rhn_plan_frontend_only"} ${rhn_plan_full:+"$rhn_plan_full"} --format json > "$rhn_logs/scope-plan.json"
  printf 'stage\tstatus\tseconds\n' > "$rhn_logs/timings.tsv"
  # Record bytes as well as HEAD: a dirty worktree's HEAD alone is insufficient.
  rhn_snapshot_started=$SECONDS
  if (cd "$rhn_root" && python3 scripts/verification-snapshot.py capture \
    --scope "$rhn_scope (frontend-only=$rhn_frontend_only)" --output "$rhn_logs/source-before.json") \
    > "$rhn_logs/source-capture.log" 2>&1; then
    printf 'source-capture\tPASS\t%s\n' "$((SECONDS - rhn_snapshot_started))" >> "$rhn_logs/timings.tsv"
  else
    printf 'source-capture\tFAIL\t%s\n' "$((SECONDS - rhn_snapshot_started))" >> "$rhn_logs/timings.tsv"
    cat "$rhn_logs/source-capture.log" >&2
    exit 2
  fi
  if [[ "$rhn_frontend_only" == 1 ]]; then echo "Frontend only: backend checks are excluded; full CI remains required."; fi
fi

run_check() {
  local rhn_name="$1" rhn_directory="$2"
  shift 2
  if [[ "$rhn_option" == --list ]]; then
    printf '[%s] cd %q && ' "$rhn_name" "$rhn_directory"
    printf '%q ' "$@"
    printf '\n'
    return
  fi
  local rhn_started=$SECONDS
  if (cd "$rhn_directory" && "$@") > "$rhn_logs/$rhn_name.log" 2>&1; then
    local rhn_elapsed=$((SECONDS - rhn_started))
    echo "PASS $rhn_name (${rhn_elapsed}s)"
    printf '%s\tPASS\t%s\n' "$rhn_name" "$rhn_elapsed" >> "$rhn_logs/timings.tsv"
    tail -n 8 "$rhn_logs/$rhn_name.log"
  else
    local rhn_elapsed=$((SECONDS - rhn_started))
    echo "FAIL $rhn_name (${rhn_elapsed}s); full log: $rhn_logs/$rhn_name.log" >&2
    printf '%s\tFAIL\t%s\n' "$rhn_name" "$rhn_elapsed" >> "$rhn_logs/timings.tsv"
    tail -n 60 "$rhn_logs/$rhn_name.log" >&2
    return 1
  fi
}

rhn_failed=0
if [[ "$rhn_full" == 1 ]]; then
  run_check frontend-tests "$rhn_root/frontend" npm run test || rhn_failed=1
  run_check backend-tests "$rhn_root/backend" mvn -q -Dspring.profiles.active=test verify || rhn_failed=1
else
  run_check frontend-tests "$rhn_root/frontend" npm run test -- "${rhn_frontend_tests[@]}" || rhn_failed=1
fi
if [[ "$rhn_full" == 0 && "$rhn_frontend_only" == 0 ]]; then
  run_check backend-tests "$rhn_root/backend" mvn -q -pl rhn-app -am \
    -Dspring.profiles.active=test "-Dtest=$rhn_backend_tests" test || rhn_failed=1
fi
run_check ui-standards "$rhn_root/frontend" npm run ui:check || rhn_failed=1
run_check code-quality "$rhn_root/frontend" npm run code:check || rhn_failed=1
run_check frontend-build "$rhn_root/frontend" npm run build || rhn_failed=1
if [[ "$rhn_option" != --list ]]; then
  rhn_snapshot_started=$SECONDS
  if (cd "$rhn_root" && python3 scripts/verification-snapshot.py check \
    --before "$rhn_logs/source-before.json" --output "$rhn_logs/source-after.json") \
    > "$rhn_logs/source-check.log" 2>&1; then
    printf 'source-check\tPASS\t%s\n' "$((SECONDS - rhn_snapshot_started))" >> "$rhn_logs/timings.tsv"
    tail -n 1 "$rhn_logs/source-check.log"
  else
    printf 'source-check\tINVALID\t%s\n' "$((SECONDS - rhn_snapshot_started))" >> "$rhn_logs/timings.tsv"
    cat "$rhn_logs/source-check.log" >&2
    echo "Verification attribution invalid (exit 2); stage results remain in timings.tsv." >&2
    rhn_failed=2
  fi
  python3 "$rhn_root/scripts/verification-scope-plan.py" "$rhn_scope" ${rhn_plan_frontend_only:+"$rhn_plan_frontend_only"} --result-directory "$rhn_logs" || rhn_failed=2
fi
exit "$rhn_failed"
