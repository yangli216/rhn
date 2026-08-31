package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;

/** Durable execution fact for one automatically generated ward supply window. */
@Entity
@Table(name = "inpatient_med_supply_gen_runs")
public class InpatientMedicationSupplyGenerationRun {
    private static final int MAX_ATTEMPTS = 10;

    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id") private Long stockSiteId;
    @Column(name = "nursing_unit_department_id", nullable = false) private Long nursingUnitDepartmentId;
    @Column(name = "dispense_route_id") private Long dispenseRouteId;
    @Column(name = "dispense_route_revision") private Long dispenseRouteRevision;
    @Column(name = "medication_type_snapshot", nullable = false) private String medicationTypeSnapshot;
    @Column(name = "business_date", nullable = false) private LocalDate businessDate;
    @Column(name = "shift_code", nullable = false) private String shiftCode;
    @Column(name = "window_start", nullable = false) private Instant windowStart;
    @Column(name = "window_end", nullable = false) private Instant windowEnd;
    @Column(name = "job_key", nullable = false) private String jobKey;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column(name = "trigger_type", nullable = false) private String triggerType;
    @Column(nullable = false) private String status;
    @Column(name = "attempt_count", nullable = false) private int attemptCount;
    @Column(name = "next_attempt_at", nullable = false) private Instant nextAttemptAt;
    @Column(name = "claimed_by") private String claimedBy;
    @Column(name = "claimed_until") private Instant claimedUntil;
    @Column(name = "batch_id") private Long batchId;
    @Column(name = "last_error_code") private String lastErrorCode;
    @Column(name = "last_error") private String lastError;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    protected InpatientMedicationSupplyGenerationRun() {
    }

    public InpatientMedicationSupplyGenerationRun(Long tenantId, Long organizationId,
                                                   Long nursingUnitDepartmentId, String medicationTypeSnapshot,
                                                   Long stockSiteId, Long dispenseRouteId,
                                                   Long dispenseRouteRevision, LocalDate businessDate,
                                                   String shiftCode, Instant windowStart, Instant windowEnd,
                                                   String jobKey, String commandCode,
                                                   String routingErrorCode, String routingError, Instant now) {
        id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.nursingUnitDepartmentId = nursingUnitDepartmentId;
        this.medicationTypeSnapshot = medicationTypeSnapshot;
        requireCompleteRoute(stockSiteId, dispenseRouteId, dispenseRouteRevision);
        this.stockSiteId = stockSiteId;
        this.dispenseRouteId = dispenseRouteId;
        this.dispenseRouteRevision = dispenseRouteRevision;
        this.businessDate = businessDate;
        this.shiftCode = shiftCode;
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.jobKey = jobKey;
        this.commandCode = commandCode;
        this.triggerType = "AUTO";
        this.status = hasRoute() ? "PENDING" : "ROUTING_BLOCKED";
        this.attemptCount = 0;
        this.nextAttemptAt = now;
        if (!hasRoute()) {
            this.lastErrorCode = errorCode(routingErrorCode, "INPATIENT_SUPPLY_ROUTE_NOT_FOUND");
            this.lastError = errorMessage(routingError, "未找到可用的住院供药路由");
        }
        this.createdAt = now;
        this.updatedAt = now;
    }

    public int claim(String workerId, Instant now, Duration lease) {
        status = "RUNNING";
        attemptCount++;
        claimedBy = workerId;
        claimedUntil = now.plus(lease);
        if (startedAt == null) startedAt = now;
        updatedAt = now;
        return attemptCount;
    }

    public boolean succeed(String workerId, int expectedAttemptCount, Long generatedBatchId, Instant now) {
        if (!ownsClaim(workerId, expectedAttemptCount)) return false;
        status = "SUCCEEDED";
        batchId = generatedBatchId;
        completedAt = now;
        lastErrorCode = null;
        lastError = null;
        releaseClaim();
        updatedAt = now;
        return true;
    }

    public boolean noDemand(String workerId, int expectedAttemptCount, Instant now) {
        if (!ownsClaim(workerId, expectedAttemptCount)) return false;
        status = "NO_DEMAND";
        completedAt = now;
        lastErrorCode = null;
        lastError = null;
        releaseClaim();
        updatedAt = now;
        return true;
    }

