package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class OrderFrequencyViews {
    private OrderFrequencyViews() {}
    public record FrequencyView(Long id, long revision, String code, String name, String shortName,
            String description, String ruleType, Integer frequencyCount, BigDecimal periodValue,
            String periodUnit, String anchorType, List<String> defaultExecutionTimes,
            boolean outpatientApplicable, boolean inpatientApplicable, boolean emergencyApplicable,
            boolean medicationApplicable, boolean treatmentApplicable, boolean nursingApplicable,
            boolean automaticTaskGeneration, int sortOrder, String status,
            LocalDate validFrom, LocalDate validTo, List<ConfigurationView> configurations, ClinicalMedicationStandards.StandardFrequency standard, ClinicalFrequencySchedule.Capability scheduleCapability) {}
    public record ConfigurationView(Long id, long revision, Long organizationId, Long departmentId,
            Long frequencyId, String localCode, String localName, List<String> executionTimes,
            String firstDayPolicy, boolean enabled, String status, LocalDate validFrom, LocalDate validTo) {}
    public record SchedulePreview(String frequencyCode, String frequencyName, String ruleType,
            String explanation, List<LocalDateTime> plannedTimes, ClinicalFrequencySchedule.Capability capability, ClinicalMedicationStandards.StandardFrequency standard, String source) {}
}
