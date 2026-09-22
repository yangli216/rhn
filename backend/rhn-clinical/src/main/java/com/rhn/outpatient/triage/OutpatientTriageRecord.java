package com.rhn.outpatient.triage;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_OP_TRIAGE_REC")
public class OutpatientTriageRecord {
    @Id
    @Column(name = "ID_TRIAGE_REC")
    private Long id;

    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;

    @Column(name = "ID_ORG", nullable = false)
    private Long organizationId;

    @Column(name = "ID_RESDNT")
    private Long residentId;

    @Column(name = "ID_ENC")
    private Long encounterId;

    @Column(name = "ID_PAT_REG")
    private Long registrationId;

    @Column(name = "CD_TRIAGE_NO", nullable = false)
    private String triageNo;

    @Column(name = "DT_TRIAGE", nullable = false)
    private Instant triageTime;

    @Column(name = "ID_TRIAGE_NURSE")
    private String triageNurseId;

    @Column(name = "NA_TRIAGE_NURSE")
    private String triageNurseName;

    @Column(name = "NA_PATIENT", nullable = false)
    private String patientName;

    @Column(name = "SD_GENDER", nullable = false)
    private String gender;

    @Column(name = "AGE")
    private Integer age;

    @Column(name = "DT_BIRTH")
    private LocalDate birthDate;

    @Column(name = "NO_PHONE")
    private String phone;

    @Column(name = "NO_ID_CARD")
    private String idCardNo;

    @Column(name = "NO_HEALTH_RECORD")
    private String healthRecordNo;

    @Column(name = "SD_ARRIVAL_METHOD")
    private String arrivalMethod;

    @Column(name = "SD_CMPNON_TYPE")
    private String companionType;

    @Column(name = "DES_CHIEF_CMPLNT")
    private String chiefComplaint;

    @Column(name = "TXT_SYMPT")
    private String symptoms;

    @Column(name = "VAL_TEMP")
    private BigDecimal temperature;

    @Column(name = "VAL_PULSE")
    private BigDecimal pulseRate;

    @Column(name = "VAL_RESP")
    private BigDecimal respiratoryRate;

    @Column(name = "VAL_SBP")
    private BigDecimal systolic;

    @Column(name = "VAL_DBP")
    private BigDecimal diastolic;

    @Column(name = "VAL_SPO2")
    private BigDecimal oxygenSaturation;

    @Column(name = "VAL_GLUCOSE")
    private BigDecimal bloodGlucose;

    @Column(name = "VAL_PAIN")
    private Integer painScore;

    @Column(name = "SD_CNSC")
    private String consciousness;

    @Column(name = "FG_FEVER", nullable = false)
    private short feverFlag;

    @Column(name = "TXT_EPID")
    private String epidemicHistory;

    @Column(name = "TXT_RISK_TAGS")
    private String riskTags;

    @Column(name = "SD_TRIAGE_LEVEL", nullable = false)
    private String triageLevel;

    @Column(name = "DES_TRIAGE_REASON")
    private String triageReason;

    @Column(name = "ID_TARGET_DEPT")
    private Long targetDepartmentId;

    @Column(name = "NA_TARGET_DEPT")
    private String targetDepartmentName;

    @Column(name = "ID_TARGET_DOC")
    private String targetDoctorId;

    @Column(name = "NA_TARGET_DOC")
    private String targetDoctorName;

    @Column(name = "SD_GREEN_CHANNEL")
    private String greenChannel;

    @Column(name = "SD_DISPOS")
    private String disposition;

    @Column(name = "SD_STATUS", nullable = false)
    private String status;

    @Column(name = "TXT_NOTES")
    private String notes;

    @Version
    @Column(name = "REVISION")
    private long version;

    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;

    @Column(name = "DT_UPDATED", nullable = false)
    private Instant updatedAt;

    protected OutpatientTriageRecord() {
    }

    public OutpatientTriageRecord(Long tenantId, Long organizationId, String triageNo, String patientName, String gender) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.organizationId = organizationId;
        this.triageNo = triageNo;
        this.patientName = patientName;
        this.gender = gender;
        this.triageTime = Instant.now();
        this.arrivalMethod = "WALK_IN";
        this.companionType = "NONE";
        this.consciousness = "ALERT";
        this.feverFlag = 0;
        this.triageLevel = "LEVEL_4_NON_URGENT";
        this.greenChannel = "NONE";
        this.disposition = "WAITING_QUEUE";
        this.status = "RECORDED";
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    // Domain methods
    public void updateDemographics(Long residentId, Integer age, LocalDate birthDate, String phone, String idCardNo, String healthRecordNo) {
        this.residentId = residentId;
        this.age = age;
        this.birthDate = birthDate;
        this.phone = phone;
        this.idCardNo = idCardNo;
        this.healthRecordNo = healthRecordNo;
        this.updatedAt = Instant.now();
    }

