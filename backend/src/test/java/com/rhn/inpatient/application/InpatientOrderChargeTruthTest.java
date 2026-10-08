package com.rhn.inpatient.application;

import com.rhn.billing.api.InpatientBillingDirectory;
import com.rhn.inpatient.domain.InpatientCareRequest;
import com.rhn.inpatient.domain.InpatientOrderTask;
import com.rhn.inpatient.domain.InpatientOrderTaskStatus;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InpatientOrderChargeTruthTest {
    private final InpatientBillingDirectory billing=mock(InpatientBillingDirectory.class);
    private final InpatientOrderChargeService service=new InpatientOrderChargeService(billing);
    private final InpatientCareRequest request=mock(InpatientCareRequest.class);
    private final InpatientOrderTask task=mock(InpatientOrderTask.class);
    @BeforeEach void arrange() {
        when(task.status()).thenReturn(InpatientOrderTaskStatus.EXECUTED);
        when(request.orderCategory()).thenReturn("SERVICE");when(request.catalogItemId()).thenReturn(10L);
        when(request.priceId()).thenReturn(11L);when(request.priceRevision()).thenReturn(0L);when(request.priceType()).thenReturn("SALE");
        when(request.unitPrice()).thenReturn(new BigDecimal("18"));when(request.totalAmount()).thenReturn(new BigDecimal("18"));
        when(request.currencyCode()).thenReturn("CNY");
    }
    @ParameterizedTest
    @ValueSource(strings={"catalog","price-id","revision","negative-revision","price-type","unit-price","total","negative-price","currency","invalid-currency"})
    void incomplete_pricing_cannot_silently_skip_the_charge(String defect) {
        switch(defect) {
            case "catalog" -> when(request.catalogItemId()).thenReturn(null);
            case "price-id" -> when(request.priceId()).thenReturn(null);
            case "revision" -> when(request.priceRevision()).thenReturn(null);
            case "negative-revision" -> when(request.priceRevision()).thenReturn(-1L);
            case "price-type" -> when(request.priceType()).thenReturn(null);
            case "unit-price" -> when(request.unitPrice()).thenReturn(null);
            case "total" -> when(request.totalAmount()).thenReturn(null);
            case "negative-price" -> when(request.unitPrice()).thenReturn(new BigDecimal("-1"));
            case "currency" -> when(request.currencyCode()).thenReturn(null);
            case "invalid-currency" -> when(request.currencyCode()).thenReturn(" ");
            default -> fail("Unknown fixture");
        }
        assertEquals("INPATIENT_ORDER_PRICE_MISSING",assertThrows(BusinessException.class,()->service.postExecutedTask(task,request)).code());
        verifyNoInteractions(billing);
    }
    @Test void inconsistent_single_execution_amount_is_not_posted() {
        when(request.totalAmount()).thenReturn(new BigDecimal("36"));
        assertEquals("INPATIENT_ORDER_PRICE_INCONSISTENT",assertThrows(BusinessException.class,()->service.postExecutedTask(task,request)).code());
        verifyNoInteractions(billing);
    }
    @Test void explicitly_priced_free_service_is_posted_as_a_real_zero_charge() {
        when(request.unitPrice()).thenReturn(BigDecimal.ZERO);when(request.totalAmount()).thenReturn(BigDecimal.ZERO);
        service.postExecutedTask(task,request);
        verify(billing).postExecutedOrderTask(argThat(command->command.unitPrice().signum()==0
                && command.totalAmount().signum()==0 && command.priceId().equals(11L)));
    }
    @Test void medication_and_skipped_tasks_remain_outside_execution_charging() {
        when(request.orderCategory()).thenReturn("MEDICATION");service.postExecutedTask(task,request);
        when(request.orderCategory()).thenReturn("SERVICE");when(task.status()).thenReturn(InpatientOrderTaskStatus.SKIPPED);
        service.postExecutedTask(task,request);verifyNoInteractions(billing);
    }
    @Test void only_unpriced_text_nursing_is_exempt_from_price_requirements() {
        var nursing=mock(InpatientCareRequest.class);when(nursing.orderCategory()).thenReturn("NURSING");
        when(nursing.catalogItemId()).thenReturn(null);when(nursing.priceId()).thenReturn(null);when(nursing.priceRevision()).thenReturn(null);
        service.postExecutedTask(task,nursing);verifyNoInteractions(billing);
        when(nursing.unitPrice()).thenReturn(BigDecimal.ZERO);
        assertThrows(BusinessException.class,()->service.postExecutedTask(task,nursing));
        verifyNoInteractions(billing);
    }
}
