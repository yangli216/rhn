package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ServiceExecutionDepartmentDefaultTest extends RhnIntegrationTestSupport {
    @Autowired
    private com.rhn.outpatient.api.OutpatientOrderOriginDirectory orderOrigins;
    @Autowired JdbcTemplate jdbc;
    @Test void seededDestinationsAreAvailableAndProjectConfigurationRemainsAnOverride() throws Exception {
        assertEquals(4, jdbc.queryForObject("select count(*) from RHN_SYS_DEPT where ID_TNT=? and ID_ORG=? and CD_DEPT in ('LABORATORY','IMAGING','ULTRASOUND','ECG')", Integer.class, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION)));
        mockMvc.perform(get("/api/platform/master-data/services/search").with(rhnWorkContext())
                        .param("query", "SRV-CBC").param("organizationId", ORGANIZATION))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].organizationAdoption.defaultDepartmentId").isEmpty())
                .andExpect(jsonPath("$.content[0].defaultExecutionDepartment.departmentName").value("医学检验科"))
                .andExpect(jsonPath("$.content[0].defaultExecutionDepartment.source").value("DEPARTMENT_TYPE"));
        jdbc.update("update RHN_BD_ORG_CATALOG_ITEM set ID_DEPT_DEFAULT=? where ID_TNT=? and ID_ORG=? and ID_CATALOG_ITEM=362387869795101",
                Long.valueOf(DEPARTMENT), Long.valueOf(TENANT), Long.valueOf(ORGANIZATION));
        try {
            mockMvc.perform(get("/api/platform/master-data/services/search").with(rhnWorkContext())
                            .param("query", "SRV-CBC").param("organizationId", ORGANIZATION))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].defaultExecutionDepartment.departmentId").value(DEPARTMENT))
                    .andExpect(jsonPath("$.content[0].defaultExecutionDepartment.source").value("CONFIGURED"));
        } finally {
            jdbc.update("update RHN_BD_ORG_CATALOG_ITEM set ID_DEPT_DEFAULT=null where ID_TNT=? and ID_ORG=? and ID_CATALOG_ITEM=362387869795101", Long.valueOf(TENANT), Long.valueOf(ORGANIZATION));
        }
    }
    @Test void physicianCanOrderAtOwnOrganizationsLabWhileRequestingDepartmentIsPreserved() throws Exception {
        String encounter = encounter();
        var request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounter).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"catalogItemId\":\"362387869795101\",\"quantity\":1}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.performerDepartmentId").value("362387869899101"))
                .andReturn().getResponse().getContentAsString());
        assertEquals(Long.valueOf(DEPARTMENT), jdbc.queryForObject("select ID_DEPT_REQ from RHN_EX_CARE_REQ where ID_CARE_REQ=?", Long.class, request.path("id").asString()));
        Long requestId = Long.valueOf(request.path("id").asString());
        var origin = orderOrigins.findByRequestIds(Long.valueOf(TENANT), java.util.Set.of(), java.util.Set.of(requestId)).get(requestId);
        assertEquals(Long.valueOf(DEPARTMENT), origin.departmentId());
        assertEquals("LABORATORY", origin.serviceType());
        assertEquals(Long.valueOf(encounter), origin.encounterId());
        assertTrue(orderOrigins.findByRequestIds(-1L, java.util.Set.of(), java.util.Set.of(requestId)).isEmpty());
        assertTrue(orderOrigins.findByRequestIds(Long.valueOf(TENANT), java.util.Set.of(requestId), java.util.Set.of()).isEmpty());
    }
    @Test void foreignAndInactiveDestinationsAreRejected() throws Exception {
        String encounter = encounter();
        mockMvc.perform(post("/api/encounters/{id}/service-requests", encounter).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"catalogItemId\":\"362387869795101\",\"quantity\":1,\"performerOrganizationId\":\"999999\",\"performerDepartmentId\":\"362387869899101\"}"))
                .andExpect(status().is4xxClientError());
        jdbc.update("update RHN_SYS_DEPT set SD_STATUS='INACTIVE' where ID_DEPT=362387869899101");
        try {
            mockMvc.perform(post("/api/encounters/{id}/service-requests", encounter).with(rhnWorkContext())
                            .contentType(MediaType.APPLICATION_JSON).content("{\"catalogItemId\":\"362387869795101\",\"quantity\":1,\"performerDepartmentId\":\"362387869899101\"}"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SERVICE_REQUEST_EXECUTION_DEPARTMENT_INVALID"));
        } finally { jdbc.update("update RHN_SYS_DEPT set SD_STATUS='ACTIVE' where ID_DEPT=362387869899101"); }
    }
    private String encounter() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        var resident = json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"执行科室测试\",\"gender\":\"MALE\",\"birthDate\":\"1990-01-01\",\"identifiers\":[{\"system\":\"9\",\"value\":\"EXEC"+suffix+"\",\"useType\":\"SECONDARY\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        var encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"residentId\":\""+resident.path("id").asString()+"\",\"organizationId\":\""+ORGANIZATION+"\",\"departmentId\":\""+DEPARTMENT+"\",\"idempotencyCode\":\"EXEC"+suffix+"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = encounter.path("id").asString();
        mockMvc.perform(verifiedEncounterStart(id)).andExpect(status().isOk());
        return id;
    }
}
