package com.rhn.platform.dictionary.api;

import java.util.List;
import java.util.Map;

public interface DictionaryAttributeDirectory {
    List<DictionaryAttributeViews.ApplicableItemView> applicableItems(
            Long tenantId, Long organizationId, Long departmentId,
            String dictionaryCode, String attributeCode, String referenceItemCode);

    default Map<Long, Map<String, String>> resolveScalarAttributes(
            Long dictionaryId, List<Long> itemIds,
            Long tenantId, Long organizationId, Long departmentId) {
        return Map.of();
    }

    default boolean isApplicable(Long tenantId, Long organizationId, Long departmentId,
                                 String dictionaryCode, String itemCode,
                                 String attributeCode, String referenceItemCode) {
        return applicableItems(tenantId, organizationId, departmentId,
                dictionaryCode, attributeCode, referenceItemCode).stream()
                .anyMatch(item -> item.code().equals(itemCode));
    }
}
