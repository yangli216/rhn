package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 结算舍入差额（抹零/进位）入账：患者账户余额以账本为准，舍入只改结算单金额而不入账会使账户残留零头。
 *
 * <p>入账规则：结算单最终结清（SETTLED，唯一汇合点为 {@code SettlementApplicationService} 的结清状态迁移）时，
 * 按结算单当前舍入金额与账本已入账舍入的差额记一条 {@code ROUNDING} 分录——舍入为负（抹零，实收少于应收）记贷方，
 * 为正（进位）记借方；零差额不写。已入账金额与结算单一致时重放不再写，故幂等。
 *
 * <p>冲销规则：原结算单的全部收费事项均已被冲销（整单退费）时，记一条 {@code ROUNDING_REVERSAL} 反向分录，
 * 使“收费冲销 + 医保冲正 + 退款”之后账户余额回到零；部分冲销不动舍入（舍入是整单让利，退款只覆盖患者实付部分）。
 * 分录类型 {@code SD_ENTRY_TYPE} 为 32 位自由文本，无检查约束或字典白名单。</p>
 */
@Service
public class SettlementRoundingLedger {
    public static final String ROUNDING = "ROUNDING";
    public static final String ROUNDING_REVERSAL = "ROUNDING_REVERSAL";
    private static final int SCALE = 6;

    private final LedgerEntryRepository ledger;
    private final SettlementRepository settlements;
    private final SettlementLineRepository settlementLines;
    private final ChargeItemRepository charges;

    public SettlementRoundingLedger(LedgerEntryRepository ledger, SettlementRepository settlements,
                                    SettlementLineRepository settlementLines, ChargeItemRepository charges) {
        this.ledger = ledger;
        this.settlements = settlements;
        this.settlementLines = settlementLines;
        this.charges = charges;
    }

    /** 结算单结清时把舍入差额写入患者账本；调用方保证已处于事务内。返回本次新增分录的有符号舍入（负为贷方），无新增为 0。 */
    @Transactional(propagation = Propagation.MANDATORY)
    public BigDecimal recordOnFinalize(ExecutionContext context, Settlement settlement, Instant occurredAt) {
        if (!"NORMAL".equals(settlement.settlementType())) return zero();
        BigDecimal desired = scaled(settlement.roundingAmount());
        Long invoiceId = settlement.legacyInvoiceId();
        if (invoiceId == null) {
            if (desired.signum() == 0) return zero();
            throw conflict("SETTLEMENT_ROUNDING_INVOICE_MISSING", "存在舍入差额的结算单缺少对应结算凭证，无法入账");
        }
        if (!ledger.findByTenantIdAndInvoiceIdAndEntryTypeOrderByOccurredAtAscIdAsc(
                context.tenantId(), invoiceId, ROUNDING_REVERSAL).isEmpty()) return zero();
        BigDecimal delta = desired.subtract(booked(context, invoiceId));
        if (delta.signum() == 0) return zero();
        ledger.save(new LedgerEntry(context.tenantId(), settlement.patientAccountId(), ROUNDING,
                delta.signum() < 0 ? "CREDIT" : "DEBIT", delta.abs().setScale(SCALE, RoundingMode.HALF_UP),
                settlement.currencyCode(), null, invoiceId, null, null, occurredAt, context.subjectId()));
        return delta;
    }

