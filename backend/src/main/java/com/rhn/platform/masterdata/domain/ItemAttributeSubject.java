package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_ITEM_ATTR_SUBJECT")
public class ItemAttributeSubject {
    @Id @Column(name = "ID_ITEM_ATTR_SUBJECT") private Long id;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "SD_SUBJECT_TYPE", nullable = false) private String subjectType;
    @Column(name = "CD_SUBJECT_KEY", nullable = false) private String subjectKey;
    @Column(name = "ID_ITEM_MASTER") private Long itemMasterId;
    @Column(name = "ID_MED") private Long medicationId;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "ID_SVC_VAR") private Long serviceVariantId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;

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
