package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_BIL_STL_TENDER")
public class SettlementTender {
    @Id @Column(name = "ID_STL_TENDER") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "ID_PAY") private Long paymentId;
    @Column(name = "ID_CLAIM_RESP") private Long claimResponseId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Column(name = "SD_TENDER_TYPE", nullable = false) private String tenderType;
    @Column(name = "CD_PAYER") private String payerCode;
    @Column(name = "NA_PAYER_SNAP") private String payerNameSnapshot;
    @Column(name = "AMT_TENDER", nullable = false, precision = 24, scale = 6) private BigDecimal tenderAmount;
    @Column(name = "CD_CURRENCY", nullable = false) private String currencyCode;

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
