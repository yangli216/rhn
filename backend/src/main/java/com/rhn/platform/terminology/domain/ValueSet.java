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
@Table(name = "value_sets")
public class ValueSet {
    @Id
    private Long id;
    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", nullable = false)
    private TerminologyScope scopeType;
    @Column(name = "scope_id", nullable = false)
    private Long scopeId;
    @Column(nullable = false)
    private String code;
    @Column(nullable = false)
    private String name;
    @Column(name = "version_code", nullable = false)
    private String versionCode;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TerminologyStatus status;
    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;
    @Column(name = "effective_to")
    private LocalDate effectiveTo;
    @Column(name = "created_at", nullable = false)
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
