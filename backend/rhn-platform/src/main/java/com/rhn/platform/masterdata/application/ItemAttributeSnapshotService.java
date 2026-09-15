package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.AttributeContexts;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.AttributeScope;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory.ItemAttributeSnapshot;
import com.rhn.platform.masterdata.api.ItemAttributeViews.AttributeResolutionResponse;
import com.rhn.platform.masterdata.api.ItemAttributeViews.ResolvedAttributeView;
import com.rhn.platform.masterdata.application.ItemAttributeResolutionService.ResolutionContexts;
import com.rhn.platform.masterdata.application.ItemAttributeResolutionService.ScopeContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ItemAttributeSnapshotService implements ItemAttributeSnapshotDirectory {
    private final ItemAttributeResolutionService resolutionService;
    private final JsonCodec jsonCodec;

    public ItemAttributeSnapshotService(ItemAttributeResolutionService resolutionService, JsonCodec jsonCodec) {
        this.resolutionService = resolutionService;
        this.jsonCodec = jsonCodec;
    }

    @Override
    @Transactional(readOnly = true)
    public ItemAttributeSnapshot resolveSnapshot(String subjectType, Long targetId, LocalDate businessDate,
                                                 AttributeContexts contexts) {
        LocalDate effectiveDate = businessDate == null ? LocalDate.now() : businessDate;
        AttributeResolutionResponse resolution = resolutionService.resolve(subjectType, targetId, effectiveDate,
                new ResolutionContexts(scope(contexts == null ? null : contexts.ordering()),
                        scope(contexts == null ? null : contexts.executing()),
                        scope(contexts == null ? null : contexts.dispensing()),
                        scope(contexts == null ? null : contexts.stocking())));
        JsonNode snapshot = canonicalSnapshot(resolution, effectiveDate);
        return new ItemAttributeSnapshot(resolution.subjectId(), resolution.subjectType(), targetId,
                resolution.itemTypeId(), effectiveDate, resolution.resolvedAt(), snapshot,
                sha256(jsonCodec.write(snapshot)));
    }

    private JsonNode canonicalSnapshot(AttributeResolutionResponse resolution, LocalDate businessDate) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("contractVersion", 1);
        root.put("subjectId", resolution.subjectId());
        root.put("subjectType", resolution.subjectType());
        root.put("targetId", resolution.targetId());
        root.put("itemTypeId", resolution.itemTypeId());
        root.put("businessDate", businessDate);
        Map<String, Object> attributes = new java.util.TreeMap<>();
        for (ResolvedAttributeView value : resolution.attributes()) {
            Map<String, Object> evidence = new LinkedHashMap<>();
            evidence.put("value", value.value());
            evidence.put("valueMode", value.valueMode());
            evidence.put("sourceLevel", value.sourceLevel());
            evidence.put("scopeKey", value.scopeKey());
            evidence.put("definitionId", value.definitionId());
            evidence.put("definitionRevision", value.definitionRevision());
            evidence.put("valueRecordId", value.valueRecordId());
            attributes.put(value.code(), evidence);
        }
        root.put("attributes", attributes);
        return jsonCodec.readTree(jsonCodec.write(root));
    }

    private ScopeContext scope(AttributeScope value) {
        return value == null ? null : new ScopeContext(value.organizationId(), value.departmentId());
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("当前运行环境不支持 SHA-256", exception);
        }
    }
}
