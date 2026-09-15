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
@Table(name = "RHN_PI_PAT_SPLIT_HIST")
class ResidentSplitHistory {
    @Id
    @Column(name = "ID_PAT_SPLIT_HIST") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PAT_MERGE_HIST", nullable = false)
    private Long mergeHistoryId;
    @Column(name = "ID_PAT_RESTORED", nullable = false)
    private Long restoredResidentId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "RESTORED_IDENTIFIER_IDS", nullable = false)
    private String restoredIdentifierIds;
    @Column(name = "DES_REASON", nullable = false)
    private String reason;
    @Column(name = "ID_USER_SPLIT", nullable = false)
    private String splitBy;
    @Column(name = "DT_SPLIT", nullable = false)
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
