package com.rhn.outpatient.encounter;

import com.rhn.platform.terminology.api.DiseaseReferenceSnapshot.DiseaseManagementSnapshot;
import com.rhn.shared.json.JsonCodec;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Distinguishes captured terminology evidence from unavailable historical policy metadata. */
record DiagnosisManagementSnapshot(String resolutionStatus, List<DiseaseManagementSnapshot> programs) {
    static DiagnosisManagementSnapshot unconfirmed() {
        return new DiagnosisManagementSnapshot("UNCONFIRMED", null);
    }

    static DiagnosisManagementSnapshot confirmed(List<DiseaseManagementSnapshot> programs) {
        if (programs == null || programs.stream().anyMatch(value -> !valid(value))) {
            throw conflict("DIAGNOSIS_MANAGEMENT_UNCONFIRMED", "诊断管理规则尚未确认，未保存，请重新核对目录诊断");
        }
        return new DiagnosisManagementSnapshot("CONFIRMED", List.copyOf(programs));
    }

    static DiagnosisManagementSnapshot read(Long conceptId, String snapshot, JsonCodec json) {
        // Legacy free-coded diagnoses were previously saved with an invented empty programs list.
        if (conceptId == null || conceptId <= 0 || snapshot == null || snapshot.isBlank()) return unconfirmed();
        try {
            var node = json.readStrictTree(snapshot);
            if (node == null || !node.isObject() || !node.path("programs").isArray()) return unconfirmed();
            if (node.has("resolutionStatus") && !"CONFIRMED".equals(node.path("resolutionStatus").asString())) return unconfirmed();
            for (var program : node.path("programs")) {
                var id = program.path("id");
                if (!(id.isIntegralNumber() && id.bigIntegerValue().signum() > 0
                        || id.isTextual() && id.asString().matches("[1-9][0-9]*"))) return unconfirmed();
                for (String key : List.of("code", "name", "managementType", "triggerAction")) {
                    if (!program.path(key).isTextual() || program.path(key).asString().isBlank()) return unconfirmed();
                }
                var deadline = program.path("reportDeadlineHours");
                if (!deadline.isMissingNode() && !deadline.isNull()
                        && (!deadline.isIntegralNumber() || deadline.bigIntegerValue().signum() <= 0)) return unconfirmed();
            }
            // Existing catalog-backed snapshots with an explicit array remain valid historical evidence.
            var value = json.read(snapshot, DiagnosisManagementSnapshot.class);
            return confirmed(value.programs());
        } catch (RuntimeException invalidSnapshot) {
            return unconfirmed();
        }
    }

    private static boolean valid(DiseaseManagementSnapshot value) {
        return value != null && value.id() != null && value.id() > 0 && text(value.code()) && text(value.name())
                && text(value.managementType()) && text(value.triggerAction())
                && (value.reportDeadlineHours() == null || value.reportDeadlineHours() > 0);
    }

    private static boolean text(String value) { return value != null && !value.isBlank(); }
}
