package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "inpatient_order_events")
public class InpatientOrderEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "request_id", nullable = false) private Long requestId;
    @Column(name = "task_id") private Long taskId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "order_status_from") private String orderStatusFrom;
    @Column(name = "order_status_to") private String orderStatusTo;
    @Column(name = "task_status_from") private String taskStatusFrom;
    @Column(name = "task_status_to") private String taskStatusTo;
    @Column(name = "command_code", nullable = false) private String commandCode;
    @Column private String reason;
    @Column(name = "actor_id", nullable = false) private Long actorId;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected InpatientOrderEvent() {
    }

    public InpatientOrderEvent(Long tenantId, Long requestId, Long taskId, String eventType,
                               String orderStatusFrom, String orderStatusTo,
                               String taskStatusFrom, String taskStatusTo,
                               String commandCode, String reason, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.requestId = requestId;
        this.taskId = taskId;
        this.eventType = eventType;
        this.orderStatusFrom = orderStatusFrom;
        this.orderStatusTo = orderStatusTo;
        this.taskStatusFrom = taskStatusFrom;
        this.taskStatusTo = taskStatusTo;
        this.commandCode = commandCode;
        this.reason = reason;
        this.actorId = actorId;
        this.occurredAt = Instant.now();
    }

    public Long requestId() { return requestId; }
    public Long taskId() { return taskId; }
    public String commandCode() { return commandCode; }
}
