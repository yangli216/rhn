package com.rhn.platform.dictionary.domain;

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
@Table(name = "dictionary_definitions")
public class DictionaryDefinition {
    @Id
    private Long id;
    @Version
    @Column(nullable = false)
    private Long revision;
    @Enumerated(EnumType.STRING)
    @Column(name = "scope_type", nullable = false, length = 16)
    private DictionaryScopeType scopeType;
    @Column(name = "scope_code", nullable = false, length = 80)
    private String scopeCode;
    @Column(name = "tenant_id")
    private Long tenantId;
    @Column(name = "category_id", nullable = false)
    private Long categoryId;
    @Column(nullable = false, length = 64)
    private String code;
    @Column(nullable = false, length = 200)
    private String name;
    @Column(length = 1000)
    private String description;
    @Column(name = "system_managed", nullable = false)
    private boolean systemManaged;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DictionaryStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "created_by", nullable = false)
    private Long createdBy;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "updated_by", nullable = false)
    private Long updatedBy;

    protected DictionaryDefinition() {
    }

    public DictionaryDefinition(DictionaryScopeType scopeType, Long currentTenantId, Long categoryId, String code,
                                String name, String description, Long actorId) {
        if (scopeType == null) throw new IllegalArgumentException("字典作用域不能为空");
        this.id = GlobalIds.next();
        // A null wrapper version marks an assigned-id entity as new to Hibernate; it is
        // initialized to zero on insert and remains externally visible as revision 0.
        this.revision = null;
        this.scopeType = scopeType;
        this.tenantId = scopeType == DictionaryScopeType.TENANT ? requireId(currentTenantId, "租户") : null;
        this.scopeCode = scopeType == DictionaryScopeType.PLATFORM ? "PLATFORM" : "TENANT:" + tenantId;
        this.categoryId = requireId(categoryId, "字典分类");
        this.code = DictionaryCodePolicy.requireDictionaryCode(code);
        this.name = requireText(name, "字典名称", 200);
        this.description = optionalText(description, 1000);
        this.systemManaged = false;
        this.status = DictionaryStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(Long categoryId, String name, String description, long expectedRevision, Long actorId) {
        assertRevision(expectedRevision);
        this.categoryId = requireId(categoryId, "字典分类");
        this.name = requireText(name, "字典名称", 200);
        this.description = optionalText(description, 1000);
        touch(actorId);
    }

    public void enable(long expectedRevision, Long actorId) {
        changeStatus(DictionaryStatus.ACTIVE, expectedRevision, actorId);
    }

    public void disable(long expectedRevision, Long actorId) {
        changeStatus(DictionaryStatus.INACTIVE, expectedRevision, actorId);
    }

    public void touchForItemChange(long expectedRevision, Long actorId) {
        assertRevision(expectedRevision);
        touch(actorId);
    }

    private void changeStatus(DictionaryStatus target, long expectedRevision, Long actorId) {
        assertRevision(expectedRevision);
        if (status == target) throw new IllegalArgumentException("字典已经处于" + target + "状态");
        status = target;
        touch(actorId);
    }

    private void touch(Long actorId) {
        updatedAt = Instant.now();
        updatedBy = requireId(actorId, "操作用户");
    }

    public void assertRevision(long expectedRevision) {
        if (revision == null || revision != expectedRevision) {
            throw new StaleDictionaryRevisionException(revision);
        }
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
    public Long categoryId() { return categoryId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public boolean systemManaged() { return systemManaged; }
    public DictionaryStatus status() { return status; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