    /**
     * 收费事项被冲销后，若某原结算单的全部收费事项都已冲销，则冲回其已入账的舍入。
     * 通过 {@code ROUNDING_REVERSAL} 判重，开具贷项账单与直接退费先后到达时不会重复冲回。
     *
     * @return 本次冲回产生的账户借方净额（借方为正、贷方为负），调用方据此扣减因冲销新增的可退余额
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public BigDecimal reverseForChargeReversals(ExecutionContext context, List<ChargeItem> reversalCharges,
                                                Instant occurredAt) {
        List<ChargeItem> reversals = reversalCharges.stream().filter(charge -> charge.reversesChargeItemId() != null).toList();
        if (reversals.isEmpty()) return zero();
        Map<Long, List<SettlementLine>> originalLines = settlementLines.findByTenantIdAndChargeItemIdIn(context.tenantId(),
                        reversals.stream().map(ChargeItem::reversesChargeItemId).distinct().toList()).stream()
                .collect(Collectors.groupingBy(SettlementLine::settlementId, LinkedHashMap::new, Collectors.toList()));
        BigDecimal debitNet = zero();
        // 一次装载本批原结算，避免逐条回查。
        List<Long> originalSettlementIds = originalLines.keySet().stream().toList();
        Map<Long, Settlement> originalById = new HashMap<>();
        for (int from = 0; from < originalSettlementIds.size(); from += 500) {
            settlements.findByTenantIdAndIdIn(context.tenantId(),
                    originalSettlementIds.subList(from, Math.min(from + 500, originalSettlementIds.size())))
                    .forEach(value -> originalById.put(value.id(), value));
        }
        // 一次装载本批结算凭证的账本、原结算行与冲销收费汇总，避免逐原结算回查。
        List<Long> invoiceIds = originalById.values().stream()
                .filter(value -> "NORMAL".equals(value.settlementType()) && value.legacyInvoiceId() != null)
                .map(Settlement::legacyInvoiceId).distinct().toList();
        Map<Long, List<LedgerEntry>> entriesByInvoice = new HashMap<>();
        for (int from = 0; from < invoiceIds.size(); from += 500) {
            ledger.findByTenantIdAndInvoiceIdInOrderByOccurredAtAscIdAsc(context.tenantId(),
                            invoiceIds.subList(from, Math.min(from + 500, invoiceIds.size())))
                    .forEach(entry -> entriesByInvoice.computeIfAbsent(entry.invoiceId(),
                            ignored -> new ArrayList<>()).add(entry));
        }
        Map<Long, List<SettlementLine>> linesBySettlement = new HashMap<>();
        for (int from = 0; from < originalSettlementIds.size(); from += 500) {
            settlementLines.findByTenantIdAndSettlementIdInOrderBySettlementIdAscLineNoAsc(context.tenantId(),
                            originalSettlementIds.subList(from, Math.min(from + 500, originalSettlementIds.size())))
                    .forEach(line -> linesBySettlement.computeIfAbsent(line.settlementId(),
                            ignored -> new ArrayList<>()).add(line));
        }
        List<Long> originalChargeIds = linesBySettlement.values().stream().flatMap(List::stream)
                .map(SettlementLine::chargeItemId).distinct().toList();
        Map<Long, BigDecimal> reversedByCharge = new HashMap<>();
        for (int from = 0; from < originalChargeIds.size(); from += 500) {
            charges.findByTenantIdAndReversesChargeItemIdIn(context.tenantId(),
                            originalChargeIds.subList(from, Math.min(from + 500, originalChargeIds.size())))
                    .forEach(charge -> reversedByCharge.merge(charge.reversesChargeItemId(),
                            charge.totalAmount().abs(), BigDecimal::add));
        }
        for (Long settlementId : originalLines.keySet()) {
            Settlement original = originalById.get(settlementId);
            if (original == null || !"NORMAL".equals(original.settlementType()) || original.legacyInvoiceId() == null) continue;
            Long invoiceId = original.legacyInvoiceId();
            List<LedgerEntry> entries = entriesByInvoice.getOrDefault(invoiceId, List.of());
            if (entries.stream().anyMatch(entry -> ROUNDING_REVERSAL.equals(entry.entryType()))) continue;
            BigDecimal booked = booked(entries);
            if (booked.signum() == 0
                    || !fullyReversed(linesBySettlement.getOrDefault(settlementId, List.of()), reversedByCharge)) continue;
            Long roundingEntryId = entries.stream()
                    .filter(entry -> ROUNDING.equals(entry.entryType())).findFirst().get().id();
            ledger.save(new LedgerEntry(context.tenantId(), original.patientAccountId(), ROUNDING_REVERSAL,
                    booked.signum() < 0 ? "DEBIT" : "CREDIT", booked.abs().setScale(SCALE, RoundingMode.HALF_UP),
                    original.currencyCode(), null, invoiceId, null, roundingEntryId, occurredAt, context.subjectId()));
            debitNet = debitNet.subtract(booked);
        }
        return debitNet;
    }

    /** 已入账舍入的有符号合计：贷方（抹零）为负，借方（进位）为正。 */
    private BigDecimal booked(ExecutionContext context, Long invoiceId) {
        return booked(ledger.findByTenantIdAndInvoiceIdAndEntryTypeOrderByOccurredAtAscIdAsc(
                context.tenantId(), invoiceId, ROUNDING));
    }

    private BigDecimal booked(List<LedgerEntry> entries) {
        return entries.stream().filter(entry -> ROUNDING.equals(entry.entryType()))
                .map(entry -> "DEBIT".equals(entry.direction()) ? entry.amount() : entry.amount().negate())
                .reduce(zero(), BigDecimal::add).setScale(SCALE, RoundingMode.HALF_UP);
    }

    private boolean fullyReversed(List<SettlementLine> lines, Map<Long, BigDecimal> reversed) {
        if (lines.isEmpty()) return false;
        return lines.stream().anyMatch(line -> line.grossAmount().signum() != 0)
                && lines.stream().allMatch(line -> line.grossAmount().signum() == 0
                || reversed.getOrDefault(line.chargeItemId(), BigDecimal.ZERO).compareTo(line.grossAmount().abs()) >= 0);
    }

    private static BigDecimal scaled(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(SCALE, RoundingMode.HALF_UP);
    }

    private static BigDecimal zero() { return BigDecimal.ZERO.setScale(SCALE); }
}
