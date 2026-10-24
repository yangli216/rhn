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

    /** Current persisted content, scoped like the anchor; used to verify feedback against a real saved version. */
    Optional<EncounterDocumentSnapshot> findEncounterDocumentSnapshot(Long encounterId, String documentType);

    record EncounterDocumentSnapshot(Long id, int version, String status, String author,
                                     java.time.Instant createdAt, tools.jackson.databind.JsonNode content) {}
}
