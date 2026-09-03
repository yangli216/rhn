package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "medication_route_profiles")
public class MedicationRouteProfile {
    @Id
    @Column(name = "concept_id")
    private Long conceptId;

    @Column(name = "execution_type", nullable = false)
    private String executionType;

    protected MedicationRouteProfile() {
    }

    public Long conceptId() {
        return conceptId;
    }

    public String executionType() {
        return executionType;
    }
}
