package com.rhn.inpatient.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "inpatient_episode_details")
public class InpatientEpisodeDetail {
    @Id @Column(name = "episode_id") private Long episodeId;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "admission_type_code") private String admissionTypeCode;
    @Column(name = "admission_source_code") private String admissionSourceCode;
    @Column(name = "admission_location_id") private Long admissionLocationId;
    @Column(name = "admission_reason") private String admissionReason;
    @Column(name = "admission_method_code") private String admissionMethodCode;
    @Column(name = "condition_code") private String conditionCode;
    @Column(name = "payment_method_code") private String paymentMethodCode;
    @Column(name = "referral_organization_name") private String referralOrganizationName;
    @Column(name = "emergency_contact_name") private String emergencyContactName;
    @Column(name = "emergency_contact_relationship") private String emergencyContactRelationship;
    @Column(name = "emergency_contact_phone") private String emergencyContactPhone;
    @Column(name = "admission_note") private String admissionNote;
    @Column(name = "discharge_disposition_code") private String dischargeDispositionCode;
    @Column(name = "discharge_location_id") private Long dischargeLocationId;
    @Column(name = "discharge_note") private String dischargeNote;
    @Column(name = "nursing_level_code") private String nursingLevelCode;
    @Column(name = "diet_code") private String dietCode;
    @Column(name = "bed_no_snapshot") private String bedNoSnapshot;
    @Column(name = "responsible_nurse_id") private Long responsibleNurseId;

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
