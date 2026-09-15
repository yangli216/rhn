package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface OrderFrequencyDirectory {
    FrequencySnapshot requireActive(Long tenantId, String code, Long organizationId, Long departmentId,
                                    String scene, String orderType, LocalDate businessDate);
    List<FrequencySnapshot> active(Long tenantId, Long organizationId, Long departmentId,
                                   String scene, String orderType, LocalDate businessDate);

    record FrequencySnapshot(Long id, long revision, String code, String name, String shortName,
            String description, String ruleType, Integer frequencyCount, BigDecimal periodValue,
            String periodUnit, String anchorType, List<String> executionTimes, String firstDayPolicy,
            boolean automaticTaskGeneration) {}
}
