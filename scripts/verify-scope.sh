#!/usr/bin/env bash
# Explicit scopes; no inference that an arbitrary change is covered by these checks.
set -euo pipefail

rhn_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rhn_scope="${1:-}"
rhn_option=""
rhn_frontend_only=0
if [[ $# -gt 0 ]]; then shift; fi
for rhn_arg in "$@"; do
  case "$rhn_arg" in
    --list) rhn_option=--list ;;
    --frontend-only) rhn_frontend_only=1 ;;
    *) echo "Usage: $0 {frequency|outpatient-draft|round1|knowledge-panel} [--frontend-only] [--list]" >&2; exit 2 ;;
  esac
done

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
      src/features/outpatient/ai/ClinicalAiCatalogReview.test.tsx
      src/features/outpatient/ai/ClinicalEvidenceDrawer.test.tsx
      src/shared/ui/Dialog.test.tsx
      src/shared/ui/Select.test.tsx
      src/features/outpatient/UnifiedOrderListEditor.test.tsx
      src/features/pharmacy/medicationDisplay.test.ts
      src/features/pharmacy/PharmacyWorkspace.test.tsx
    )
    rhn_backend_tests+=",ClinicalFrequencyContractTest,ClinicalSemanticPrimitivesTest"
    ;;
  outpatient-draft) ;;
  knowledge-panel)
    rhn_frontend_only=1
    rhn_frontend_tests+=(
      src/shared/ui/Dialog.test.tsx
      src/features/outpatient/ai/ClinicalEvidenceDrawer.test.tsx
      src/features/outpatient/ai/MedicalInsertViewerModal.test.tsx
    )
    ;;
  *)
    echo "Usage: $0 {frequency|outpatient-draft|round1|knowledge-panel} [--frontend-only] [--list]" >&2
    exit 2
    ;;
