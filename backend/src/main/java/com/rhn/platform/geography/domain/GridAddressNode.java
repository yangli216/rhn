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
@Table(name = "grid_address_nodes")
public class GridAddressNode {
    @Id private Long id;
    @Version @Column(nullable = false) private long revision;
    @Column(name = "parent_id") private Long parentId;
    @Enumerated(EnumType.STRING) @Column(name = "level_code", nullable = false) private GridAddressLevel level;
    @Column(nullable = false, unique = true, length = 12) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "short_name") private String shortName;
    @Column(name = "pinyin_code", nullable = false) private String pinyinCode;
    @Column(name = "full_path", nullable = false) private String fullPath;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private GridAddressStatus status;
    @Column(name = "system_managed", nullable = false) private boolean systemManaged;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

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
