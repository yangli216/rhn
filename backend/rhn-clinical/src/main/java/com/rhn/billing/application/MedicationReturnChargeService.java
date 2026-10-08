package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.DispenseBillingDirectory;
import com.rhn.pharmacy.api.DispenseBillingDirectory.DispenseBillingFact;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.shared.api.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Objects;

/** One posting policy for pharmacy events and explicit billing synchronization. */
@Service
public class MedicationReturnChargeService {
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final DispenseBillingDirectory dispenses;
    private final MedicationRequestDirectory requests;

    public MedicationReturnChargeService(ChargeItemRepository charges, ChargeItemComponentRepository components,
                                        LedgerEntryRepository ledger, DispenseBillingDirectory dispenses,
                                        MedicationRequestDirectory requests) {
        this.charges = charges; this.components = components; this.ledger = ledger;
        this.dispenses = dispenses; this.requests = requests;
    }

    @Transactional
    public Posting postEvent(DomainEventEnvelope event) {
        check(event.tenantId() != null && event.tenantId() > 0 && event.eventId() != null && event.eventId() > 0
                && event.eventVersion() == 1 && event.occurredAt() != null
                && "MEDICATION_RETURN_POSTED".equals(event.eventType()) && "DispenseTask".equals(event.aggregateType()), "事件身份或发生时间缺失");
        Map<String, Object> data = event.payload();
        check(data != null, "事件内容缺失");
        Long returnId = id(data, "returnDispenseId");
        DispenseBillingFact fact = requireReturn(event.tenantId(), returnId);
        check(Objects.equals(event.aggregateId(), fact.taskId()) && Objects.equals(event.subjectId(), fact.residentId())
                && Objects.equals(event.organizationId(), fact.siteOrganizationId())
                && sameTime(event.occurredAt(), fact.occurredAt())
                && Objects.equals(id(data, "requestId"), fact.requestId())
                && Objects.equals(id(data, "originalDispenseId"), fact.originalDispenseId())
                && Objects.equals(id(data, "processedBy"), fact.processedBy())
                && Objects.equals(text(data, "returnNo"), fact.dispenseNo())
                && Objects.equals(text(data, "operationUnitCode"), fact.operationUnitCode())
                && number(data, "operationQuantity").compareTo(fact.operationQuantity()) == 0,
                "事件与实际退药记录的身份、数量、单位、处理人或时间不一致");
        return post(event.tenantId(), fact);
    }

    @Transactional
    public Posting post(Long tenantId, Long returnId) { return post(tenantId, requireReturn(tenantId, returnId)); }

    @Transactional(readOnly = true)
    public Preview preview(Long tenantId, Long returnId) {
        Plan plan = plan(tenantId, requireReturn(tenantId, returnId), false);
        return new Preview(plan.quantity(), plan.amount(), plan.original() == null);
    }

    private Posting post(Long tenantId, DispenseBillingFact returned) {
        Plan plan = plan(tenantId, returned, true);
        if (plan.original() == null) return new Posting(null, false);
        if (plan.existing() != null) return new Posting(plan.existing(), false);
        ChargeItem original = plan.original();
        ChargeItem reversal = charges.save(new ChargeItem(tenantId, original.organizationId(), original.departmentId(),
                original.patientAccountId(), original.residentId(), original.encounterId(), original.requestId(), original.catalogItemId(),
                "MEDICATION_RETURN", returned.id(), returned.dispenseNo(), plan.quantity().negate(), original.unitCode(),
                original.unitPrice(), plan.amount().negate(), original.currencyCode(), original.priceId(), original.priceRevision(),
                original.priceType(), original.itemCodeSnapshot(), original.itemNameSnapshot(), returned.occurredAt(),
                returned.processedBy(), original.id(), original.accountingCategory()));
        components.save(new ChargeItemComponent(tenantId, reversal.id(), original.catalogItemId(), original.itemCodeSnapshot(),
                original.itemNameSnapshot(), plan.quantity().negate(), original.unitCode(), plan.factor(), original.unitPrice(), plan.amount().negate()));
        ledger.save(new LedgerEntry(tenantId, original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT", plan.amount(),
                original.currencyCode(), reversal.id(), null, null, plan.originalLedger().id(), returned.occurredAt(), returned.processedBy()));
        return new Posting(reversal, true);
    }

