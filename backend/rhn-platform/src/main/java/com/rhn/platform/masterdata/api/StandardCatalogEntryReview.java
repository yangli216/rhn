package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.StandardCatalogReview.Identity;
import java.time.Instant;
import java.util.List;

public final class StandardCatalogEntryReview {
    private StandardCatalogEntryReview() {}
    public record EntryReviewChange(Identity identity, Integer expectedRevision, String status, String note) {}
    public record EntryReviewEvent(Long id, Identity identity, String entryId, int revision, String status, String note, Long actorId, String actor, Instant recordedAt) {}
    public record EntryReviewView(Identity identity, List<EntryReviewEvent> entries) {}
}
