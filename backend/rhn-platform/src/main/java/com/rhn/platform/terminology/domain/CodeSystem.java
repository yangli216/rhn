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
@Table(name = "RHN_BD_CODE_SYSTEM")
public class CodeSystem {
    @Id
    @Column(name = "ID_CODE_SYSTEM") private Long id;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_SCOPE_TYPE", nullable = false)
    private TerminologyScope scopeType;
    @Column(name = "ID_SCOPE", nullable = false)
    private Long scopeId;
    @Column(name = "CD_CODE_SYSTEM", nullable = false)
    private String code;
    @Column(name = "NA_CODE_SYSTEM", nullable = false)
    private String name;
    @Column(name = "CD_CANON_URI")
    private String canonicalUri;
    @Column(name = "CD_VER", nullable = false)
    private String versionCode;
    @Column(name = "SD_SYS_TYPE", nullable = false)
    private String systemType;
    @Column(name = "SD_DIAG_DOMAIN")
    private String diagnosisDomain;
    @Column(name = "PUBLSHR") private String publisher;
    @Column(name = "DES_CODE_SYSTEM") private String description;
    @Column(name = "SD_SRC_TYPE", nullable = false)
    private String sourceType;
    @Column(name = "SD_AUTHRTY_TYPE", nullable = false)
    private String authorityType;
    @Column(name = "CD_SRC_URI")
    private String sourceUri;
    @Column(name = "HASH_CONTENT")
    private String contentHash;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false)
    private TerminologyStatus status;
    @Column(name = "DA_EFF_FROM", nullable = false)
    private LocalDate effectiveFrom;
    @Column(name = "DA_EFF_TO")
    private LocalDate effectiveTo;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false)
    private Instant updatedAt;
    @Version
    @Column(name = "REVISION") private long revision;

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
