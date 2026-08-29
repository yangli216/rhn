package com.rhn.platform.terminology.domain;

import com.rhn.platform.terminology.api.ConceptView;
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
@Table(name = "concepts")
public class Concept {
    @Id
    private Long id;
    @Column(name = "code_system_id", nullable = false)
    private Long codeSystemId;
    @Column(nullable = false)
    private String code;
    @Column(nullable = false)
    private String display;
    private String definition;
    @Column(name = "concept_type", nullable = false)
    private String conceptType;
    @Column(name = "short_display")
    private String shortDisplay;
    @Column(name = "chapter_code")
    private String chapterCode;
    @Column(name = "chapter_name")
    private String chapterName;
    @Column(name = "search_code")
    private String searchCode;
    @Column(name = "source_type", nullable = false)
    private String sourceType;
    @Column(name = "replacement_concept_id")
    private Long replacementConceptId;
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

    protected Concept() {
    }

    public Concept(Long codeSystemId, String code, String display, String definition,
                   LocalDate effectiveFrom, LocalDate effectiveTo) {
        this(codeSystemId, code, display, definition, "CONCEPT", null, null, null, null,
                effectiveFrom, effectiveTo, TerminologyStatus.DRAFT);
    }

    public Concept(Long codeSystemId, String code, String display, String definition, String conceptType,
                   String shortDisplay, String chapterCode, String chapterName, String searchCode,
                   LocalDate effectiveFrom, LocalDate effectiveTo, TerminologyStatus status) {
        CodeSystem.validateDates(effectiveFrom, effectiveTo);
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.codeSystemId = codeSystemId;
        this.code = code;
        this.display = display;
        this.definition = definition;
        this.conceptType = conceptType;
        this.shortDisplay = shortDisplay;
        this.chapterCode = chapterCode;
        this.chapterName = chapterName;
        this.searchCode = searchCode;
        this.sourceType = "MANUAL";
        this.status = status;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public void activate() { changeStatus(TerminologyStatus.ACTIVE, null); }
    public void update(long expectedRevision, String display, String definition, String conceptType,
                       String shortDisplay, String chapterCode, String chapterName, String searchCode,
                       LocalDate effectiveFrom, LocalDate effectiveTo) {
        requireRevision(expectedRevision);
        CodeSystem.validateDates(effectiveFrom, effectiveTo);
        this.display = display;
        this.definition = definition;
        this.conceptType = conceptType;
        this.shortDisplay = shortDisplay;
        this.chapterCode = chapterCode;
        this.chapterName = chapterName;
        this.searchCode = searchCode;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
        this.updatedAt = Instant.now();
    }

    public void changeStatus(TerminologyStatus status, Long replacementConceptId) {
        if (status == TerminologyStatus.REPLACED && replacementConceptId == null) {
            throw new IllegalArgumentException("已替代状态必须指定替代概念");
        }
        this.status = status;
        this.replacementConceptId = status == TerminologyStatus.REPLACED ? replacementConceptId : null;
        this.updatedAt = Instant.now();
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("基础数据已被其他用户修改，请刷新后重试");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long codeSystemId() { return codeSystemId; }
    public String code() { return code; }
    public String display() { return display; }
    public String definition() { return definition; }
    public String conceptType() { return conceptType; }
    public String shortDisplay() { return shortDisplay; }
    public String chapterCode() { return chapterCode; }
    public String chapterName() { return chapterName; }
    public String searchCode() { return searchCode; }
    public TerminologyStatus status() { return status; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public LocalDate effectiveTo() { return effectiveTo; }
    public Long replacementConceptId() { return replacementConceptId; }
    public boolean isEffectiveAt(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveTo == null || !effectiveTo.isBefore(date));
    }

    public boolean isActive() {
        return status == TerminologyStatus.ACTIVE;
    }

    public ConceptView toView(CodeSystem system) {
        return new ConceptView(id, system.code(), system.versionCode(), code, display, status.name());
    }
}
