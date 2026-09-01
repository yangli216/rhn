package com.rhn.platform.terminology.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "disease_management_members")
public class DiseaseManagementMember {
    @Id private Long id;
    @Column(name = "program_id", nullable = false) private Long programId;
    @Column(name = "concept_id", nullable = false) private Long conceptId;
    @Column(name = "inclusion_mode", nullable = false) private String inclusionMode;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false) private TerminologyStatus status;
    @Column(name = "effective_from", nullable = false) private LocalDate effectiveFrom;
    @Column(name = "effective_to") private LocalDate effectiveTo;
    private String note;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected DiseaseManagementMember() {}

    public DiseaseManagementMember(Long programId, Long conceptId, LocalDate effectiveFrom, LocalDate effectiveTo,
                                   String note) {
        this(programId, conceptId, "INCLUDE", effectiveFrom, effectiveTo, note);
    }

    public DiseaseManagementMember(Long programId, Long conceptId, String inclusionMode,
                                   LocalDate effectiveFrom, LocalDate effectiveTo, String note) {
        CodeSystem.validateDates(effectiveFrom, effectiveTo);
        if (!java.util.Set.of("INCLUDE", "EXCLUDE").contains(inclusionMode)) {
            throw new IllegalArgumentException("疾病例外的纳入方式不正确");
        }
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.programId = programId;
        this.conceptId = conceptId;
        this.inclusionMode = inclusionMode;
        this.status = TerminologyStatus.ACTIVE;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.note = note;
        this.createdAt = Instant.now();
    }

    public Long id() { return id; }
    public Long programId() { return programId; }
    public Long conceptId() { return conceptId; }
    public String inclusionMode() { return inclusionMode; }
    public TerminologyStatus status() { return status; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public String note() { return note; }
    public boolean isEffectiveAt(LocalDate date) {
        return status == TerminologyStatus.ACTIVE && !effectiveFrom.isAfter(date)
                && (effectiveTo == null || !effectiveTo.isBefore(date));
    }
}
