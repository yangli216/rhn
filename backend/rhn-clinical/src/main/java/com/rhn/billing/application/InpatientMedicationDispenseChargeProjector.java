package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.ChargeItemComponent;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.infrastructure.ChargeItemComponentRepository;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.DispenseBillingDirectory;
import com.rhn.pharmacy.api.DispenseBillingDirectory.DispenseBillingFact;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.api.IdempotentDomainEventConsumer;
import com.rhn.shared.event.EventPayload;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Posts inpatient medication cost from the actual pharmacy dispense fact, never from order intent. */
@Service
public class InpatientMedicationDispenseChargeProjector {
    private static final String CONSUMER = "billing-inpatient-medication-dispense-v1";
    private static final String SOURCE_TYPE = "MEDICATION_DISPENSE";

    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final DispenseBillingDirectory dispenses;
    private final MedicationRequestDirectory medicationRequests;
    private final IdempotentDomainEventConsumer eventConsumer;

    public InpatientMedicationDispenseChargeProjector(
            PatientAccountRepository accounts, ChargeItemRepository charges,
            ChargeItemComponentRepository components, LedgerEntryRepository ledger,
            DispenseBillingDirectory dispenses, MedicationRequestDirectory medicationRequests,
            IdempotentDomainEventConsumer eventConsumer) {
        this.accounts = accounts;
        this.charges = charges;
        this.components = components;
        this.ledger = ledger;
        this.dispenses = dispenses;
        this.medicationRequests = medicationRequests;
        this.eventConsumer = eventConsumer;
    }

    @EventListener
    @Transactional
    public void project(DomainEventEnvelope event) {
        if (!"MEDICATION_DISPENSE_POSTED".equals(event.eventType())
                || !"INPATIENT".equals(EventPayload.of(event.payload()).text("taskType"))) return;
        eventConsumer.consume(CONSUMER, event, () -> apply(event));
    }

    private void apply(DomainEventEnvelope event) {
        EventPayload payload = EventPayload.of(event.payload());
        Long dispenseId = payload.longValue("dispenseId");
        if (dispenseId == null || charges.findByTenantIdAndSourceTypeAndSourceId(
                event.tenantId(), SOURCE_TYPE, dispenseId).isPresent()) return;
        DispenseBillingFact dispense = dispenses.requireById(event.tenantId(), dispenseId);
        MedicationRequestSnapshot request = medicationRequests.requireForRouting(event.tenantId(), dispense.requestId());
        if (request.selfProvided()) return;
        if (!request.encounterId().equals(dispense.encounterId())
                || !request.residentId().equals(dispense.residentId())) {
            throw conflict("INPATIENT_DISPENSE_REQUEST_MISMATCH", "住院发药事实与药品医嘱不属于同一患者就诊");
        }
        if (request.catalogItemId() == null || !request.catalogItemId().equals(dispense.catalogItemId())) {
            throw conflict("INPATIENT_DISPENSE_PRODUCT_MISMATCH", "住院发药产品与医嘱价格快照不一致");
        }
        if (request.baseQuantity() == null || request.baseQuantity().signum() <= 0
                || request.totalAmount() == null || request.currencyCode() == null) {
            throw conflict("INPATIENT_MEDICATION_PRICE_MISSING", "住院药品医嘱缺少可用于发药计费的价格快照");
        }

        BigDecimal dispensedBaseQuantity = dispense.operationQuantity().multiply(dispense.baseQuantityFactor());
        BigDecimal amount = money(request.totalAmount().multiply(dispensedBaseQuantity)
                .divide(request.baseQuantity(), 12, RoundingMode.HALF_UP));
        BigDecimal unitPrice = money(amount.divide(dispense.operationQuantity(), 12, RoundingMode.HALF_UP));
        PatientAccount account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(
                        event.tenantId(), dispense.encounterId(), request.currencyCode())
                .orElseGet(() -> accounts.save(PatientAccount.inpatient(
                        event.tenantId(), request.residentId(), request.encounterId(),
                        request.performerOrganizationId(), request.performerDepartmentId(), request.currencyCode())));
        if (!"INPATIENT".equals(account.accountType())) {
            throw conflict("INPATIENT_ACCOUNT_TYPE_INVALID", "当前就诊费用账户不是住院账户");
        }
        Long actorId = payload.longValue("dispensedBy");
        if (actorId == null) actorId = request.authoredBy();
        Long orgId = request.performerOrganizationId() != null ? request.performerOrganizationId() : account.organizationId();
        Long deptId = request.performerDepartmentId() != null ? request.performerDepartmentId() : account.departmentId();
        Instant occurredAt = dispense.occurredAt() == null ? Instant.now() : dispense.occurredAt();
        ChargeItem charge = charges.save(new ChargeItem(
                event.tenantId(), orgId, deptId,
                account.id(), request.residentId(), request.encounterId(), request.id(),
                dispense.catalogItemId(), SOURCE_TYPE, dispense.id(), dispense.dispenseNo(),
                dispense.operationQuantity(), dispense.operationUnitCode(), unitPrice, amount,
                request.currencyCode(), request.priceId(), request.priceRevision(), request.priceType(),
                dispense.productCodeSnapshot(), dispense.productNameSnapshot(), occurredAt, actorId, null));
        components.save(new ChargeItemComponent(
                event.tenantId(), charge.id(), charge.catalogItemId(), charge.itemCodeSnapshot(),
                charge.itemNameSnapshot(), charge.quantity(), charge.unitCode(), dispense.baseQuantityFactor(),
                charge.unitPrice(), charge.totalAmount()));
        ledger.save(new LedgerEntry(event.tenantId(), account.id(), "CHARGE", "DEBIT", amount,
                request.currencyCode(), charge.id(), null, null, null, occurredAt, actorId));
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(6, RoundingMode.HALF_UP);
    }
}
