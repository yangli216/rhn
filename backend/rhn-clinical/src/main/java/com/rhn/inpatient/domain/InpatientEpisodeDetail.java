package com.rhn.inpatient.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_VIS_INP_EPISODE_DETAIL")
public class InpatientEpisodeDetail {
    @Id @Column(name = "ID_CARE_EPISODE") private Long episodeId;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_ADM_TYPE") private String admissionTypeCode;
    @Column(name = "CD_ADM_SRC") private String admissionSourceCode;
    @Column(name = "ID_SVC_LOC_ADM") private Long admissionLocationId;
    @Column(name = "DES_ADM_REASON") private String admissionReason;
    @Column(name = "CD_ADM_METHOD") private String admissionMethodCode;
    @Column(name = "CD_COND") private String conditionCode;
    @Column(name = "CD_PAY_METHOD") private String paymentMethodCode;
    @Column(name = "NA_REFER_ORG") private String referralOrganizationName;
    @Column(name = "NA_EMERG_CONTACT") private String emergencyContactName;
    @Column(name = "EMERG_CONTACT_RELSHIP") private String emergencyContactRelationship;
    @Column(name = "EMERG_CONTACT_PHONE") private String emergencyContactPhone;
    @Column(name = "DES_ADM_NOTE") private String admissionNote;
    @Column(name = "CD_DISCH_DISPOS") private String dischargeDispositionCode;
    @Column(name = "ID_SVC_LOC_DISCH") private Long dischargeLocationId;
    @Column(name = "DES_DISCH_NOTE") private String dischargeNote;
    @Column(name = "CD_NURS_LEVEL") private String nursingLevelCode;
    @Column(name = "CD_DIET") private String dietCode;
    @Column(name = "CD_BED_SNAP") private String bedNoSnapshot;
    @Column(name = "ID_RSPNSBL_NURSE") private Long responsibleNurseId;

    protected InpatientEpisodeDetail() {
    }

    public InpatientEpisodeDetail(Long episodeId, Long tenantId, String admissionTypeCode,
                                  String admissionSourceCode, Long admissionLocationId,
                                  String admissionReason, String nursingLevelCode, String dietCode,
                                  String bedNoSnapshot, Long responsibleNurseId,
                                  String admissionMethodCode, String conditionCode, String paymentMethodCode,
                                  String referralOrganizationName, String emergencyContactName,
                                  String emergencyContactRelationship, String emergencyContactPhone,
                                  String admissionNote) {
        this.episodeId = episodeId;
        this.tenantId = tenantId;
        this.admissionTypeCode = admissionTypeCode;
        this.admissionSourceCode = admissionSourceCode;
        this.admissionLocationId = admissionLocationId;
        this.admissionReason = admissionReason;
        this.nursingLevelCode = nursingLevelCode;
        this.dietCode = dietCode;
        this.bedNoSnapshot = bedNoSnapshot;
        this.responsibleNurseId = responsibleNurseId;
        this.admissionMethodCode = admissionMethodCode;
        this.conditionCode = conditionCode;
        this.paymentMethodCode = paymentMethodCode;
        this.referralOrganizationName = referralOrganizationName;
        this.emergencyContactName = emergencyContactName;
        this.emergencyContactRelationship = emergencyContactRelationship;
        this.emergencyContactPhone = emergencyContactPhone;
        this.admissionNote = admissionNote;
    }

    public void moveTo(String bedNo) {
        this.bedNoSnapshot = bedNo;
    }

    public void discharge(Long locationId, String dispositionCode, String note) {
        this.dischargeLocationId = locationId;
        this.dischargeDispositionCode = dispositionCode;
        this.dischargeNote = note;
    }

    public Long episodeId() { return episodeId; }
    public String admissionTypeCode() { return admissionTypeCode; }
    public String admissionSourceCode() { return admissionSourceCode; }
    public String admissionReason() { return admissionReason; }
    public String admissionMethodCode() { return admissionMethodCode; }
    public String conditionCode() { return conditionCode; }
    public String paymentMethodCode() { return paymentMethodCode; }
    public String referralOrganizationName() { return referralOrganizationName; }
    public String emergencyContactName() { return emergencyContactName; }
    public String emergencyContactRelationship() { return emergencyContactRelationship; }
    public String emergencyContactPhone() { return emergencyContactPhone; }
    public String admissionNote() { return admissionNote; }
    public String dischargeDispositionCode() { return dischargeDispositionCode; }
    public String dischargeNote() { return dischargeNote; }
    public String nursingLevelCode() { return nursingLevelCode; }
    public String dietCode() { return dietCode; }
    public String bedNoSnapshot() { return bedNoSnapshot; }
}
