package com.rhn.platform.dictionary.domain;

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
@Table(name = "dictionary_categories")
public class DictionaryCategory {
    @Id private Long id;
    @Version @Column(nullable = false) private Long revision;
    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", nullable = false, length = 16)
    private DictionaryScopeType scopeType;
    @Column(name = "scope_code", nullable = false, length = 80)
    private String scopeCode;
    @Column(name = "tenant_id") private Long tenantId;
    @Column(name = "parent_id") private Long parentId;
    @Column(nullable = false, length = 64) private String code;
    @Column(nullable = false, length = 200) private String name;
    @Column(length = 1000) private String description;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DictionaryStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected DictionaryCategory() {
    }

    public DictionaryCategory(DictionaryScopeType scopeType, Long currentTenantId, Long parentId,
                              String code, String name, String description, int sortOrder, Long actorId) {
        if (scopeType == null) throw new IllegalArgumentException("字典分类作用域不能为空");
        this.id = GlobalIds.next();
        this.revision = null;
        this.scopeType = scopeType;
        this.tenantId = scopeType == DictionaryScopeType.TENANT ? requireId(currentTenantId, "租户") : null;
        this.scopeCode = scopeType == DictionaryScopeType.PLATFORM ? "PLATFORM" : "TENANT:" + tenantId;
        this.code = DictionaryCodePolicy.requireCategoryCode(code);
        this.status = DictionaryStatus.ACTIVE;
        apply(parentId, name, description, sortOrder);
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long parentId, String name, String description,
                       int sortOrder, Long actorId) {
        assertRevision(expectedRevision);
        apply(parentId, name, description, sortOrder);
        touch(actorId);
    }

    public void enable(long expectedRevision, Long actorId) {
        changeStatus(DictionaryStatus.ACTIVE, expectedRevision, actorId);
    }

    public void disable(long expectedRevision, Long actorId) {
        changeStatus(DictionaryStatus.INACTIVE, expectedRevision, actorId);
    }

    public void assertRevision(long expectedRevision) {
        if (revision == null || revision != expectedRevision) {
            throw new StaleRevisionException(revision, "字典已被其他操作更新，当前修订号为 " + revision);
        }
    }

    private void apply(Long parentId, String name, String description, int sortOrder) {
        if (parentId != null && parentId <= 0) throw new IllegalArgumentException("父分类标识不正确");
        if (parentId != null && parentId.equals(id)) throw new IllegalArgumentException("分类不能以自身作为父分类");
        this.parentId = parentId;
        this.name = requireText(name, "分类名称", 200);
        this.description = optionalText(description, 1000);
        if (sortOrder < 0) throw new IllegalArgumentException("分类排序不能小于0");
        this.sortOrder = sortOrder;
    }

    private void changeStatus(DictionaryStatus target, long expectedRevision, Long actorId) {
        assertRevision(expectedRevision);
        if (status == target) throw new IllegalArgumentException("字典分类已经处于" + target + "状态");
        status = target;
        touch(actorId);
    }

    private void touch(Long actorId) {
        updatedAt = Instant.now();
        updatedBy = requireId(actorId, "操作用户");
    }

    private static Long requireId(Long value, String label) {
        if (value == null || value <= 0) throw new IllegalArgumentException(label + "标识不能为空");
        return value;
    }

    private static String requireText(String value, String label, int max) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException(label + "长度不能超过" + max);
        return result;
    }

    private static String optionalText(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException("描述长度不能超过" + max);
        return result;
    }

    public Long id() { return id; }
    public Long revision() { return revision; }
    public DictionaryScopeType scopeType() { return scopeType; }
    public String scopeCode() { return scopeCode; }
    public Long tenantId() { return tenantId; }
    public Long parentId() { return parentId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public int sortOrder() { return sortOrder; }
    public DictionaryStatus status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
