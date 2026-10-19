package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.Instant;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PaymentChannelConfigurationAuthorizationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Test void realWorkContextRequiresTheNewPermissionAndCatalogReflectsItsAuthorizedInstitution() throws Exception {
        String endpoint="/api/billing/payment-channel-management";
        mockMvc.perform(get(endpoint).with(rhnWorkContext())).andExpect(status().isForbidden());
        Long permission=jdbc.queryForObject("select ID_ACC_PERM from RHN_SYS_ACC_PERM where ID_TNT=? and CD_ACC_PERM='PAYMENT_CONFIGURATION.MANAGE'",Long.class,Long.valueOf(TENANT));
        Long role=GlobalIds.next();Instant now=Instant.now();
        jdbc.update("insert into RHN_SYS_ACC_ROLE (ID_ACC_ROLE,ID_TNT,CD_ACC_ROLE,NA_ACC_ROLE,SD_ROLE_TYPE,SD_STATUS,DT_CREATED,DT_UPDATED,REVISION) values (?,?,'TEST_PAYMENT_CONFIG','测试支付配置管理员','BUSINESS','ACTIVE',?,?,0)",role,Long.valueOf(TENANT),now,now);
        jdbc.update("insert into RHN_SYS_ROLE_PERM_ASSIGN (ID_ROLE_PERM_ASSIGN,ID_TNT,ID_ACC_ROLE,ID_ACC_PERM,DT_VALID_FROM,DT_CREATED) values (?,?,?,?,?,?)",GlobalIds.next(),Long.valueOf(TENANT),role,permission,now.minusSeconds(10),now);
        jdbc.update("insert into RHN_SYS_USER_ROLE_ASSIGN (ID_USER_ROLE_ASSIGN,ID_TNT,ID_USER,ID_ACC_ROLE,ID_ORG,ID_DEPT,SD_DATA_SCOPE_TYPE,DT_VALID_FROM,DT_CREATED) values (?,?,362387869790222,?,?,?,'DEPARTMENT',?,?)",GlobalIds.next(),Long.valueOf(TENANT),role,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),now.minusSeconds(10),now);
        mockMvc.perform(get(endpoint).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.organizations[0].id").value(ORGANIZATION));
        mockMvc.perform(get(endpoint).with(rhn())).andExpect(status().isForbidden());
    }
}
