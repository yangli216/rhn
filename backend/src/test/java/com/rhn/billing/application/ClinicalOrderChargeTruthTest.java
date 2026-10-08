package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.application.IdempotentEventConsumer;
import com.rhn.platform.eventing.infrastructure.EventConsumptionRepository;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ClinicalOrderChargeTruthTest {
    final PatientAccountRepository accounts = mock(PatientAccountRepository.class);
    final ChargeItemRepository charges = mock(ChargeItemRepository.class);
    final ChargeItemComponentRepository components = mock(ChargeItemComponentRepository.class);
    final LedgerEntryRepository ledger = mock(LedgerEntryRepository.class);
    final EventConsumptionRepository consumed = mock(EventConsumptionRepository.class);
    final ClinicalOrderChargeProjector projector = new ClinicalOrderChargeProjector(accounts, charges, components, ledger,
            new IdempotentEventConsumer(consumed));
    final Instant occurred = Instant.parse("2026-09-29T12:00:00.123456Z");
    ClinicalOrderChargeTruthTest() {
        when(accounts.save(any())).thenAnswer(call -> call.getArgument(0));
        when(charges.save(any())).thenAnswer(call -> call.getArgument(0));
    }
    @ParameterizedTest
    @ValueSource(strings = {"encounterId", "residentId", "encounterOrganizationId", "encounterDepartmentId", "catalogItemId",
            "authoredBy", "chargeQuantity", "unitPrice", "totalAmount", "currencyCode", "chargeUnit", "itemCode",
            "itemName", "requestNo", "priceId", "priceRevision", "priceType", "billingDisposition"})
    void incomplete_chargeable_event_is_not_acknowledged_or_given_placeholder_facts(String field) {
        var data = payload(); data.remove(field);
        rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @ParameterizedTest @ValueSource(strings = {"chargeUnit", "itemCode", "itemName", "requestNo", "currencyCode"})
    void blank_text_does_not_become_a_default(String field) {
        var data = payload(); data.put(field, "   "); rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @Test void event_without_occurrence_time_is_not_given_processing_time() {
        var event = event("SERVICE_REQUEST_AUTHORED", payload());
        rejected(new DomainEventEnvelope(event.eventId(), 1L, 1L, event.eventType(), 2, "ServiceRequest", 7L, 0,
                3L, null, Instant.now(), "8", "TEST", "CORR", null, event.payload(), 1));
    }
    @Test void fractional_identifier_is_not_truncated_to_an_existing_patient() {
        var data = payload(); data.put("residentId", new BigDecimal("3.5")); rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @Test void financial_arithmetic_must_match_before_persistence() {
        var data = payload(); data.put("totalAmount", new BigDecimal("9")); rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @Test void decision_cannot_disguise_a_positive_charge_as_unpriced() {
        var data = payload(); data.put("billingDisposition", "UNPRICED"); rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @Test void medication_without_explicit_self_provided_fact_is_rejected() {
        var data = payload(); data.remove("selfProvided"); rejected(event("MEDICATION_REQUEST_AUTHORED", data));
    }
    @Test void legacy_event_without_decision_is_not_silently_consumed() {
        var original = event("SERVICE_REQUEST_AUTHORED", payload());
        rejected(new DomainEventEnvelope(original.eventId(), 1L, 1L, original.eventType(), 1, "ServiceRequest", 7L, 0,
                3L, occurred, occurred, "8", "TEST", "CORR", null, original.payload(), 1));
    }
    @ParameterizedTest @ValueSource(strings = {"UNPRICED", "ZERO_AMOUNT", "SELF_PROVIDED", "DRAFT"})
    void explicit_non_charge_reasons_are_acknowledged_without_creating_money(String decision) {
        var data = payload(); data.put("billingDisposition", decision);
        if (decision.equals("UNPRICED")) for (String field : List.of("unitPrice", "totalAmount", "currencyCode", "priceId", "priceRevision", "priceType", "catalogItemId")) data.remove(field);
        if (decision.equals("ZERO_AMOUNT")) { data.put("unitPrice", BigDecimal.ZERO); data.put("totalAmount", BigDecimal.ZERO); }
        if (decision.equals("SELF_PROVIDED")) data.put("selfProvided", true);
        data.put("cancelledBy", 9L);
        projector.project(event(decision.equals("DRAFT") ? "MEDICATION_REQUEST_CANCELLED" : "MEDICATION_REQUEST_AUTHORED", data));
        verify(consumed).save(any()); verifyNoInteractions(accounts, components, ledger); verify(charges, never()).save(any());
    }
    @Test void draft_skip_cannot_be_used_for_an_activated_order() {
        var data = payload(); data.put("billingDisposition", "DRAFT"); rejected(event("MEDICATION_REQUEST_ACTIVATED", data));
    }
    @Test void valid_charge_preserves_snapshot_actor_and_historical_time() {
        projector.project(event("SERVICE_REQUEST_AUTHORED", payload()));
        var capture = ArgumentCaptor.forClass(ChargeItem.class); verify(charges).save(capture.capture());
        var value = capture.getValue();
        assertEquals("已确认项目", value.itemNameSnapshot()); assertEquals("EA", value.unitCode());
        assertEquals("REQUEST", value.requestCode()); assertEquals(8L, value.enteredBy()); assertEquals(occurred, value.occurredAt());
        assertNull(value.accountingCategory()); verify(consumed).save(any()); verify(components).save(any()); verify(ledger).save(any());
    }
    @Test void account_for_another_patient_cannot_receive_the_charge() {
        when(accounts.findByTenantIdAndEncounterIdAndCurrencyCode(1L, 4L, "CNY"))
                .thenReturn(Optional.of(new PatientAccount(1L, 99L, 4L, 1L, 1L, "CNY")));
        rejected(event("SERVICE_REQUEST_AUTHORED", payload()));
    }
    @Test void billed_order_cancellation_requires_original_charge() {
        var data = payload(); data.put("cancelledBy", 9L); rejected(event("SERVICE_REQUEST_CANCELLED", data));
    }
    @Test void cancellation_without_actor_cannot_use_the_author() {
        original(); rejected(event("SERVICE_REQUEST_CANCELLED", payload()));
    }
    @Test void cancellation_without_original_ledger_cannot_create_unlinked_credit() {
        original(); var data = payload(); data.put("cancelledBy", 9L); rejected(event("SERVICE_REQUEST_CANCELLED", data));
    }
    @Test void cancellation_preserves_real_canceller_and_links_original_ledger() {
        var original = original(); var originalLedger = originalLedger(original);
        var data = payload(); data.put("cancelledBy", 9L);
        projector.project(event("SERVICE_REQUEST_CANCELLED", data));
        var charge = ArgumentCaptor.forClass(ChargeItem.class); verify(charges).save(charge.capture());
        assertEquals(9L, charge.getValue().enteredBy()); assertEquals(occurred, charge.getValue().occurredAt());
        assertEquals(original.id(), charge.getValue().reversesChargeItemId()); assertNull(charge.getValue().accountingCategory());
        var entry = ArgumentCaptor.forClass(LedgerEntry.class); verify(ledger).save(entry.capture());
        assertEquals(originalLedger.id(), entry.getValue().reversesLedgerEntryId()); assertEquals(9L, entry.getValue().recordedBy());
        verify(consumed).save(any());
    }
    @Test void duplicate_with_changed_amount_is_not_acknowledged() {
        var original = original(); originalLedger(original);
        var data = payload(); data.put("unitPrice", BigDecimal.ONE); data.put("totalAmount", BigDecimal.ONE);
        rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @Test void duplicate_quantity_is_compared_without_rounding_away_a_difference() {
        var original = original(); originalLedger(original);
        var data = payload(); data.put("chargeQuantity", new BigDecimal("1.00000001"));
        data.put("totalAmount", new BigDecimal("10.0000001"));
        rejected(event("SERVICE_REQUEST_AUTHORED", data));
    }
    @Test void original_ledger_with_a_different_actor_is_not_confirmed() {
        var original = original();
        when(ledger.findByTenantIdAndChargeItemId(1L, original.id())).thenReturn(Optional.of(
                new LedgerEntry(1L, 2L, "CHARGE", "DEBIT", BigDecimal.TEN, "CNY", original.id(), null, null, null, occurred, 99L)));
        var data = payload(); data.put("cancelledBy", 9L); rejected(event("SERVICE_REQUEST_CANCELLED", data));
    }
    @Test void genuine_duplicate_does_not_create_a_second_charge() {
        var original = original(); originalLedger(original);
        projector.project(event("SERVICE_REQUEST_AUTHORED", payload()));
        verify(charges, never()).save(any()); verify(ledger, never()).save(any()); verify(consumed).save(any());
    }
    @Test void non_charge_disposition_conflicting_with_posted_charge_is_rejected() {
        var charge = original(); var data = payload(); data.put("billingDisposition", "SELF_PROVIDED"); data.put("selfProvided", true);
        when(charges.findByTenantIdAndSourceTypeAndSourceId(1L, "MEDICATION_REQUEST", 7L)).thenReturn(Optional.of(charge));
        rejected(event("MEDICATION_REQUEST_AUTHORED", data));
    }
    private ChargeItem original() {
        var value = new ChargeItem(1L, 1L, 1L, 2L, 3L, 4L, 7L, 5L, "SERVICE_REQUEST", 7L, "REQUEST",
                BigDecimal.ONE, "EA", BigDecimal.TEN, BigDecimal.TEN, "CNY", 6L, 0L, "SALE", "ITEM", "已确认项目", occurred, 8L, null, null);
        when(charges.findByTenantIdAndSourceTypeAndSourceId(1L, "SERVICE_REQUEST", 7L)).thenReturn(Optional.of(value));
        return value;
    }
    private LedgerEntry originalLedger(ChargeItem charge) {
        var value = new LedgerEntry(1L, 2L, "CHARGE", "DEBIT", BigDecimal.TEN, "CNY", charge.id(), null, null, null, occurred, 8L);
        when(ledger.findByTenantIdAndChargeItemId(1L, charge.id())).thenReturn(Optional.of(value)); return value;
    }
    private void rejected(DomainEventEnvelope event) {
        assertEquals("CLINICAL_ORDER_BILLING_UNVERIFIED", assertThrows(BusinessException.class, () -> projector.project(event)).code());
        verify(consumed, never()).save(any()); verify(charges, never()).save(any()); verify(components, never()).save(any()); verify(ledger, never()).save(any());
    }
    private Map<String, Object> payload() {
        var data = new HashMap<String, Object>();
        data.put("encounterId", 4L); data.put("residentId", 3L); data.put("encounterOrganizationId", 1L); data.put("encounterDepartmentId", 1L);
        data.put("catalogItemId", 5L); data.put("authoredBy", 8L); data.put("chargeQuantity", BigDecimal.ONE);
        data.put("unitPrice", BigDecimal.TEN); data.put("totalAmount", BigDecimal.TEN); data.put("currencyCode", "CNY");
        data.put("chargeUnit", "EA"); data.put("itemCode", "ITEM"); data.put("itemName", "已确认项目"); data.put("requestNo", "REQUEST");
        data.put("priceId", 6L); data.put("priceRevision", 0L); data.put("priceType", "SALE");
        data.put("billingDisposition", "CHARGEABLE"); data.put("selfProvided", false); return data;
    }
    private DomainEventEnvelope event(String type, Map<String, Object> data) {
        return new DomainEventEnvelope(10L, 1L, 1L, type, 2, type.startsWith("SERVICE_REQUEST") ? "ServiceRequest" : "MedicationRequest",
                7L, 0, 3L, occurred, Instant.now(), "8", "TEST", "CORR", null, data, 1);
    }
}
