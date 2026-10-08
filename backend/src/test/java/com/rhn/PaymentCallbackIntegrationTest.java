package com.rhn;

import com.rhn.billing.api.PaymentResultDirectory;
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
@Import(PaymentCallbackIntegrationTest.CallbackController.class)
class PaymentCallbackIntegrationTest extends RhnIntegrationTestSupport {
    @Autowired PatientAccountRepository accounts;
    @Autowired InvoiceRepository invoices;
    @Autowired SettlementRepository settlements;
    @Autowired PaymentOrderRepository orders;
    @Autowired PaymentRepository payments;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean ExternalMessageApplicationService messages;

    @Test void incompleteSuccessNeverPostsRequestedMoney() throws Exception {
        var order=fixture();
        for(String amount:new String[]{null,"0","9","11","-1","10.0000001"}) {
            var body=body(order,"MSG","CMD","SUCCEEDED",amount);
            int code=callback(body).andReturn().getResponse().getStatus();
            assertTrue(code==400 || code==409,"Invalid amount unexpectedly accepted: "+amount);
        }
        for(String currency:new String[]{null," ","USD"}) {
            var body=body(order,"MSG","CMD","SUCCEEDED","10");body.put("currencyCode",currency);
            int code=callback(body).andReturn().getResponse().getStatus();assertTrue(code==400 || code==409);
        }
        for(String key:List.of("externalOrderNo","externalTransactionNo","externalMessageBusinessId","commandCode","status")) {
            var body=body(order,"MSG","CMD","SUCCEEDED","10");body.remove(key);
            callback(body).andExpect(status().isBadRequest());
        }
        assertEquals("CREATED",orders.findById(order.id()).orElseThrow().status());
        assertEquals(0,count("RHN_BIL_PAY_EVT","ID_PAY_ORDER",order.id()));
        assertEquals(0,count("RHN_BIL_PAY","ID_PAY_ORDER",order.id()));
        assertEquals(0,messageCount("MSG"));
    }

