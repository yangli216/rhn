package com.rhn.outpatient.scheduling;

import com.rhn.platform.maintenance.api.*;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Component
public class OutpatientMaintenanceContribution extends ClinicalMaintenanceSupport {
    private final AppointmentRepository appointments;
    private final ScheduleSlotPoolRepository pools;
    private final MaintenanceRelationalData data;
    public OutpatientMaintenanceContribution(AppointmentRepository appointments, ScheduleSlotPoolRepository pools,
                                            MaintenanceRelationalData data) {
        super("OUTPATIENT", OutpatientMaintenanceTables.all());
        this.appointments = appointments; this.pools = pools; this.data = data;
    }
    @Override public Map<String, Set<Long>> relatedIdentifiers(Capture snapshot) {
        Set<Long> ids = new TreeSet<>();
        for (var row : rows(snapshot, "RHN_VIS_ENC")) {
            Long appointment = id(row, "ID_APPT");
            if (appointment != null) ids.add(appointment);
        }
        return Map.of("ID_APPT", ids);
    }
    @Override public List<TableSnapshot> additionalSnapshots(ExecutionContext actor, Scope scope, Capture snapshot) {
        Set<Long> ids = rows(snapshot, "RHN_SC_APPT").stream().map(row -> id(row, "ID_SCHED_SLOT_POOL"))
                .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        if (ids.isEmpty()) return List.of();
        var definition = tables().stream().filter(table -> table.name().equals("RHN_SC_SCHED_SLOT_POOL")).findFirst().orElseThrow();
        return data.capture(scope.tenantId(), List.of(definition), Map.of("ID_SCHED_SLOT_POOL", ids)).tables();
    }
    @Override public List<Issue> inspect(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules, List<Root> roots) {
        if (!modules.contains("OUTPATIENT")) return List.of();
        List<Issue> issues = new ArrayList<>();
        var releasing = occupied(snapshot);
        for (var pool : rows(snapshot, "RHN_SC_SCHED_SLOT_POOL")) {
            if (amount(pool, "QTY_OCCPD").longValue() < releasing.getOrDefault(pool.id(), 0L))
                issues.add(new Issue("MAINTENANCE_SLOT_OCCUPANCY_INVALID", "预约号源占用不足，需先核对排班账", "OUTPATIENT"));
        }
        return issues;
    }
    @Override public List<PreviewLine> compensationPreview(Capture snapshot, Set<String> modules) {
        if (!modules.contains("OUTPATIENT")) return List.of();
        long count = occupied(snapshot).values().stream().mapToLong(Long::longValue).sum();
        return count == 0 ? List.of() : List.of(new PreviewLine("OUTPATIENT", null, "", "恢复预约号源",
                "RELEASE", count + " 个占用", "释放对应占用", "排班和号源池保留", null));
    }
    @Override public void beforeDelete(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {
        if (!modules.contains("OUTPATIENT")) return;
        for (Row row : rows(snapshot, "RHN_SC_APPT")) {
            var appointment = appointments.findWithLockByIdAndTenantId(row.id(), scope.tenantId())
                    .orElseThrow(() -> conflict("MAINTENANCE_APPOINTMENT_CHANGED", "待清理预约已变化"));
            if (Set.of("REGISTERED", "BOOKED", "CHECKED_IN").contains(appointment.status().name())) {
                var pool = pools.findWithLockByIdAndTenantId(appointment.slotPoolId(), scope.tenantId())
                        .orElseThrow(() -> conflict("MAINTENANCE_SLOT_POOL_MISSING", "预约对应号源池缺失"));
                pool.releaseOccupiedOne();
            }
        }
        pools.flush();
    }
    @Override public void verify(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {
        if (!modules.contains("OUTPATIENT")) return;
        var releasing = occupied(snapshot);
        for (Row before : rows(snapshot, "RHN_SC_SCHED_SLOT_POOL")) {
            var actual = pools.findWithLockByIdAndTenantId(before.id(), scope.tenantId()).orElseThrow();
            long expected = amount(before, "QTY_OCCPD").longValueExact() - releasing.getOrDefault(before.id(), 0L);
            if (actual.occupiedCount() != expected) throw conflict("MAINTENANCE_SLOT_VERIFY_FAILED", "预约号源释放校验失败");
        }
    }
    private Map<Long, Long> occupied(Capture snapshot) {
        return rows(snapshot, "RHN_SC_APPT").stream()
                .filter(row -> Set.of("REGISTERED", "BOOKED", "CHECKED_IN").contains(text(row, "SD_STATUS")))
                .collect(java.util.stream.Collectors.groupingBy(row -> id(row, "ID_SCHED_SLOT_POOL"), java.util.stream.Collectors.counting()));
    }
}
