package com.rhn.queueing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.LocalDate;

@Entity
@Table(name = "RHN_SC_QUEUE_COUNT")
public class QueueCounter {
    @Id @Column(name = "ID_QUEUE_COUNT") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_SVC_QUEUE", nullable = false) private Long serviceQueueId;
    @Column(name = "DA_BUSINESS", nullable = false) private LocalDate businessDate;
    @Column(name = "SN_NEXT", nullable = false) private int nextSequence;

    protected QueueCounter() {}

    public QueueCounter(Long tenantId, Long serviceQueueId, LocalDate businessDate) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.serviceQueueId = serviceQueueId;
        this.businessDate = businessDate;
        this.nextSequence = 1;
    }

    public int take() { return nextSequence++; }
}
