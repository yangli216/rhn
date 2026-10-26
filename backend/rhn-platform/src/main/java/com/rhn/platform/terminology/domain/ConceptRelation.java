package com.rhn.platform.terminology.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/** 术语概念之间的有向关系；PART_OF 表示源概念是目标概念的一部分，用于部位层级。 */
@Entity
@Table(name = "RHN_BD_CONCEPT_REL")
public class ConceptRelation {
    public static final String PART_OF = "PART_OF";

    @Id @Column(name = "ID_CONCEPT_REL") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_CONCEPT", nullable = false) private Long conceptId;
    @Column(name = "ID_CONCEPT_TARGET", nullable = false) private Long targetConceptId;
    @Column(name = "SD_REL_TYPE", nullable = false) private String relationType;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected ConceptRelation() {}

    public ConceptRelation(Long conceptId, Long targetConceptId, String relationType, Long actorId) {
        if (conceptId.equals(targetConceptId)) throw new IllegalArgumentException("概念不能与自身建立关系");
        this.id = GlobalIds.next();
        this.conceptId = conceptId;
        this.targetConceptId = targetConceptId;
        this.relationType = relationType;
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void changeStatus(String status, Long actorId) {
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long conceptId() { return conceptId; }
    public Long targetConceptId() { return targetConceptId; }
    public String relationType() { return relationType; }
    public String status() { return status; }
    public boolean active() { return "ACTIVE".equals(status); }
}
