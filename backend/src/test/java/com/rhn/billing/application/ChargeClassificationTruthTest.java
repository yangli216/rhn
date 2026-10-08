package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.platform.eventing.api.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChargeClassificationTruthTest {
    final ChargeItemRepository charges=mock(ChargeItemRepository.class);
    final ChargeItemComponentRepository components=mock(ChargeItemComponentRepository.class);
    final LedgerEntryRepository ledger=mock(LedgerEntryRepository.class);
    final PatientAccountRepository accounts=mock(PatientAccountRepository.class);
    final IdempotentDomainEventConsumer consumer=(name,event,action)->{action.run();return true;};
    ChargeClassificationTruthTest() {
        when(accounts.save(any())).thenAnswer(inv->inv.getArgument(0));
        when(charges.save(any())).thenAnswer(inv->inv.getArgument(0));
    }
    @ParameterizedTest @ValueSource(strings={"MEDICATION_REQUEST_AUTHORED","SERVICE_REQUEST_AUTHORED"})
    void clinical_projection_keeps_real_amount_but_does_not_fill_missing_classification(String type) {
        new ClinicalOrderChargeProjector(accounts,charges,components,ledger,consumer).project(event(type,payload()));
        var captured=org.mockito.ArgumentCaptor.forClass(ChargeItem.class);verify(charges).save(captured.capture());
        assertNull(captured.getValue().accountingCategory());assertEquals(0,BigDecimal.TEN.compareTo(captured.getValue().totalAmount()));
        var summary=new ChargeCategoryResolver(null).resolve(1L,captured.getValue());
        assertEquals("UNCLASSIFIED",summary.code());assertEquals("分类未确认",summary.name());verify(ledger).save(any());
    }
    @Test void clinical_projection_preserves_explicit_custom_classification() {
        var data=payload();data.put("accountingCategory","CUSTOM_REHAB");
        new ClinicalOrderChargeProjector(accounts,charges,components,ledger,consumer).project(event("SERVICE_REQUEST_AUTHORED",data));
        var captured=org.mockito.ArgumentCaptor.forClass(ChargeItem.class);verify(charges).save(captured.capture());assertEquals("CUSTOM_REHAB",captured.getValue().accountingCategory());
    }
    @Test void request_lookup_failure_cannot_become_a_western_medicine_category() {
        var service=mock(BillingApplicationService.class,CALLS_REAL_METHODS);var directory=mock(MedicationRequestDirectory.class);
        ReflectionTestUtils.setField(service,"medicationRequestDirectory",directory);
        var failure=new IllegalStateException("request unavailable");when(directory.requireForPharmacy(7L)).thenThrow(failure);
        assertSame(failure,assertThrows(IllegalStateException.class,()->ReflectionTestUtils.invokeMethod(service,"resolveMedicationCategory",7L)));
    }
    @Test void missing_request_cannot_certify_a_category() {
        var service=mock(BillingApplicationService.class,CALLS_REAL_METHODS);var directory=mock(MedicationRequestDirectory.class);
        ReflectionTestUtils.setField(service,"medicationRequestDirectory",directory);
        assertThrows(com.rhn.shared.api.BusinessException.class,()->ReflectionTestUtils.invokeMethod(service,"resolveMedicationCategory",7L));
    }
    Map<String,Object> payload() {
        var data=new HashMap<String,Object>();data.put("encounterId",4L);data.put("residentId",3L);data.put("encounterOrganizationId",1L);data.put("encounterDepartmentId",1L);
        data.put("catalogItemId",5L);data.put("authoredBy",8L);data.put("chargeQuantity",BigDecimal.ONE);data.put("unitPrice",BigDecimal.TEN);data.put("totalAmount",BigDecimal.TEN);data.put("currencyCode","CNY");
        data.put("chargeUnit","EA");data.put("itemCode","ITEM");data.put("itemName","已确认项目");data.put("requestNo","REQUEST");data.put("billingDisposition","CHARGEABLE");data.put("selfProvided",false);data.put("priceId",6L);data.put("priceRevision",0L);data.put("priceType","SALE");return data;
    }
    DomainEventEnvelope event(String type,Map<String,Object> payload) {
        return new DomainEventEnvelope(10L,1L,1L,type,2,type.startsWith("SERVICE_REQUEST")?"ServiceRequest":"MedicationRequest",7L,0,3L,Instant.now(),Instant.now(),"8","TEST","CORR",null,payload,1);
    }
}
