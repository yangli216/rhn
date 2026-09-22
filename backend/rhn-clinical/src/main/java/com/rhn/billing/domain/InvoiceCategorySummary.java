package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_INVOICE_CAT_SUM")
public class InvoiceCategorySummary {
    @Id @Column(name = "ID_INVOICE_CAT_SUM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INVOICE", nullable = false) private Long invoiceId;
    @Column(name = "CD_CAT", nullable = false) private String categoryCode;
    @Column(name = "NA_CAT_SNAP") private String categoryNameSnapshot;
    @Column(name = "AMT_CAT", nullable = false, precision = 24, scale = 6) private BigDecimal amount;

    protected InvoiceCategorySummary() {}

    public InvoiceCategorySummary(Long tenantId, Long invoiceId, String categoryCode,
                                  String categoryNameSnapshot, BigDecimal amount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.invoiceId = invoiceId;
        this.categoryCode = categoryCode; this.categoryNameSnapshot = categoryNameSnapshot; this.amount = amount;
    }
}
