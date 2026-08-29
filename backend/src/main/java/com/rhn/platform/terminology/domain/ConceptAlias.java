package com.rhn.platform.terminology.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "concept_aliases")
public class ConceptAlias {
    @Id
    private Long id;
    @Column(name = "concept_id", nullable = false)
    private Long conceptId;
    @Column(name = "alias_type", nullable = false)
    private String aliasType;
    @Column(name = "alias_name", nullable = false)
    private String aliasName;
    @Column(name = "search_code")
    private String searchCode;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TerminologyStatus status;

    protected ConceptAlias() {}

    public ConceptAlias(Long conceptId, String aliasType, String aliasName, String searchCode) {
        this.id = GlobalIds.next();
        this.conceptId = conceptId;
        this.aliasType = aliasType;
        this.aliasName = aliasName;
        this.searchCode = searchCode;
        this.status = TerminologyStatus.ACTIVE;
    }

    public void retire() { this.status = TerminologyStatus.RETIRED; }
    public void activate() { this.status = TerminologyStatus.ACTIVE; }
    public Long id() { return id; }
    public Long conceptId() { return conceptId; }
    public String aliasType() { return aliasType; }
    public String aliasName() { return aliasName; }
    public String searchCode() { return searchCode; }
    public TerminologyStatus status() { return status; }
}
