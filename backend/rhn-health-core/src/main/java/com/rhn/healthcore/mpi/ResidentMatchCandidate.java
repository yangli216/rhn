package com.rhn.healthcore.mpi;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_PI_PAT_MATCH_CAND")
class ResidentMatchCandidate {
    @Id
    @Column(name = "ID_PAT_MATCH_CAND") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PAT_SRC_RECORD", nullable = false)
    private Long sourceRecordId;
    @Column(name = "ID_PAT_CAND", nullable = false)
    private Long candidateResidentId;
    @Column(name = "MATCH_SCORE", nullable = false)
    private BigDecimal matchScore;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_REASONS", nullable = false)
    private String reasonsJson;
    @Column(name = "SD_DCSN", nullable = false)
    private String decision;
    @Column(name = "ID_USER_RVWD")
    private String reviewedBy;
    @Column(name = "DT_RVWD")
    private Instant reviewedAt;

    protected ResidentMatchCandidate() {
    }

    ResidentMatchCandidate(Long tenantId, Long sourceRecordId, Long candidateResidentId,
                           BigDecimal matchScore, String reasonsJson) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.sourceRecordId = sourceRecordId;
        this.candidateResidentId = candidateResidentId;
        this.matchScore = matchScore;
        this.reasonsJson = reasonsJson;
        this.decision = "PENDING";
    }

    void accept(String actor) { decide("ACCEPTED", actor); }
    void reject(String actor) { decide("REJECTED", actor); }
    private void decide(String decision, String actor) {
        this.decision = decision;
        this.reviewedBy = actor;
        this.reviewedAt = Instant.now();
    }
    Long id() { return id; }
    Long candidateResidentId() { return candidateResidentId; }
    BigDecimal matchScore() { return matchScore; }
    String reasonsJson() { return reasonsJson; }
    String decision() { return decision; }
}
