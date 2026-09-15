package com.rhn.platform.terminology.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Set;

@Entity
@Table(name = "RHN_HPL_DISEASE_MGMT_RULE")
public class DiseaseManagementRule {
    @Id @Column(name = "ID_DISEASE_MGMT_RULE") private Long id;
    @Column(name = "ID_DISEASE_MGMT_PROG", nullable = false) private Long programId;
    @Column(name = "SD_INCLUSION_MODE", nullable = false) private String inclusionMode;
    @Column(name = "SD_DIAG_DOMAIN") private String diagnosisDomain;
    @Column(name = "ID_CODE_SYSTEM") private Long codeSystemId;
    @Column(name = "SD_CONCEPT_TYPE") private String conceptType;
    @Column(name = "CD_CHAPTER") private String chapterCode;
    @Column(name = "CD_CODE_FROM") private String codeFrom;
    @Column(name = "CD_CODE_TO") private String codeTo;
    @Column(name = "DES_NOTE") private String note;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected DiseaseManagementRule() {}

    public DiseaseManagementRule(Long programId, String inclusionMode, String diagnosisDomain,
                                 Long codeSystemId, String conceptType, String chapterCode,
                                 String codeFrom, String codeTo, String note) {
        if (!Set.of("INCLUDE", "EXCLUDE").contains(inclusionMode)) {
            throw new IllegalArgumentException("疾病规则的纳入方式不正确");
        }
        if (diagnosisDomain == null && codeSystemId == null && conceptType == null && chapterCode == null
                && codeFrom == null && codeTo == null) {
            throw new IllegalArgumentException("疾病规则至少需要一个匹配条件");
        }
        if (diagnosisDomain != null && !Set.of("WESTERN_MEDICINE", "TCM_DISEASE", "TCM_SYNDROME")
                .contains(diagnosisDomain)) throw new IllegalArgumentException("诊断体系不正确");
        if (codeFrom != null && codeTo != null && codeFrom.compareToIgnoreCase(codeTo) > 0) {
            throw new IllegalArgumentException("疾病编码起始值不能大于结束值");
        }
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.programId = programId;
        this.inclusionMode = inclusionMode;
        this.diagnosisDomain = diagnosisDomain;
        this.codeSystemId = codeSystemId;
        this.conceptType = conceptType;
        this.chapterCode = chapterCode;
        this.codeFrom = codeFrom;
        this.codeTo = codeTo;
        this.note = note;
        this.createdAt = Instant.now();
    }

    public Long id() { return id; }
    public Long programId() { return programId; }
    public String inclusionMode() { return inclusionMode; }
    public String diagnosisDomain() { return diagnosisDomain; }
    public Long codeSystemId() { return codeSystemId; }
    public String conceptType() { return conceptType; }
    public String chapterCode() { return chapterCode; }
    public String codeFrom() { return codeFrom; }
    public String codeTo() { return codeTo; }
    public String note() { return note; }

    public boolean matches(Concept concept, CodeSystem system) {
        if (diagnosisDomain != null && !diagnosisDomain.equals(system.diagnosisDomain())) return false;
        if (codeSystemId != null && !codeSystemId.equals(concept.codeSystemId())) return false;
        if (conceptType != null && !conceptType.equals(concept.conceptType())) return false;
        if (chapterCode != null && (concept.chapterCode() == null
                || !chapterCode.equalsIgnoreCase(concept.chapterCode()))) return false;
        if (codeFrom != null && concept.code().compareToIgnoreCase(codeFrom) < 0) return false;
        return codeTo == null || concept.code().compareToIgnoreCase(codeTo) <= 0;
    }
}

