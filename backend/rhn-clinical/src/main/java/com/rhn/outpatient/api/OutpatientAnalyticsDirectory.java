package com.rhn.outpatient.api;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

/** Fixed outpatient aggregate contract. No patient identifiers or arbitrary query expressions. */
public interface OutpatientAnalyticsDirectory {
    List<DailyCount> dailyCounts(Long tenantId, Long organizationId, Set<Long> departmentIds,
                                LocalDate start, LocalDate endInclusive, ZoneId zone);
    List<DiagnosisCount> diagnosisCounts(Long tenantId, Long organizationId, Set<Long> departmentIds,
                                        LocalDate start, LocalDate endInclusive, ZoneId zone);
    record DiagnosisCount(LocalDate date, Long departmentId, String key, String label, long count) {}
    record DailyCount(LocalDate date, Long departmentId, long registered, long cancelled, long completed) {}
}
