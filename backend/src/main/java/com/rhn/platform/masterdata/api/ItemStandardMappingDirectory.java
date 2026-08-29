package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingView;

import java.time.LocalDate;
import java.util.List;

public interface ItemStandardMappingDirectory {
    List<ItemTermMappingView> resolve(Long tenantId, String subjectType, Long targetId,
                                      String mappingType, LocalDate businessDate);
}
