package com.rhn.platform.geography.domain;

import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_GRID_ADDR_NODE")
public class GridAddressNode {
    @Id @Column(name = "ID_GRID_ADDR_NODE") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_GRID_ADDR_NODE_PARENT") private Long parentId;
    @Enumerated(EnumType.STRING) @Column(name = "CD_LEVEL", nullable = false) private GridAddressLevel level;
    @Column(name = "CD_GRID_ADDR_NODE", nullable = false, unique = true, length = 12) private String code;
    @Column(name = "NA_GRID_ADDR_NODE", nullable = false) private String name;
    @Column(name = "NA_SHORT") private String shortName;
    @Column(name = "CD_PINYIN", nullable = false) private String pinyinCode;
    @Column(name = "DES_FULL_PATH", nullable = false) private String fullPath;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private GridAddressStatus status;
    @Column(name = "FG_SYS_MANAGED", nullable = false) private boolean systemManaged;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected GridAddressNode() {}

    public GridAddressNode(Long parentId, GridAddressLevel level, String code, String name, String shortName,
                           String pinyinCode, String fullPath, int sortOrder, Long actorId) {
        this.id = GlobalIds.next();
        this.parentId = parentId;
        this.level = level;
        this.code = code;
        this.name = name;
        this.shortName = shortName;
        this.pinyinCode = pinyinCode;
        this.fullPath = fullPath;
        this.sortOrder = sortOrder;
        this.status = GridAddressStatus.ACTIVE;
        this.systemManaged = false;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(Long parentId, String name, String shortName, String pinyinCode, String fullPath,
                       int sortOrder, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        this.parentId = parentId;
        this.name = name;
        this.shortName = shortName;
        this.pinyinCode = pinyinCode;
        this.fullPath = fullPath;
        this.sortOrder = sortOrder;
        touch(actorId);
    }

    public void refreshPath(String fullPath, Long actorId) {
        this.fullPath = fullPath;
        touch(actorId);
    }

    public void changeStatus(GridAddressStatus status, long expectedRevision, Long actorId) {
        requireRevision(expectedRevision);
        this.status = status;
        touch(actorId);
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) {
            throw new StaleRevisionException(revision, "网格地址已被其他用户修改，请刷新后重试");
        }
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long parentId() { return parentId; }
    public GridAddressLevel level() { return level; }
    public String code() { return code; }
    public String name() { return name; }
    public String shortName() { return shortName; }
    public String pinyinCode() { return pinyinCode; }
    public String fullPath() { return fullPath; }
    public int sortOrder() { return sortOrder; }
    public GridAddressStatus status() { return status; }
    public boolean systemManaged() { return systemManaged; }
    public Instant updatedAt() { return updatedAt; }
}
