package com.rhn.portal.workspace;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PORTAL_USER_WKSPACE")
class PortalUserWorkspace {
    @Id @Column(name = "ID_PORTAL_USER_WKSPACE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_USER", nullable = false) private Long userId;
    @Column(name = "ID_ORG_DEFAULT") private Long defaultOrganizationId;
    @Column(name = "ID_DEPT_DEFAULT") private Long defaultDepartmentId;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_FAVORITES", nullable = false) private String favoritesJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_TABS", nullable = false) private String tabsJson;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR) @Column(name = "JSON_LAYOUT", nullable = false) private String layoutJson;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Version @Column(name = "REVISION", nullable = false) private long revision;

    protected PortalUserWorkspace() {
    }

    PortalUserWorkspace(Long tenantId, Long userId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.userId = userId;
        this.favoritesJson = "[]";
        this.tabsJson = "[]";
        this.layoutJson = "{}";
        this.updatedAt = Instant.now();
    }

    void update(Long organizationId, Long departmentId, String favoritesJson, String tabsJson, String layoutJson) {
        this.defaultOrganizationId = organizationId;
        this.defaultDepartmentId = departmentId;
        this.favoritesJson = favoritesJson;
        this.tabsJson = tabsJson;
        this.layoutJson = layoutJson;
        this.updatedAt = Instant.now();
    }

    Long defaultOrganizationId() { return defaultOrganizationId; }
    Long defaultDepartmentId() { return defaultDepartmentId; }
    String favoritesJson() { return favoritesJson; }
    String tabsJson() { return tabsJson; }
    String layoutJson() { return layoutJson; }
    long revision() { return revision; }
}
