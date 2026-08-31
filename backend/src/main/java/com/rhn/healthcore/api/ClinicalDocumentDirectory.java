package com.rhn.healthcore.api;

import java.util.Map;
import java.util.Optional;

/** Public contract used by care modules to maintain encounter-scoped clinical documents. */
public interface ClinicalDocumentDirectory {
    Long upsertEncounterDraft(Long residentId, Long encounterId, Long organizationId, Long departmentId,
                              String documentType, String title, String contentSchema,
                              Map<String, Object> content, String changeReason);

    /** Fails closed when the required encounter document is missing or has an unsigned current version. */
    void requireSignedEncounterDocument(Long encounterId, String documentType);

    /** Minimal read-only anchor for detecting changes to one encounter-scoped clinical document. */
    Optional<EncounterDocumentAnchor> findEncounterDocumentAnchor(Long encounterId, String documentType);

    record EncounterDocumentAnchor(Long id, int version, String status) {}
}
