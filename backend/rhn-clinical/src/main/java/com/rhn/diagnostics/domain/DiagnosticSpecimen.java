package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Entity
@Table(name = "RHN_EX_DIAG_SPEC")
public class DiagnosticSpecimen {
    @Id @Column(name = "ID_DIAG_SPEC") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_SPEC_NO", nullable = false) private String specimenNo;
    @Column(name = "SD_SPEC_TYPE", nullable = false) private String specimenType;
    @Column(name = "NA_SPEC_TYPE", nullable = false) private String specimenName;
    @Column(name = "SD_CONTNR") private String containerCode;
    @Column(name = "NA_CONTNR") private String containerName;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_COLLD") private Instant collectedAt;
    @Column(name = "ID_USER_COLLD") private Long collectedBy;
    @Column(name = "DT_RECVD") private Instant receivedAt;
    @Column(name = "ID_USER_RECVD") private Long receivedBy;
    @Column(name = "DT_REJECT") private Instant rejectedAt;
    @Column(name = "ID_USER_REJECT") private Long rejectedBy;
    @Column(name = "DES_REJECT") private String rejectionReason;
    @Column(name = "ID_SPEC_PRIOR") private Long previousSpecimenId;
    @Column(name = "CD_CMD", nullable = false) private String creationCommand;
    @Column(name = "HASH_CMD", nullable = false) private String commandHash;

    protected DiagnosticSpecimen() {}
    public DiagnosticSpecimen(DiagnosticExecutionTask task, String number, String type, String name,
            String containerCode, String containerName, String command, String commandHash, Long previousSpecimenId) {
        id = GlobalIds.next(); tenantId = task.tenantId(); organizationId = task.organizationId();
        departmentId = task.departmentId(); residentId = task.residentId(); encounterId = task.encounterId();
        specimenNo = number; specimenType = type; specimenName = name; this.containerCode = containerCode;
        this.containerName = containerName; creationCommand = command; this.previousSpecimenId = previousSpecimenId;
        this.commandHash = commandHash; status = "READY"; createdAt = Instant.now();
    }
    public void collect(long expected, Long actor) {
        require(expected); if (!"READY".equals(status)) invalid();
        status = "COLLECTED"; collectedBy = actor; collectedAt = Instant.now();
    }
    public void receive(long expected, Long actor) {
        require(expected); if (!"COLLECTED".equals(status)) invalid();
        status = "RECEIVED"; receivedBy = actor; receivedAt = Instant.now();
    }
    public void reject(long expected, Long actor, String reason) {
        require(expected); if (!"COLLECTED".equals(status) && !"RECEIVED".equals(status)) invalid();
        status = "REJECTED"; rejectedBy = actor; rejectedAt = Instant.now(); rejectionReason = reason;
    }
    private void require(long expected) { if(revision!=expected) throw conflict("DIAGNOSTIC_SPECIMEN_REVISION_CONFLICT", "标本已被更新，请刷新"); }
    private void invalid() { throw conflict("DIAGNOSTIC_SPECIMEN_STATE_INVALID", "当前标本状态不能执行此操作"); }
    public Long id() { return id; } public long revision() { return revision; }
    public Long tenantId() { return tenantId; } public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; } public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; } public String specimenNo() { return specimenNo; }
    public String specimenType() { return specimenType; } public String specimenName() { return specimenName; }
    public String containerCode() { return containerCode; } public String containerName() { return containerName; }
    public String status() { return status; } public Instant createdAt() { return createdAt; }
    public Instant collectedAt() { return collectedAt; } public Instant receivedAt() { return receivedAt; }
    public String rejectionReason() { return rejectionReason; } public Long previousSpecimenId() { return previousSpecimenId; }
    public String creationCommand() { return creationCommand; }
    public String commandHash() { return commandHash; }
}
