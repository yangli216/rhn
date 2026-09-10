package com.rhn.outpatient.api;

import java.time.LocalDate;
import java.util.List;

/** Read-only department and schedule inventory exposed to outpatient workflows. */
public interface OutpatientScheduleAvailabilityDirectory {
    List<DepartmentAvailability> listDepartmentAvailability(Long tenantId, Long organizationId, LocalDate serviceDate);

    record DepartmentAvailability(Long departmentId, String departmentName, int availableSlotCount,
                                  boolean scheduledToday) { }
}
