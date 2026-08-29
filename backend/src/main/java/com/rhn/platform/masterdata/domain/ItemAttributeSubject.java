package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "item_attribute_subjects")
public class ItemAttributeSubject {
    @Id private Long id;
    @Column(name = "tenant_id") private Long tenantId;
    @Column(name = "subject_type", nullable = false) private String subjectType;
    @Column(name = "subject_key", nullable = false) private String subjectKey;
    @Column(name = "item_master_id") private Long itemMasterId;
    @Column(name = "medication_id") private Long medicationId;
    @Column(name = "catalog_item_id") private Long catalogItemId;
    @Column(name = "service_variant_id") private Long serviceVariantId;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    protected ItemAttributeSubject() {}

    public static ItemAttributeSubject medication(Long tenantId, Long medicationId, Long actorId) {
        return tenantSubject(tenantId, "MEDICATION", medicationId, actorId);
    }

    public static ItemAttributeSubject catalogItem(Long tenantId, Long catalogItemId, Long actorId) {
        return tenantSubject(tenantId, "CATALOG_ITEM", catalogItemId, actorId);
    }

    public static ItemAttributeSubject serviceVariant(Long tenantId, Long variantId, Long actorId) {
        return tenantSubject(tenantId, "SERVICE_VARIANT", variantId, actorId);
    }

    private static ItemAttributeSubject tenantSubject(Long tenantId, String type, Long targetId, Long actorId) {
        ItemAttributeSubject value = new ItemAttributeSubject();
        value.id = GlobalIds.next();
        value.tenantId = tenantId;
        value.subjectType = type;
        value.subjectKey = "TENANT:" + tenantId + "/" + type + ":" + targetId;
        if ("MEDICATION".equals(type)) value.medicationId = targetId;
        if ("CATALOG_ITEM".equals(type)) value.catalogItemId = targetId;
        if ("SERVICE_VARIANT".equals(type)) value.serviceVariantId = targetId;
        value.createdAt = Instant.now();
        value.createdBy = actorId;
        return value;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String subjectType() { return subjectType; }
    public String subjectKey() { return subjectKey; }
    public Long itemMasterId() { return itemMasterId; }
    public Long medicationId() { return medicationId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long serviceVariantId() { return serviceVariantId; }
}
