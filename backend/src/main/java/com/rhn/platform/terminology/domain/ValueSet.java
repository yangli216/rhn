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
@Table(name = "RHN_BD_VAL_SET")
public class ValueSet {
    @Id
    @Column(name = "ID_VAL_SET") private Long id;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_SCOPE_TYPE", nullable = false)
    private TerminologyScope scopeType;
    @Column(name = "ID_SCOPE", nullable = false)
    private Long scopeId;
    @Column(name = "CD_VAL_SET", nullable = false)
    private String code;
    @Column(name = "NA_VAL_SET", nullable = false)
    private String name;
    @Column(name = "CD_VER", nullable = false)
    private String versionCode;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false)
    private TerminologyStatus status;
    @Column(name = "DA_EFFECTIVE_FROM", nullable = false)
    private LocalDate effectiveFrom;
    @Column(name = "DA_EFFECTIVE_TO")
    private LocalDate effectiveTo;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;

    protected ValueSet() {
    }

    public ValueSet(TerminologyScope scopeType, Long scopeId, String code, String name, String versionCode,
                    LocalDate effectiveFrom, LocalDate effectiveTo) {
        CodeSystem.validateDates(effectiveFrom, effectiveTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.code = TerminologyCodePolicy.requireValueSetCode(code, scopeType);
        this.name = name;
        this.versionCode = TerminologyCodePolicy.requireVersion(code, versionCode);
        this.status = TerminologyStatus.DRAFT;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.createdAt = Instant.now();
    }

    public void activate() { this.status = TerminologyStatus.ACTIVE; }
    public Long id() { return id; }
    public String code() { return code; }
    public boolean isEffectiveAt(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveTo == null || !effectiveTo.isBefore(date));
    }
}
