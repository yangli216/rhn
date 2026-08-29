package com.rhn.platform.terminology.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "value_set_members")
public class ValueSetMember {
    @Id
    private Long id;
    @Column(name = "value_set_id", nullable = false)
    private Long valueSetId;
    @Column(name = "concept_id", nullable = false)
    private Long conceptId;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ValueSetMember() {
    }

    public ValueSetMember(Long valueSetId, Long conceptId, int sortOrder) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.valueSetId = valueSetId;
        this.conceptId = conceptId;
        this.sortOrder = sortOrder;
        this.createdAt = Instant.now();
    }
}

