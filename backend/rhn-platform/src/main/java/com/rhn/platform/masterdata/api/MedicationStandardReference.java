package com.rhn.platform.masterdata.api;

import java.util.List;
import tools.jackson.databind.JsonNode;

/** Reference identity is separate from local codes, product identity and clinical evidence approval. */
public record MedicationStandardReference(String status, String catalogId, String catalogVersion,
        String contentHash, String entryId, String specificationId, Integer semanticVersion,
        String name, String doseForm, String preparationSpec, String presentationUnit,
        JsonNode strength, String sourceVerificationStatus, List<String> issues) {
    public MedicationStandardReference { issues = List.copyOf(issues); }
    public boolean linked() { return "LINKED".equals(status); }
    public static MedicationStandardReference unavailable(String status, String reason) {
        return new MedicationStandardReference(status, null, null, null, null, null, null,
                null, null, null, null, null, null, List.of(reason));
    }
}
