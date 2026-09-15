package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Entity
@Table(name = "RHN_SUP_WARD_MED_RETURN_REQ")
public class WardMedicationReturnRequest {
    @Id @Column(name = "ID_WARD_MED_RETURN_REQ") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_STOCK_SITE", nullable = false) private Long stockSiteId;
    @Column(name = "ID_DEPT_NURS_UNIT", nullable = false) private Long nursingUnitDepartmentId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_REQ_NO", nullable = false) private String requestNo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_REQUESTED", nullable = false) private Instant requestedAt;
    @Column(name = "ID_USER_REQUESTED", nullable = false) private Long requestedBy;
    @Column(name = "DES_REQ_NOTE") private String requestNote;
    @Column(name = "DT_HANDED_OVER") private Instant handedOverAt;
    @Column(name = "ID_USER_HANDED_OVER") private Long handedOverBy;
    @Column(name = "DES_HANDOVER_NOTE") private String handoverNote;
    @Column(name = "DT_RECEIVED") private Instant receivedAt;
    @Column(name = "ID_USER_RECEIVED") private Long receivedBy;
    @Column(name = "ID_PROCESSOR_PRACT") private Long processorPractitionerId;
    @Column(name = "ID_PROCESSOR_ASSIGN") private Long processorAssignmentId;
    @Column(name = "DES_RCPT_NOTE") private String receiptNote;

    protected WardMedicationReturnRequest() {
    }

    public WardMedicationReturnRequest(Long tenantId, Long organizationId, Long stockSiteId,
                                       Long nursingUnitDepartmentId, Long residentId, Long encounterId,
                                       Long actorId, String note) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.stockSiteId = stockSiteId;
        this.nursingUnitDepartmentId = nursingUnitDepartmentId;
        this.residentId = residentId;
        this.encounterId = encounterId;
        this.requestNo = "WMR" + id;
        this.status = "REQUESTED";
        this.requestedAt = Instant.now();
        this.requestedBy = actorId;
        this.requestNote = note;
    }

    public String handOver(long expectedRevision, Long actorId, String note) {
        requireRevision(expectedRevision);
        if (!"REQUESTED".equals(status)) {
            throw conflict("WARD_MED_RETURN_NOT_REQUESTED", "只有待交出的病区退药申请可以确认交出");
        }
        String previous = status;
        status = "IN_TRANSIT";
        handedOverAt = Instant.now();
        handedOverBy = actorId;
        handoverNote = note;
        return previous;
    }

    public String receive(long expectedRevision, Long actorId, Long practitionerId,
                          Long assignmentId, String note) {
        requireRevision(expectedRevision);
        if (!"IN_TRANSIT".equals(status)) {
            throw conflict("WARD_MED_RETURN_NOT_IN_TRANSIT", "只有病区已交出的退药申请可以由药房接收");
        }
        String previous = status;
        status = "RECEIVED";
        receivedAt = Instant.now();
        receivedBy = actorId;
        processorPractitionerId = practitionerId;
        processorAssignmentId = assignmentId;
        receiptNote = note;
        return previous;
    }

    public void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw conflict("WARD_MED_RETURN_REVISION_CONFLICT", "病区退药申请已被其他用户更新，请刷新后重试");
        }
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long stockSiteId() { return stockSiteId; }
    public Long nursingUnitDepartmentId() { return nursingUnitDepartmentId; }
    public Long residentId() { return residentId; }
    public Long encounterId() { return encounterId; }
    public String requestNo() { return requestNo; }
    public String status() { return status; }
    public Instant requestedAt() { return requestedAt; }
    public Long requestedBy() { return requestedBy; }
    public String requestNote() { return requestNote; }
    public Instant handedOverAt() { return handedOverAt; }
    public Long handedOverBy() { return handedOverBy; }
    public String handoverNote() { return handoverNote; }
    public Instant receivedAt() { return receivedAt; }
    public Long receivedBy() { return receivedBy; }
    public Long processorPractitionerId() { return processorPractitionerId; }
    public Long processorAssignmentId() { return processorAssignmentId; }
    public String receiptNote() { return receiptNote; }
}
