package com.rhn.outpatient.ordering;

import com.rhn.platform.masterdata.api.ExaminationSiteDirectory.ExaminationSiteOption;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** 检查申请开立时选择的一个部位；名称、标准概念和互认编码均为开立时快照。 */
@Entity
@Table(name = "RHN_EX_SVC_REQ_SITE")
class ServiceRequestSite {
    @Id @Column(name = "ID_SVC_REQ_SITE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CARE_REQ", nullable = false) private Long requestId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "ID_SVC_VAR", nullable = false) private Long variantId;
    @Column(name = "CD_BODY_SITE", nullable = false) private String code;
    @Column(name = "NA_BODY_SITE", nullable = false) private String name;
    @Column(name = "ID_CONCEPT_BODY_SITE") private Long bodySiteConceptId;
    @Column(name = "SD_METHOD_TYPE") private String methodType;
    @Column(name = "CD_MUTUAL_RECOG") private String mutualRecognitionCode;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected ServiceRequestSite() {}

    ServiceRequestSite(Long tenantId, Long requestId, int lineNo, ExaminationSiteOption site) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.requestId = requestId;
        this.lineNo = lineNo;
        this.variantId = site.variantId();
        this.code = site.code();
        this.name = site.name();
        this.bodySiteConceptId = site.bodySiteConceptId();
        this.methodType = site.methodType();
        this.mutualRecognitionCode = site.mutualRecognitionCode();
        this.createdAt = Instant.now();
    }

    Long requestId() { return requestId; } int lineNo() { return lineNo; } Long variantId() { return variantId; }
    String code() { return code; } String name() { return name; } Long bodySiteConceptId() { return bodySiteConceptId; }
    String methodType() { return methodType; } String mutualRecognitionCode() { return mutualRecognitionCode; }
}
