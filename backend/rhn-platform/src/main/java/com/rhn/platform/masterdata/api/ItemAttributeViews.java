package com.rhn.platform.masterdata.api;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class ItemAttributeViews {
    private ItemAttributeViews() {}

    public record AttributeSchemaView(
            Long assignmentId, Long definitionId, long definitionRevision,
            String code, String name, String description, String dataType, String cardinality,
            Long dictionaryId, String unitCode, JsonNode schema, JsonNode defaultValue,
            String variability, String overridePolicy, JsonNode allowedScopes,
            String contextBasis, String storageMode, String projectionField, String sensitivity,
            boolean required, String widgetType, String groupName, int groupSortOrder,
            int attributeSortOrder, JsonNode visibleCondition, JsonNode requiredCondition,
            boolean searchable, boolean listDisplay) {}

    public record ResolvedAttributeView(
            String code, JsonNode value, String valueMode, String sourceLevel, String scopeKey,
            Long definitionId, long definitionRevision, Long valueRecordId, Instant resolvedAt) {}

    public record AttributeSchemaResponse(
            Long subjectId, String subjectType, Long targetId, Long itemTypeId,
            List<AttributeSchemaView> attributes) {}

    public record AttributeResolutionResponse(
            Long subjectId, String subjectType, Long targetId, Long itemTypeId,
            Instant resolvedAt, List<ResolvedAttributeView> attributes) {}

    public record AttributeValueView(
            Long id, long revision, Long definitionId, String attributeCode, JsonNode value,
            LocalDate validFrom, LocalDate validTo, String status) {}

    public record AttributeOverrideView(
            Long id, long revision, Long definitionId, String attributeCode,
            String scopeType, String scopeKey, Long organizationId, Long departmentId,
            String valueMode, JsonNode value, LocalDate validFrom, LocalDate validTo, String status) {}

    public record AttributeChangeView(
            Long id, Long definitionId, String attributeCode, String targetType, String changeType,
            String scopeKey, String reason, String requestCode, Instant changedAt, Long changedBy) {}

    public record AttributeMaintenanceResponse(
            AttributeSchemaResponse schema, List<AttributeValueView> baseValues,
            List<AttributeOverrideView> overrides) {}
}
