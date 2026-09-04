package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_BD_MED_ROUTE_PROF")
public class MedicationRouteProfile {
    @Id
    @Column(name = "ID_CONCEPT")
    private Long conceptId;

    @Column(name = "SD_EXEC_TYPE", nullable = false)
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
