package com.rhn.billing.application;

import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 结算结清的最后一道账务平衡防线：结算单迁移为 SETTLED 的同一事务内，在舍入入账之后断言
 * <ol>
 *   <li>资金合计（支付、医保基金、个人账户、补助、减免、预交金冲抵）严格等于结算净额；</li>
 *   <li>账本平衡：结算行对应收费事项的借方净额，等于该结算凭证维度账本的贷方净额
 *       （支付、医保、减免、舍入等全部分录类型；住院预交金的存款分录不带凭证，按冲抵的 tender 金额计入）。</li>
 * </ol>
 * 任一不满足即抛 {@code SETTLEMENT_LEDGER_IMBALANCE}，使整事务回滚，不留下“已结清但账不平”的结算单。
 * 冲正结算（REVERSAL）不适用。
 */
@Component
public class SettlementFinalizationGuard {
    private static final int SCALE = 6;

    private final SettlementTenderRepository tenders;
    private final LedgerEntryRepository ledger;

    public SettlementFinalizationGuard(SettlementTenderRepository tenders, LedgerEntryRepository ledger) {
        this.tenders = tenders;
        this.ledger = ledger;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requireBalanced(ExecutionContext context, Settlement settlement) {
        if (!"NORMAL".equals(settlement.settlementType())) return;
        Long tenantId = context.tenantId();
        BigDecimal net = scaled(settlement.netAmount());
        BigDecimal tendered = scaled(tenders.totalTendered(tenantId, settlement.id()));
        if (tendered.compareTo(net) != 0) {
            throw conflict("SETTLEMENT_LEDGER_IMBALANCE", "结算单 %s 结清时资金合计 %s 与结算净额 %s 不一致（差额 %s），已拒绝结清"
                    .formatted(settlement.settlementNo(), tendered.toPlainString(), net.toPlainString(),
                            tendered.subtract(net).toPlainString()));
        }
        Long invoiceId = settlement.legacyInvoiceId();
        BigDecimal chargeDebit = scaled(ledger.chargeDebitNetForSettlement(tenantId, settlement.id()));
        BigDecimal invoiceCredit = invoiceId == null ? zero() : scaled(ledger.creditNetForInvoice(tenantId, invoiceId));
        invoiceCredit = invoiceCredit.add(scaled(tenders.prepaymentTendered(tenantId, settlement.id())));
        if (chargeDebit.compareTo(invoiceCredit) != 0) {
            throw conflict("SETTLEMENT_LEDGER_IMBALANCE", "结算单 %s 结清时收费借方 %s 与结算凭证账本贷方 %s 不平（差额 %s），已拒绝结清"
                    .formatted(settlement.settlementNo(), chargeDebit.toPlainString(), invoiceCredit.toPlainString(),
                            chargeDebit.subtract(invoiceCredit).toPlainString()));
        }
    }

    private static BigDecimal scaled(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal zero() { return BigDecimal.ZERO.setScale(SCALE); }
}