    private Plan plan(Long tenantId, DispenseBillingFact returned, boolean lock) {
        DispenseBillingFact dispensed = dispenses.requireById(tenantId, returned.originalDispenseId());
        requireFact(dispensed);
        check(Objects.equals(dispensed.id(), returned.originalDispenseId())
                && ("DISPENSE".equals(dispensed.dispenseType()) || "REDISPENSE".equals(dispensed.dispenseType()))
                && Objects.equals(dispensed.taskId(), returned.taskId())
                && Objects.equals(dispensed.residentId(), returned.residentId())
                && Objects.equals(dispensed.encounterId(), returned.encounterId())
                && Objects.equals(dispensed.requestId(), returned.requestId())
                && Objects.equals(dispensed.catalogItemId(), returned.catalogItemId())
                && Objects.equals(dispensed.stockSiteId(), returned.stockSiteId())
                && Objects.equals(dispensed.operationUnitCode(), returned.operationUnitCode())
                && Objects.equals(dispensed.packageId(), returned.packageId())
                && same(dispensed.baseQuantityFactor(), returned.baseQuantityFactor())
                && returned.operationQuantity().compareTo(dispensed.operationQuantity()) <= 0,
                "退药与原发药记录不一致或超过原发药数量");
        ChargeItem byRequest = charges.findByTenantIdAndSourceTypeAndSourceId(tenantId, "MEDICATION_REQUEST", returned.requestId()).orElse(null);
        ChargeItem byDispense = charges.findByTenantIdAndSourceTypeAndSourceId(tenantId, "MEDICATION_DISPENSE", dispensed.id()).orElse(null);
        check(byRequest == null || byDispense == null, "原医嘱和发药同时存在收费，必须先核对重复计费");
        ChargeItem original = byRequest != null ? byRequest : byDispense;
        if (original != null && lock) original = charges.lockByIdAndTenantId(original.id(), tenantId)
                .orElseThrow(() -> failure("原收费在核对期间消失"));
        ChargeItem existing = charges.findByTenantIdAndSourceTypeAndSourceId(tenantId, "MEDICATION_RETURN", returned.id()).orElse(null);
        if (original == null) {
            MedicationRequestSnapshot request = requireRequest(tenantId, returned);
            boolean explicitZero = request.unitPrice() != null && request.unitPrice().signum() == 0
                    && request.totalAmount() != null && request.totalAmount().signum() == 0
                    && nonblank(request.currencyCode()) && request.priceId() != null && request.priceRevision() != null
                    && nonblank(request.priceType());
            check(existing == null && (request.selfProvided() || explicitZero), "原收费缺失，且原医嘱没有明确的不收费依据");
            return new Plan(null, null, null, returned.operationQuantity(), returned.baseQuantityFactor(), BigDecimal.ZERO);
        }
        requireOriginal(tenantId, original, returned);
        check(byRequest != null ? "MEDICATION_REQUEST".equals(original.sourceType()) && Objects.equals(original.sourceId(), returned.requestId())
                : "MEDICATION_DISPENSE".equals(original.sourceType()) && Objects.equals(original.sourceId(), dispensed.id()), "原收费来源关联不一致");
        BigDecimal factor;
        if (byRequest != null) {
            MedicationRequestSnapshot request = requireRequest(tenantId, returned);
            check(!request.selfProvided() && same(original.quantity(), request.priceQuantity())
                    && same(original.unitPrice(), request.unitPrice()) && same(original.totalAmount(), request.totalAmount())
                    && Objects.equals(original.currencyCode(), request.currencyCode())
                    && Objects.equals(original.priceId(), request.priceId()) && Objects.equals(original.priceRevision(), request.priceRevision())
                    && Objects.equals(original.priceType(), request.priceType()), "原收费与医嘱价格快照不一致");
            if (Objects.equals(original.unitCode(), request.baseUnit())) factor = BigDecimal.ONE;
            else {
                check(Objects.equals(original.unitCode(), request.quantityUnit()) && positive(request.packageFactor()), "原计费单位缺少明确的包装换算依据");
                factor = request.packageFactor();
            }
            check(positive(request.baseQuantity()) && same(original.quantity().multiply(factor), request.baseQuantity()), "原计费数量和单位无法对应医嘱基本数量");
        } else {
            check(Objects.equals(original.unitCode(), dispensed.operationUnitCode())
                    && same(original.quantity(), dispensed.operationQuantity()), "原发药收费的单位或数量与发药记录不一致");
            factor = dispensed.baseQuantityFactor();
        }
        BigDecimal quantity;
        try { quantity = returned.operationQuantity().multiply(returned.baseQuantityFactor()).divide(factor, 8, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException error) { throw failure("退药数量不能精确换算为原计费单位"); }
        LedgerEntry originalLedger = ledger.findByTenantIdAndChargeItemId(tenantId, original.id())
                .orElseThrow(() -> failure("原收费缺少账务流水"));
        requireLedger(originalLedger, original, "CHARGE", "DEBIT", null);
        BigDecimal reversedQuantity = BigDecimal.ZERO, reversedAmount = BigDecimal.ZERO;
        var previous = charges.findByTenantIdAndReversesChargeItemIdOrderByOccurredAtAscIdAsc(tenantId, original.id());
        for (ChargeItem prior : previous) {
            // Posting IDs, rather than a backdated business timestamp, determine earlier credits.
            if (existing != null && prior.id() >= existing.id()) continue;
            check(Objects.equals(prior.tenantId(), tenantId) && Objects.equals(prior.patientAccountId(), original.patientAccountId())
                    && Objects.equals(prior.reversesChargeItemId(), original.id()) && Objects.equals(prior.unitCode(), original.unitCode())
                    && Objects.equals(prior.residentId(), original.residentId()) && Objects.equals(prior.encounterId(), original.encounterId())
                    && Objects.equals(prior.requestId(), original.requestId()) && Objects.equals(prior.catalogItemId(), original.catalogItemId())
                    && Objects.equals(prior.currencyCode(), original.currencyCode()) && prior.quantity() != null && prior.quantity().signum() < 0
                    && prior.totalAmount() != null && prior.totalAmount().signum() <= 0 && "POSTED".equals(prior.status()),
                    "已有冲销记录缺少一致的数量、单位或金额事实");
            LedgerEntry priorLedger = ledger.findByTenantIdAndChargeItemId(tenantId, prior.id()).orElseThrow(() -> failure("已有冲销缺少账务流水"));
            requireLedger(priorLedger, prior, "CHARGE_REVERSAL", "CREDIT", originalLedger.id());
            reversedQuantity = reversedQuantity.subtract(prior.quantity());
            reversedAmount = reversedAmount.subtract(prior.totalAmount());
        }
        BigDecimal remaining = original.quantity().subtract(reversedQuantity);
        BigDecimal remainingAmount = money(original.totalAmount().subtract(reversedAmount));
        check(quantity.signum() > 0 && quantity.compareTo(remaining) <= 0 && remainingAmount.signum() >= 0,
                "累计冲销超过原收费数量或金额");
        BigDecimal amount = quantity.compareTo(remaining) == 0 ? remainingAmount
                : original.totalAmount().multiply(quantity).divide(original.quantity(), 6, RoundingMode.HALF_UP);
        check(amount.signum() >= 0 && amount.compareTo(remainingAmount) <= 0, "本次冲销超过剩余原收费金额");
        if (existing != null) {
            check(Objects.equals(existing.reversesChargeItemId(), original.id())
                    && Objects.equals(existing.patientAccountId(), original.patientAccountId())
                    && Objects.equals(existing.residentId(), returned.residentId()) && Objects.equals(existing.encounterId(), returned.encounterId())
                    && Objects.equals(existing.requestId(), returned.requestId()) && Objects.equals(existing.catalogItemId(), returned.catalogItemId())
                    && Objects.equals(existing.requestCode(), returned.dispenseNo()) && Objects.equals(existing.enteredBy(), returned.processedBy())
                    && sameTime(existing.occurredAt(), returned.occurredAt()) && Objects.equals(existing.unitCode(), original.unitCode())
                    && Objects.equals(existing.currencyCode(), original.currencyCode()) && Objects.equals(existing.accountingCategory(), original.accountingCategory())
                    && Objects.equals(existing.organizationId(), original.organizationId()) && Objects.equals(existing.departmentId(), original.departmentId())
                    && Objects.equals(existing.itemCodeSnapshot(), original.itemCodeSnapshot()) && Objects.equals(existing.itemNameSnapshot(), original.itemNameSnapshot())
                    && Objects.equals(existing.priceId(), original.priceId()) && Objects.equals(existing.priceRevision(), original.priceRevision())
                    && Objects.equals(existing.priceType(), original.priceType())
                    && same(existing.quantity(), quantity.negate()) && same(existing.totalAmount(), amount.negate())
                    && same(existing.unitPrice(), original.unitPrice()) && "POSTED".equals(existing.status()), "已入账退药与原退药事实不一致");
            LedgerEntry entry = ledger.findByTenantIdAndChargeItemId(tenantId, existing.id()).orElseThrow(() -> failure("已有退药冲销缺少账务流水"));
            requireLedger(entry, existing, "CHARGE_REVERSAL", "CREDIT", originalLedger.id());
        }
        return new Plan(original, existing, originalLedger, quantity, factor, amount);
    }

    private DispenseBillingFact requireReturn(Long tenantId, Long id) {
        check(tenantId != null && tenantId > 0 && id != null && id > 0, "退药身份缺失");
        DispenseBillingFact fact = dispenses.requireById(tenantId, id);
        requireFact(fact);
        check(Objects.equals(fact.id(), id) && "RETURN".equals(fact.dispenseType())
                && fact.originalDispenseId() != null, "来源不是具备原发药关联的退药记录");
        return fact;
    }
    private void requireFact(DispenseBillingFact fact) {
        check(fact != null && fact.id() != null && fact.taskId() != null && fact.residentId() != null
                && fact.encounterId() != null && fact.stockSiteId() != null && fact.siteOrganizationId() != null
                && fact.requestId() != null && fact.catalogItemId() != null && fact.processedBy() != null
                && fact.occurredAt() != null && positive(fact.operationQuantity()) && positive(fact.baseQuantityFactor())
                && nonblank(fact.dispenseNo()) && nonblank(fact.operationUnitCode()), "发退药记录缺少身份、操作人、时间、数量或单位换算事实");
    }
    private MedicationRequestSnapshot requireRequest(Long tenantId, DispenseBillingFact returned) {
        MedicationRequestSnapshot request = requests.requireForRouting(tenantId, returned.requestId());
        check(request != null && Objects.equals(request.id(), returned.requestId()) && Objects.equals(request.tenantId(), tenantId)
                && Objects.equals(request.residentId(), returned.residentId()) && Objects.equals(request.encounterId(), returned.encounterId())
                && Objects.equals(request.catalogItemId(), returned.catalogItemId()), "原医嘱与退药患者、就诊或产品不一致");
        return request;
    }
    private void requireOriginal(Long tenantId, ChargeItem original, DispenseBillingFact returned) {
        check(Objects.equals(original.tenantId(), tenantId) && Objects.equals(original.residentId(), returned.residentId())
                && Objects.equals(original.encounterId(), returned.encounterId()) && Objects.equals(original.requestId(), returned.requestId())
                && Objects.equals(original.catalogItemId(), returned.catalogItemId()) && original.patientAccountId() != null
                && original.organizationId() != null && original.departmentId() != null && original.enteredBy() != null && original.occurredAt() != null
                && original.reversesChargeItemId() == null && "POSTED".equals(original.status()) && positive(original.quantity())
                && original.unitPrice() != null && original.unitPrice().signum() >= 0 && original.totalAmount() != null && original.totalAmount().signum() >= 0
                && nonblank(original.unitCode()) && nonblank(original.currencyCode()) && nonblank(original.itemCodeSnapshot())
                && nonblank(original.itemNameSnapshot()) && original.priceId() != null && original.priceRevision() != null && nonblank(original.priceType()),
                "原收费缺少可核对的身份、项目或价格快照");
    }
    private void requireLedger(LedgerEntry entry, ChargeItem charge, String type, String direction, Long reverses) {
        check(Objects.equals(entry.patientAccountId(), charge.patientAccountId()) && Objects.equals(entry.chargeItemId(), charge.id())
                && Objects.equals(entry.entryType(), type) && Objects.equals(entry.direction(), direction)
                && Objects.equals(entry.currencyCode(), charge.currencyCode()) && Objects.equals(entry.recordedBy(), charge.enteredBy())
                && sameTime(entry.occurredAt(), charge.occurredAt()) && same(entry.amount(), charge.totalAmount().abs())
                && Objects.equals(entry.reversesLedgerEntryId(), reverses), "账务流水与收费或原冲销关联不一致");
    }
    private static boolean positive(BigDecimal value) { return value != null && value.signum() > 0; }
    private static boolean nonblank(String value) { return value != null && !value.isBlank(); }
    private static boolean same(BigDecimal a, BigDecimal b) { return a != null && b != null && a.compareTo(b) == 0; }
    private static boolean sameTime(Instant a, Instant b) { return a != null && b != null && a.truncatedTo(ChronoUnit.MICROS).equals(b.truncatedTo(ChronoUnit.MICROS)); }
    private static BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private static void check(boolean valid, String reason) { if (!valid) throw failure(reason); }
    private static BusinessException failure(String reason) { return new BusinessException("MEDICATION_RETURN_BILLING_UNVERIFIED", "退药计费未确认：" + reason, HttpStatus.CONFLICT); }
    private static String text(Map<String, Object> data, String key) {
        Object value = data.get(key); check(value instanceof String && !((String) value).isBlank(), key + "缺失或无效"); return ((String) value).trim();
    }
    private static BigDecimal number(Map<String, Object> data, String key) {
        Object value = data.get(key); check(value instanceof Number || value instanceof String, key + "缺失或无效");
        try { return new BigDecimal(value.toString()); } catch (NumberFormatException error) { throw failure(key + "不是有效数值"); }
    }
    private static Long id(Map<String, Object> data, String key) {
        try { long value = number(data, key).longValueExact(); check(value > 0, key + "无效"); return value; }
        catch (ArithmeticException error) { throw failure(key + "不是有效整数标识"); }
    }
    private record Plan(ChargeItem original, ChargeItem existing, LedgerEntry originalLedger, BigDecimal quantity, BigDecimal factor, BigDecimal amount) {}
    public record Posting(ChargeItem charge, boolean created) {}
    public record Preview(BigDecimal quantity, BigDecimal amount, boolean nonChargeable) {}
}
