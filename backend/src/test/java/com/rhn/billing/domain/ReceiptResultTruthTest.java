package com.rhn.billing.domain;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult.Outcome;
import com.rhn.billing.infrastructure.LocalReceiptAdapter;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class ReceiptResultTruthTest {
    static final Instant ISSUED=Instant.parse("2026-10-04T00:00:00Z");
    Receipt original(){return new Receipt(1L,2L,"KEY","MEDICAL_E_INVOICE","FISCAL",BigDecimal.TEN,"CNY","CASHIER","payer",null,"corr",3L);}
    ReceiptResult result(Outcome outcome,String external,String code,String number,Instant time) {
        return new ReceiptResult(outcome,external,code,number,"VERIFY","OBJECT",time,null,null,null);
    }
    ReceiptResult success(Outcome outcome){return result(outcome,"EXT","CODE","NUMBER",ISSUED);}
    @Test void missingFiscalIdentityOrTimeCannotBeInventedForIssueOrRedFlush() {
        for(boolean red:new boolean[]{false,true}) {
            for(var result:new ReceiptResult[]{result(red?Outcome.RED_FLUSHED:Outcome.ISSUED,null,"CODE","NUMBER",ISSUED),
                    result(red?Outcome.RED_FLUSHED:Outcome.ISSUED,"EXT",null,"NUMBER",ISSUED),
                    result(red?Outcome.RED_FLUSHED:Outcome.ISSUED,"EXT","CODE"," ",ISSUED),
                    result(red?Outcome.RED_FLUSHED:Outcome.ISSUED,"EXT","CODE","NUMBER",null)}) {
                var receipt=red?Receipt.redFlushOf(original(),"RED","corr",3L):original();
                assertThrows(IllegalStateException.class,()->{if(red) receipt.applyRedFlushResult(result);else receipt.applyIssueResult(result);});
                assertEquals("REQUESTED",receipt.status());assertNull(receipt.externalReceiptNo());assertNull(receipt.issuedAt());
            }
        }
    }
    @Test void confirmedIssueCannotSilentlyAcceptAContradictoryState() {
        var receipt=original();receipt.applyIssueResult(success(Outcome.ISSUED));var updated=receipt.updatedAt();
        assertThrows(IllegalStateException.class,()->receipt.applyIssueResult(result(Outcome.PENDING,null,null,null,null)));
        assertEquals("ISSUED",receipt.status());assertEquals(updated,receipt.updatedAt());
        receipt.applyIssueResult(success(Outcome.ISSUED));assertEquals(updated,receipt.updatedAt());
    }
    @Test void duplicateIssueAndRedFlushVerifyFullIdentityAndTime() {
        for(boolean red:new boolean[]{false,true}) {
            var receipt=red?Receipt.redFlushOf(original(),"RED","corr",3L):original();var outcome=red?Outcome.RED_FLUSHED:Outcome.ISSUED;
            if(red)receipt.applyRedFlushResult(success(outcome));else receipt.applyIssueResult(success(outcome));
            for(var changed:new ReceiptResult[]{result(outcome,"OTHER","CODE","NUMBER",ISSUED),result(outcome,"EXT","OTHER","NUMBER",ISSUED),
                    result(outcome,"EXT","CODE","OTHER",ISSUED),result(outcome,"EXT","CODE","NUMBER",ISSUED.plusSeconds(1)),
                    new ReceiptResult(outcome,"EXT","CODE","NUMBER",null,null,ISSUED,null,null,null)}) {
                assertThrows(IllegalStateException.class,()->{if(red)receipt.applyRedFlushResult(changed);else receipt.applyIssueResult(changed);});
            }
            assertEquals("EXT",receipt.externalReceiptNo());assertEquals(ISSUED,receipt.issuedAt());
        }
    }
    @Test void voidRequiresOriginalTicketAndExplicitActionTimeEvenOnReplay() {
        var receipt=original();receipt.applyIssueResult(success(Outcome.ISSUED));
        assertThrows(IllegalStateException.class,()->receipt.applyVoidResult(result(Outcome.VOIDED,null,null,null,ISSUED)));
        assertThrows(IllegalStateException.class,()->receipt.applyVoidResult(result(Outcome.VOIDED,"EXT",null,null,null)));
        receipt.applyVoidResult(result(Outcome.VOIDED,"EXT",null,null,ISSUED));
        assertThrows(IllegalStateException.class,()->receipt.applyVoidResult(result(Outcome.VOIDED,"OTHER",null,null,ISSUED)));
        assertEquals("EXT",receipt.externalReceiptNo());
    }
    @Test void issueAndRedFlushCannotBeSubstitutedForEachOther() {
        var original=original();var red=Receipt.redFlushOf(original,"RED","corr",3L);
        assertThrows(IllegalStateException.class,()->red.applyIssueResult(success(Outcome.ISSUED)));
        assertThrows(IllegalStateException.class,()->red.applyRedFlushResult(success(Outcome.ISSUED)));
        assertThrows(IllegalStateException.class,()->original.applyIssueResult(success(Outcome.RED_FLUSHED)));
        assertNull(red.externalReceiptNo());assertNull(original.externalReceiptNo());
    }
    @Test void successfulOutcomeCannotHideAnError() {
        var receipt=original();var result=new ReceiptResult(Outcome.ISSUED,"EXT","CODE","NUMBER",null,null,ISSUED,"FAILED",null,null);
        assertThrows(IllegalStateException.class,()->receipt.applyIssueResult(result));assertEquals("REQUESTED",receipt.status());
    }
    @Test void localQueryDoesNotGenerateAnIssuedReceiptOrAPlaceholderDocument() {
        var adapter=new LocalReceiptAdapter();
        assertThrows(BusinessException.class,()->adapter.query("UNKNOWN",null,"corr"));
        var input=new com.rhn.billing.api.FiscalReceiptAdapter.ReceiptInstruction(1L,2L,"REQ","KEY","RECEIPT","CASHIER","LOCAL",null,
                "payer",null,BigDecimal.TEN,BigDecimal.ZERO,"CNY",BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.TEN,BigDecimal.ZERO,java.util.List.of(),"corr");
        assertNull(adapter.issue(input).controlledObjectReference());
    }
}
