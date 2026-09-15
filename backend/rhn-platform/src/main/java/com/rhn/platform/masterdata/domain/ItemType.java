package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity
@Table(name = "RHN_BD_ITEM_TYPE")
public class ItemType {
    @Id @Column(name = "ID_ITEM_TYPE") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "SD_SCOPE_TYPE", nullable = false) private String scopeType;
    @Column(name = "CD_SCOPE", nullable = false) private String scopeCode;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "ID_ITEM_TYPE_PARENT") private Long parentId;
    @Column(name = "CD_ITEM_TYPE", nullable = false) private String code;
    @Column(name = "NA_ITEM_TYPE", nullable = false) private String name;
    @Column(name = "DES_ITEM_TYPE") private String description;
    @Column(name = "SD_SUBJECT_TYPE", nullable = false) private String subjectType;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "SD_STATUS", nullable = false) private String status;

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
