package com.rhn.platform.masterdata.api;

import java.time.Instant;
import java.util.List;
import tools.jackson.databind.JsonNode;

public final class MedicationStandardRevisionContracts {
    private MedicationStandardRevisionContracts() {}
    public record SourceLink(Long id, String catalogId, String catalogVersion, String entryId, String specificationId,
            String contentHash, Long createdBy, Instant createdAt) {}
    public record ImpactSnapshot(String version, Instant inspectedAt, List<MedicationStandardImpactDirectory.Area> areas, String fingerprint) {}
    public record Proposal(Long medicationId, long medicationRevision, JsonNode medication, List<SourceLink> previousLinks,
            StandardCatalogReview.Identity identity, String specificationId, JsonNode target,
            String reason, String impactNotes, Long submittedBy, String submitter, Instant submittedAt, ImpactSnapshot impact) {}
    public record Event(Long id, String status, Proposal proposal, Long actorId, String actor, String reason, Instant recordedAt, List<SourceLink> resultingLinks) {}
    public record Submit(Long expectedMedicationRevision, Long expectedEventId, String expectedSourceFingerprint, StandardCatalogReview.Identity identity,
            String specificationId, String reason, String impactNotes, boolean confirmedIdentity, String expectedImpactFingerprint) {
        public Submit(Long expectedMedicationRevision, Long expectedEventId, String expectedSourceFingerprint, StandardCatalogReview.Identity identity,
                String specificationId, String reason, String impactNotes, boolean confirmedIdentity) {
            this(expectedMedicationRevision, expectedEventId, expectedSourceFingerprint, identity, specificationId, reason, impactNotes, confirmedIdentity, null);
        }
    }
    public record Review(Long expectedEventId, String action, String reason, boolean confirmedIdentity, boolean confirmedImpact) {}
}
