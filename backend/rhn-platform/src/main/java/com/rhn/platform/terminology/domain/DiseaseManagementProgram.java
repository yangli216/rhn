package com.rhn.platform.terminology.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_HPL_DISEASE_MGMT_PROG")
public class DiseaseManagementProgram {
    @Id @Column(name = "ID_DISEASE_MGMT_PROG") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private TerminologyScope scopeType;
    @Column(name = "ID_SCOPE", nullable = false) private Long scopeId;
    @Column(name = "CD_DISEASE_MGMT_PROG", nullable = false) private String code;
    @Column(name = "NA_DISEASE_MGMT_PROG", nullable = false) private String name;
    @Column(name = "SD_MGMT_TYPE", nullable = false) private String managementType;
    @Column(name = "SD_TRIGGER_ACTION", nullable = false) private String triggerAction;
    @Column(name = "DES_DISEASE_MGMT_PROG") private String description;
    @Column(name = "SD_REPORT_CARD_TYPE") private String reportCardType;
    @Column(name = "QTY_REPORT_DDLN_HOURS") private Integer reportDeadlineHours;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false) private TerminologyStatus status;
    @Column(name = "DA_EFF_FROM", nullable = false) private LocalDate effectiveFrom;
    @Column(name = "DA_EFF_TO") private LocalDate effectiveTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected DiseaseManagementProgram() {}

    public DiseaseManagementProgram(TerminologyScope scopeType, Long scopeId, String code, String name,
                                    String managementType, String triggerAction, String description,
                                    String reportCardType, Integer reportDeadlineHours,
                                    LocalDate effectiveFrom, LocalDate effectiveTo) {
        validate(managementType, triggerAction, reportDeadlineHours, effectiveFrom, effectiveTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.code = code;
        this.name = name;
        this.managementType = managementType;
        this.triggerAction = triggerAction;
        this.description = description;
        this.reportCardType = reportCardType;
        this.reportDeadlineHours = reportDeadlineHours;
        this.status = TerminologyStatus.DRAFT;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public void update(long expectedRevision, String name, String managementType, String triggerAction,
                       String description, String reportCardType, Integer reportDeadlineHours,
                       LocalDate effectiveFrom, LocalDate effectiveTo) {
        requireRevision(expectedRevision);
        validate(managementType, triggerAction, reportDeadlineHours, effectiveFrom, effectiveTo);
        this.name = name;
        this.managementType = managementType;
        this.triggerAction = triggerAction;
        this.description = description;
        this.reportCardType = reportCardType;
        this.reportDeadlineHours = reportDeadlineHours;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.updatedAt = Instant.now();
    }

    public void replaceMembers(long expectedRevision) {
        requireRevision(expectedRevision);
        this.updatedAt = Instant.now();
    }

    public void changeStatus(long expectedRevision, TerminologyStatus status) {
        requireRevision(expectedRevision);
        this.status = status;
        this.updatedAt = Instant.now();
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("疾病管理项目已被其他用户修改，请刷新后重试");
    }

    private static void validate(String managementType, String triggerAction, Integer deadline,
                                 LocalDate from, LocalDate to) {
        if (!java.util.Set.of("CHRONIC_CARE", "DISEASE_REPORT", "SPECIAL_REGISTRY").contains(managementType)) {
            throw new IllegalArgumentException("疾病管理类别不正确");
        }
        if (!java.util.Set.of("PROMPT_CONFIRMATION", "CREATE_FOLLOW_UP_TASK", "CREATE_REPORT_DRAFT")
                .contains(triggerAction)) throw new IllegalArgumentException("疾病管理触发动作不正确");
        if (deadline != null && deadline <= 0) throw new IllegalArgumentException("报告时限必须大于 0 小时");
        CodeSystem.validateDates(from, to);
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public TerminologyScope scopeType() { return scopeType; }
    public Long scopeId() { return scopeId; }
    public String code() { return code; }
    public String name() { return name; }
    public String managementType() { return managementType; }
    public String triggerAction() { return triggerAction; }
    public String description() { return description; }
    public String reportCardType() { return reportCardType; }
    public Integer reportDeadlineHours() { return reportDeadlineHours; }
    public TerminologyStatus status() { return status; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public boolean isEffectiveAt(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveTo == null || !effectiveTo.isBefore(date));
    }
}
