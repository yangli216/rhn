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
@Table(name = "RHN_AN_DRAFT_VER")
public class AnalysisDraftVersion {
    @Id
    @Column(name = "ID_DRAFT_VER", nullable = false) private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DRAFT", nullable = false) private Long draftId;
    @Column(name = "NO_VERSION", nullable = false) private int draftVersion;
    @Column(name = "ID_USER_OWNER", nullable = false) private Long ownerId;
    @Column(name = "ID_CATALOG_VER", nullable = false) private Long catalogVersionId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_SPEC", nullable = false) private String specJson;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;

    protected AnalysisDraftVersion() {}

    public AnalysisDraftVersion(Long tenantId, Long draftId, int draftVersion, Long ownerId, Long catalogVersionId, String specJson, Instant createdAt) {
        this.id = GlobalIds.next();
        this.tenantId = Strings.requireId(tenantId, "tenantId");
        this.draftId = Strings.requireId(draftId, "draftId");
        if (draftVersion < 1) throw new IllegalArgumentException("draftVersion must be positive");
        this.draftVersion = draftVersion;
        this.ownerId = Strings.requireId(ownerId, "ownerId");
        this.catalogVersionId = Strings.requireId(catalogVersionId, "catalogVersionId");
        this.specJson = Strings.requireText(specJson, "specJson", 1000000);
        this.createdAt = Strings.require(createdAt, "createdAt");
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long draftId() { return draftId; }
    public int draftVersion() { return draftVersion; }
    public Long ownerId() { return ownerId; }
    public Long catalogVersionId() { return catalogVersionId; }
    public String specJson() { return specJson; }
    public Instant createdAt() { return createdAt; }
}
