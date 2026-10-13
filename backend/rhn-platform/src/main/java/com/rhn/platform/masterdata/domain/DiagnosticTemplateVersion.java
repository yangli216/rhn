package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_BD_DIAG_TPL")
public class DiagnosticTemplateVersion {
    @Id @Column(name = "ID_DIAG_TPL") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "SN_VERSION", nullable = false) private int version;
    @Column(name = "SD_SVC_TYPE", nullable = false) private String serviceType;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate effectiveFrom;
    @Column(name = "DES_BASIS", nullable = false) private String publicationBasis;
    @Column(name = "ID_USER_PUBLISH", nullable = false) private Long publishedBy;
    @Column(name = "DT_PUBLISH", nullable = false) private Instant publishedAt;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "CONTENT_JSON", nullable = false) private String content;

    protected DiagnosticTemplateVersion() {}
    public DiagnosticTemplateVersion(Long tenantId, Long organizationId, Long catalogItemId, int version,
            String serviceType, LocalDate effectiveFrom, String publicationBasis, Long actorId, String content) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.catalogItemId = catalogItemId; this.version = version; this.serviceType = serviceType;
        this.effectiveFrom = effectiveFrom; this.publicationBasis = publicationBasis;
        this.publishedBy = actorId; this.publishedAt = Instant.now(); this.content = content;
    }
    public Long id() { return id; }
    public Long organizationId() { return organizationId; }
    public Long catalogItemId() { return catalogItemId; }
    public int version() { return version; }
    public String serviceType() { return serviceType; }
    public LocalDate effectiveFrom() { return effectiveFrom; }
    public String publicationBasis() { return publicationBasis; }
    public Long publishedBy() { return publishedBy; }
    public Instant publishedAt() { return publishedAt; }
    public String content() { return content; }
}
