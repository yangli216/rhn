package com.rhn.analytics.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

/** A06 storage only; no approval, authorization or execution is implied by persistence. */
@Entity
@Immutable
@Table(name = "RHN_AN_CATALOG_VER")
public class AnalyticsCatalogVersion {
    @Id
    @Column(name = "ID_CATALOG_VER", nullable = false) private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_CATALOG", nullable = false, length = 100) private String code;
    @Column(name = "NO_VERSION", nullable = false) private int catalogVersion;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_DEF", nullable = false) private String definitionJson;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "SD_REVIEW", nullable = false, length = 24) private String reviewStatus = "CANDIDATE";

    protected AnalyticsCatalogVersion() {}

    public AnalyticsCatalogVersion(Long tenantId, String code, int catalogVersion, String definitionJson, Instant createdAt) {
        this.id = GlobalIds.next();
        this.tenantId = Strings.requireId(tenantId, "tenantId");
        this.code = Strings.requireText(code, "code", 100);
        if (catalogVersion < 1) throw new IllegalArgumentException("catalogVersion must be positive");
        this.catalogVersion = catalogVersion;
        this.definitionJson = Strings.requireText(definitionJson, "definitionJson", 1000000);
        this.createdAt = Strings.require(createdAt, "createdAt");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String code() { return code; }
    public int catalogVersion() { return catalogVersion; }
    public String definitionJson() { return definitionJson; }
    public Instant createdAt() { return createdAt; }
    public String reviewStatus() { return reviewStatus; }
}
