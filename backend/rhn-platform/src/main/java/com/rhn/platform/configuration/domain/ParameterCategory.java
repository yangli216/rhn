package com.rhn.platform.configuration.domain;

import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PARAM_CAT")
public class ParameterCategory {
    @Id @Column(name = "ID_PARAM_CAT") private Long id;
    @Column(name = "ID_PARAM_CAT_PARENT") private Long parentId;
    @Column(name = "CD_PARAM_CAT", nullable = false, length = 64) private String code;
    @Column(name = "NA_PARAM_CAT", nullable = false, length = 200) private String name;
    @Column(name = "DES_PARAM_CAT", length = 1000) private String description;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "FG_ACTIVE", nullable = false) private boolean active;
    @Version @Column(name = "REVISION", nullable = false) private Long revision;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ParameterCategory() {
    }

    public ParameterCategory(Long parentId, String code, String name, String description,
                             int sortOrder, Long actorId) {
        id = GlobalIds.next();
        revision = null;
        this.code = ConfigurationCodePolicy.requireCategoryCode(code);
        apply(parentId, name, description, sortOrder);
        active = true;
        createdAt = Instant.now();
        createdBy = Strings.requireId(actorId, "操作用户");
        updatedAt = createdAt;
        updatedBy = actorId;
    }

    public void update(long expectedRevision, Long parentId, String name, String description,
                       int sortOrder, boolean active, Long actorId) {
        assertRevision(expectedRevision);
        apply(parentId, name, description, sortOrder);
        this.active = active;
        updatedAt = Instant.now();
        updatedBy = Strings.requireId(actorId, "操作用户");
    }

    public void reorder(long expectedRevision, Long parentId, int sortOrder, Long actorId) {
        assertRevision(expectedRevision);
        apply(parentId, name, description, sortOrder);
        updatedAt = Instant.now();
        updatedBy = Strings.requireId(actorId, "操作用户");
    }

    public void assertRevision(long expectedRevision) {
        if (revision == null || revision != expectedRevision) {
            throw new StaleRevisionException(revision, "参数已被其他操作更新，请刷新后重试");
        }
    }

    private void apply(Long parentId, String name, String description, int sortOrder) {
        if (parentId != null && parentId <= 0) throw new IllegalArgumentException("父分类标识不正确");
        if (parentId != null && parentId.equals(id)) throw new IllegalArgumentException("分类不能以自身作为父分类");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("分类名称不能为空");
        if (name.trim().length() > 200) throw new IllegalArgumentException("分类名称长度不能超过200");
        if (description != null && description.trim().length() > 1000) throw new IllegalArgumentException("分类说明长度不能超过1000");
        if (sortOrder < 0) throw new IllegalArgumentException("分类排序不能小于0");
        this.parentId = parentId;
        this.name = name.trim();
        this.description = description == null || description.isBlank() ? null : description.trim();
        this.sortOrder = sortOrder;
    }

    public Long id() { return id; }
    public Long parentId() { return parentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public int sortOrder() { return sortOrder; }
    public boolean active() { return active; }
    public Long revision() { return revision; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
