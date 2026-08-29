package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "invoice_category_summaries")
public class InvoiceCategorySummary {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "invoice_id", nullable = false) private Long invoiceId;
    @Column(name = "category_code", nullable = false) private String categoryCode;
    @Column(name = "category_name_snapshot") private String categoryNameSnapshot;
    @Column(nullable = false, precision = 24, scale = 6) private BigDecimal amount;

    protected InvoiceCategorySummary() {}

    public InvoiceCategorySummary(Long tenantId, Long invoiceId, String categoryCode,
                                  String categoryNameSnapshot, BigDecimal amount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.invoiceId = invoiceId;
        this.categoryCode = categoryCode; this.categoryNameSnapshot = categoryNameSnapshot; this.amount = amount;
    }
}
