package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_EX_INP_ORDER_EVT")
public class InpatientOrderEvent {
    @Id @Column(name = "ID_INP_ORDER_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "ID_INP_ORDER_TASK") private Long taskId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_ORDER_STATUS_FROM") private String orderStatusFrom;
    @Column(name = "SD_ORDER_STATUS_TO") private String orderStatusTo;
    @Column(name = "SD_TASK_STATUS_FROM") private String taskStatusFrom;
    @Column(name = "SD_TASK_STATUS_TO") private String taskStatusTo;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_REASON") private String reason;
    @Column(name = "ID_ACTOR", nullable = false) private Long actorId;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

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
