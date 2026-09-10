package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientScheduleAvailabilityDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
class JpaOutpatientScheduleAvailabilityDirectory implements OutpatientScheduleAvailabilityDirectory {
    private final ServiceScheduleRepository schedules;
    private final ScheduleSlotPoolRepository pools;
    private final OrganizationDirectory organizations;

    JpaOutpatientScheduleAvailabilityDirectory(ServiceScheduleRepository schedules,
                                               ScheduleSlotPoolRepository pools,
                                               OrganizationDirectory organizations) {
        this.schedules = schedules;
        this.pools = pools;
        this.organizations = organizations;
    }

    @Override
    @Transactional(readOnly = true)
    public List<DepartmentAvailability> listDepartmentAvailability(Long tenantId, Long organizationId,
                                                                   LocalDate serviceDate) {
        List<ServiceSchedule> activeSchedules = schedules
                .findByTenantIdAndOrganizationIdAndServiceDateBetweenOrderByStartAt(
                        tenantId, organizationId, serviceDate, serviceDate).stream()
                .filter(value -> "PUBLISHED".equals(value.status()))
                .toList();
        Map<Long, ScheduleSlotPool> poolBySchedule = pools.findByTenantIdAndScheduleIdIn(
                        tenantId, activeSchedules.stream().map(ServiceSchedule::id).toList()).stream()
                .collect(java.util.stream.Collectors.toMap(ScheduleSlotPool::scheduleId, value -> value));
        Map<Long, Integer> availableByDepartment = new HashMap<>();
        for (ServiceSchedule schedule : activeSchedules) {
            ScheduleSlotPool pool = poolBySchedule.get(schedule.id());
            int available = pool == null ? schedule.totalCapacity()
                    : "ACTIVE".equals(pool.status())
                    ? Math.max(0, pool.totalCount() - pool.heldCount() - pool.occupiedCount() - pool.frozenCount()) : 0;
            availableByDepartment.merge(schedule.departmentId(), available, Integer::sum);
        }

        return organizations.listDepartments(tenantId, organizationId).stream()
                .filter(value -> "ACTIVE".equals(value.sdOrgStatus()))
                .filter(value -> "CLINICAL".equals(value.sdDepartmentProperty()))
                .map(value -> view(value, availableByDepartment, activeSchedules))
                .toList();
    }

    private static DepartmentAvailability view(DepartmentView department, Map<Long, Integer> availability,
                                               List<ServiceSchedule> schedules) {
        boolean scheduled = schedules.stream().anyMatch(value -> value.departmentId().equals(department.id()));
        return new DepartmentAvailability(department.id(), department.name(),
                availability.getOrDefault(department.id(), 0), scheduled);
    }
}
