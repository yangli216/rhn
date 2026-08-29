package com.rhn.outpatient.scheduling;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

final class SchedulingEntities {
    private SchedulingEntities() {}
}

@Entity
@Table(name = "service_resources")
class ServiceResource {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "practitioner_id", nullable = false) private Long practitionerId;
    @Column(name = "assignment_id", nullable = false) private Long assignmentId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "resource_code", nullable = false) private String resourceCode;
    @Column(name = "resource_name", nullable = false) private String resourceName;
    @Column(name = "service_code_snapshot", nullable = false) private String serviceCodeSnapshot;
    @Column(name = "service_name_snapshot", nullable = false) private String serviceNameSnapshot;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ServiceResource() {}

    ServiceResource(Long tenantId, Long organizationId, Long departmentId, Long practitionerId,
                    Long assignmentId, Long catalogItemId, String practitionerName,
                    String serviceCode, String serviceName, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.practitionerId = practitionerId;
        this.assignmentId = assignmentId;
        this.catalogItemId = catalogItemId;
        this.resourceCode = "SR-" + id;
        this.resourceName = practitionerName + " · " + serviceName;
        this.serviceCodeSnapshot = serviceCode;
        this.serviceNameSnapshot = serviceName;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    void refresh(Long assignmentId, String practitionerName, String serviceCode, String serviceName, Long actorId) {
        this.assignmentId = assignmentId;
        this.resourceName = practitionerName + " · " + serviceName;
        this.serviceCodeSnapshot = serviceCode;
        this.serviceNameSnapshot = serviceName;
        this.status = "ACTIVE";
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
}

@Entity
@Table(name = "schedule_templates")
class ScheduleTemplate {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resource_id", nullable = false) private Long resourceId;
    @Column(name = "template_code", nullable = false) private String templateCode;
    @Column(name = "template_name", nullable = false) private String templateName;
    @Column(name = "management_mode", nullable = false) private String managementMode;
    @Column(name = "timezone_code", nullable = false) private String timezoneCode;
    @Column(name = "valid_from", nullable = false) private LocalDate validFrom;
    @Column(name = "valid_to") private LocalDate validTo;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ScheduleTemplate() {}

    ScheduleTemplate(Long tenantId, Long resourceId, String name, String timezoneCode,
                     LocalDate validFrom, LocalDate validTo, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.resourceId = resourceId;
        this.templateCode = "ST-" + id;
        this.templateName = name;
        this.managementMode = ScheduleManagementMode.SIMPLE.name();
        this.timezoneCode = timezoneCode;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    Long id() { return id; }
}

@Entity
@Table(name = "schedule_template_periods")
class ScheduleTemplatePeriod {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "day_of_week", nullable = false) private int dayOfWeek;
    @Column(name = "day_part", nullable = false) private String dayPart;
    @Column(name = "minute_start", nullable = false) private int minuteStart;
    @Column(name = "minute_end", nullable = false) private int minuteEnd;
    @Column(name = "default_capacity", nullable = false) private int defaultCapacity;
    @Column(name = "slot_mode", nullable = false) private String slotMode;
    @Column(nullable = false) private boolean active;

    protected ScheduleTemplatePeriod() {}

    ScheduleTemplatePeriod(Long tenantId, Long templateId, int dayOfWeek, ScheduleDayPart dayPart,
                           int minuteStart, int minuteEnd, int defaultCapacity) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.templateId = templateId;
        this.dayOfWeek = dayOfWeek;
        this.dayPart = dayPart.name();
        this.minuteStart = minuteStart;
        this.minuteEnd = minuteEnd;
        this.defaultCapacity = defaultCapacity;
        this.slotMode = "POOL";
        this.active = true;
    }

    Long id() { return id; }
    int dayOfWeek() { return dayOfWeek; }
    String dayPart() { return dayPart; }
    int minuteStart() { return minuteStart; }
    int minuteEnd() { return minuteEnd; }
}

