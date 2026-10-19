package com.rhn;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 财政回调入口经完整安全链（无登录态）的端到端校验：仅 HMAC 签名可通过，验签失败不触达领域，
 * 通过后绑定配置的租户与机构落入票据，同一消息重复投递幂等，其余路径仍须认证。
 */
@ResetDatabaseBeforeEachTestMethod
@TestPropertySource(properties = {
        "rhn.billing.fiscal.mock-enabled=false",
        "rhn.billing.fiscal.gateway.enabled=true",
        "rhn.billing.fiscal.gateway.base-url=http://127.0.0.1:1/fiscal",
        "rhn.billing.fiscal.gateway.client-id=cid",
        "rhn.billing.fiscal.gateway.client-secret=csecret",
        "rhn.billing.fiscal.gateway.callback.enabled=true",
        "rhn.billing.fiscal.gateway.callback.secret=callback-secret",
        "rhn.billing.fiscal.gateway.callback.tenant-id=362387869790209",
        "rhn.billing.fiscal.gateway.callback.organization-id=362387869790211",
        "rhn.billing.fiscal.gateway.callback.department-id=362387869790212"})
class FiscalGatewayCallbackIntegrationTest extends RhnIntegrationTestSupport {
    static final String PATH = "/integration/fiscal/callback";
    static final Instant ISSUED = Instant.parse("2026-10-04T00:00:00Z");
    @Autowired PatientAccountRepository accounts;
    @Autowired InvoiceRepository invoices;
    @Autowired SettlementRepository settlements;
    @Autowired ReceiptRepository receipts;
    @Autowired JdbcTemplate jdbc;

    @Test void signedCallbackWithoutSessionIssuesTheReceiptAndRepeatedDeliveryIsIdempotent() throws Exception {
        var receipt = fixture();
        String body = body(receipt, "MSG-1");
        callback(body, sign(body, now())).andExpect(status().isOk()).andExpect(jsonPath("$.accepted").value(true));
        var stored = receipts.findById(receipt.id()).orElseThrow();
        assertEquals("ISSUED", stored.status());
        assertEquals("EXT-" + receipt.receiptNo(), stored.externalReceiptNo());
        long events = eventCount(receipt);
        callback(body, sign(body, now())).andExpect(status().isOk());
        assertEquals(events, eventCount(receipt));
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_INT_EXT_MSG where ID_BIZ_MSG = 'MSG-1' and SD_DIR = 'INBOUND'", Integer.class));
    }

    @Test void badStaleOrMissingSignatureNeverReachesTheDomain() throws Exception {
        var receipt = fixture();
        String body = body(receipt, "MSG-BAD");
        String ts = now();
        callback(body, new String[]{ts, "00".repeat(32)}).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("FISCAL_CALLBACK_SIGNATURE_INVALID"));
        callback(body, new String[]{ts, "not-hex"}).andExpect(status().isUnauthorized());
        String stale = String.valueOf(System.currentTimeMillis() - 3_600_000L);
        callback(body, sign(body, stale)).andExpect(status().isUnauthorized());
        callback(body, new String[]{null, null}).andExpect(status().isUnauthorized());
        callback(body + " ", new String[]{ts, sign(body, ts)[1]}).andExpect(status().isUnauthorized());
        assertEquals("REQUESTED", receipts.findById(receipt.id()).orElseThrow().status());
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_INT_EXT_MSG where ID_BIZ_MSG = 'MSG-BAD'", Integer.class));
    }

    @Test void malformedSignedPayloadIsRejectedWithoutSideEffects() throws Exception {
        String body = "{\"operation\":\"NOPE\"}";
        callback(body, sign(body, now())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FISCAL_CALLBACK_MALFORMED"));
    }

    @Test void onlyTheExactCallbackPathIsOpenOtherRoutesStillRequireAuthentication() throws Exception {
        mockMvc.perform(post("/integration/fiscal/other").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/billing/receipts/1/issue/retry").header("X-Tenant-Id", TENANT)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    String now() { return String.valueOf(System.currentTimeMillis()); }

    String[] sign(String body, String timestamp) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("callback-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return new String[]{timestamp, HexFormat.of().formatHex(mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8)))};
    }

    org.springframework.test.web.servlet.ResultActions callback(String body, String[] sig) throws Exception {
        var request = post(PATH).contentType(MediaType.APPLICATION_JSON).content(body);
        if (sig[0] != null) request.header("X-Fiscal-Timestamp", sig[0]);
        if (sig[1] != null) request.header("X-Fiscal-Signature", sig[1]);
        return mockMvc.perform(request);
    }

    String body(Receipt receipt, String messageId) {
        var b = new LinkedHashMap<String, Object>();
        b.put("fiscalAuthorityCode", "FISCAL"); b.put("externalMessageBusinessId", messageId); b.put("commandCode", "CMD-" + messageId);
        b.put("receiptRequestNo", receipt.receiptNo()); b.put("operation", "ISSUE"); b.put("outcome", "ISSUED");
        b.put("externalReceiptNo", "EXT-" + receipt.receiptNo()); b.put("fiscalCode", "CODE"); b.put("fiscalNumber", "NUMBER");
        b.put("verificationCode", "VERIFY"); b.put("verifyUrl", "http://verify/x"); b.put("issuedAt", ISSUED.toString());
        return objectMapper.writeValueAsString(b);
    }

    int eventCount(Receipt receipt) { return jdbc.queryForObject("select count(*) from RHN_BIL_RCPT_EVT where ID_RCPT = ?", Integer.class, receipt.id()); }

    Receipt fixture() throws Exception {
        String key=UUID.randomUUID().toString();
        long residentId=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"财政回执校验\",\"gender\":\"2\",\"birthDate\":\"1992-02-02\",\"identifiers\":[{\"system\":\"9\",\"value\":\""+key+"\",\"useType\":\"SECONDARY\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asLong();
        var account=accounts.saveAndFlush(new PatientAccount(Long.valueOf(TENANT),residentId,null,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"CNY"));
        var invoice=invoices.saveAndFlush(new Invoice(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),"INV-"+key,"CNY",BigDecimal.TEN,Instant.now(),362387869790222L));
        var settlement=new Settlement(invoice.id(),Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),account.id(),invoice.id(),"STL-"+key,key,"NORMAL","OUTPATIENT","CASHIER",BigDecimal.TEN,"CNY","TEST",362387869790222L,Instant.now());
        settlement.applyPaidAmount(BigDecimal.TEN,362387869790222L,Instant.now());settlements.saveAndFlush(settlement);
        var receipt=new Receipt(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),invoice.id(),key,"MEDICAL_E_INVOICE","FISCAL",BigDecimal.TEN,"CNY","CASHIER","payer",null,"corr",362387869790222L, "TEST-Receipt");
        receipts.saveAndFlush(receipt);
        return receipt;
    }
}