    public boolean fail(String workerId, int expectedAttemptCount, String code,
                        RuntimeException error, Instant now) {
        if (!ownsClaim(workerId, expectedAttemptCount)) return false;
        status = attemptCount >= MAX_ATTEMPTS ? "EXHAUSTED" : "FAILED";
        lastErrorCode = errorCode(code, "INPATIENT_SUPPLY_GENERATION_FAILED");
        String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
        lastError = truncate(message, 1000);
        long delaySeconds = Math.min(300, 1L << Math.min(attemptCount, 8));
        nextAttemptAt = now.plusSeconds(delaySeconds);
        if ("EXHAUSTED".equals(status)) completedAt = now;
        releaseClaim();
        updatedAt = now;
        return true;
    }

    public boolean blockRouting(String workerId, int expectedAttemptCount, String code,
                                String message, Instant now) {
        if (!ownsClaim(workerId, expectedAttemptCount)) return false;
        stockSiteId = null;
        dispenseRouteId = null;
        dispenseRouteRevision = null;
        status = "ROUTING_BLOCKED";
        lastErrorCode = errorCode(code, "INPATIENT_SUPPLY_ROUTE_NOT_FOUND");
        lastError = errorMessage(message, "未找到可用的住院供药路由");
        releaseClaim();
        updatedAt = now;
        return true;
    }

    public boolean recoverRouting(Long stockSiteId, Long dispenseRouteId,
                                  Long dispenseRouteRevision, Instant now) {
        if (!"ROUTING_BLOCKED".equals(status)) return false;
        requireCompleteRoute(stockSiteId, dispenseRouteId, dispenseRouteRevision);
        this.stockSiteId = stockSiteId;
        this.dispenseRouteId = dispenseRouteId;
        this.dispenseRouteRevision = dispenseRouteRevision;
        status = "PENDING";
        nextAttemptAt = now;
        lastErrorCode = null;
        lastError = null;
        completedAt = null;
        updatedAt = now;
        return true;
    }

    public void refreshRoutingBlock(String code, String message, Instant now) {
        if (!"ROUTING_BLOCKED".equals(status)) return;
        lastErrorCode = errorCode(code, "INPATIENT_SUPPLY_ROUTE_NOT_FOUND");
        lastError = errorMessage(message, "未找到可用的住院供药路由");
        updatedAt = now;
    }

    private boolean ownsClaim(String workerId, int expectedAttemptCount) {
        return "RUNNING".equals(status) && workerId != null && workerId.equals(claimedBy)
                && attemptCount == expectedAttemptCount;
    }

    private boolean hasRoute() {
        return stockSiteId != null && dispenseRouteId != null && dispenseRouteRevision != null;
    }

    private static void requireCompleteRoute(Long stockSiteId, Long dispenseRouteId, Long dispenseRouteRevision) {
        boolean empty = stockSiteId == null && dispenseRouteId == null && dispenseRouteRevision == null;
        boolean complete = stockSiteId != null && dispenseRouteId != null && dispenseRouteRevision != null;
        if (!empty && !complete) throw new IllegalArgumentException("Supply route snapshot must be all empty or all present");
    }

    private static String errorCode(String value, String fallback) {
        String selected = value == null || value.isBlank() ? fallback : value.trim();
        return truncate(selected, 64);
    }

    private static String errorMessage(String value, String fallback) {
        String selected = value == null || value.isBlank() ? fallback : value.trim();
        return truncate(selected, 1000);
    }

    private static String truncate(String value, int limit) {
        return value.substring(0, Math.min(limit, value.length()));
    }

    private void releaseClaim() {
        claimedBy = null;
        claimedUntil = null;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long nursingUnitDepartmentId() { return nursingUnitDepartmentId; }
    public Long dispenseRouteId() { return dispenseRouteId; }
    public Long dispenseRouteRevision() { return dispenseRouteRevision; }
    public String medicationTypeSnapshot() { return medicationTypeSnapshot; }
    public LocalDate businessDate() { return businessDate; }
    public String shiftCode() { return shiftCode; }
    public Instant windowStart() { return windowStart; }
    public Instant windowEnd() { return windowEnd; }
    public String jobKey() { return jobKey; }
    public String commandCode() { return commandCode; }
    public String status() { return status; }
    public int attemptCount() { return attemptCount; }
    public String claimedBy() { return claimedBy; }
    public Long batchId() { return batchId; }
    public String lastErrorCode() { return lastErrorCode; }
    public String lastError() { return lastError; }
}