esac
if [[ "$rhn_scope" == outpatient-draft || "$rhn_scope" == round1 ]]; then
  rhn_frontend_tests+=(
    src/features/outpatient/record/saveClinicalDraft.test.ts
    src/features/outpatient/record/clinicalRecordReceipt.test.ts
    src/features/outpatient/record/clinicalDocumentWorkflow.test.ts
    src/features/outpatient/record/useClinicalDocumentSession.test.tsx
    src/features/outpatient/record/useClinicalDraftSession.test.tsx
    src/features/outpatient/record/completeEncounter.test.ts
    src/features/outpatient/record/completionFacts.test.ts
    src/features/outpatient/record/completionBillingWrites.test.ts
    src/shared/billing/SettlementPaymentPanel.test.tsx
    src/features/outpatient/record/DiagnosisPanel.test.tsx
    src/features/outpatient/record/diagnosisManagementEvidence.test.ts
    src/features/outpatient/record/ClinicalVitalsFields.test.tsx
    src/features/outpatient/record/useClinicalAiDraft.test.tsx
    src/features/outpatient/record/useAiPlanApplication.test.tsx
    src/features/outpatient/record/NoteTemplateBar.test.tsx
    src/features/outpatient/DoctorWorkstation.test.tsx
    src/features/outpatient/orders/usePrescriptionSplitPreview.test.tsx
    src/features/outpatient/orders/persistOrderDrafts.test.ts
    src/features/outpatient/DoctorNoteTemplate.test.ts
    src/features/outpatient/PrescriptionPackaging.test.ts
    src/features/outpatient/ai/aiDraftAdapter.test.ts
    src/features/outpatient/ai/canonicalAiDiagnoses.test.ts
    src/features/outpatient/ai/ClinicalAiQuietWorkflow.test.tsx
    src/features/outpatient/ai/ClinicalAiAssistantPanel.test.tsx
    src/features/outpatient/ai/ClinicalAiPlanAdoption.test.tsx
    src/features/outpatient/ai/HistoryPrescriptionReference.test.tsx
    src/features/outpatient/ai/historicalPrescriptionImport.test.ts
    src/features/outpatient/templates/templateApplicationReceipt.test.ts
    src/features/outpatient/templates/noteTemplateSaveInput.test.ts
    src/features/outpatient/templates/maintainedTemplateSave.test.ts
    src/features/outpatient/templates/TemplateMaintenanceTruth.test.tsx
    src/features/outpatient/templates/templateCatalogSearch.test.ts
    src/features/outpatient/templates/useTemplateCatalogSearch.test.tsx
    src/features/outpatient/templates/AiPlanCatalogSearch.test.tsx
    src/features/outpatient/templates/ManualClinicalTemplateDialog.test.tsx
    src/features/outpatient/templates/templateEditorFacts.test.ts
    src/features/outpatient/templates/ManualTemplateEditorTruth.test.tsx
    src/features/outpatient/templates/AiPlanTemplateDraftModal.test.tsx
    src/features/outpatient/templates/convertedPlanFacts.test.ts
    src/features/outpatient/templates/AiPlanConversionTruth.test.tsx
    src/features/outpatient/templates/AiPlanMedicationTruth.test.tsx
    src/features/outpatient/templates/AiPlanServiceTruth.test.tsx
    src/features/outpatient/templates/aiPlanServiceFacts.test.ts
    src/features/outpatient/templates/aiPlanMedicationFacts.test.ts
    src/features/outpatient/templates/planMedicationPresentation.test.ts
    src/features/outpatient/templates/OutpatientPlanTemplatesWorkspace.test.tsx
    src/features/outpatient/templates/resolveTemplateOrders.test.ts
    src/features/outpatient/templates/resolveTemplateOrders.api.test.ts
    src/features/outpatient/templates/useTemplateApplication.test.tsx
    src/features/outpatient/templates/historicalPlanSelection.test.ts
  )
  rhn_backend_tests+=",ClinicalAiModelModeTest"
  rhn_backend_tests+=",OutpatientDoctorWorkstationTest,ClinicalAiPlanPreflightTest,OutpatientNoteTemplateTest,OutpatientPlanTemplateTest,ClinicalAiPlanCompilationTest,TemplateCatalogPagingContractTest,ServiceOrderableCatalogCompletenessTest,com.rhn.ai.application.ClinicalTreatmentRecommendationServiceTest,com.rhn.platform.web.ApiExceptionHandlerTest,com.rhn.platform.masterdata.application.ItemGroupDirectoryServiceTest,com.rhn.ai.application.ClinicalPlanInvestigationTruthTest,com.rhn.ai.application.PlanInvestigationDecisionServiceTest,com.rhn.ai.application.ClinicalPlanMedicationTruthTest,com.rhn.ai.application.MedicationIntentParserTest,com.rhn.ai.application.MedicationSpecificationEvidenceTest,com.rhn.ai.application.MedicationCandidateMatchingServiceTest,com.rhn.ai.application.HistoricalPlanResolutionServiceTest,com.rhn.ai.application.HistoricalPlanComparisonServiceTest,com.rhn.ai.application.ClinicalPlanRetrievalServiceTest,ClinicalAiPlanIdentityTest,HistoricalPlanCoverageContractTest,HistoricalEncounterWindowTest,DiagnosisManagementEvidenceTest,DiagnosisDomainTruthTest,DiagnosisDomainMigrationTest,DiagnosisOwnershipPersistenceTest,com.rhn.outpatient.encounter.DiagnosisOwnershipValidationTest,com.rhn.outpatient.encounter.DiagnosisManagementSnapshotTest,com.rhn.pharmacy.application.OutpatientInventoryRoutingTruthTest,com.rhn.outpatient.ordering.JpaOutpatientClinicalHistoryDirectoryTest"
  rhn_backend_tests+=",OutpatientStructuredNoteFormTest,ClinicalDocumentFoundationTest"
  rhn_backend_tests+=",ServiceExecutionDepartmentDefaultTest,com.rhn.platform.masterdata.api.ServiceExecutionDepartmentPolicyTest"
  rhn_backend_tests+=",BillingSettlementTest,PaymentRoundingIntegrationTest"
fi

# Fail loudly when a mapped test moves; a stale mapping must not silently turn green.
for rhn_test in "${rhn_frontend_tests[@]}"; do
  [[ -f "$rhn_root/frontend/$rhn_test" ]] || { echo "Missing test: $rhn_test" >&2; exit 2; }
done
if [[ "$rhn_frontend_only" == 0 ]]; then
  IFS=',' read -r -a rhn_backend_classes <<< "$rhn_backend_tests"
  for rhn_class in "${rhn_backend_classes[@]}"; do
    rhn_class_path="${rhn_class#com.rhn.}"
    rhn_class_path="${rhn_class_path//.//}"
    [[ -f "$rhn_root/backend/src/test/java/com/rhn/$rhn_class_path.java" ]] || {
      echo "Missing test: $rhn_class" >&2; exit 2;
    }
  done
fi

if [[ "$rhn_option" != --list ]]; then
  rhn_logs="$rhn_root/.runtime/verification/$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$rhn_logs"
  echo "Scope: $rhn_scope; logs: $rhn_logs"
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
run_check frontend-tests "$rhn_root/frontend" npm run test -- "${rhn_frontend_tests[@]}" || rhn_failed=1
if [[ "$rhn_frontend_only" == 0 ]]; then
  run_check backend-tests "$rhn_root/backend" mvn -q -pl rhn-app -am \
    -Dspring.profiles.active=test "-Dtest=$rhn_backend_tests" test || rhn_failed=1
fi
run_check ui-standards "$rhn_root/frontend" npm run ui:check || rhn_failed=1
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
    exit 2
  fi
fi
exit "$rhn_failed"
