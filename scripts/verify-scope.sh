#!/usr/bin/env bash
# Explicit scopes; no inference that an arbitrary change is covered by these checks.
set -euo pipefail

rhn_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rhn_scope="${1:-}"
rhn_option="${2:-}"
if [[ $# -gt 2 || ( -n "$rhn_option" && "$rhn_option" != --list ) ]]; then
  echo "Usage: $0 {frequency|outpatient-draft|round1} [--list]" >&2
  exit 2
fi

rhn_frontend_tests=()
rhn_backend_tests="ArchitectureTest"
case "$rhn_scope" in
  frequency|round1)
    rhn_frontend_tests+=(
      src/shared/clinical/frequencySemantics.test.ts
      src/features/outpatient/orders/medicationQuantity.test.ts
      src/features/outpatient/orders/orderEntries.test.ts
      src/features/outpatient/orders/medicationEntry.test.ts
      src/features/outpatient/orders/OrderComposerFields.test.tsx
      src/features/outpatient/orders/useDraftRowInteractions.test.tsx
      src/features/outpatient/orders/useAiOrderReview.test.tsx
      src/features/outpatient/ai/ClinicalAiTreatmentRows.test.tsx
      src/features/outpatient/UnifiedOrderListEditor.test.tsx
      src/features/pharmacy/medicationDisplay.test.ts
      src/features/pharmacy/PharmacyWorkspace.test.tsx
    )
    rhn_backend_tests+=",ClinicalFrequencyContractTest,ClinicalSemanticPrimitivesTest"
    ;;
  outpatient-draft) ;;
  *)
    echo "Usage: $0 {frequency|outpatient-draft|round1} [--list]" >&2
    exit 2
    ;;
esac
if [[ "$rhn_scope" == outpatient-draft || "$rhn_scope" == round1 ]]; then
  rhn_frontend_tests+=(
    src/features/outpatient/record/saveClinicalDraft.test.ts
    src/features/outpatient/record/DiagnosisPanel.test.tsx
    src/features/outpatient/record/ClinicalVitalsFields.test.tsx
    src/features/outpatient/record/useClinicalAiDraft.test.tsx
    src/features/outpatient/DoctorWorkstation.test.tsx
    src/features/outpatient/DoctorNoteTemplate.test.ts
    src/features/outpatient/PrescriptionPackaging.test.ts
    src/features/outpatient/ai/aiDraftAdapter.test.ts
    src/features/outpatient/ai/ClinicalAiQuietWorkflow.test.tsx
    src/features/outpatient/ai/HistoryPrescriptionReference.test.tsx
  )
  rhn_backend_tests+=",OutpatientDoctorWorkstationTest"
fi

# Fail loudly when a mapped test moves; a stale mapping must not silently turn green.
for rhn_test in "${rhn_frontend_tests[@]}"; do
  [[ -f "$rhn_root/frontend/$rhn_test" ]] || { echo "Missing test: $rhn_test" >&2; exit 2; }
done
IFS=',' read -r -a rhn_backend_classes <<< "$rhn_backend_tests"
for rhn_class in "${rhn_backend_classes[@]}"; do
  [[ -f "$rhn_root/backend/src/test/java/com/rhn/$rhn_class.java" ]] || {
    echo "Missing test: $rhn_class" >&2; exit 2;
  }
done

if [[ "$rhn_option" != --list ]]; then
  rhn_logs="$rhn_root/.runtime/verification/$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$rhn_logs"
  echo "Scope: $rhn_scope; logs: $rhn_logs"
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
  if (cd "$rhn_directory" && "$@") > "$rhn_logs/$rhn_name.log" 2>&1; then
    echo "PASS $rhn_name"
    tail -n 8 "$rhn_logs/$rhn_name.log"
  else
    echo "FAIL $rhn_name; full log: $rhn_logs/$rhn_name.log" >&2
    tail -n 60 "$rhn_logs/$rhn_name.log" >&2
    return 1
  fi
}

rhn_failed=0
run_check frontend-tests "$rhn_root/frontend" npm run test -- "${rhn_frontend_tests[@]}" || rhn_failed=1
run_check backend-tests "$rhn_root/backend" mvn -q -pl rhn-app -am \
  -Dspring.profiles.active=test "-Dtest=$rhn_backend_tests" test || rhn_failed=1
run_check ui-standards "$rhn_root/frontend" npm run ui:check || rhn_failed=1
run_check frontend-build "$rhn_root/frontend" npm run build || rhn_failed=1
exit "$rhn_failed"
