package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "invoice_lines")
public class InvoiceLine {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "invoice_id", nullable = false) private Long invoiceId;
    @Column(name = "charge_item_id", nullable = false) private Long chargeItemId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(nullable = false, precision = 24, scale = 6) private BigDecimal amount;

    protected InvoiceLine() {}

    public InvoiceLine(Long tenantId, Long invoiceId, Long chargeItemId, int lineNo, BigDecimal amount) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.invoiceId = invoiceId;
        this.chargeItemId = chargeItemId; this.lineNo = lineNo; this.amount = amount;
    }

    public Long id() { return id; }
    public Long invoiceId() { return invoiceId; }
    public Long chargeItemId() { return chargeItemId; }
    public int lineNo() { return lineNo; }
    public BigDecimal amount() { return amount; }
}
