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
@Table(name = "ward_med_return_requests")
public class WardMedicationReturnRequest {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "stock_site_id", nullable = false) private Long stockSiteId;
    @Column(name = "nursing_unit_department_id", nullable = false) private Long nursingUnitDepartmentId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "request_no", nullable = false) private String requestNo;
    @Column(nullable = false) private String status;
    @Column(name = "requested_at", nullable = false) private Instant requestedAt;
    @Column(name = "requested_by", nullable = false) private Long requestedBy;
    @Column(name = "request_note") private String requestNote;
    @Column(name = "handed_over_at") private Instant handedOverAt;
    @Column(name = "handed_over_by") private Long handedOverBy;
    @Column(name = "handover_note") private String handoverNote;
    @Column(name = "received_at") private Instant receivedAt;
    @Column(name = "received_by") private Long receivedBy;
    @Column(name = "processor_practitioner_id") private Long processorPractitionerId;
    @Column(name = "processor_assignment_id") private Long processorAssignmentId;
    @Column(name = "receipt_note") private String receiptNote;

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
