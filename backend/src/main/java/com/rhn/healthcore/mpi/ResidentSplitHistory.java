package com.rhn.healthcore.mpi;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@Entity
@Table(name = "resident_split_history")
class ResidentSplitHistory {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "merge_history_id", nullable = false)
    private Long mergeHistoryId;
    @Column(name = "restored_resident_id", nullable = false)
    private Long restoredResidentId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "restored_identifier_ids", nullable = false)
    private String restoredIdentifierIds;
    @Column(nullable = false)
    private String reason;
    @Column(name = "split_by", nullable = false)
    private String splitBy;
    @Column(name = "split_at", nullable = false)
    private Instant splitAt;

    protected ResidentSplitHistory() {
    }

    ResidentSplitHistory(Long tenantId, Long mergeHistoryId, Long restoredResidentId,
                         List<Long> restoredIdentifierIds, String reason, String actor) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.mergeHistoryId = mergeHistoryId;
        this.restoredResidentId = restoredResidentId;
        this.restoredIdentifierIds = restoredIdentifierIds.stream().map(String::valueOf)
                .collect(Collectors.joining(","));
        this.reason = reason;
        this.splitBy = actor;
        this.splitAt = Instant.now();
    }
}
