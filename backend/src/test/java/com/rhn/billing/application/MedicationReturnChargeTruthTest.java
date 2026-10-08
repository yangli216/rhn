package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.DispenseBillingDirectory;
import com.rhn.pharmacy.api.DispenseBillingDirectory.DispenseBillingFact;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.application.IdempotentEventConsumer;
import com.rhn.platform.eventing.infrastructure.EventConsumptionRepository;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MedicationReturnChargeTruthTest {
    final ChargeItemRepository charges = mock(ChargeItemRepository.class);
    final ChargeItemComponentRepository components = mock(ChargeItemComponentRepository.class);
    final LedgerEntryRepository ledger = mock(LedgerEntryRepository.class);
    final DispenseBillingDirectory dispenses = mock(DispenseBillingDirectory.class);
    final MedicationRequestDirectory requests = mock(MedicationRequestDirectory.class);
    final EventConsumptionRepository consumed = mock(EventConsumptionRepository.class);
    final MedicationReturnChargeService service = new MedicationReturnChargeService(charges, components, ledger, dispenses, requests);
    final MedicationReturnChargeProjector projector = new MedicationReturnChargeProjector(service, new IdempotentEventConsumer(consumed));
    final Instant occurred = Instant.parse("2026-10-03T08:30:00.123456Z");
    final List<ChargeItem> saved = new ArrayList<>();
    final Map<Long, LedgerEntry> entries = new HashMap<>();
    final Map<Long, DispenseBillingFact> pharmacy = new HashMap<>();
    ChargeItem original;

    MedicationReturnChargeTruthTest() {
        when(charges.save(any())).thenAnswer(call -> { ChargeItem value = call.getArgument(0); saved.add(value); return value; });
        when(ledger.save(any())).thenAnswer(call -> { LedgerEntry value = call.getArgument(0); entries.put(value.chargeItemId(), value); return value; });
        when(ledger.findByTenantIdAndChargeItemId(eq(1L), anyLong())).thenAnswer(call -> Optional.ofNullable(entries.get(call.getArgument(1))));
        when(charges.findByTenantIdAndSourceTypeAndSourceId(eq(1L), anyString(), anyLong())).thenAnswer(call -> {
            String type = call.getArgument(1); Long source = call.getArgument(2);
            return java.util.stream.Stream.concat(original == null ? java.util.stream.Stream.empty() : java.util.stream.Stream.of(original), saved.stream())
                    .filter(c -> type.equals(c.sourceType()) && source.equals(c.sourceId())).findFirst();
        });
        when(charges.lockByIdAndTenantId(anyLong(), eq(1L))).thenAnswer(call -> Optional.ofNullable(original));
        when(charges.findByTenantIdAndReversesChargeItemIdOrderByOccurredAtAscIdAsc(eq(1L), anyLong()))
                .thenAnswer(call -> List.copyOf(saved));
        when(dispenses.requireById(eq(1L), anyLong())).thenAnswer(call -> pharmacy.get(call.getArgument(1)));
        original("MEDICATION_DISPENSE", "3", "1", "EA", null);
        pharmacy.put(7L, fact(7L, "DISPENSE", "3", "EA", "1", occurred.minusSeconds(60)));
        pharmacy.put(9L, fact(9L, "RETURN", "1", "EA", "1", occurred));
    }

    @ParameterizedTest @ValueSource(strings = {"returnDispenseId", "requestId", "originalDispenseId", "processedBy", "returnNo", "operationUnitCode", "operationQuantity"})
    void missing_event_fact_does_not_become_a_successful_consumption(String field) {
        var payload = payload(); payload.remove(field); reject(event(payload, occurred));
    }
    @Test void fractional_identifier_is_rejected() { var p = payload(); p.put("requestId", "5.5"); reject(event(p, occurred)); }
    @Test void missing_time_cannot_become_processing_time() { reject(event(payload(), null)); }
    @Test void actor_is_checked_against_the_recorded_return() { var p = payload(); p.put("processedBy", 99L); reject(event(p, occurred)); }
    @Test void missing_pharmacy_fact_cannot_be_treated_as_no_charge() { pharmacy.remove(9L); reject(event(payload(), occurred)); }
    @Test void unit_mismatch_cannot_inherit_the_original_unit() { var p = payload(); p.put("operationUnitCode", "BOX"); reject(event(p, occurred)); }
    @Test void missing_original_ledger_cannot_produce_unlinked_credit() { entries.clear(); reject(event(payload(), occurred)); }
    @Test void unknown_charge_absence_is_not_acknowledged() { original = null; request(false, false); reject(event(payload(), occurred)); }
    @Test void missing_original_dispense_is_rejected() { pharmacy.remove(7L); reject(event(payload(), occurred)); }
    @Test void another_patient_cannot_receive_the_credit() {
        var old = pharmacy.get(9L);
        pharmacy.put(9L, new DispenseBillingFact(old.id(),99L,old.encounterId(),old.stockSiteId(),old.siteOrganizationId(),old.originalDispenseId(),old.dispenseNo(),old.dispenseType(),old.occurredAt(),old.operationQuantity(),old.operationUnitCode(),old.requestId(),old.catalogItemId(),old.packageId(),old.baseQuantityFactor(),old.productCodeSnapshot(),old.productNameSnapshot(),old.taskId(),old.processedBy()));
        reject(event(payload(), occurred));
    }
    @ParameterizedTest @ValueSource(strings = {"", "HERBAL_MED"})
    void classification_is_copied_from_original_including_null(String category) {
        original("MEDICATION_DISPENSE", "3", "1", "EA", category.isEmpty() ? null : category);
        projector.project(event(payload(), occurred));
        assertEquals(original.accountingCategory(), saved.getFirst().accountingCategory());
        assertEquals(8L, saved.getFirst().enteredBy()); assertEquals(occurred, saved.getFirst().occurredAt());
        assertEquals("RET-9", saved.getFirst().requestCode()); assertEquals(original.id(), saved.getFirst().reversesChargeItemId());
        assertEquals(entries.get(original.id()).id(), entries.get(saved.getFirst().id()).reversesLedgerEntryId());
        verify(consumed).save(any());
    }
    @Test void fractional_price_returns_exact_total_on_the_last_return_even_if_business_time_is_backdated() {
        var first = service.post(1L, 9L); assertMoney("0.333333", first.charge().totalAmount().abs());
        pharmacy.put(10L, fact(10L, "RETURN", "1", "EA", "1", occurred.minusSeconds(30)));
        service.post(1L, 10L);
        pharmacy.put(11L, fact(11L, "RETURN", "1", "EA", "1", occurred.plusSeconds(10)));
        var last = service.post(1L, 11L); assertMoney("0.333334", last.charge().totalAmount().abs());
        assertMoney("1", saved.stream().map(c -> c.totalAmount().abs()).reduce(BigDecimal.ZERO, BigDecimal::add));
        assertFalse(service.post(1L, 9L).created()); assertFalse(service.post(1L, 10L).created()); assertFalse(service.post(1L, 11L).created());
        assertEquals(3, saved.size());
    }
    @Test void cumulative_excess_does_not_create_more_money() {
        pharmacy.put(9L, fact(9L, "RETURN", "3", "EA", "1", occurred)); service.post(1L, 9L);
        pharmacy.put(10L, fact(10L, "RETURN", "1", "EA", "1", occurred));
        assertThrows(BusinessException.class, () -> service.post(1L, 10L)); assertEquals(1, saved.size());
    }
    @Test void request_price_units_are_converted_from_actual_dispense_units() {
        original("MEDICATION_REQUEST", "2", "20", "BOX", null);
        var request = request(false, false);
        when(request.priceQuantity()).thenReturn(new BigDecimal("2")); when(request.unitPrice()).thenReturn(BigDecimal.TEN);
        when(request.totalAmount()).thenReturn(new BigDecimal("20")); when(request.baseUnit()).thenReturn("EA");
        when(request.quantityUnit()).thenReturn("BOX"); when(request.packageFactor()).thenReturn(BigDecimal.TEN);
        when(request.baseQuantity()).thenReturn(new BigDecimal("20"));
        pharmacy.put(7L, fact(7L, "DISPENSE", "20", "EA", "1", occurred.minusSeconds(60)));
        pharmacy.put(9L, fact(9L, "RETURN", "5", "EA", "1", occurred));
        var result = service.post(1L, 9L).charge();
        assertMoney("-0.5", result.quantity()); assertMoney("-5", result.totalAmount()); assertEquals("BOX", result.unitCode());
    }
    @Test void unrepresentable_unit_conversion_is_not_rounded_to_an_invented_quantity() {
        original("MEDICATION_REQUEST", "1", "1", "BOX", null); var request = request(false, false);
        when(request.priceQuantity()).thenReturn(BigDecimal.ONE); when(request.unitPrice()).thenReturn(BigDecimal.ONE); when(request.totalAmount()).thenReturn(BigDecimal.ONE);
        when(request.baseUnit()).thenReturn("EA"); when(request.quantityUnit()).thenReturn("BOX"); when(request.packageFactor()).thenReturn(new BigDecimal("3")); when(request.baseQuantity()).thenReturn(new BigDecimal("3"));
        reject(event(payload(), occurred));
    }
    @ParameterizedTest @ValueSource(strings = {"SELF_PROVIDED", "ZERO"})
    void only_explicit_non_chargeable_request_can_explain_no_original_charge(String reason) {
        original = null; request(reason.equals("SELF_PROVIDED"), reason.equals("ZERO"));
        projector.project(event(payload(), occurred)); assertTrue(saved.isEmpty()); verify(consumed).save(any());
    }
    @Test void changed_duplicate_payload_is_rejected_without_another_charge() {
        service.post(1L, 9L); var p = payload(); p.put("operationQuantity", "2");
        assertThrows(BusinessException.class, () -> projector.project(event(p, occurred))); assertEquals(1, saved.size()); verify(consumed, never()).save(any());
    }
    @Test void duplicate_still_requires_existing_credit_ledger() {
        var first = service.post(1L, 9L); entries.remove(first.charge().id());
        assertThrows(BusinessException.class, () -> service.post(1L, 9L)); assertEquals(1, saved.size());
    }
    private void original(String type, String qty, String total, String unit, String category) {
        BigDecimal quantity = new BigDecimal(qty), amount = new BigDecimal(total);
        original = new ChargeItem(1L,1L,1L,2L,3L,4L,5L,6L,type,type.equals("MEDICATION_REQUEST") ? 5L : 7L,"ORIG",quantity,unit,
                amount.divide(quantity,6,java.math.RoundingMode.HALF_UP),amount,"CNY",11L,0L,"SALE","ITEM","真实药品",occurred.minusSeconds(60),10L,null,category);
        entries.put(original.id(),new LedgerEntry(1L,2L,"CHARGE","DEBIT",amount,"CNY",original.id(),null,null,null,original.occurredAt(),10L));
    }
    private MedicationRequestSnapshot request(boolean selfProvided, boolean zero) {
        var request = mock(MedicationRequestSnapshot.class);
        when(requests.requireForRouting(1L,5L)).thenReturn(request);
        when(request.id()).thenReturn(5L); when(request.tenantId()).thenReturn(1L); when(request.residentId()).thenReturn(3L);
        when(request.encounterId()).thenReturn(4L); when(request.catalogItemId()).thenReturn(6L); when(request.selfProvided()).thenReturn(selfProvided);
        when(request.priceId()).thenReturn(11L); when(request.priceRevision()).thenReturn(0L); when(request.priceType()).thenReturn("SALE"); when(request.currencyCode()).thenReturn("CNY");
        if(zero) { when(request.unitPrice()).thenReturn(BigDecimal.ZERO); when(request.totalAmount()).thenReturn(BigDecimal.ZERO); }
        return request;
    }
    private DispenseBillingFact fact(Long id, String type, String quantity, String unit, String factor, Instant at) {
        return new DispenseBillingFact(id,3L,4L,20L,1L,type.equals("RETURN")?7L:null,type.equals("RETURN")?"RET-"+id:"DISP-7",type,at,new BigDecimal(quantity),unit,5L,6L,null,new BigDecimal(factor),"ITEM","真实药品",30L,type.equals("RETURN")?8L:10L);
    }
    private Map<String,Object> payload() { return new HashMap<>(Map.of("returnDispenseId",9L,"requestId",5L,"originalDispenseId",7L,"processedBy",8L,"returnNo","RET-9","operationUnitCode","EA","operationQuantity",BigDecimal.ONE)); }
    private DomainEventEnvelope event(Map<String,Object> payload,Instant at) { return new DomainEventEnvelope(40L,1L,1L,"MEDICATION_RETURN_POSTED",1,"DispenseTask",30L,1L,3L,at,occurred,"8","TEST","CORR",null,payload,1); }
    private void reject(DomainEventEnvelope event) { assertEquals("MEDICATION_RETURN_BILLING_UNVERIFIED",assertThrows(BusinessException.class,()->projector.project(event)).code()); assertTrue(saved.isEmpty()); verify(consumed,never()).save(any()); }
    private void assertMoney(String expected,BigDecimal actual) { assertEquals(0,new BigDecimal(expected).compareTo(actual)); }
}
