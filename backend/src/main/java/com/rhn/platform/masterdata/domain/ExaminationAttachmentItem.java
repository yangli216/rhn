package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "RHN_EX_EXAM_ATTACH_ITEM")
public class ExaminationAttachmentItem {
    @Id @Column(name = "ID_EXAM_ATTACH_ITEM") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_CATALOG_ITEM_ATTACH", nullable = false) private Long attachmentCatalogItemId;
    @Column(name = "SD_TRIGGER_TYPE", nullable = false) private String triggerType;
    @Column(name = "QTY_BASIS", nullable = false) private String quantityBasis;
    @Column(name = "QTY_ATTACH", nullable = false) private BigDecimal quantity;
    @Column(name = "FG_REQUIRED_ATTACH", nullable = false) private boolean requiredAttachment;
    @Column(name = "FG_SEPARATELY_CHARGEABLE", nullable = false) private boolean separatelyChargeable;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "DES_EXAM_ATTACH_ITEM") private String description;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ExaminationAttachmentItem() {}

    public ExaminationAttachmentItem(Long tenantId, Long catalogItemId, Long attachmentCatalogItemId,
            String triggerType, String quantityBasis, BigDecimal quantity, boolean requiredAttachment,
            boolean separatelyChargeable, int sortOrder, String description, String status, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(attachmentCatalogItemId, triggerType, quantityBasis, quantity, requiredAttachment,
                separatelyChargeable, sortOrder, description, status, actorId);
    }

    public void update(long expectedRevision, Long attachmentCatalogItemId, String triggerType,
            String quantityBasis, BigDecimal quantity, boolean requiredAttachment,
            boolean separatelyChargeable, int sortOrder, String description, String status, Long actorId) {
        if (revision != expectedRevision) throw new IllegalStateException("检查附件项目已被其他用户修改，请刷新后重试");
        updateValues(attachmentCatalogItemId, triggerType, quantityBasis, quantity, requiredAttachment,
                separatelyChargeable, sortOrder, description, status, actorId);
    }

    private void updateValues(Long attachmentCatalogItemId, String triggerType, String quantityBasis,
            BigDecimal quantity, boolean requiredAttachment, boolean separatelyChargeable,
            int sortOrder, String description, String status, Long actorId) {
        if (quantity == null || quantity.signum() <= 0) throw new IllegalArgumentException("附件项目数量必须大于0");
        if (sortOrder < 0) throw new IllegalArgumentException("排序号不能小于0");
        this.attachmentCatalogItemId = attachmentCatalogItemId;
        this.triggerType = triggerType;
        this.quantityBasis = quantityBasis;
        this.quantity = quantity;
        this.requiredAttachment = requiredAttachment;
        this.separatelyChargeable = separatelyChargeable;
        this.sortOrder = sortOrder;
        this.description = description;
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long attachmentCatalogItemId() { return attachmentCatalogItemId; }
    public String triggerType() { return triggerType; }
    public String quantityBasis() { return quantityBasis; }
    public BigDecimal quantity() { return quantity; }
    public boolean requiredAttachment() { return requiredAttachment; }
    public boolean separatelyChargeable() { return separatelyChargeable; }
    public int sortOrder() { return sortOrder; }
    public String description() { return description; }
    public String status() { return status; }
}
