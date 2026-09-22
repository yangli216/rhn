package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BD_ITEM_GRP_MEMBER")
public class ItemGroupMember {
    @Id @Column(name = "ID_ITEM_GRP_MEMBER") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ITEM_GRP", nullable = false) private Long itemGroupId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "QTY_MEMBER", nullable = false) private BigDecimal quantity;
    @Column(name = "CD_UNIT") private String unitCode;
    @Column(name = "FG_RQD_MEMBER", nullable = false) private boolean requiredMember;
    @Column(name = "DES_MEMBER_DESCR") private String memberDescription;

    protected ItemGroupMember() {}

    public ItemGroupMember(Long tenantId, Long itemGroupId, Long catalogItemId, int sortOrder,
                           BigDecimal quantity, String unitCode, boolean requiredMember,
                           String memberDescription) {
        if (quantity == null || quantity.signum() <= 0) throw new IllegalArgumentException("组套成员数量必须大于0");
        if (sortOrder < 0) throw new IllegalArgumentException("组套成员排序号不能小于0");
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.itemGroupId = itemGroupId;
        this.catalogItemId = catalogItemId;
        this.sortOrder = sortOrder;
        this.quantity = quantity;
        this.unitCode = unitCode == null || unitCode.isBlank() ? null : unitCode.trim();
        this.requiredMember = requiredMember;
        this.memberDescription = memberDescription == null || memberDescription.isBlank() ? null : memberDescription.trim();
    }

    public Long id() { return id; } public Long itemGroupId() { return itemGroupId; }
    public Long catalogItemId() { return catalogItemId; } public int sortOrder() { return sortOrder; }
    public BigDecimal quantity() { return quantity; } public String unitCode() { return unitCode; }
    public boolean requiredMember() { return requiredMember; } public String memberDescription() { return memberDescription; }
}
