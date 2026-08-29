package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "item_types")
public class ItemType {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "scope_type", nullable = false) private String scopeType;
    @Column(name = "scope_code", nullable = false) private String scopeCode;
    @Column(name = "tenant_id") private Long tenantId;
    @Column(name = "parent_id") private Long parentId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    private String description;
    @Column(name = "subject_type", nullable = false) private String subjectType;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private String status;

    protected ItemType() {}

    public Long id() { return id; }
    public long revision() { return revision; }
    public String scopeType() { return scopeType; }
    public String scopeCode() { return scopeCode; }
    public Long tenantId() { return tenantId; }
    public Long parentId() { return parentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public String subjectType() { return subjectType; }
    public int sortOrder() { return sortOrder; }
    public String status() { return status; }
}
