package com.rhn.healthcore.mpi;

import com.rhn.shared.api.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@Entity
@Table(name = "RHN_PI_PAT_MERGE_HIST")
class ResidentMergeHistory {
    @Id
    @Column(name = "ID_PAT_MERGE_HIST") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PAT_SURVIVING", nullable = false)
    private Long survivingResidentId;
    @Column(name = "ID_PAT_MERGED", nullable = false)
    private Long mergedResidentId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "MOVED_IDENTIFIER_IDS", nullable = false)
    private String movedIdentifierIds;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "MOVED_SOURCE_RECORD_IDS", nullable = false)
    private String movedSourceRecordIds;
    @Column(name = "DES_REASON", nullable = false)
    private String reason;
    @Column(name = "ID_USER_MERGED", nullable = false)
    private String mergedBy;
    @Column(name = "DT_MERGED", nullable = false)
    private Instant mergedAt;
    @Column(name = "DT_SPLIT")
    private Instant splitAt;

    protected ResidentMergeHistory() {
    }

    ResidentMergeHistory(Long tenantId, Long survivingResidentId, Long mergedResidentId,
                         List<Long> movedIdentifierIds, List<Long> movedSourceRecordIds,
                         String reason, String actor) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.survivingResidentId = survivingResidentId;
        this.mergedResidentId = mergedResidentId;
        this.movedIdentifierIds = movedIdentifierIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        this.movedSourceRecordIds = movedSourceRecordIds.stream().map(String::valueOf)
                .collect(Collectors.joining(","));
        this.reason = reason;
        this.mergedBy = actor;
        this.mergedAt = Instant.now();
    }

    void markSplit() {
        if (splitAt != null) {
            throw new BusinessException("RESIDENT_MERGE_ALREADY_SPLIT", "该合并记录已经执行过拆分",
                    HttpStatus.CONFLICT);
        }
        this.splitAt = Instant.now();
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long survivingResidentId() { return survivingResidentId; }
    Long mergedResidentId() { return mergedResidentId; }
    Instant mergedAt() { return mergedAt; }
    Instant splitAt() { return splitAt; }
    List<Long> movedIdentifierIds() {
        return movedIdentifierIds.isBlank() ? List.of()
                : java.util.Arrays.stream(movedIdentifierIds.split(",")).map(Long::valueOf).toList();
    }
    List<Long> movedSourceRecordIds() {
        return movedSourceRecordIds.isBlank() ? List.of()
                : java.util.Arrays.stream(movedSourceRecordIds.split(",")).map(Long::valueOf).toList();
    }
}
