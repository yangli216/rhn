package com.rhn.platform.masterdata.api;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.List;

public final class ItemAttributeConfigurationViews {
    private ItemAttributeConfigurationViews() {}

    public record ItemTypeOption(
            Long id, String code, String name, String subjectType, Long parentId,
            String scopeType, int sortOrder) {}

    public record AttributeDefinitionView(
            Long id, long revision, String scopeType, Long tenantId, String code, String name,
            String description, String dataType, String cardinality, Long dictionaryId,
            String unitCode, JsonNode schema, JsonNode defaultValue, String variability,
            String overridePolicy, List<String> allowedScopes, String contextBasis,
            String storageMode, String projectionField, String sensitivity, String status,
            boolean editable) {}

    public record TypeAttributeView(
            Long id, long revision, Long itemTypeId, Long definitionId, boolean required,
            JsonNode defaultValue, String widgetType, String groupName, int groupSortOrder,
            int attributeSortOrder, JsonNode visibleCondition, JsonNode requiredCondition,
            boolean searchable, boolean listDisplay, String status, boolean editable) {}

    public record ConfigurationChangeView(
            Long id, Long definitionId, Long itemTypeId, Long assignmentId,
            String targetType, String changeType, String scopeKey, String reason,
            String requestCode, Instant changedAt, Long changedBy) {}

    public record AttributeConfigurationResponse(
            String tenantNamespace, List<ItemTypeOption> itemTypes,
            List<AttributeDefinitionView> definitions, List<TypeAttributeView> assignments) {}
}
