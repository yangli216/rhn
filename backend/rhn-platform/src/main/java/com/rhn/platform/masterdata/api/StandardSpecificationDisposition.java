package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.StandardCatalogReview.Identity;
import java.time.Instant;
import java.util.List;

public final class StandardSpecificationDisposition {
    private StandardSpecificationDisposition() {}

    public record Change(Identity identity, Integer expectedRevision, String status, String note) {}
    public record Event(Long id, Identity identity, String specificationId, int revision, String status,
            String note, Long actorId, String actor, Instant recordedAt) {}
    public record View(Identity identity, List<Event> specifications) {}
}
