package com.rhn.platform.configuration.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "parameter_categories")
public class ParameterCategory {
    @Id private Long id;
    @Column(name = "parent_id") private Long parentId;
    @Column(nullable = false, length = 64) private String code;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 1000) private String description;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private boolean active;
    @Version @Column(nullable = false) private Long revision;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

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
        createdBy = requireId(actorId);
        updatedAt = createdAt;
        updatedBy = actorId;
    }

    public void update(long expectedRevision, Long parentId, String name, String description,
                       int sortOrder, boolean active, Long actorId) {
        assertRevision(expectedRevision);
        apply(parentId, name, description, sortOrder);
        this.active = active;
        updatedAt = Instant.now();
        updatedBy = requireId(actorId);
    }

    public void reorder(long expectedRevision, Long parentId, int sortOrder, Long actorId) {
        assertRevision(expectedRevision);
        apply(parentId, name, description, sortOrder);
        updatedAt = Instant.now();
        updatedBy = requireId(actorId);
    }

    public void assertRevision(long expectedRevision) {
        if (revision == null || revision != expectedRevision) throw new StaleConfigurationRevisionException(revision);
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

    private static Long requireId(Long value) {
        if (value == null || value <= 0) throw new IllegalArgumentException("操作用户标识不能为空");
        return value;
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
