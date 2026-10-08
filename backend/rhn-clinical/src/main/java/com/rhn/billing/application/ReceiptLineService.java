package com.rhn.billing.application;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptLine;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.InvoiceLine;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InvoiceLineRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Fiscal lines retain posted charge facts; missing classifications are not inferred from source types. */
@Service
class ReceiptLineService {
    private final SettlementLineRepository lines;
    private final ChargeItemRepository charges;
    private final InvoiceLineRepository invoiceLines;

    ReceiptLineService(SettlementLineRepository lines, ChargeItemRepository charges, InvoiceLineRepository invoiceLines) {
        this.lines = lines; this.charges = charges; this.invoiceLines = invoiceLines;
    }

    List<ReceiptLine> resolve(Settlement settlement) {
        var stored = lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(settlement.tenantId(), settlement.id());
        require(!stored.isEmpty() && settlement.legacyInvoiceId() != null, "缺少正式结算明细或原账单");
        Map<Long, ChargeItem> byCharge = charges.findByTenantIdAndIdIn(settlement.tenantId(),
                stored.stream().map(value -> value.chargeItemId()).toList()).stream()
                .collect(Collectors.toMap(ChargeItem::id, value -> value));
        Map<Long, InvoiceLine> byInvoiceLine = invoiceLines.findByTenantIdAndInvoiceIdOrderByLineNo(
                settlement.tenantId(), settlement.legacyInvoiceId()).stream()
                .collect(Collectors.toMap(InvoiceLine::id, value -> value));
        Set<Long> chargeIds = new HashSet<>(), invoiceLineIds = new HashSet<>();
        Set<Integer> lineNumbers = new HashSet<>();
        List<ReceiptLine> result = new ArrayList<>();
        BigDecimal gross = BigDecimal.ZERO, discount = BigDecimal.ZERO, net = BigDecimal.ZERO;
        for (var line : stored) {
            require(Objects.equals(line.settlementId(), settlement.id()) && line.lineNo() > 0
                    && lineNumbers.add(line.lineNo()) && chargeIds.add(line.chargeItemId())
                    && invoiceLineIds.add(line.legacyInvoiceLineId()), "结算明细身份重复或不一致");
            var charge = byCharge.get(line.chargeItemId());
            require(charge != null && Objects.equals(charge.tenantId(), settlement.tenantId())
                    && Objects.equals(charge.organizationId(), settlement.organizationId())
                    && Objects.equals(charge.patientAccountId(), settlement.patientAccountId())
                    && Objects.equals(charge.currencyCode(), settlement.currencyCode())
                    && "POSTED".equals(charge.status()) && charge.reversesChargeItemId() == null,
                    "收费来源缺失、已冲销或与结算范围不一致");
            require(text(charge.accountingCategory()) && !"UNCLASSIFIED".equals(charge.accountingCategory().trim()), "收费项目缺少会计分类快照，不能推定为药品费或其他费");
            require(text(charge.itemCodeSnapshot()) && text(charge.itemNameSnapshot()), "收费项目编码或名称快照缺失");
            require(line.settledQuantity() != null && line.settledQuantity().signum() > 0
                    && equal(line.settledQuantity(), charge.quantity()), "结算数量与原收费数量不一致");
            var invoiceLine = byInvoiceLine.get(line.legacyInvoiceLineId());
            require(invoiceLine != null && Objects.equals(invoiceLine.invoiceId(), settlement.legacyInvoiceId())
                    && Objects.equals(invoiceLine.chargeItemId(), charge.id()) && invoiceLine.lineNo() == line.lineNo()
                    && equal(invoiceLine.amount(), line.grossAmount()) && equal(line.grossAmount(), charge.totalAmount()),
                    "结算明细与原账单或收费金额不一致");
            require(nonnegative(line.grossAmount()) && nonnegative(line.discountAmount()) && nonnegative(line.netAmount())
                    && equal(line.grossAmount().subtract(line.discountAmount()), line.netAmount()), "结算行原额、优惠与净额不一致");
            gross = gross.add(line.grossAmount()); discount = discount.add(line.discountAmount()); net = net.add(line.netAmount());
            result.add(new ReceiptLine(line.lineNo(), charge.accountingCategory().trim(), charge.itemCodeSnapshot(),
                    charge.itemNameSnapshot(), line.settledQuantity(), line.netAmount()));
        }
        require(invoiceLineIds.equals(byInvoiceLine.keySet()), "正式结算未完整包含原账单明细");
        require(equal(gross, settlement.grossAmount()) && equal(discount, settlement.discountAmount())
                && settlement.roundingAmount() != null && equal(net.add(settlement.roundingAmount()), settlement.netAmount()),
                "结算明细合计、优惠或舍入差额与票面金额不一致");
        return List.copyOf(result);
    }

    private static boolean nonnegative(BigDecimal value) { return value != null && value.signum() >= 0; }
    private static boolean equal(BigDecimal first, BigDecimal second) { return first != null && second != null && first.compareTo(second) == 0; }
    private static boolean text(String value) { return value != null && !value.isBlank(); }
    private static void require(boolean condition, String message) {
        if (!condition) throw conflict("RECEIPT_LINES_UNVERIFIED", message);
    }
}