@Entity
@Table(name = "schedule_generation_runs")
class ScheduleGenerationRun {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "idempotency_code", nullable = false) private String idempotencyCode;
    @Column(name = "date_from", nullable = false) private LocalDate dateFrom;
    @Column(name = "date_to", nullable = false) private LocalDate dateTo;
    @Column(name = "trigger_type", nullable = false) private String triggerType;
    @Column(nullable = false) private String status;
    @Column(name = "generated_count", nullable = false) private int generatedCount;
    @Column(name = "skipped_count", nullable = false) private int skippedCount;
    @Lob @Column(name = "request_json", nullable = false) private String requestJson;
    @Column(name = "started_at", nullable = false) private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "error_message") private String errorMessage;
    @Column(name = "triggered_by", nullable = false) private Long triggeredBy;

    protected ScheduleGenerationRun() {}

    ScheduleGenerationRun(Long tenantId, Long templateId, String idempotencyCode,
                          LocalDate dateFrom, LocalDate dateTo, String requestJson, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.templateId = templateId;
        this.idempotencyCode = idempotencyCode;
        this.dateFrom = dateFrom;
        this.dateTo = dateTo;
        this.triggerType = "QUICK_CREATE";
        this.status = "RUNNING";
        this.requestJson = requestJson;
        this.startedAt = Instant.now();
        this.triggeredBy = actorId;
    }

    void complete(int generatedCount, int skippedCount) {
        this.status = "COMPLETED";
        this.generatedCount = generatedCount;
        this.skippedCount = skippedCount;
        this.completedAt = Instant.now();
    }

    Long id() { return id; }
    int generatedCount() { return generatedCount; }
    int skippedCount() { return skippedCount; }
}

