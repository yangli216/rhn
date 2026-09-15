package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_INVOICE_LINE")
public class InvoiceLine {
    @Id @Column(name = "ID_INVOICE_LINE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INVOICE", nullable = false) private Long invoiceId;
    @Column(name = "ID_CHARGE_ITEM", nullable = false) private Long chargeItemId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "AMT_LINE", nullable = false, precision = 24, scale = 6) private BigDecimal amount;

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
