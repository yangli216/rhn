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
@Table(name = "code_systems")
public class CodeSystem {
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
    @Column(name = "canonical_uri")
    private String canonicalUri;
    @Column(name = "version_code", nullable = false)
    private String versionCode;
    @Column(name = "system_type", nullable = false)
    private String systemType;
    @Column(name = "diagnosis_domain")
    private String diagnosisDomain;
    private String publisher;
    private String description;
    @Column(name = "source_type", nullable = false)
    private String sourceType;
    @Column(name = "authority_type", nullable = false)
    private String authorityType;
    @Column(name = "source_uri")
    private String sourceUri;
    @Column(name = "content_hash")
    private String contentHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TerminologyStatus status;
    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;
    @Column(name = "effective_to")
    private LocalDate effectiveTo;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Version
    private long revision;

    protected CodeSystem() {
    }

    public CodeSystem(TerminologyScope scopeType, Long scopeId, String code, String name, String canonicalUri,
                      String versionCode, LocalDate effectiveFrom, LocalDate effectiveTo) {
        this(scopeType, scopeId, code, name, canonicalUri, versionCode, "COMMON", null, null,
                "INTERNAL", null, null, effectiveFrom, effectiveTo);
    }

    public CodeSystem(TerminologyScope scopeType, Long scopeId, String code, String name, String canonicalUri,
                      String versionCode, String systemType, String publisher, String description,
                      LocalDate effectiveFrom, LocalDate effectiveTo) {
        this(scopeType, scopeId, code, name, canonicalUri, versionCode, systemType, publisher, description,
                "INTERNAL", null, null, effectiveFrom, effectiveTo);
    }

    public CodeSystem(TerminologyScope scopeType, Long scopeId, String code, String name, String canonicalUri,
                      String versionCode, String systemType, String publisher, String description,
                      String authorityType, String sourceUri, String contentHash,
                      LocalDate effectiveFrom, LocalDate effectiveTo) {
        this(scopeType, scopeId, code, name, canonicalUri, versionCode, systemType, null, publisher, description,
                authorityType, sourceUri, contentHash, effectiveFrom, effectiveTo);
    }

    public CodeSystem(TerminologyScope scopeType, Long scopeId, String code, String name, String canonicalUri,
                      String versionCode, String systemType, String diagnosisDomain, String publisher,
                      String description, String authorityType, String sourceUri, String contentHash,
                      LocalDate effectiveFrom, LocalDate effectiveTo) {
        validateDates(effectiveFrom, effectiveTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.code = TerminologyCodePolicy.requireCodeSystemCode(code, scopeType);
        this.name = name;
        this.canonicalUri = canonicalUri;
        this.versionCode = TerminologyCodePolicy.requireVersion(code, versionCode);
        this.systemType = systemType == null || systemType.isBlank() ? "COMMON" : systemType.trim();
        this.diagnosisDomain = diagnosisDomain == null || diagnosisDomain.isBlank()
                ? ("DISEASE".equals(this.systemType) ? "WESTERN_MEDICINE" : null) : diagnosisDomain.trim();
        if (this.diagnosisDomain != null && !java.util.Set.of(
                "WESTERN_MEDICINE", "TCM_DISEASE", "TCM_SYNDROME").contains(this.diagnosisDomain)) {
            throw new IllegalArgumentException("诊断体系不正确");
        }
        this.publisher = publisher;
        this.description = description;
        this.sourceType = "MANUAL";
        this.authorityType = authorityType == null || authorityType.isBlank() ? "INTERNAL" : authorityType.trim();
        this.sourceUri = sourceUri;
        this.contentHash = contentHash;
        this.status = TerminologyStatus.DRAFT;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public void activate() { this.status = TerminologyStatus.ACTIVE; this.updatedAt = Instant.now(); }
    public Long id() { return id; }
    public TerminologyScope scopeType() { return scopeType; }
    public Long scopeId() { return scopeId; }
    public String code() { return code; }
    public String name() { return name; }
    public String canonicalUri() { return canonicalUri; }
    public String versionCode() { return versionCode; }
    public String systemType() { return systemType; }
    public String diagnosisDomain() { return diagnosisDomain; }
    public String publisher() { return publisher; }
    public String description() { return description; }
    public String authorityType() { return authorityType; }
    public String sourceUri() { return sourceUri; }
    public String contentHash() { return contentHash; }
    public TerminologyStatus status() { return status; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public long revision() { return revision; }
    public boolean isEffectiveAt(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveTo == null || !effectiveTo.isBefore(date));
    }

    static void validateDates(LocalDate from, LocalDate to) {
        if (to != null && to.isBefore(from)) {
            throw new IllegalArgumentException("effectiveTo cannot be before effectiveFrom");
        }
    }
}
