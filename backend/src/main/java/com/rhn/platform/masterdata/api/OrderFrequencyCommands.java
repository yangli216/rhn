package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class OrderFrequencyCommands {
    private OrderFrequencyCommands() {}
    public record FrequencyCommand(String code, String name, String shortName, String description,
            String ruleType, Integer frequencyCount, BigDecimal periodValue, String periodUnit,
            String anchorType, String defaultExecutionTimes, boolean outpatientApplicable,
            boolean inpatientApplicable, boolean emergencyApplicable, boolean medicationApplicable,
            boolean treatmentApplicable, boolean nursingApplicable, boolean automaticTaskGeneration,
            int sortOrder, String status, LocalDate validFrom, LocalDate validTo) {}
    public record ConfigurationCommand(Long organizationId, Long departmentId, String localCode,
            String localName, String executionTimes, String firstDayPolicy, boolean enabled,
            String status, LocalDate validFrom, LocalDate validTo) {}
}
