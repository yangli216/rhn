package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;

/** Projects an accepted patient medication return into an immediate account credit. */
@Service
public class MedicationReturnChargeProjector {
    private static final String CONSUMER = "billing-medication-return-charge-v1";

    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final IdempotentDomainEventConsumer eventConsumer;

    public MedicationReturnChargeProjector(ChargeItemRepository charges,
                                           ChargeItemComponentRepository components,
                                           LedgerEntryRepository ledger,
                                           IdempotentDomainEventConsumer eventConsumer) {
        this.charges = charges;
        this.components = components;
        this.ledger = ledger;
        this.eventConsumer = eventConsumer;
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!"MEDICATION_RETURN_POSTED".equals(event.eventType())) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        Long returnDispenseId = longValue(event.payload().get("returnDispenseId"));
        Long requestId = longValue(event.payload().get("requestId"));
        BigDecimal quantity = decimal(event.payload().get("operationQuantity"));
        if (returnDispenseId == null || requestId == null || quantity == null || quantity.signum() <= 0) return;
        if (charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), "MEDICATION_RETURN", returnDispenseId).isPresent()) return;

        Long originalDispenseId = longValue(event.payload().get("originalDispenseId"));
        ChargeItem original = charges.findByTenantIdAndSourceTypeAndSourceId(
                        event.tenantId(), "MEDICATION_REQUEST", requestId)
                .or(() -> originalDispenseId == null ? java.util.Optional.empty()
                        : charges.findByTenantIdAndSourceTypeAndSourceId(
                                event.tenantId(), "MEDICATION_DISPENSE", originalDispenseId))
                .orElse(null);
        if (original == null) return;

        BigDecimal amount = money(original.unitPrice().multiply(quantity)).negate();
        String returnNo = text(event.payload().get("returnNo"));
        Long actorId = longValue(event.payload().get("processedBy"));
        if (actorId == null) actorId = original.enteredBy();
        String unitCode = text(event.payload().get("operationUnitCode"));
        if (unitCode == null) unitCode = original.unitCode();
        Instant occurredAt = event.occurredAt() == null ? Instant.now() : event.occurredAt();

        ChargeItem reversal = charges.save(new ChargeItem(event.tenantId(), original.patientAccountId(),
                original.residentId(), original.encounterId(), requestId, original.catalogItemId(),
                "MEDICATION_RETURN", returnDispenseId, returnNo == null ? "RET-" + returnDispenseId : returnNo,
                quantity.negate(), unitCode, original.unitPrice(), amount, original.currencyCode(),
                original.priceId(), original.priceRevision(), original.priceType(), original.itemCodeSnapshot(),
                original.itemNameSnapshot(), occurredAt, actorId, original.id()));
        components.save(new ChargeItemComponent(event.tenantId(), reversal.id(), original.catalogItemId(),
                original.itemCodeSnapshot(), original.itemNameSnapshot(), quantity.negate(), unitCode,
                BigDecimal.ONE, original.unitPrice(), amount));
        Long reversesLedger = ledger.findByTenantIdAndChargeItemId(event.tenantId(), original.id())
                .map(LedgerEntry::id).orElse(null);
        ledger.save(new LedgerEntry(event.tenantId(), original.patientAccountId(), "CHARGE_REVERSAL", "CREDIT",
                amount.abs(), original.currencyCode(), reversal.id(), null, null, reversesLedger,
                occurredAt, actorId));
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String text && !text.isBlank()) return Long.valueOf(text);
        return null;
    }

    private BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return new BigDecimal(number.toString());
        if (value instanceof String text && !text.isBlank()) return new BigDecimal(text);
        return null;
    }

    private String text(Object value) {
        if (value == null) return null;
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(6, RoundingMode.HALF_UP);
    }
}
