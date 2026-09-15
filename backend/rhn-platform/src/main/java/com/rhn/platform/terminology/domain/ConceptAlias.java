package com.rhn.platform.terminology.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_BD_CONCEPT_ALIAS")
public class ConceptAlias {
    @Id
    @Column(name = "ID_CONCEPT_ALIAS") private Long id;
    @Column(name = "ID_CONCEPT", nullable = false)
    private Long conceptId;
    @Column(name = "SD_ALIAS_TYPE", nullable = false)
    private String aliasType;
    @Column(name = "NA_ALIAS", nullable = false)
    private String aliasName;
    @Column(name = "CD_SEARCH")
    private String searchCode;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false)
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
