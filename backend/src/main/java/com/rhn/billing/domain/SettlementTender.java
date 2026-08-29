package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "settlement_tenders")
public class SettlementTender {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "settlement_id", nullable = false) private Long settlementId;
    @Column(name = "payment_id") private Long paymentId;
    @Column(name = "claim_response_id") private Long claimResponseId;
    @Column(name = "line_no", nullable = false) private int lineNo;
    @Column(name = "tender_type", nullable = false) private String tenderType;
    @Column(name = "payer_code") private String payerCode;
    @Column(name = "payer_name_snapshot") private String payerNameSnapshot;
    @Column(name = "tender_amount", nullable = false, precision = 24, scale = 6) private BigDecimal tenderAmount;
    @Column(name = "currency_code", nullable = false) private String currencyCode;

    protected SettlementTender() {}
    public SettlementTender(Long tenantId, Long settlementId, Long paymentId, int lineNo,
                            String tenderType, String payerCode, String payerName,
                            BigDecimal amount, String currencyCode) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.settlementId = settlementId;
        this.paymentId = paymentId; this.lineNo = lineNo; this.tenderType = tenderType;
        this.payerCode = payerCode; this.payerNameSnapshot = payerName; this.tenderAmount = amount;
        this.currencyCode = currencyCode;
    }
    public SettlementTender(Long tenantId, Long settlementId, Long claimResponseId, int lineNo,
                            String tenderType, String payerCode, String payerName,
                            BigDecimal amount, String currencyCode, boolean insuranceTender) {
        this(tenantId, settlementId, null, lineNo, tenderType, payerCode, payerName, amount, currencyCode);
        this.claimResponseId = claimResponseId;
    }
    public Long id() { return id; } public Long paymentId() { return paymentId; } public Long claimResponseId() { return claimResponseId; }
    public int lineNo() { return lineNo; } public String tenderType() { return tenderType; }
    public String payerCode() { return payerCode; } public String payerNameSnapshot() { return payerNameSnapshot; }
    public BigDecimal tenderAmount() { return tenderAmount; } public String currencyCode() { return currencyCode; }
}
