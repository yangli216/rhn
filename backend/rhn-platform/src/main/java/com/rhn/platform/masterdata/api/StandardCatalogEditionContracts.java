package com.rhn.platform.masterdata.api;

import com.rhn.shared.api.PageResult;
import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Registration and comparison do not select an edition for operational use. */
public final class StandardCatalogEditionContracts {
    private StandardCatalogEditionContracts() {}
    public record Import(String fileName,String content,String reason,String expectedRuntimeHash) {}
    public record Edition(Long id,StandardCatalogReview.Identity identity,String packageHash,String declaredContentHash,String fileName,
            String reason,Long actorId,String actor,Instant importedAt,int entries,int specifications,int issues,boolean runtime,String origin,Long baselineId) {}
    public record Stored(Edition edition,JsonNode catalog,String uploadedText) {}
    public record Original(String fileName,String content,String packageHash) {}
    public record Detail(Edition edition,JsonNode source,StandardCatalogReview.View review,List<String> notices) {}
    public record Change(String group,String objectId,String name,String operation,String path,JsonNode before,JsonNode after) {}
    public record Comparison(Edition base,Edition target,String fingerprint,Map<String,Integer> counts,PageResult<Change> changes) {}
    public record Dependencies(Edition target,String fingerprint,List<String> coverage,List<String> limitations,PageResult<MedicationStandardImpactDirectory.Item> items) {}
}
