package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.outpatient.api.ClinicalOrderBillingDisposition;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

import static com.rhn.billing.application.ClinicalOrderChargeFacts.*;

/** Projects effective outpatient orders into the encounter account before execution. */
@Service
public class ClinicalOrderChargeProjector {
    private static final String CONSUMER = "billing-clinical-order-charge-v1";
    private static final List<String> EVENTS = List.of(
            "SERVICE_REQUEST_AUTHORED", "SERVICE_REQUEST_CANCELLED",
            "MEDICATION_REQUEST_AUTHORED", "MEDICATION_REQUEST_ACTIVATED", "MEDICATION_REQUEST_CANCELLED");

    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final IdempotentDomainEventConsumer eventConsumer;

    public ClinicalOrderChargeProjector(PatientAccountRepository accounts, ChargeItemRepository charges,
                                        ChargeItemComponentRepository components, LedgerEntryRepository ledger,
                                        IdempotentDomainEventConsumer eventConsumer) {
        this.accounts = accounts;
        this.charges = charges;
        this.components = components;
        this.ledger = ledger;
        this.eventConsumer = eventConsumer;
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!EVENTS.contains(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        ClinicalOrderChargeFacts facts = ClinicalOrderChargeFacts.read(event);
        String sourceType = event.eventType().startsWith("SERVICE_REQUEST") ? "SERVICE_REQUEST" : "MEDICATION_REQUEST";
        ChargeItem original = charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), sourceType, event.aggregateId()).orElse(null);
        ChargeItem reversal = charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), sourceType + "_REVERSAL", event.aggregateId()).orElse(null);
        if (facts.disposition() != ClinicalOrderBillingDisposition.CHARGEABLE) {
            require(original == null && reversal == null, "非收费决策与已存在的收费记录冲突");
            return;
        }
        boolean cancellation = event.eventType().endsWith("_CANCELLED");
        if (original != null) facts.requireOriginal(original, event, cancellation);
        if (cancellation) {
            require(original != null, "应收费医嘱缺少原收费记录，不能确认撤销完成");
            reverse(event, facts, sourceType, original, reversal);
        } else if (original == null) {
            require(reversal == null, "仅存在冲销记录，原收费事实缺失");
            charge(event, facts, sourceType);
        } else {
            requireOriginalLedger(event, original);
        }
    }

    private void charge(DomainEventEnvelope event, ClinicalOrderChargeFacts facts, String sourceType) {
        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                        event.tenantId(), facts.encounterId(), facts.currency())
                .orElseGet(() -> accounts.save(new PatientAccount(event.tenantId(), facts.residentId(), facts.encounterId(),
                        facts.organizationId(), facts.departmentId(), facts.currency())));
        require(Objects.equals(account.tenantId(), event.tenantId())
                && Objects.equals(account.residentId(), facts.residentId())
                && Objects.equals(account.encounterId(), facts.encounterId())
                && Objects.equals(account.organizationId(), facts.organizationId())
                && Objects.equals(account.departmentId(), facts.departmentId())
                && Objects.equals(account.currencyCode(), facts.currency()), "就诊账户与医嘱患者、机构或币种不一致");
        ChargeItem charge = charges.save(new ChargeItem(event.tenantId(), facts.organizationId(), facts.departmentId(),
                account.id(), facts.residentId(), facts.encounterId(), event.aggregateId(), facts.catalogItemId(),
                sourceType, event.aggregateId(), facts.requestNo(), facts.quantity(), facts.unitCode(), facts.unitPrice(),
                facts.totalAmount(), facts.currency(), facts.priceId(), facts.priceRevision(), facts.priceType(),
                facts.itemCode(), facts.itemName(), facts.occurredAt(), facts.actorId(), null, facts.accountingCategory()));
        components.save(new ChargeItemComponent(event.tenantId(), charge.id(), facts.catalogItemId(), facts.itemCode(),
                facts.itemName(), facts.quantity(), facts.unitCode(), BigDecimal.ONE, facts.unitPrice(), facts.totalAmount()));
        ledger.save(new LedgerEntry(event.tenantId(), account.id(), "CHARGE", "DEBIT", facts.totalAmount(), facts.currency(),
                charge.id(), null, null, null, facts.occurredAt(), facts.actorId()));
    }

    private void reverse(DomainEventEnvelope event, ClinicalOrderChargeFacts facts, String sourceType,
                         ChargeItem original, ChargeItem existingReversal) {
        LedgerEntry originalLedger = requireOriginalLedger(event, original);
        if (existingReversal != null) {
            require(Objects.equals(existingReversal.reversesChargeItemId(), original.id())
                    && Objects.equals(existingReversal.patientAccountId(), original.patientAccountId())
                    && Objects.equals(existingReversal.enteredBy(), facts.actorId())
                    && Objects.equals(existingReversal.currencyCode(), facts.currency())
                    && sameNumber(existingReversal.totalAmount(), facts.totalAmount().negate())
                    && existingReversal.quantity() != null && existingReversal.quantity().compareTo(facts.quantity().negate()) == 0
                    && sameTime(existingReversal.occurredAt(), facts.occurredAt()), "重复撤销事件与原冲销事实不一致");
            LedgerEntry reversalLedger = ledger.findByTenantIdAndChargeItemId(event.tenantId(), existingReversal.id())
                    .orElseThrow(() -> unverified("冲销记录缺少账务流水"));
            require(Objects.equals(reversalLedger.reversesLedgerEntryId(), originalLedger.id())
                    && "CHARGE_REVERSAL".equals(reversalLedger.entryType()) && "CREDIT".equals(reversalLedger.direction())
                    && Objects.equals(reversalLedger.patientAccountId(), original.patientAccountId())
                    && Objects.equals(reversalLedger.currencyCode(), facts.currency())
                    && Objects.equals(reversalLedger.chargeItemId(), existingReversal.id())
                    && Objects.equals(reversalLedger.recordedBy(), facts.actorId())
                    && sameTime(reversalLedger.occurredAt(), facts.occurredAt())
                    && sameNumber(reversalLedger.amount(), facts.totalAmount()), "冲销流水与原收费不一致");
            return;
        }
        ChargeItem reversal = charges.save(new ChargeItem(event.tenantId(), original.organizationId(), original.departmentId(),
                original.patientAccountId(), original.residentId(), original.encounterId(), original.requestId(), original.catalogItemId(),
                sourceType + "_REVERSAL", event.aggregateId(), "REV-" + original.requestCode(), original.quantity().negate(),
                original.unitCode(), original.unitPrice(), original.totalAmount().negate(), original.currencyCode(),
                original.priceId(), original.priceRevision(), original.priceType(), original.itemCodeSnapshot(),
                original.itemNameSnapshot(), facts.occurredAt(), facts.actorId(), original.id(), original.accountingCategory()));
        components.save(new ChargeItemComponent(event.tenantId(), reversal.id(), original.catalogItemId(),
                original.itemCodeSnapshot(), original.itemNameSnapshot(), original.quantity().negate(),
                original.unitCode(), BigDecimal.ONE, original.unitPrice(), original.totalAmount().negate()));
        ledger.save(new LedgerEntry(event.tenantId(), original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT",
                original.totalAmount(), original.currencyCode(), reversal.id(), null, null, originalLedger.id(),
                facts.occurredAt(), facts.actorId()));
    }

    private LedgerEntry requireOriginalLedger(DomainEventEnvelope event, ChargeItem original) {
        LedgerEntry entry = ledger.findByTenantIdAndChargeItemId(event.tenantId(), original.id())
                .orElseThrow(() -> unverified("原收费缺少账务流水"));
        require("CHARGE".equals(entry.entryType()) && "DEBIT".equals(entry.direction())
                && Objects.equals(entry.chargeItemId(), original.id())
                && Objects.equals(entry.patientAccountId(), original.patientAccountId())
                && Objects.equals(entry.currencyCode(), original.currencyCode())
                && Objects.equals(entry.recordedBy(), original.enteredBy())
                && sameTime(entry.occurredAt(), original.occurredAt())
                && sameNumber(entry.amount(), original.totalAmount()), "原收费流水与收费记录不一致");
        return entry;
    }
}
