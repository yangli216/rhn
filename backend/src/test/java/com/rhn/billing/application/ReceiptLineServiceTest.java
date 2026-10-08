package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReceiptLineServiceTest {
    final SettlementLineRepository lines = mock(SettlementLineRepository.class);
    final ChargeItemRepository charges = mock(ChargeItemRepository.class);
    final InvoiceLineRepository invoiceLines = mock(InvoiceLineRepository.class);
    final ReceiptLineService service = new ReceiptLineService(lines, charges, invoiceLines);
    final Settlement settlement = new Settlement(2L,1L,3L,4L,"STL","CMD","NORMAL","OUTPATIENT","CASHIER",money("10"),"CNY","TEST",5L,Instant.now());
    final ChargeItem charge = new ChargeItem(1L,1L,1L,3L,6L,null,null,7L,"SERVICE_REQUEST",8L,"CHARGE",
            money("2"),"EA",money("5"),money("10"),"CNY",9L,0L,"SALE","CODE","历史检验名称",Instant.now(),5L,null,"LABORATORY");
    final InvoiceLine invoiceLine = new InvoiceLine(1L,4L,charge.id(),1,money("10"));
    final SettlementLine line = new SettlementLine(1L,2L,charge.id(),invoiceLine.id(),1,money("2"),money("10"));
    final List<SettlementLine> stored = new ArrayList<>(List.of(line));
    final List<InvoiceLine> originals = new ArrayList<>(List.of(invoiceLine));
    ReceiptLineServiceTest() {
        when(lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(1L,2L)).thenReturn(stored);
        when(charges.findByTenantIdAndIdIn(eq(1L),anyCollection())).thenReturn(List.of(charge));
        when(invoiceLines.findByTenantIdAndInvoiceIdOrderByLineNo(1L,4L)).thenReturn(originals);
    }
    @Test void preservesExplicitClassificationNameQuantityAndAmount() {
        var result=service.resolve(settlement).getFirst();
        assertEquals("LABORATORY",result.categoryCode());assertEquals("CODE",result.itemCode());assertEquals("历史检验名称",result.itemName());
        assertEquals(0,money("2").compareTo(result.quantity()));assertEquals(0,money("10").compareTo(result.amount()));
        ReflectionTestUtils.setField(charge,"accountingCategory","CUSTOM_REHAB");
        assertEquals("CUSTOM_REHAB",service.resolve(settlement).getFirst().categoryCode());
    }
    @ParameterizedTest @ValueSource(strings={"SERVICE_REQUEST","DIRECT_VISIT_SERVICE","MED_DISPENSE","REGISTRATION","UNKNOWN"})
    void missingClassificationCannotBeGuessedFromSource(String source) {
        ReflectionTestUtils.setField(charge,"sourceType",source);ReflectionTestUtils.setField(charge,"accountingCategory",null);rejected();
        ReflectionTestUtils.setField(charge,"accountingCategory","  ");rejected();
        ReflectionTestUtils.setField(charge,"accountingCategory","UNCLASSIFIED");rejected();
    }
    @Test void missingSourceCannotProduceAnEmptyOrGenericLine() {
        when(charges.findByTenantIdAndIdIn(eq(1L),anyCollection())).thenReturn(List.of());rejected();
    }
    @Test void missingNameOrCodeCannotBeReplacedWithCatalogOrPlaceholder() {
        for(String field:List.of("itemCodeSnapshot","itemNameSnapshot")) {
            var old=ReflectionTestUtils.getField(charge,field);ReflectionTestUtils.setField(charge,field," ");rejected();ReflectionTestUtils.setField(charge,field,old);
        }
    }
    @Test void chargeMustBelongToSameTenantOrganizationAccountAndCurrency() {
        for(String field:List.of("tenantId","organizationId","patientAccountId")) {
            var old=ReflectionTestUtils.getField(charge,field);ReflectionTestUtils.setField(charge,field,999L);rejected();ReflectionTestUtils.setField(charge,field,old);
        }
        ReflectionTestUtils.setField(charge,"currencyCode","USD");rejected();
    }
    @Test void reversalsCannotMasqueradeAsOrdinaryIssueLines() {
        ReflectionTestUtils.setField(charge,"reversesChargeItemId",999L);rejected();ReflectionTestUtils.setField(charge,"reversesChargeItemId",null);
        ReflectionTestUtils.setField(charge,"status","REVERSED");rejected();
    }
    @Test void requiresMatchingQuantityOriginalInvoiceAndChargeAmount() {
        for(String field:List.of("settledQuantity","grossAmount","netAmount")) {
            var old=ReflectionTestUtils.getField(line,field);ReflectionTestUtils.setField(line,field,money("99"));rejected();ReflectionTestUtils.setField(line,field,old);
        }
        ReflectionTestUtils.setField(line,"legacyInvoiceLineId",999L);rejected();
    }
    @Test void missingOrRepeatedSettlementLinesAreRejected() {
        stored.clear();rejected();stored.add(line);stored.add(line);rejected();
    }
    @Test void omittedOriginalInvoiceLineIsRejectedEvenIfTotalMatches() {
        originals.add(new InvoiceLine(1L,4L,999L,2,BigDecimal.ZERO));rejected();
    }
    @Test void roundingIsExplicitAndNeverHiddenByChangingLineAmount() {
        settlement.applyRoundingAdjustment(money("-0.04"));
        var result=service.resolve(settlement).getFirst();assertEquals(0,money("10").compareTo(result.amount()));
        assertEquals(0,result.amount().add(settlement.roundingAmount()).compareTo(settlement.netAmount()));
        ReflectionTestUtils.setField(settlement,"roundingAmount",BigDecimal.ZERO);rejected();
    }
    @Test void discountsMustAgreeAtLineAndSettlementLevel() {
        ReflectionTestUtils.setField(line,"discountAmount",money("1"));ReflectionTestUtils.setField(line,"netAmount",money("9"));rejected();
        ReflectionTestUtils.setField(settlement,"discountAmount",money("1"));ReflectionTestUtils.setField(settlement,"netAmount",money("9"));
        assertEquals(0,money("9").compareTo(service.resolve(settlement).getFirst().amount()));
        ReflectionTestUtils.setField(line,"discountAmount",money("-1"));rejected();
    }
    @Test void totalMustMatchEvenWhenEachIndividualLineLooksValid() {
        ReflectionTestUtils.setField(settlement,"grossAmount",money("11"));rejected();
    }
    static BigDecimal money(String value){return new BigDecimal(value);}
    void rejected(){assertEquals("RECEIPT_LINES_UNVERIFIED",assertThrows(BusinessException.class,()->service.resolve(settlement)).code());}
}
