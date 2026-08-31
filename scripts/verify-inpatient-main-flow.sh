#!/usr/bin/env bash
set -euo pipefail

rhn_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(
  cd "$rhn_project_root/backend"
  mvn -Dtest=InpatientAdmissionFlowTest,InpatientTemperatureChartTest,InpatientOrderExecutionFlowTest,InpatientBillingFlowTest,InpatientDischargeReadinessFlowTest,InpatientMedicalRecordFlowTest,InpatientMedicationFulfillmentFlowTest,InpatientMedicationDispenseConsumptionTest,WardMedicationDeliveryFlowTest,InpatientWardBoardTest,InpatientDiagnosticExecutionFlowTest,InpatientNursingAndShiftHandoffTest test
  # These scenarios deliberately reuse the demo resident and bed identifiers. Run them in fresh
  # application contexts so one scenario's inpatients cannot leak into another scenario.
  mvn -Dtest=WardMedicationReturnFlowTest test
  mvn -Dtest=InpatientAdmissionDiagnosisAndMedicationSafetyTest test
  # Daily ward supply and its durable automatic generation reuse the same demo bed.
  # Keep them in isolated contexts and include them in the primary inpatient gate so
  # pharmacy batch regressions cannot pass unnoticed after the clinical flow is green.
  mvn -Dtest=InpatientDailyMedicationSupplyFlowTest test
  mvn -Dtest=InpatientSupplyAutoGenerationTest test
  mvn -Dtest=ArchitectureTest test
)

(
  cd "$rhn_project_root/frontend"
  npm run test -- \
    src/app/AppShellContext.test.ts \
    src/features/inpatient/InpatientTemperatureChart.test.tsx \
    src/features/inpatient/InpatientOrderWorkspace.test.tsx \
    src/features/inpatient/InpatientAdmissionDiagnosisPanel.test.tsx \
    src/features/inpatient/InpatientMedicalRecordWorkspace.test.tsx \
    src/features/inpatient/InpatientDischargeAndBilling.test.tsx \
    src/features/inpatient/InpatientNursingAndDiagnostics.test.tsx \
    src/features/pharmacy/WardMedicationReturnInbox.test.tsx \
    src/features/pharmacy/WardDailySupplyPanel.test.tsx \
    src/shared/api/pharmacyApi.test.ts \
    src/features/inpatient/InpatientWardBoard.test.tsx \
    src/features/inpatient/CanvasMedicalRecordEditor.test.tsx \
    src/features/inpatient/InpatientMedicalRecordTemplates.test.ts
  npm run build
  npm run ui:check
)
