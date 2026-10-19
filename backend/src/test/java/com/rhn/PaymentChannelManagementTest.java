package com.rhn;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentChannelCapabilities;
import com.rhn.billing.api.PaymentChannelConfigurationAdapter;
import com.rhn.billing.api.PaymentConfigurationPermissions;
import com.rhn.billing.application.PaymentMerchantConfigurationStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import java.util.*;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(PaymentChannelManagementTest.Providers.class)
@ResetDatabaseBeforeEachTestMethod
class PaymentChannelManagementTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired JdbcTemplate jdbc;
    @Autowired PaymentMerchantConfigurationStore store;
    @Autowired TestProvider provider;
    @Autowired com.rhn.platform.maintenance.api.MaintenanceRelationalData relationalData;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.rhn.platform.cryptography.api.SecretEncryptionService encryption;
    private final String path = "/api/billing/payment-channel-management/organizations/" + ORGANIZATION + "/channels/NEW_CONFIG";
    @BeforeEach void context() { provider.deployment = Map.of(); when(contexts.requireCurrent()).thenReturn(manager(Long.valueOf(ORGANIZATION))); }
    ExecutionContext manager(Long org) {
        return new ExecutionContext(Long.valueOf(TENANT),362387869790222L,"doctor","payment-settings-test",
                Set.of(PaymentConfigurationPermissions.MANAGE), org, null, "ORGANIZATION",Set.of(org),Set.of());
    }
    String save(String body) throws Exception {
        return mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
    String initial() { return """
        {"expectedRevision":-1,"enabled":true,"values":{"appId":"APPLICATION","merchantId":"MERCHANT","apiSecret":"highly-confidential"}}
        """; }
    @Test void encryptedInstitutionConfigurationIsUsedAtRuntimeAndNeverReturned() throws Exception {
        mockMvc.perform(get("/api/billing/payment-channel-management").with(rhn())).andExpect(status().isOk())
                .andExpect(jsonPath("$.channels[0].paymentMethodCode").value("NEW_CONFIG"));
        String saved=save(initial());
        assertFalse(saved.contains("highly-confidential")); assertFalse(saved.contains("enc:v1"));
        assertEquals("APPLICATION",json(saved).at("/values/appId").asString());
        assertTrue(json(saved).at("/configuredSecrets/apiSecret").asBoolean());
        String cipher=jdbc.queryForObject("select TXT_CIPHER from RHN_BIL_PAY_CFG",String.class);
        assertTrue(cipher.startsWith("enc:v1:"));assertFalse(cipher.contains("highly-confidential"));
        assertEquals("highly-confidential",store.find(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),"NEW_CONFIG").orElseThrow().values().get("apiSecret"));
        assertTrue(store.find(999L,Long.valueOf(ORGANIZATION),"NEW_CONFIG").isEmpty());
        assertTrue(store.find(Long.valueOf(TENANT),999L,"NEW_CONFIG").isEmpty());
    }
    @Test void blankSecretsAreKeptAndDisablingRetainsRecoveryCredentials() throws Exception {
        save(initial());
        String updated=save("{\"expectedRevision\":0,\"enabled\":false,\"values\":{\"apiSecret\":\"\"}}");
        assertFalse(json(updated).get("enabled").asBoolean());
        assertTrue(json(updated).at("/configuredSecrets/apiSecret").asBoolean());
        var runtime=store.find(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),"NEW_CONFIG").orElseThrow();
        assertFalse(runtime.enabled());assertEquals("highly-confidential",runtime.values().get("apiSecret"));
    }
    @Test void merchantIdentityAndRevisionAreProtectedAfterFirstActivation() throws Exception {
        save(initial());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
            {"expectedRevision":0,"enabled":true,"values":{"merchantId":"ANOTHER"}}
            """)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_MERCHANT_IDENTITY_LOCKED"));
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial())).andExpect(status().isConflict());
        assertEquals(1,jdbc.queryForObject("select count(*) from RHN_BIL_PAY_CFG",Integer.class));
    }
    @Test void managerPermissionAndInstitutionAuthorizationApplyToEveryOperation() throws Exception {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(Long.valueOf(TENANT),1L,"reader","test",Set.of()));
        mockMvc.perform(get("/api/billing/payment-channel-management").with(rhn())).andExpect(status().isForbidden());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial())).andExpect(status().isForbidden());
        mockMvc.perform(post(path+"/check").with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial())).andExpect(status().isForbidden());
        when(contexts.requireCurrent()).thenReturn(manager(999L));
        mockMvc.perform(get(path).with(rhn())).andExpect(status().isForbidden());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial())).andExpect(status().isForbidden());
        mockMvc.perform(post(path+"/check").with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial())).andExpect(status().isForbidden());
    }
    @Test void checkIsReadOnlyAndRejectsUnknownFieldsWithoutEchoingSecrets() throws Exception {
        String response=mockMvc.perform(post(path+"/check").with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true)).andReturn().getResponse().getContentAsString();
        assertFalse(response.contains("highly-confidential"));assertEquals(0,jdbc.queryForObject("select count(*) from RHN_BIL_PAY_CFG",Integer.class));
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial().replace("\"appId\"","\"unknown\"")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(path+"/check").with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial().replace("highly-confidential","invalid-secret")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(false))
                .andExpect(result->assertFalse(result.getResponse().getContentAsString().contains("invalid-secret")));
    }
    @Test void disabledDraftCanBeIncompleteAndItsSecretCanBeExplicitlyCleared() throws Exception {
        save("{\"expectedRevision\":-1,\"enabled\":false,\"values\":{\"apiSecret\":\"temporary\"}}");
        String updated=save("{\"expectedRevision\":0,\"enabled\":false,\"clearSecrets\":[\"apiSecret\"]}");
        assertFalse(json(updated).at("/configuredSecrets/apiSecret").asBoolean());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
            {"expectedRevision":1,"enabled":true,"values":{}}
            """)).andExpect(status().isBadRequest());
    }
    @Test void importingAndDisablingDeploymentConfigurationKeepsItsIdentityLocked() throws Exception {
        provider.deployment = Map.of("appId","APPLICATION","merchantId","MERCHANT","apiSecret","highly-confidential");
        String saved=save("{\"expectedRevision\":-1,\"enabled\":false}");
        assertTrue(json(saved).get("identityLocked").asBoolean());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":0,\"enabled\":false,\"values\":{\"merchantId\":\"OTHER\"}}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_MERCHANT_IDENTITY_LOCKED"));
    }
    @Test void missingEncryptionKeyNeverFallsBackToPlaintextStorage() throws Exception {
        org.mockito.Mockito.doReturn(false).when(encryption).available();
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(initial()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYMENT_SECRET_ENCRYPTION_REQUIRED"));
        assertEquals(0,jdbc.queryForObject("select count(*) from RHN_BIL_PAY_CFG",Integer.class));
    }
    @Test void tenantScopeCanConfigureItsInstitutionsButCannotOmitRevisionOrEnabled() throws Exception {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(Long.valueOf(TENANT),362387869790222L,"doctor","test",
                Set.of(PaymentConfigurationPermissions.MANAGE),999L,null,"TENANT",Set.of(),Set.of()));
        mockMvc.perform(get(path).with(rhn())).andExpect(status().isOk());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":-1}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":null,\"enabled\":false}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":-1,\"enabled\":null}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get(path.replace(ORGANIZATION,"999999")).with(rhn())).andExpect(status().isNotFound());
    }
    @Test void clinicalCleanupRetainsTheEncryptedInstitutionMerchantConfiguration() throws Exception {
        save(initial());
        var definition=new com.rhn.billing.application.BillingMaintenanceContribution().tables().stream()
                .filter(table->table.name().equals("RHN_BIL_PAY_CFG")).findFirst().orElseThrow();
        var snapshot=relationalData.capture(Long.valueOf(TENANT),List.of(definition),Map.of("ID_ORG",Set.of(Long.valueOf(ORGANIZATION))));
        assertEquals(1,snapshot.tables().getFirst().rows().size());
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status->
                relationalData.delete(Long.valueOf(TENANT),snapshot,Set.of("BILLING")));
        assertEquals("highly-confidential",store.find(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),"NEW_CONFIG").orElseThrow().values().get("apiSecret"));
    }
    static class TestProvider implements PaymentChannelAdapter, PaymentChannelConfigurationAdapter {
        Map<String,String> deployment = Map.of();
        public Set<String> paymentMethods() { return Set.of("NEW_CONFIG"); }
        public PaymentChannelCapabilities capabilities(String method) { return new PaymentChannelCapabilities("NEW_CONFIG_PROVIDER",PaymentChannelCapabilities.PaymentInteraction.DIRECT,null,true,true,true); }
        public InitiationResult initiate(PaymentInstruction input) { throw new UnsupportedOperationException(); }
        public RefundResult refund(RefundInstruction input) { throw new UnsupportedOperationException(); }
        public QueryResult query(QueryInstruction input) { throw new UnsupportedOperationException(); }
        public PaymentConfigurationDescriptor configurationDescriptor() {
            return new PaymentConfigurationDescriptor("NEW_CONFIG","NEW_CONFIG_PROVIDER","测试新渠道",List.of(
                new PaymentConfigurationField("appId","应用","TEXT",true,false,true,null,null,List.of(),null,null),
                new PaymentConfigurationField("merchantId","商户","TEXT",true,false,true,null,null,List.of(),null,null),
                new PaymentConfigurationField("apiSecret","密钥","PASSWORD",true,true,false,null,null,List.of(),null,null)));
        }
        public Map<String,String> deploymentConfiguration(Long tenant,Long org) { return deployment; }
        public void checkConfiguration(Map<String,String> values) { if (!"highly-confidential".equals(values.get("apiSecret"))) throw new IllegalArgumentException("credential rejected"); }
    }
    @TestConfiguration static class Providers { @Bean TestProvider managedPaymentProvider() { return new TestProvider(); } }
}
