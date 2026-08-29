package com.rhn.platform.dictionary.api;

import com.rhn.platform.dictionary.domain.DictionaryAttributeCardinality;
import com.rhn.platform.dictionary.domain.DictionaryAttributeDataType;
import com.rhn.platform.dictionary.domain.DictionaryAttributeOverridePolicy;
import com.rhn.platform.dictionary.domain.DictionaryAttributeScopeType;
import com.rhn.platform.dictionary.domain.DictionaryAttributeValueMode;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.List;

public final class DictionaryAttributeViews {
    private DictionaryAttributeViews() {
    }

    public record AttributeDefinitionView(
            Long id, long revision, Long dictionaryId, String code, String name, String description,
            DictionaryAttributeDataType dataType, DictionaryAttributeCardinality cardinality,
            Long referenceDictionaryId, String referenceDictionaryCode, String referenceDictionaryName,
            JsonNode schema, DictionaryAttributeScopeType minimumScope,
            DictionaryAttributeOverridePolicy overridePolicy, boolean requiredValue, boolean searchable,
            DictionaryStatus status, Instant updatedAt, Long updatedBy,
            List<ReferenceOptionView> referenceOptions) {
    }

    public record ReferenceOptionView(Long id, String code, String name, int sortOrder) {
    }

    public record AttributeValueMemberView(
            Long id, int valueOrder, String value,
            Long referenceItemId, String referenceItemCode, String referenceItemName) {
    }

    public record AttributeValueSetView(
            DictionaryAttributeScopeType scopeType, String scopeCode,
            Long tenantId, Long organizationId, Long departmentId,
            DictionaryAttributeValueMode valueMode, List<AttributeValueMemberView> values,
            String sourceLabel) {
    }

    public record ItemAttributeView(
            AttributeDefinitionView definition,
            AttributeValueSetView configured,
            AttributeValueSetView resolved,
            boolean inherited) {
    }

    public record ItemAttributeConfigurationView(
            Long dictionaryId, Long dictionaryItemId, String itemCode, String itemName,
            DictionaryAttributeScopeType editingScope, String editingScopeCode,
            List<ItemAttributeView> attributes) {
    }

    public record ApplicableItemView(Long id, String code, String name, int sortOrder,
                                     String matchedAttributeCode, String matchedReferenceCode,
                                     String resolvedScopeCode) {
    }
}
