package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.event.EventPayload;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

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
        if (event.eventType().endsWith("_CANCELLED")) {
            reverse(event);
        } else {
            charge(event);
        }
    }

    private void charge(DomainEventEnvelope event) {
        String sourceType = sourceType(event.eventType());
        if (charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), sourceType, event.aggregateId()).isPresent()) return;
        EventPayload payload = EventPayload.of(event.payload());
        Long encounterId = payload.longValue("encounterId");
        Long residentId = payload.longValue("residentId");
        Long organizationId = payload.longValue("encounterOrganizationId");
        Long departmentId = payload.longValue("encounterDepartmentId");
        Long catalogItemId = payload.longValue("catalogItemId");
        Long authoredBy = payload.longValue("authoredBy");
        BigDecimal quantity = payload.decimal("chargeQuantity");
        BigDecimal unitPrice = payload.decimal("unitPrice");
        BigDecimal totalAmount = payload.decimal("totalAmount");
        String currency = payload.text("currencyCode");
        if (encounterId == null || residentId == null || organizationId == null || departmentId == null
                || catalogItemId == null || authoredBy == null || quantity == null || quantity.signum() <= 0
                || unitPrice == null || totalAmount == null || totalAmount.signum() <= 0 || currency == null) return;

        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                        event.tenantId(), encounterId, currency)
                .orElseGet(() -> accounts.save(new PatientAccount(event.tenantId(), residentId, encounterId,
                        organizationId, departmentId, currency)));
        Long priceId = payload.longValue("priceId");
        Long priceRevision = payload.longValue("priceRevision");
        String unitCode = textOr(payload.text("chargeUnit"), "次");
        String itemCode = textOr(payload.text("itemCode"), event.aggregateType());
        String itemName = textOr(payload.text("itemName"), "门诊医嘱");
        String prescriptionNo = clean(payload.text("prescriptionNo"));
        String requestNo = prescriptionNo != null ? prescriptionNo
                : textOr(payload.text("requestNo"), event.aggregateType() + event.aggregateId());
        Instant occurredAt = event.occurredAt() == null ? Instant.now() : event.occurredAt();
        Long clinicalRequestId = event.aggregateId();
        String accountingCategory = clean(payload.text("accountingCategory"));
        if (accountingCategory == null) {
            accountingCategory = sourceType.startsWith("MEDICATION") ? "WESTERN_MED" : "TREATMENT";
        }
        ChargeItem charge = charges.save(new ChargeItem(event.tenantId(),
                organizationId, departmentId,
                account.id(), residentId, encounterId,
                clinicalRequestId, catalogItemId, sourceType, event.aggregateId(), requestNo,
                quantity, unitCode, money(unitPrice), money(totalAmount), currency, priceId, priceRevision,
                payload.text("priceType"), itemCode, itemName, occurredAt, authoredBy, null,
                accountingCategory));
        components.save(new ChargeItemComponent(event.tenantId(), charge.id(), catalogItemId, itemCode, itemName,
                quantity, unitCode, BigDecimal.ONE, money(unitPrice), money(totalAmount)));
        ledger.save(new LedgerEntry(event.tenantId(), account.id(), "CHARGE", "DEBIT", money(totalAmount), currency,
                charge.id(), null, null, null, occurredAt, authoredBy));
    }

    private void reverse(DomainEventEnvelope event) {
        String originalType = sourceType(event.eventType());
        String reversalType = originalType + "_REVERSAL";
        if (charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), reversalType, event.aggregateId()).isPresent()) return;
        ChargeItem original = charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), originalType, event.aggregateId()).orElse(null);
        if (original == null) return;
        Long actorId = EventPayload.of(event.payload()).longValue("cancelledBy");
        if (actorId == null) actorId = original.enteredBy();
        Instant occurredAt = event.occurredAt() == null ? Instant.now() : event.occurredAt();
        ChargeItem reversal = charges.save(new ChargeItem(event.tenantId(),
                original.organizationId(), original.departmentId(),
                original.patientAccountId(),
                original.residentId(), original.encounterId(), original.requestId(), original.catalogItemId(),
                reversalType, event.aggregateId(), "REV-" + original.requestCode(), original.quantity().negate(),
                original.unitCode(), original.unitPrice(), original.totalAmount().negate(), original.currencyCode(),
                original.priceId(), original.priceRevision(), original.priceType(), original.itemCodeSnapshot(),
                original.itemNameSnapshot(), occurredAt, actorId, original.id(),
                original.accountingCategory()));
        components.save(new ChargeItemComponent(event.tenantId(), reversal.id(), original.catalogItemId(),
                original.itemCodeSnapshot(), original.itemNameSnapshot(), original.quantity().negate(),
                original.unitCode(), BigDecimal.ONE, original.unitPrice(), original.totalAmount().negate()));
        Long reversesLedger = ledger.findByTenantIdAndChargeItemId(event.tenantId(), original.id())
                .map(LedgerEntry::id).orElse(null);
        ledger.save(new LedgerEntry(event.tenantId(), original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT",
                original.totalAmount().abs(), original.currencyCode(), reversal.id(), null, null, reversesLedger,
                occurredAt, actorId));
    }

    private String sourceType(String eventType) {
        return eventType.startsWith("SERVICE_REQUEST") ? "SERVICE_REQUEST" : "MEDICATION_REQUEST";
    }

    private String textOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
}
