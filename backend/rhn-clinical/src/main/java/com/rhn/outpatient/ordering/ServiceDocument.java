package com.rhn.outpatient.ordering;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

/** 一张门诊服务申请单；明细、执行与收费仍在各条 ServiceRequest 上，单头只承载归单事实。 */
@Entity
@Table(name = "RHN_EX_SVC_DOC")
class ServiceDocument {
    @Id @Column(name = "ID_SVC_DOC") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "CD_DOC_NO", nullable = false) private String documentNo;
    @Column(name = "SD_SVC_TYPE", nullable = false) private String serviceType;
    @Column(name = "ID_ORG_EXEC", nullable = false) private Long performerOrganizationId;
    @Column(name = "ID_DEPT_EXEC", nullable = false) private Long performerDepartmentId;
    @Column(name = "SD_GRP_RULE", nullable = false) private String groupingRule;
    @Column(name = "CD_GRP_VAL") private String groupingValue;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

    protected ServiceDocument() {}

    ServiceDocument(Long tenantId, Long residentId, Long encounterId, String documentNo, String serviceType,
                    Long performerOrganizationId, Long performerDepartmentId, String groupingRule,
                    String groupingValue, Long createdBy) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.residentId = residentId;
        this.encounterId = encounterId; this.documentNo = documentNo; this.serviceType = serviceType;
        this.performerOrganizationId = performerOrganizationId; this.performerDepartmentId = performerDepartmentId;
        this.groupingRule = groupingRule; this.groupingValue = groupingValue;
        this.createdAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS); this.createdBy = createdBy;
    }

    Long id() { return id; } long revision() { return revision; } Long tenantId() { return tenantId; }
    Long encounterId() { return encounterId; } String documentNo() { return documentNo; }
    String serviceType() { return serviceType; } String groupingRule() { return groupingRule; }
    String groupingValue() { return groupingValue; }
}
