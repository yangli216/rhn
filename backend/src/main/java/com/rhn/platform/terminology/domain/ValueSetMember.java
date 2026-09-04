package com.rhn.platform.terminology.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_VAL_SET_MEMBER")
public class ValueSetMember {
    @Id
    @Column(name = "ID_VAL_SET_MEMBER") private Long id;
    @Column(name = "ID_VAL_SET", nullable = false)
    private Long valueSetId;
    @Column(name = "ID_CONCEPT", nullable = false)
    private Long conceptId;
    @Column(name = "SN_SORT", nullable = false)
    private int sortOrder;
    @Column(name = "DT_CREATED", nullable = false)
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