    @Test void concurrentDeliveryAndNewTransportCommandsDoNotDuplicateAccountingOrRewriteProcessingFacts() throws Exception {
        var order=fixture();
        var a=callbackAsync(body(order,"MSG","CMD-A","SUCCEEDED","10"));
        var b=callbackAsync(body(order,"MSG","CMD-B","SUCCEEDED","10.000000"));
        var results=List.of(a.join(),b.join());
        assertEquals(1,results.stream().filter(v->v.path("duplicate").asBoolean()).count());
        assertEquals(1,count("RHN_BIL_PAY_EVT","ID_PAY_ORDER",order.id()));
        assertEquals(1,count("RHN_BIL_PAY","ID_PAY_ORDER",order.id()));
        var original=processed("MSG");
        callback(body(order,"OTHER-MSG","OTHER-CMD","SUCCEEDED","10")).andExpect(status().isOk());
        var later=orders.findById(order.id()).orElseThrow();
        callback(body(order,"MSG","RETRY","SUCCEEDED","10")).andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true));
        assertEquals(original,processed("MSG"));
        assertEquals(later.revision(),orders.findById(order.id()).orElseThrow().revision());
        assertEquals(1,count("RHN_BIL_PAY","ID_PAY_ORDER",order.id()));
        var changed=body(order,"MSG","CHANGED","SUCCEEDED","10");changed.put("externalTransactionNo","DIFFERENT");
        callback(changed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));
        callback(body(order,"MSG","CHANGED","FAILED",null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));
        assertEquals("SUCCEEDED",orders.findById(order.id()).orElseThrow().status());
    }

    @Test void pendingNullAndZeroAndChangedErrorsAreDifferentFactsAndCommandsCannotBeReused() throws Exception {
        var order=fixture();
        var pending=body(order,"PENDING-MSG","PENDING-CMD","PENDING",null);pending.put("currencyCode",null);
        callback(pending).andExpect(status().isOk()).andExpect(jsonPath("$.events[0].eventAmount").doesNotExist());
        var original=processed("PENDING-MSG");
        var changed=new LinkedHashMap<>(pending);changed.put("capturedAmount",BigDecimal.ZERO);
        callback(changed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));
        changed=new LinkedHashMap<>(pending);changed.put("errorCode","DIFFERENT");
        callback(changed).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT"));
        callback(body(order,"SUCCESS-MSG","PENDING-CMD","SUCCEEDED","10")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PAYMENT_CALLBACK_COMMAND_REUSED"));
        assertEquals(0,messageCount("SUCCESS-MSG"));
        callback(body(order,"SUCCESS-MSG","SUCCESS-CMD","SUCCEEDED","10")).andExpect(status().isOk());
        pending.put("commandCode","RETRY");
        callback(pending).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUCCEEDED")).andExpect(jsonPath("$.duplicate").value(true));
        assertEquals(original,processed("PENDING-MSG"));
        assertEquals(2,count("RHN_BIL_PAY_EVT","ID_PAY_ORDER",order.id()));
    }

    @ParameterizedTest @ValueSource(booleans={false,true})
    void markingFailureRollsBackMessagesEventsAndRealPaymentOrRefundLedger(boolean refund) throws Exception {
        var paymentOrder=fixture();var order=paymentOrder;
        if(refund) {
            callback(body(paymentOrder,"PAID","PAID","SUCCEEDED","10")).andExpect(status().isOk());
            var payment=payments.findByTenantIdAndPaymentNo(Long.valueOf(TENANT),"PAY-"+paymentOrder.orderNo()).orElseThrow();
            order=orders.saveAndFlush(new PaymentOrder(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),
                    paymentOrder.patientAccountId(),paymentOrder.invoiceId(),payment.id(),"REFUND-"+UUID.randomUUID(),UUID.randomUUID().toString(),
                    "OUTPATIENT","CASHIER","CASH","现金","REFUND",BigDecimal.TEN,"CNY","test",null,null,362387869790222L));
        }
        int ledgerBefore=count("RHN_BIL_LEDGER_ENTRY","ID_PAT_ACCT",order.patientAccountId());
        doThrow(com.rhn.shared.api.BusinessErrors.conflict("TEST_MARK_FAILURE","test mark failure"))
                .when(messages).markProcessed(anyLong(),eq("PaymentOrder"),eq(order.id()),anyLong());
        try {
            callback(body(order,"ATOMIC","ATOMIC","SUCCEEDED","10")).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("TEST_MARK_FAILURE"));
        } finally { reset(messages); }
        assertEquals("CREATED",orders.findById(order.id()).orElseThrow().status());
        assertEquals(0,count("RHN_BIL_PAY_EVT","ID_PAY_ORDER",order.id()));
        assertEquals(0,count("RHN_BIL_PAY","ID_PAY_ORDER",order.id()));
        assertEquals(0,messageCount("ATOMIC"));
        assertEquals(ledgerBefore,count("RHN_BIL_LEDGER_ENTRY","ID_PAT_ACCT",order.patientAccountId()));
        callback(body(order,"ATOMIC","ATOMIC","SUCCEEDED","10")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(refund ? "REFUNDED" : "SUCCEEDED"));
        assertEquals(1,count("RHN_BIL_PAY","ID_PAY_ORDER",order.id()));
        assertEquals(ledgerBefore+1,count("RHN_BIL_LEDGER_ENTRY","ID_PAT_ACCT",order.patientAccountId()));
    }

    @Test void processedMessageWithoutItsEventIsNotAcceptedAsACompletedReplay() throws Exception {
        var order=fixture();var body=body(order,"MSG","CMD","SUCCEEDED","10");
        callback(body).andExpect(status().isOk());
        jdbc.update("delete from RHN_BIL_PAY_EVT where ID_PAY_ORDER = ?",order.id());
        callback(body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_PROCESSED_RESULT_MISSING"));
        assertEquals(1,count("RHN_BIL_PAY","ID_PAY_ORDER",order.id()));
    }

    private Map<String,Object> body(PaymentOrder order,String message,String command,String state,String amount) {
        var body=new LinkedHashMap<String,Object>();
        body.put("paymentMethodCode","CASH");body.put("externalMessageBusinessId",message);body.put("commandCode",command);
        body.put("paymentOrderNo",order.orderNo());body.put("externalOrderNo","EXT-"+order.orderNo());body.put("externalTransactionNo","TXN-"+order.orderNo());
        body.put("status",state);body.put("capturedAmount",amount==null?null:new BigDecimal(amount));body.put("currencyCode","CNY");
        body.put("sanitizedPayload",Map.of());return body;
    }
    private ResultActions callback(Map<String,Object> body) throws Exception {
        return mockMvc.perform(post("/api/test/payment-callback").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }
    private CompletableFuture<JsonNode> callbackAsync(Map<String,Object> body) {
        return CompletableFuture.supplyAsync(()->{
            try{
                var response=callback(body).andReturn().getResponse();
                assertEquals(200,response.getStatus(),response.getContentAsString());
                return json(response.getContentAsString());
            }
            catch(Exception e){throw new RuntimeException(e);}
        });
    }
    private int count(String table,String column,Long id) {return jdbc.queryForObject("select count(*) from "+table+" where "+column+" = ?",Integer.class,id);}
    private int messageCount(String id) {return jdbc.queryForObject("select count(*) from RHN_INT_EXT_MSG where ID_BIZ_MSG = ? and SD_DIR = 'INBOUND'",Integer.class,id);}
    private Map<String,Object> processed(String message) {return jdbc.queryForMap("select DT_PROCSD, SN_RELATED_RSRC_VER, REVISION from RHN_INT_EXT_MSG where ID_BIZ_MSG = ? and SD_DIR = 'INBOUND'",message);}
    private PaymentOrder fixture() throws Exception {
        String key=UUID.randomUUID().toString();
        long residentId=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"支付回执校验\",\"gender\":\"FEMALE\",\"birthDate\":\"1992-02-02\",\"identifiers\":[{\"system\":\"9\",\"value\":\""+key+"\",\"useType\":\"SECONDARY\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
        var account=accounts.saveAndFlush(new PatientAccount(Long.valueOf(TENANT),residentId,null,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"CNY"));
        var invoice=invoices.saveAndFlush(new Invoice(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),"INV-"+key,"CNY",BigDecimal.TEN,Instant.now(),362387869790222L));
        settlements.saveAndFlush(new Settlement(invoice.id(),Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),invoice.id(),"STL-"+key,key,"NORMAL","OUTPATIENT","CASHIER",BigDecimal.TEN,"CNY","TEST",362387869790222L,Instant.now()));
        return orders.saveAndFlush(new PaymentOrder(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),invoice.id(),null,"ORDER-"+key,key,"OUTPATIENT","CASHIER","CASH","现金","SETTLEMENT_PAY",BigDecimal.TEN,"CNY","test",null,null,362387869790222L));
    }
    /** Test-only bridge to the authenticated adapter boundary; absent from production. */
    @RestController static class CallbackController {
        private final PaymentResultDirectory results;
        CallbackController(PaymentResultDirectory results){this.results=results;}
        @PostMapping("/api/test/payment-callback")
        PaymentResultDirectory.PaymentOrderView accept(@RequestBody PaymentResultDirectory.VerifiedPaymentResult input){return results.accept(input);}
    }
}
