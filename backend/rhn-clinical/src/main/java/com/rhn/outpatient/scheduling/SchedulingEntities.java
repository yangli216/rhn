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
@Table(name = "RHN_SYS_SVC_RSRC")
class ServiceResource {
    @Id @Column(name = "ID_SVC_RSRC") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "SD_RSRC_TYPE", nullable = false) private String resourceType;
    @Column(name = "CD_RSRC_KEY", nullable = false) private String resourceKey;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_STAFF_ASSIGN") private Long assignmentId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "CD_RSRC", nullable = false) private String resourceCode;
    @Column(name = "NA_RSRC", nullable = false) private String resourceName;
    @Column(name = "CD_SVC_SNAP", nullable = false) private String serviceCodeSnapshot;
    @Column(name = "NA_SVC_SNAP", nullable = false) private String serviceNameSnapshot;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ServiceResource() {}

    ServiceResource(Long tenantId, Long organizationId, Long departmentId, ScheduleRegistrationScope scope,
                    Long practitionerId, Long assignmentId, Long catalogItemId, String ownerName,
                    String serviceCode, String serviceName, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.resourceType = scope.name();
        this.resourceKey = scope == ScheduleRegistrationScope.DEPARTMENT
                ? "DEPARTMENT:" + departmentId : "PRACTITIONER:" + practitionerId;
        this.practitionerId = practitionerId;
        this.assignmentId = assignmentId;
        this.catalogItemId = catalogItemId;
        this.resourceCode = "SR-" + id;
        this.resourceName = ownerName + " · " + serviceName;
        this.serviceCodeSnapshot = serviceCode;
        this.serviceNameSnapshot = serviceName;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    void refresh(Long assignmentId, String ownerName, String serviceCode, String serviceName, Long actorId) {
        this.assignmentId = assignmentId;
        this.resourceName = ownerName + " · " + serviceName;
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
    String resourceType() { return resourceType; }
    String resourceKey() { return resourceKey; }
    Long practitionerId() { return practitionerId; }
    Long assignmentId() { return assignmentId; }
    Long catalogItemId() { return catalogItemId; }
    String resourceName() { return resourceName; }
    String serviceCode() { return serviceCodeSnapshot; }
    String serviceName() { return serviceNameSnapshot; }
}

@Entity
@Table(name = "RHN_SC_SCHED_TMPL")
class ScheduleTemplate {
    @Id @Column(name = "ID_SCHED_TMPL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SVC_RSRC", nullable = false) private Long resourceId;
    @Column(name = "CD_TMPL", nullable = false) private String templateCode;
    @Column(name = "NA_TMPL", nullable = false) private String templateName;
    @Column(name = "SD_MGMT_MODE", nullable = false) private String managementMode;
    @Column(name = "CD_TZ", nullable = false) private String timezoneCode;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ScheduleTemplate() {}

    ScheduleTemplate(Long tenantId, Long resourceId, String name, String timezoneCode,
                     LocalDate validFrom, LocalDate validTo, Long actorId) {
        this(tenantId, resourceId, name, ScheduleManagementMode.SIMPLE, timezoneCode,
                validFrom, validTo, actorId);
    }

    ScheduleTemplate(Long tenantId, Long resourceId, String name, ScheduleManagementMode managementMode,
                     String timezoneCode, LocalDate validFrom, LocalDate validTo, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.resourceId = resourceId;
        this.templateCode = "ST-" + id;
        this.templateName = name;
        this.managementMode = managementMode.name();
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
    Long tenantId() { return tenantId; }
    Long resourceId() { return resourceId; }
    String templateCode() { return templateCode; }
    String templateName() { return templateName; }
    String managementMode() { return managementMode; }
    LocalDate validFrom() { return validFrom; }
    LocalDate validTo() { return validTo; }
    String status() { return status; }
    Instant updatedAt() { return updatedAt; }
}

@Entity
@Table(name = "RHN_SC_SCHED_TMPL_PERIOD")
class ScheduleTemplatePeriod {
    @Id @Column(name = "ID_SCHED_TMPL_PERIOD") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SCHED_TMPL", nullable = false) private Long templateId;
    @Column(name = "SD_DAY_OF_WEEK", nullable = false) private int dayOfWeek;
    @Column(name = "SD_DAY_PART", nullable = false) private String dayPart;
    @Column(name = "QTY_MINUTE_START", nullable = false) private int minuteStart;
    @Column(name = "QTY_MINUTE_END", nullable = false) private int minuteEnd;
    @Column(name = "QTY_DEFAULT_CAPCTY", nullable = false) private int defaultCapacity;
    @Column(name = "SD_SLOT_MODE", nullable = false) private String slotMode;
    @Column(name = "QTY_SLOT_MINUTES") private Integer slotMinutes;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;

    protected ScheduleTemplatePeriod() {}

    ScheduleTemplatePeriod(Long tenantId, Long templateId, int dayOfWeek, ScheduleDayPart dayPart,
                           int minuteStart, int minuteEnd, int defaultCapacity) {
        this(tenantId, templateId, dayOfWeek, dayPart, minuteStart, minuteEnd,
                defaultCapacity, "POOL", null);
    }

    ScheduleTemplatePeriod(Long tenantId, Long templateId, int dayOfWeek, ScheduleDayPart dayPart,
                           int minuteStart, int minuteEnd, int defaultCapacity,
                           String slotMode, Integer slotMinutes) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.templateId = templateId;
        this.dayOfWeek = dayOfWeek;
        this.dayPart = dayPart.name();
        this.minuteStart = minuteStart;
        this.minuteEnd = minuteEnd;
        this.defaultCapacity = defaultCapacity;
        this.slotMode = slotMode;
        this.slotMinutes = slotMinutes;
        this.active = true;
    }

    Long id() { return id; }
    int dayOfWeek() { return dayOfWeek; }
    String dayPart() { return dayPart; }
    int minuteStart() { return minuteStart; }
    int minuteEnd() { return minuteEnd; }
    int defaultCapacity() { return defaultCapacity; }
    String slotMode() { return slotMode; }
    Integer slotMinutes() { return slotMinutes; }
}

@Entity
@Table(name = "RHN_SC_SCHED_EXCEPT")
class ScheduleException {
    @Id @Column(name = "ID_SCHED_EXCEPT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SCHED_TMPL", nullable = false) private Long templateId;
    @Column(name = "DA_EXCEPT", nullable = false) private LocalDate exceptionDate;
    @Column(name = "SD_EXCEPT_TYPE", nullable = false) private String exceptionType;
    @Column(name = "QTY_MINUTE_START") private Integer minuteStart;
    @Column(name = "QTY_MINUTE_END") private Integer minuteEnd;
    @Column(name = "QTY_CAPCTY") private Integer capacity;
    @Column(name = "QTY_SLOT_MINUTES") private Integer slotMinutes;
    @Column(name = "DES_REASON", nullable = false) private String reason;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

    protected ScheduleException() {}

    ScheduleException(Long tenantId, Long templateId, LocalDate exceptionDate, String exceptionType,
                      Integer minuteStart, Integer minuteEnd, Integer capacity, Integer slotMinutes,
                      String reason, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.templateId = templateId;
        this.exceptionDate = exceptionDate;
        this.exceptionType = exceptionType;
        this.minuteStart = minuteStart;
        this.minuteEnd = minuteEnd;
        this.capacity = capacity;
        this.slotMinutes = slotMinutes;
        this.reason = reason;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
    }

    Long id() { return id; }
    LocalDate exceptionDate() { return exceptionDate; }
    String exceptionType() { return exceptionType; }
    Integer minuteStart() { return minuteStart; }
    Integer minuteEnd() { return minuteEnd; }
    Integer capacity() { return capacity; }
    Integer slotMinutes() { return slotMinutes; }
    String reason() { return reason; }
}

@Entity
@Table(name = "RHN_SC_SCHED_GEN_RUN")
class ScheduleGenerationRun {
    @Id @Column(name = "ID_SCHED_GEN_RUN") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SCHED_TMPL", nullable = false) private Long templateId;
    @Column(name = "CD_IDEMP", nullable = false) private String idempotencyCode;
    @Column(name = "DA_DATE_FROM", nullable = false) private LocalDate dateFrom;
    @Column(name = "DA_DATE_TO", nullable = false) private LocalDate dateTo;
    @Column(name = "SD_TRIGGER_TYPE", nullable = false) private String triggerType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "QTY_GEND", nullable = false) private int generatedCount;
    @Column(name = "QTY_SKIPPED", nullable = false) private int skippedCount;
    @Lob @Column(name = "JSON_REQ", nullable = false) private String requestJson;
    @Column(name = "DT_STARTED", nullable = false) private Instant startedAt;
    @Column(name = "DT_CMPLD") private Instant completedAt;
    @Column(name = "DES_ERROR_MSG") private String errorMessage;
    @Column(name = "ID_USER_TRIGD", nullable = false) private Long triggeredBy;

    protected ScheduleGenerationRun() {}

    ScheduleGenerationRun(Long tenantId, Long templateId, String idempotencyCode,
                          LocalDate dateFrom, LocalDate dateTo, String requestJson, Long actorId) {
        this(tenantId, templateId, idempotencyCode, dateFrom, dateTo, "QUICK_CREATE", requestJson, actorId);
    }

    ScheduleGenerationRun(Long tenantId, Long templateId, String idempotencyCode,
                          LocalDate dateFrom, LocalDate dateTo, String triggerType,
                          String requestJson, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.templateId = templateId;
        this.idempotencyCode = idempotencyCode;
        this.dateFrom = dateFrom;
        this.dateTo = dateTo;
        this.triggerType = triggerType;
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
    Long templateId() { return templateId; }
    int generatedCount() { return generatedCount; }
    int skippedCount() { return skippedCount; }
}

@Entity
@Table(name = "RHN_SC_SVC_SCHED")
class ServiceSchedule {
    @Id @Column(name = "ID_SVC_SCHED") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SVC_RSRC", nullable = false) private Long resourceId;
    @Column(name = "ID_SCHED_TMPL", nullable = false) private Long templateId;
    @Column(name = "ID_SCHED_TMPL_PERIOD", nullable = false) private Long templatePeriodId;
    @Column(name = "ID_SCHED_GEN_RUN", nullable = false) private Long generationRunId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "SD_REG_SCOPE", nullable = false) private String registrationScope;
    @Column(name = "ID_PRACT") private Long practitionerId;
    @Column(name = "ID_STAFF_ASSIGN") private Long assignmentId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "CD_SCHED", nullable = false) private String scheduleCode;
    @Column(name = "SD_MGMT_MODE", nullable = false) private String managementMode;
    @Column(name = "SD_SCHED_TYPE", nullable = false) private String scheduleType;
    @Column(name = "SD_BOOKING_POLICY", nullable = false) private String bookingPolicy;
    @Column(name = "SD_DAY_PART", nullable = false) private String dayPart;
    @Column(name = "NA_PRACT_SNAP") private String practitionerNameSnapshot;
    @Column(name = "CD_SVC_SNAP", nullable = false) private String serviceCodeSnapshot;
    @Column(name = "NA_SVC_SNAP", nullable = false) private String serviceNameSnapshot;
    @Column(name = "NA_LOC") private String locationName;
    @Column(name = "CD_TZ", nullable = false) private String timezoneCode;
    @Column(name = "DA_SVC", nullable = false) private LocalDate serviceDate;
    @Column(name = "DT_START", nullable = false) private Instant startAt;
    @Column(name = "DT_END", nullable = false) private Instant endAt;
    @Column(name = "QTY_TOTAL_CAPCTY", nullable = false) private int totalCapacity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ServiceSchedule() {}

    ServiceSchedule(Long tenantId, Long resourceId, Long templateId, Long templatePeriodId,
                    Long generationRunId, Long organizationId, Long departmentId, Long practitionerId,
                    Long assignmentId, Long catalogItemId, ScheduleDayPart dayPart,
                    String practitionerName, String serviceCode, String serviceName, String locationName,
                    String timezoneCode, LocalDate serviceDate, Instant startAt, Instant endAt,
                    int totalCapacity, Long actorId) {
        this(tenantId, resourceId, templateId, templatePeriodId, generationRunId, organizationId,
                departmentId, practitionerId, assignmentId, catalogItemId, dayPart, practitionerName,
                serviceCode, serviceName, locationName, timezoneCode, serviceDate, startAt, endAt,
                totalCapacity, ScheduleManagementMode.SIMPLE, "SHARED", actorId);
    }

    ServiceSchedule(Long tenantId, Long resourceId, Long templateId, Long templatePeriodId,
                    Long generationRunId, Long organizationId, Long departmentId, Long practitionerId,
                    Long assignmentId, Long catalogItemId, ScheduleDayPart dayPart,
                    String practitionerName, String serviceCode, String serviceName, String locationName,
                    String timezoneCode, LocalDate serviceDate, Instant startAt, Instant endAt,
                    int totalCapacity, ScheduleManagementMode managementMode, String bookingPolicy,
                    Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.resourceId = resourceId;
        this.templateId = templateId;
        this.templatePeriodId = templatePeriodId;
        this.generationRunId = generationRunId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.registrationScope = practitionerId == null
                ? ScheduleRegistrationScope.DEPARTMENT.name() : ScheduleRegistrationScope.PRACTITIONER.name();
        this.practitionerId = practitionerId;
        this.assignmentId = assignmentId;
        this.catalogItemId = catalogItemId;
        this.scheduleCode = "SCH-" + id;
        this.managementMode = managementMode.name();
        this.scheduleType = "OUTPATIENT";
        this.bookingPolicy = bookingPolicy;
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
    String registrationScope() { return registrationScope; }
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
    int totalCapacity() { return totalCapacity; }

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
@Table(name = "RHN_SC_SCHED_SLOT_POOL")
class ScheduleSlotPool {
    @Id @Column(name = "ID_SCHED_SLOT_POOL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SVC_SCHED", nullable = false) private Long scheduleId;
    @Column(name = "CD_POOL", nullable = false) private String poolCode;
    @Column(name = "SD_SLOT_MODE", nullable = false) private String slotMode;
    @Column(name = "SD_QUOTA_MODE", nullable = false) private String quotaMode;
    @Column(name = "QTY_TOTAL", nullable = false) private int totalCount;
    @Column(name = "QTY_HELD", nullable = false) private int heldCount;
    @Column(name = "QTY_OCCPD", nullable = false) private int occupiedCount;
    @Column(name = "QTY_FROZEN", nullable = false) private int frozenCount;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected ScheduleSlotPool() {}

    ScheduleSlotPool(Long tenantId, Long scheduleId, int totalCount) {
        this(tenantId, scheduleId, totalCount, "POOL");
    }

    ScheduleSlotPool(Long tenantId, Long scheduleId, int totalCount, String slotMode) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.scheduleId = scheduleId;
        this.poolCode = "SP-" + id;
        this.slotMode = slotMode;
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

    void releaseOccupiedOne() {
        if (occupiedCount <= 0) {
            throw com.rhn.shared.api.BusinessErrors.conflict("SCHEDULE_OCCUPIED_SLOT_MISSING",
                    "预约占用的号源不存在，请刷新后重试");
        }
        occupiedCount--;
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
@Table(name = "RHN_SC_SVC_SCHED_EVT")
class ServiceScheduleEvent {
    @Id @Column(name = "ID_SVC_SCHED_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SVC_SCHED", nullable = false) private Long scheduleId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO", nullable = false) private String statusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_USER_ACTOR", nullable = false) private Long actorUserId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "DES_SVC_SCHED_EVT") private String description;

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
@Table(name = "RHN_SC_SLOT_EVT")
class SlotEvent {
    @Id @Column(name = "ID_SLOT_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SCHED_SLOT_POOL", nullable = false) private Long poolId;
    @Column(name = "ID_SVC_SCHED", nullable = false) private Long scheduleId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SN_SEQ", nullable = false) private int sequenceNo;
    @Column(name = "QTY_TOTAL_DELTA", nullable = false) private int totalDelta;
    @Column(name = "QTY_HELD_DELTA", nullable = false) private int heldDelta;
    @Column(name = "QTY_OCCPD_DELTA", nullable = false) private int occupiedDelta;
    @Column(name = "QTY_FROZEN_DELTA", nullable = false) private int frozenDelta;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "ID_USER_ACTOR", nullable = false) private Long actorUserId;
    @Column(name = "DT_OCCRD", nullable = false) private Instant occurredAt;
    @Column(name = "DES_SLOT_EVT") private String description;

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
