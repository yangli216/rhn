package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Uniqueness serializes reuse of a batch command across different task selections. */
@Entity
@Table(name = "RHN_EX_SPEC_BATCH")
public class DiagnosticSpecimenBatch {
    @Id @Column(name = "ID_SPEC_BATCH") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "CD_CMD", nullable = false) private String commandId;
    @Column(name = "HASH_CMD", nullable = false) private String commandHash;
    protected DiagnosticSpecimenBatch() {}
    public DiagnosticSpecimenBatch(Long tenantId, Long organizationId, String commandId, String commandHash) {
        id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.commandId = commandId; this.commandHash = commandHash;
    }
}
