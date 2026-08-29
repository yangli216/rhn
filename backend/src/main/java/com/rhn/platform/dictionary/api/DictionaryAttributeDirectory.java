package com.rhn.platform.dictionary.api;

import java.util.List;

public interface DictionaryAttributeDirectory {
    List<DictionaryAttributeViews.ApplicableItemView> applicableItems(
            Long tenantId, Long organizationId, Long departmentId,
            String dictionaryCode, String attributeCode, String referenceItemCode);

    default boolean isApplicable(Long tenantId, Long organizationId, Long departmentId,
                                 String dictionaryCode, String itemCode,
                                 String attributeCode, String referenceItemCode) {
        return applicableItems(tenantId, organizationId, departmentId,
                dictionaryCode, attributeCode, referenceItemCode).stream()
                .anyMatch(item -> item.code().equals(itemCode));
    }
}
