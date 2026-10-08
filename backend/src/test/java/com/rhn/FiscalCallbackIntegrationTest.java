package com.rhn;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.FiscalReceiptResultDirectory;
import com.rhn.billing.api.ReceiptViews.ReceiptView;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.integration.application.ExternalMessageApplicationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
@Import(FiscalCallbackIntegrationTest.CallbackController.class)
class FiscalCallbackIntegrationTest extends RhnIntegrationTestSupport {
    static final Instant ISSUED=Instant.parse("2026-10-04T00:00:00Z");
    @Autowired PatientAccountRepository accounts;
    @Autowired InvoiceRepository invoices;
    @Autowired SettlementRepository settlements;
    @Autowired ReceiptRepository receipts;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean ExternalMessageApplicationService messages;

    @Test void settledFlagWithoutActualFundingCannotCreateOrRetryAnIssue() throws Exception {
        var existing = fixture("ISSUE");
        long before = receipts.count();
        mockMvc.perform(post("/api/billing/settlements/{settlementId}/receipts", existing.settlementId())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idempotencyKey\":\"NO-FUNDING\",\"receiptType\":\"PAPER_INVOICE\",\"issueChannel\":\"CASHIER\",\"fiscalAuthorityCode\":\"TEST_QUEUE\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECEIPT_FUNDING_UNVERIFIED"));
        assertEquals(before, receipts.count());
        mockMvc.perform(post("/api/billing/receipts/{receiptId}/issue/retry", existing.id())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"commandCode\":\"NO-FUNDING-RETRY\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECEIPT_FUNDING_UNVERIFIED"));
        assertEquals("REQUESTED", receipts.findById(existing.id()).orElseThrow().status());
        assertEquals(0, eventCount(existing));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_INT_EXT_MSG where SD_RELATED_RSRC_TYPE='Receipt'", Integer.class));
    }

    @Test void incompleteIssueCannotCreateTimeIdentityOrProcessedMessages() throws Exception {
        var receipt=fixture("ISSUE");
        for(String field:List.of("externalReceiptNo","fiscalCode","fiscalNumber","issuedAt")) {
            var body=body(receipt,"ISSUE","MSG","CMD");body.remove(field);
            callback(body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECEIPT_STATE_INVALID"));
        }
        for(String field:List.of("commandCode","externalMessageBusinessId","operation","outcome")) {
            var body=body(receipt,"ISSUE","MSG","CMD");body.remove(field);
            callback(body).andExpect(status().isBadRequest());
        }
        var stored=receipts.findById(receipt.id()).orElseThrow();
        assertEquals("REQUESTED",stored.status());assertNull(stored.externalReceiptNo());assertNull(stored.issuedAt());
        assertEquals(0,eventCount(receipt));assertEquals(0,messageCount("MSG"));
    }

    @ParameterizedTest @ValueSource(strings={"ISSUE","VOID","RED_FLUSH"})
    void concurrentCallbacksRecordOneEventAndDoNotRewriteOriginalProcessingFacts(String operation) throws Exception {
        var receipt=fixture(operation);
        var a=callbackAsync(body(receipt,operation,"MSG","CMD-A"));var b=callbackAsync(body(receipt,operation,"MSG","CMD-B"));
        var results=List.of(a.join(),b.join());
        assertEquals(1,results.stream().filter(r->r.path("duplicate").asBoolean()).count());assertEquals(1,eventCount(receipt));
        var original=processed("MSG");
        var changed=body(receipt,operation,"MSG","CHANGED");changed.put("fiscalNumber","CHANGED");
        callback(changed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));
        changed=body(receipt,operation,"MSG","CHANGED");changed.put("issuedAt",ISSUED.plusSeconds(1).toString());
        callback(changed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));
        callback(body(receipt,operation,"OTHER-MSG","OTHER-CMD")).andExpect(status().isOk());
        var revision=receipts.findById(receipt.id()).orElseThrow().revision();
        callback(body(receipt,operation,"MSG","RETRY")).andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true));
        assertEquals(original,processed("MSG"));assertEquals(revision,receipts.findById(receipt.id()).orElseThrow().revision());
        assertEquals(2,eventCount(receipt));
    }

    @ParameterizedTest @ValueSource(strings={"ISSUE","VOID","RED_FLUSH"})
    void processingFailureRollsBackTheReceiptEventAndInboundMessage(String operation) throws Exception {
        var receipt=fixture(operation);String before=receipt.status();
        doThrow(com.rhn.shared.api.BusinessErrors.conflict("TEST_MARK_FAILURE","test mark failure"))
                .when(messages).markProcessed(anyLong(),eq("Receipt"),eq(receipt.id()),anyLong());
        try {callback(body(receipt,operation,"ATOMIC","ATOMIC")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TEST_MARK_FAILURE"));}
        finally {reset(messages);}
        assertEquals(before,receipts.findById(receipt.id()).orElseThrow().status());assertEquals(0,eventCount(receipt));assertEquals(0,messageCount("ATOMIC"));
        callback(body(receipt,operation,"ATOMIC","ATOMIC")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value(outcome(operation)));
        assertEquals(1,eventCount(receipt));assertEquals(1,messageCount("ATOMIC"));
    }

    @Test void oldPendingReplayAfterIssueDoesNotDowngradeAndCommandReuseCannotHideADifferentOutcome() throws Exception {
        var receipt=fixture("ISSUE");var pending=body(receipt,"ISSUE","PENDING","CMD");
        pending.put("outcome","PENDING");pending.put("issuedAt",null);pending.put("fiscalNumber",null);pending.put("fiscalCode",null);
        callback(pending).andExpect(status().isOk());var original=processed("PENDING");
        callback(body(receipt,"ISSUE","SUCCESS","CMD")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RECEIPT_CALLBACK_COMMAND_REUSED"));
        assertEquals(0,messageCount("SUCCESS"));
        callback(body(receipt,"ISSUE","SUCCESS","SUCCESS")).andExpect(status().isOk());
        pending.put("commandCode","RETRY");
        callback(pending).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ISSUED")).andExpect(jsonPath("$.duplicate").value(true));
        assertEquals(original,processed("PENDING"));
        var late=new LinkedHashMap<>(pending);late.put("externalMessageBusinessId","LATE");late.put("commandCode","LATE");
        callback(late).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECEIPT_STATE_INVALID"));
        assertEquals(0,messageCount("LATE"));
    }

    @Test void oldIssueReplayAfterVoidPreservesOriginalProcessingAndMissingEventIsRejected() throws Exception {
        var receipt=fixture("ISSUE");var issue=body(receipt,"ISSUE","ISSUE","ISSUE");callback(issue).andExpect(status().isOk());var original=processed("ISSUE");
        callback(body(receipt,"VOID","VOID","VOID")).andExpect(status().isOk());
        callback(issue).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VOIDED")).andExpect(jsonPath("$.duplicate").value(true));
        assertEquals(original,processed("ISSUE"));
        jdbc.update("delete from RHN_BIL_RCPT_EVT where ID_RCPT = ? and CD_COMMAND = 'ISSUE'",receipt.id());
        callback(issue).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECEIPT_PROCESSED_RESULT_MISSING"));
    }

    @Test void aRedReceiptCannotReuseTheOriginalFiscalNumber() throws Exception {
        var receipt=fixture("RED_FLUSH");var body=body(receipt,"RED_FLUSH","DUPLICATE","DUPLICATE");
        body.put("fiscalNumber","NUMBER");
        callback(body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DATA_INTEGRITY_CONFLICT"));
        assertEquals("REQUESTED",receipts.findById(receipt.id()).orElseThrow().status());
        assertEquals(0,eventCount(receipt));assertEquals(0,messageCount("DUPLICATE"));
    }

    String outcome(String operation){return switch(operation){case "ISSUE"->"ISSUED";case "VOID"->"VOIDED";default->"RED_FLUSHED";};}
    Map<String,Object> body(Receipt receipt,String operation,String message,String command) {
        var b=new LinkedHashMap<String,Object>();b.put("fiscalAuthorityCode","FISCAL");b.put("receiptRequestNo",receipt.receiptNo());
        b.put("externalMessageBusinessId",message);b.put("commandCode",command);b.put("operation",operation);b.put("outcome",outcome(operation));
        b.put("externalReceiptNo","EXT-"+receipt.receiptNo());b.put("fiscalCode","CODE");b.put("fiscalNumber",operation.equals("RED_FLUSH")?"RED-NUMBER":"NUMBER");
        b.put("verificationCode","VERIFY");b.put("controlledObjectReference","OBJECT");b.put("issuedAt",ISSUED.toString());
        b.put("actionReason",operation.equals("ISSUE")?null:"核实后的操作原因");b.put("sanitizedPayload",Map.of());return b;
    }
    ResultActions callback(Map<String,Object> body) throws Exception {return mockMvc.perform(post("/api/test/fiscal-callback").with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)));}
    CompletableFuture<JsonNode> callbackAsync(Map<String,Object> body) {return CompletableFuture.supplyAsync(()->{
        try{var response=callback(body).andReturn().getResponse();assertEquals(200,response.getStatus(),response.getContentAsString());return json(response.getContentAsString());}
        catch(Exception e){throw new RuntimeException(e);}
    });}
    int eventCount(Receipt receipt){return jdbc.queryForObject("select count(*) from RHN_BIL_RCPT_EVT where ID_RCPT = ?",Integer.class,receipt.id());}
    int messageCount(String id){return jdbc.queryForObject("select count(*) from RHN_INT_EXT_MSG where ID_BIZ_MSG = ? and SD_DIR = 'INBOUND'",Integer.class,id);}
    Map<String,Object> processed(String id){return jdbc.queryForMap("select DT_PROCSD, SN_RELATED_RSRC_VER, REVISION from RHN_INT_EXT_MSG where ID_BIZ_MSG = ? and SD_DIR = 'INBOUND'",id);}
    Receipt fixture(String operation) throws Exception {
        String key=UUID.randomUUID().toString();
        long residentId=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"财政回执校验\",\"gender\":\"FEMALE\",\"birthDate\":\"1992-02-02\",\"identifiers\":[{\"system\":\"9\",\"value\":\""+key+"\",\"useType\":\"SECONDARY\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
        var account=accounts.saveAndFlush(new PatientAccount(Long.valueOf(TENANT),residentId,null,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"CNY"));
        var invoice=invoices.saveAndFlush(new Invoice(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),"INV-"+key,"CNY",BigDecimal.TEN,Instant.now(),362387869790222L));
        var settlement=new Settlement(invoice.id(),Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),invoice.id(),"STL-"+key,key,"NORMAL","OUTPATIENT","CASHIER",BigDecimal.TEN,"CNY","TEST",362387869790222L,Instant.now());
        settlement.applyPaidAmount(BigDecimal.TEN,362387869790222L,Instant.now());settlements.saveAndFlush(settlement);
        var receipt=new Receipt(Long.valueOf(TENANT),invoice.id(),key,"MEDICAL_E_INVOICE","FISCAL",BigDecimal.TEN,"CNY","CASHIER","payer",null,"corr",362387869790222L);
        if(!operation.equals("ISSUE"))receipt.applyIssueResult(new ReceiptResult(ReceiptResult.Outcome.ISSUED,"EXT-"+receipt.receiptNo(),"CODE","NUMBER","VERIFY","OBJECT",ISSUED,null,null,null));
        receipts.saveAndFlush(receipt);
        return operation.equals("RED_FLUSH")?receipts.saveAndFlush(Receipt.redFlushOf(receipt,"RED-"+key,"corr",362387869790222L)):receipt;
    }
    @RestController static class CallbackController {
        private final FiscalReceiptResultDirectory results;
        CallbackController(FiscalReceiptResultDirectory results){this.results=results;}
        @PostMapping("/api/test/fiscal-callback") ReceiptView accept(@RequestBody FiscalReceiptResultDirectory.VerifiedReceiptResult input){return results.accept(input);}
    }
}