@Entity
@Table(name = "service_schedules")
class ServiceSchedule {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "resource_id", nullable = false) private Long resourceId;
    @Column(name = "template_id", nullable = false) private Long templateId;
    @Column(name = "template_period_id", nullable = false) private Long templatePeriodId;
    @Column(name = "generation_run_id", nullable = false) private Long generationRunId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id", nullable = false) private Long departmentId;
    @Column(name = "practitioner_id", nullable = false) private Long practitionerId;
    @Column(name = "assignment_id", nullable = false) private Long assignmentId;
    @Column(name = "catalog_item_id", nullable = false) private Long catalogItemId;
    @Column(name = "schedule_code", nullable = false) private String scheduleCode;
    @Column(name = "management_mode", nullable = false) private String managementMode;
    @Column(name = "schedule_type", nullable = false) private String scheduleType;
    @Column(name = "booking_policy", nullable = false) private String bookingPolicy;
    @Column(name = "day_part", nullable = false) private String dayPart;
    @Column(name = "practitioner_name_snapshot", nullable = false) private String practitionerNameSnapshot;
    @Column(name = "service_code_snapshot", nullable = false) private String serviceCodeSnapshot;
    @Column(name = "service_name_snapshot", nullable = false) private String serviceNameSnapshot;
    @Column(name = "location_name") private String locationName;
    @Column(name = "timezone_code", nullable = false) private String timezoneCode;
    @Column(name = "service_date", nullable = false) private LocalDate serviceDate;
    @Column(name = "start_at", nullable = false) private Instant startAt;
    @Column(name = "end_at", nullable = false) private Instant endAt;
    @Column(name = "total_capacity", nullable = false) private int totalCapacity;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ServiceSchedule() {}

    ServiceSchedule(Long tenantId, Long resourceId, Long templateId, Long templatePeriodId,
                    Long generationRunId, Long organizationId, Long departmentId, Long practitionerId,
                    Long assignmentId, Long catalogItemId, ScheduleDayPart dayPart,
                    String practitionerName, String serviceCode, String serviceName, String locationName,
                    String timezoneCode, LocalDate serviceDate, Instant startAt, Instant endAt,
                    int totalCapacity, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.resourceId = resourceId;
        this.templateId = templateId;
        this.templatePeriodId = templatePeriodId;
        this.generationRunId = generationRunId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.practitionerId = practitionerId;
        this.assignmentId = assignmentId;
        this.catalogItemId = catalogItemId;
        this.scheduleCode = "SCH-" + id;
        this.managementMode = ScheduleManagementMode.SIMPLE.name();
        this.scheduleType = "OUTPATIENT";
        this.bookingPolicy = "SHARED";
        this.dayPart = dayPart.name();
        this.practitionerNameSnapshot = practitionerName;
        this.serviceCodeSnapshot = serviceCode;
        this.serviceNameSnapshot = serviceName;
        this.locationName = locationName;
        this.timezoneCode = timezoneCode;
        this.serviceDate = serviceDate;
        this.startAt = startAt;
        this.endAt = endAt;
        this.totalCapacity = totalCapacity;
        this.status = "PUBLISHED";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    String scheduleCode() { return scheduleCode; }
    LocalDate serviceDate() { return serviceDate; }
    String dayPart() { return dayPart; }
    Instant startAt() { return startAt; }
    Instant endAt() { return endAt; }
    Long practitionerId() { return practitionerId; }
    String practitionerName() { return practitionerNameSnapshot; }
    Long catalogItemId() { return catalogItemId; }
    String serviceCode() { return serviceCodeSnapshot; }
    String serviceName() { return serviceNameSnapshot; }
    String locationName() { return locationName; }
    String status() { return status; }
    String managementMode() { return managementMode; }
    String bookingPolicy() { return bookingPolicy; }
    String timezoneCode() { return timezoneCode; }

    void update(Instant startAt, Instant endAt, int totalCapacity, String locationName, Long actorId) {
        this.startAt = startAt;
        this.endAt = endAt;
        this.totalCapacity = totalCapacity;
        this.locationName = locationName;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    String changeStatus(String target, Long actorId) {
        String previous = status;
        this.status = target;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
        return previous;
    }
}

@Entity
@Table(name = "schedule_slot_pools")
class ScheduleSlotPool {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "schedule_id", nullable = false) private Long scheduleId;
    @Column(name = "pool_code", nullable = false) private String poolCode;
    @Column(name = "slot_mode", nullable = false) private String slotMode;
    @Column(name = "quota_mode", nullable = false) private String quotaMode;
    @Column(name = "total_count", nullable = false) private int totalCount;
    @Column(name = "held_count", nullable = false) private int heldCount;
    @Column(name = "occupied_count", nullable = false) private int occupiedCount;
    @Column(name = "frozen_count", nullable = false) private int frozenCount;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected ScheduleSlotPool() {}

    ScheduleSlotPool(Long tenantId, Long scheduleId, int totalCount) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.scheduleId = scheduleId;
        this.poolCode = "SP-" + id;
        this.slotMode = "POOL";
        this.quotaMode = "SHARED";
        this.totalCount = totalCount;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    void occupyOne() {
        if (!"ACTIVE".equals(status) || heldCount + occupiedCount + frozenCount >= totalCount) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SCHEDULE_SLOT_UNAVAILABLE", "所选排班已无可用号源");
        }
        occupiedCount++;
        updatedAt = Instant.now();
    }

    void holdOne() {
        if (!"ACTIVE".equals(status) || heldCount + occupiedCount + frozenCount >= totalCount) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SCHEDULE_SLOT_UNAVAILABLE", "所选排班已无可用号源");
        }
        heldCount++;
        updatedAt = Instant.now();
    }

    void consumeHeldOne() {
        if (heldCount <= 0) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SCHEDULE_SLOT_HOLD_MISSING", "号源暂占已失效，请重新选择排班");
        }
        heldCount--;
        occupiedCount++;
        updatedAt = Instant.now();
    }

    void releaseHeldOne() {
        if (heldCount <= 0) return;
        heldCount--;
        updatedAt = Instant.now();
    }

    void changeCapacity(int capacity) {
        if (capacity < heldCount + occupiedCount + frozenCount) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SCHEDULE_CAPACITY_BELOW_USAGE",
                    "号源上限不能小于已暂占、已挂号和已冻结数量之和");
        }
        totalCount = capacity;
        updatedAt = Instant.now();
    }

    void freeze() {
        status = "FROZEN";
        updatedAt = Instant.now();
    }

    void activate() {
        status = "ACTIVE";
        updatedAt = Instant.now();
    }

    void close() {
        if (heldCount + occupiedCount + frozenCount > 0) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SCHEDULE_CANCEL_HAS_USAGE",
                    "班次已有暂占、挂号或冻结号源，请先完成影响处理");
        }
        status = "CLOSED";
        updatedAt = Instant.now();
    }

    Long id() { return id; }
    Long scheduleId() { return scheduleId; }
    String slotMode() { return slotMode; }
    int totalCount() { return totalCount; }
    int heldCount() { return heldCount; }
    int occupiedCount() { return occupiedCount; }
    int frozenCount() { return frozenCount; }
    String status() { return status; }
}

