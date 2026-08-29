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
@Table(name = "resident_match_candidates")
class ResidentMatchCandidate {
    @Id
    private Long id;
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;
    @Column(name = "source_record_id", nullable = false)
    private Long sourceRecordId;
    @Column(name = "candidate_resident_id", nullable = false)
    private Long candidateResidentId;
    @Column(name = "match_score", nullable = false)
    private BigDecimal matchScore;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "reasons_json", nullable = false)
    private String reasonsJson;
    @Column(nullable = false)
    private String decision;
    @Column(name = "reviewed_by")
    private String reviewedBy;
    @Column(name = "reviewed_at")
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
