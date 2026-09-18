package com.rhn.queueing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Entity
@Table(name = "RHN_SC_QUEUE_TICKET")
public class QueueTicket {
    private static final Set<String> CANCELLABLE = Set.of("WAITING", "CALLED", "MISSED");

    @Id @Column(name = "ID_QUEUE_TICKET") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_SVC_QUEUE", nullable = false) private Long serviceQueueId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC") private Long encounterId;
    @Column(name = "SD_SOURCE_TYPE", nullable = false) private String sourceType;
    @Column(name = "ID_SOURCE", nullable = false) private Long sourceId;
    @Column(name = "CD_IDEMP", nullable = false) private String idempotencyCode;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Column(name = "CD_TICKET", nullable = false) private String ticketCode;
    @Column(name = "SN_SEQUENCE", nullable = false) private int sequenceNo;
    @Column(name = "SN_PRIORITY", nullable = false) private int priority;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CHECKED_IN", nullable = false) private Instant checkedInAt;
    @Column(name = "DT_READY") private Instant readyAt;
    @Column(name = "DT_CALLED") private Instant calledAt;
    @Column(name = "DT_STARTED") private Instant startedAt;
    @Column(name = "DT_COMPLETED") private Instant completedAt;
    @Column(name = "QTY_CALL", nullable = false) private int callCount;
    @Column(name = "QTY_MISSED", nullable = false) private int missedCount;
    @Column(name = "ID_SVC_LOC_CURRENT") private Long currentLocationId;

    protected QueueTicket() {}

    public QueueTicket(Long tenantId, Long serviceQueueId, Long residentId, Long encounterId,
                       String sourceType, Long sourceId, String idempotencyCode, LocalDate businessDate,
                       String ticketCode, int sequenceNo, int priority, boolean ready, Instant now) {
        this(tenantId, 1L, 1L, serviceQueueId, residentId, encounterId, sourceType, sourceId,
                idempotencyCode, businessDate, ticketCode, sequenceNo, priority, ready, now);
    }

    public QueueTicket(Long tenantId, Long organizationId, Long departmentId,
                       Long serviceQueueId, Long residentId, Long encounterId,
                       String sourceType, Long sourceId, String idempotencyCode, LocalDate businessDate,
                       String ticketCode, int sequenceNo, int priority, boolean ready, Instant now) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.serviceQueueId = serviceQueueId;
        this.residentId = residentId;
        this.encounterId = encounterId;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.idempotencyCode = idempotencyCode;
        this.businessDate = businessDate;
        this.ticketCode = ticketCode;
        this.sequenceNo = sequenceNo;
        this.priority = priority;
        this.status = "WAITING";
        this.checkedInAt = now;
        this.readyAt = ready ? now : null;
    }

    public boolean ready(Instant now) {
        if (readyAt != null) return false;
        requireStatus("WAITING", "QUEUE_TICKET_NOT_WAITING", "只有候等中的号票可以标记为可呼叫");
        readyAt = now;
        return true;
    }

    public String call(Long locationId, Instant now) {
        requireStatus("WAITING", "QUEUE_TICKET_NOT_WAITING", "只有候等中的号票可以叫号");
        if (readyAt == null || readyAt.isAfter(now)) {
            throw conflict("QUEUE_TICKET_NOT_READY", "号票尚未达到可呼叫条件");
        }
        String previous = status;
        status = "CALLED";
        calledAt = now;
        callCount++;
        currentLocationId = locationId;
        return previous;
    }

    public String recall(Long locationId, Instant now) {
        requireStatus("CALLED", "QUEUE_TICKET_NOT_CALLED", "只有已叫号的号票可以重呼");
        calledAt = now;
        callCount++;
        if (locationId != null) currentLocationId = locationId;
        return status;
    }

    public String miss(Instant now) {
        requireStatus("CALLED", "QUEUE_TICKET_NOT_CALLED", "只有已叫号的号票可以设为过号");
        String previous = status;
        status = "MISSED";
        missedCount++;
        return previous;
    }

    public String requeue(Instant now) {
        requireStatus("MISSED", "QUEUE_TICKET_NOT_MISSED", "只有已过号的号票可以回队");
        String previous = status;
        status = "WAITING";
        currentLocationId = null;
        return previous;
    }

    public String start(Long locationId, Instant now) {
        requireStatus("CALLED", "QUEUE_TICKET_NOT_CALLED", "号票需先叫号才能开始服务");
        String previous = status;
        status = "SERVING";
        startedAt = now;
        if (locationId != null) currentLocationId = locationId;
        return previous;
    }

    public String suspend() {
        requireStatus("SERVING", "QUEUE_TICKET_NOT_SERVING", "只有服务中的号票可以暂挂");
        String previous = status;
        status = "SUSPENDED";
        return previous;
    }

    public String resume(Long locationId) {
        requireStatus("SUSPENDED", "QUEUE_TICKET_NOT_SUSPENDED", "只有已暂挂的号票可以恢复服务");
        String previous = status;
        status = "SERVING";
        if (locationId != null) currentLocationId = locationId;
        return previous;
    }

    public String complete(Instant now) {
        if (!Set.of("SERVING", "SUSPENDED").contains(status)) {
            throw conflict("QUEUE_TICKET_NOT_COMPLETABLE", "只有服务中或已暂挂的号票可以结束");
        }
        String previous = status;
        status = "COMPLETED";
        completedAt = now;
        return previous;
    }

    public String cancel(Instant now) {
        if ("CANCELLED".equals(status)) return status;
        if (!CANCELLABLE.contains(status)) {
            throw conflict("QUEUE_TICKET_NOT_CANCELLABLE", "已经开始服务的号票不能取消");
        }
        String previous = status;
        status = "CANCELLED";
        completedAt = now;
        return previous;
    }

    private void requireStatus(String expected, String code, String message) {
        if (!expected.equals(status)) throw conflict(code, message);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long serviceQueueId() { return serviceQueueId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public String sourceType() { return sourceType; }
    public Long sourceId() { return sourceId; }
    public LocalDate businessDate() { return businessDate; }
    public String ticketCode() { return ticketCode; }
    public int sequenceNo() { return sequenceNo; }
    public int priority() { return priority; }
    public String status() { return status; }
    public Instant checkedInAt() { return checkedInAt; }
    public Instant readyAt() { return readyAt; }
    public Instant calledAt() { return calledAt; }
    public Instant startedAt() { return startedAt; }
    public Instant completedAt() { return completedAt; }
    public int callCount() { return callCount; }
    public int missedCount() { return missedCount; }
    public Long currentLocationId() { return currentLocationId; }
}
