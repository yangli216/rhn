package com.rhn.diagnostics.domain;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
@Entity
@Table(name = "RHN_EX_DIAG_SPEC_TASK")
public class DiagnosticSpecimenTask {
    @Id @Column(name = "ID_SPEC_TASK") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DIAG_SPEC", nullable = false) private Long specimenId;
    @Column(name = "ID_DIAG_EXEC_TASK", nullable = false) private Long taskId;
    protected DiagnosticSpecimenTask() {}
    public DiagnosticSpecimenTask(Long tenantId, Long specimenId, Long taskId) {
        id=GlobalIds.next(); this.tenantId=tenantId; this.specimenId=specimenId; this.taskId=taskId;
    }
    public Long taskId() { return taskId; }
}
