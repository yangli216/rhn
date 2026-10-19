package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.Instant;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class PaymentReconciliationAuthorizationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Test void financeRoleRequiresAnAuthorizedWorkContextAndNeverGrantsMerchantScopeImplicitly() throws Exception {
        String endpoint="/api/billing/reconciliation/channels";
        mockMvc.perform(get(endpoint).with(rhnWorkContext())).andExpect(status().isForbidden());
        Long role=jdbc.queryForObject("select ID_ACC_ROLE from RHN_SYS_ACC_ROLE where ID_TNT=? and CD_ACC_ROLE='PAYMENT_RECON_ADMIN'",Long.class,Long.valueOf(TENANT));
        Instant now=Instant.now();
        jdbc.update("insert into RHN_SYS_USER_ROLE_ASSIGN (ID_USER_ROLE_ASSIGN,ID_TNT,ID_USER,ID_ACC_ROLE,ID_ORG,ID_DEPT,SD_DATA_SCOPE_TYPE,DT_VALID_FROM,DT_CREATED) values (?,?,362387869790222,?,?,?,'DEPARTMENT',?,?)",GlobalIds.next(),Long.valueOf(TENANT),role,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),now.minusSeconds(10),now);
        mockMvc.perform(get(endpoint).with(rhnWorkContext())).andExpect(status().isOk());
        mockMvc.perform(get(endpoint).with(rhn())).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/billing/reconciliation/organizations/999999999/policies/WECHAT").with(rhnWorkContext())).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/billing/reconciliation/tasks/999999999/files/999999999/export").with(rhnWorkContext())).andExpect(status().isForbidden());
    }
}