@Entity
@Table(name = "service_schedule_events")
class ServiceScheduleEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "schedule_id", nullable = false) private Long scheduleId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to", nullable = false) private String statusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "actor_user_id", nullable = false) private Long actorUserId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    private String description;

    protected ServiceScheduleEvent() {}

    ServiceScheduleEvent(Long tenantId, Long scheduleId, String commandCode, Long actorUserId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.scheduleId = scheduleId;
        this.eventType = "PUBLISHED";
        this.statusTo = "PUBLISHED";
        this.commandCode = commandCode;
        this.actorUserId = actorUserId;
        this.occurredAt = Instant.now();
        this.description = "简易排班生成并发布";
    }

    ServiceScheduleEvent(Long tenantId, Long scheduleId, String eventType, String statusFrom,
                         String statusTo, String commandCode, Long actorUserId, String description) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.scheduleId = scheduleId;
        this.eventType = eventType;
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.commandCode = commandCode;
        this.actorUserId = actorUserId;
        this.occurredAt = Instant.now();
        this.description = description;
    }
}

@Entity
@Table(name = "slot_events")
class SlotEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "pool_id", nullable = false) private Long poolId;
    @Column(name = "schedule_id", nullable = false) private Long scheduleId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "sequence_no", nullable = false) private int sequenceNo;
    @Column(name = "total_delta", nullable = false) private int totalDelta;
    @Column(name = "held_delta", nullable = false) private int heldDelta;
    @Column(name = "occupied_delta", nullable = false) private int occupiedDelta;
    @Column(name = "frozen_delta", nullable = false) private int frozenDelta;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "actor_user_id", nullable = false) private Long actorUserId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;
    private String description;

    protected SlotEvent() {}

    SlotEvent(Long tenantId, Long poolId, Long scheduleId, int totalCount,
              String commandCode, Long actorUserId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.poolId = poolId;
        this.scheduleId = scheduleId;
        this.eventType = "INITIALIZED";
        this.sequenceNo = 1;
        this.totalDelta = totalCount;
        this.commandCode = commandCode;
        this.actorUserId = actorUserId;
        this.occurredAt = Instant.now();
        this.description = "初始化共享号池";
    }

    SlotEvent(Long tenantId, Long poolId, Long scheduleId, int sequenceNo,
              String commandCode, Long actorUserId, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.poolId = poolId;
        this.scheduleId = scheduleId; this.eventType = "OCCUPIED"; this.sequenceNo = sequenceNo;
        this.occupiedDelta = 1; this.commandCode = commandCode; this.actorUserId = actorUserId;
        this.occurredAt = Instant.now(); this.description = description;
    }

    SlotEvent(Long tenantId, Long poolId, Long scheduleId, String eventType, int sequenceNo,
              int heldDelta, int occupiedDelta, String commandCode, Long actorUserId, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.poolId = poolId;
        this.scheduleId = scheduleId; this.eventType = eventType; this.sequenceNo = sequenceNo;
        this.heldDelta = heldDelta; this.occupiedDelta = occupiedDelta;
        this.commandCode = commandCode; this.actorUserId = actorUserId;
        this.occurredAt = Instant.now(); this.description = description;
    }

    SlotEvent(Long tenantId, Long poolId, Long scheduleId, int sequenceNo, int totalDelta,
              String commandCode, Long actorUserId, String description) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.poolId = poolId;
        this.scheduleId = scheduleId; this.eventType = "CAPACITY_CHANGED"; this.sequenceNo = sequenceNo;
        this.totalDelta = totalDelta; this.commandCode = commandCode; this.actorUserId = actorUserId;
        this.occurredAt = Instant.now(); this.description = description;
    }

    int sequenceNo() { return sequenceNo; }
}
