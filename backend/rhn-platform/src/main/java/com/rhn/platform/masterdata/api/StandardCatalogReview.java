package com.rhn.platform.masterdata.api;

import java.time.Instant;
import java.util.List;

/** Provenance review of an exact supplied catalog edition, not clinical knowledge approval. */
public final class StandardCatalogReview {
    private StandardCatalogReview() {}
    public record Identity(String catalogId, String catalogVersion, String contentHash, String sourceHash) {}
    public record Evidence(String title, String publisher, String edition, String location, String verificationNotes) {}
    public record Event(Long id, int revision, Identity identity, String status, Evidence evidence,
            Long submittedBy, String submitter, Long actorId, String actor, String reason, Instant recordedAt) {}
    public record View(Identity identity, int revision, String status, Event latest, List<Event> history,
            int totalEvents, int historyPage, int historyPageSize, List<String> allowedActions) {}
    public record Change(Identity identity, Integer expectedRevision, String action, Evidence evidence, String reason) {}
}