    public void updateStaff(String nurseId, String nurseName) {
        this.triageNurseId = nurseId;
        this.triageNurseName = nurseName;
        this.updatedAt = Instant.now();
    }

    public void updateArrivalAndCompanion(String arrivalMethod, String companionType) {
        if (arrivalMethod != null) this.arrivalMethod = arrivalMethod;
        if (companionType != null) this.companionType = companionType;
        this.updatedAt = Instant.now();
    }

    public void updateClinicalAssessment(String chiefComplaint, String symptoms,
                                         BigDecimal temperature, BigDecimal pulseRate, BigDecimal respiratoryRate,
                                         BigDecimal systolic, BigDecimal diastolic, BigDecimal oxygenSaturation,
                                         BigDecimal bloodGlucose, Integer painScore, String consciousness,
                                         boolean feverFlag, String epidemicHistory, String riskTags) {
        this.chiefComplaint = chiefComplaint;
        this.symptoms = symptoms;
        this.temperature = temperature;
        this.pulseRate = pulseRate;
        this.respiratoryRate = respiratoryRate;
        this.systolic = systolic;
        this.diastolic = diastolic;
        this.oxygenSaturation = oxygenSaturation;
        this.bloodGlucose = bloodGlucose;
        this.painScore = painScore;
        this.consciousness = consciousness != null ? consciousness : "ALERT";
        this.feverFlag = feverFlag ? (short) 1 : (short) 0;
        this.epidemicHistory = epidemicHistory;
        this.riskTags = riskTags;
        this.updatedAt = Instant.now();
    }

    public void updateTriageDecision(String triageLevel, String triageReason,
                                     Long targetDeptId, String targetDeptName,
                                     String targetDoctorId, String targetDoctorName,
                                     String greenChannel, String disposition, String notes) {
        if (triageLevel != null) this.triageLevel = triageLevel;
        this.triageReason = triageReason;
        this.targetDepartmentId = targetDeptId;
        this.targetDepartmentName = targetDeptName;
        this.targetDoctorId = targetDoctorId;
        this.targetDoctorName = targetDoctorName;
        if (greenChannel != null) this.greenChannel = greenChannel;
        if (disposition != null) this.disposition = disposition;
        this.notes = notes;
        this.updatedAt = Instant.now();
    }

    public void bindEncounter(Long encounterId, Long registrationId) {
        this.encounterId = encounterId;
        this.registrationId = registrationId;
        this.status = "REGISTERED";
        this.updatedAt = Instant.now();
    }

    public void updateStatus(String status) {
        this.status = status;
        this.updatedAt = Instant.now();
    }

    // Getters
    public Long getId() { return id; }
    public Long getTenantId() { return tenantId; }
    public Long getOrganizationId() { return organizationId; }
    public Long getResidentId() { return residentId; }
    public Long getEncounterId() { return encounterId; }
    public Long getRegistrationId() { return registrationId; }
    public String getTriageNo() { return triageNo; }
    public Instant getTriageTime() { return triageTime; }
    public String getTriageNurseId() { return triageNurseId; }
    public String getTriageNurseName() { return triageNurseName; }
    public String getPatientName() { return patientName; }
    public String getGender() { return gender; }
    public Integer getAge() { return age; }
    public LocalDate getBirthDate() { return birthDate; }
    public String getPhone() { return phone; }
    public String getIdCardNo() { return idCardNo; }
    public String getHealthRecordNo() { return healthRecordNo; }
    public String getArrivalMethod() { return arrivalMethod; }
    public String getCompanionType() { return companionType; }
    public String getChiefComplaint() { return chiefComplaint; }
    public String getSymptoms() { return symptoms; }
    public BigDecimal getTemperature() { return temperature; }
    public BigDecimal getPulseRate() { return pulseRate; }
    public BigDecimal getRespiratoryRate() { return respiratoryRate; }
    public BigDecimal getSystolic() { return systolic; }
    public BigDecimal getDiastolic() { return diastolic; }
    public BigDecimal getOxygenSaturation() { return oxygenSaturation; }
    public BigDecimal getBloodGlucose() { return bloodGlucose; }
    public Integer getPainScore() { return painScore; }
    public String getConsciousness() { return consciousness; }
    public boolean isFever() { return feverFlag == 1; }
    public String getEpidemicHistory() { return epidemicHistory; }
    public String getRiskTags() { return riskTags; }
    public String getTriageLevel() { return triageLevel; }
    public String getTriageReason() { return triageReason; }
    public Long getTargetDepartmentId() { return targetDepartmentId; }
    public String getTargetDepartmentName() { return targetDepartmentName; }
    public String getTargetDoctorId() { return targetDoctorId; }
    public String getTargetDoctorName() { return targetDoctorName; }
    public String getGreenChannel() { return greenChannel; }
    public String getDisposition() { return disposition; }
    public String getStatus() { return status; }
    public String getNotes() { return notes; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
