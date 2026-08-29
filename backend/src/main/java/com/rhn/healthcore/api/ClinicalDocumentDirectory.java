package com.rhn.healthcore.api;

import java.util.Map;

/** Public contract used by care modules to maintain encounter-scoped clinical documents. */
public interface ClinicalDocumentDirectory {
    Long upsertEncounterDraft(Long residentId, Long encounterId, Long organizationId, Long departmentId,
                              String documentType, String title, String contentSchema,
                              Map<String, Object> content, String changeReason);

    /** Fails closed when the required encounter document is missing or has an unsigned current version. */
    void requireSignedEncounterDocument(Long encounterId, String documentType);
}
