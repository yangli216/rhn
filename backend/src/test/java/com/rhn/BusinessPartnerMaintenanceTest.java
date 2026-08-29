package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BusinessPartnerMaintenanceTest extends RhnIntegrationTestSupport {

    @Test
    void manufacturer_and_supplier_support_independent_maintenance_and_status_control() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode manufacturer = json(mockMvc.perform(post("/api/platform/master-data/manufacturers").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"MFR-MAINT-%s","name":"维护测试制药企业","shortName":"测试制药",
                                 "sdManufacturerType":"DRUG","sdProductionPlace":"DOMESTIC",
                                 "countryCode":"CN","address":"测试地址","sdStatus":"ACTIVE"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.revision").value(0))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/platform/master-data/manufacturers/{id}", manufacturer.get("id").asText()).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":"0","code":"MFR-MAINT-%s","name":"更新制药企业",
                                 "shortName":"更新制药","sdManufacturerType":"DRUG",
                                 "sdProductionPlace":"DOMESTIC","countryCode":"CN",
                                 "address":"更新地址","sdStatus":"ACTIVE"}
                                """.formatted(suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.name").value("更新制药企业"));

        mockMvc.perform(post("/api/platform/master-data/manufacturers/{id}/status", manufacturer.get("id").asText()).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":\"1\",\"sdStatus\":\"SUSPENDED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.sdStatus").value("SUSPENDED"));

        JsonNode supplier = json(mockMvc.perform(post("/api/pharmacy/suppliers").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"SUP-MAINT-%s","name":"维护测试供应商",
                                 "unifiedCreditCode":"91310000%s","licenseNo":"LIC-%s",
                                 "licenseValidTo":"2028-12-31","contactName":"张三","contactPhone":"13800000000",
                                 "validFrom":"2026-01-01"}
                                """.formatted(suffix, suffix, suffix)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.revision").value(0))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/pharmacy/suppliers/{id}", supplier.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":"0","code":"SUP-MAINT-%s","name":"更新药品供应商",
                                 "unifiedCreditCode":"91310000%s","licenseNo":"LIC-%s",
                                 "licenseValidTo":"2029-12-31","contactName":"李四","contactPhone":"13900000000",
                                 "validFrom":"2026-01-01","status":"ACTIVE"}
                                """.formatted(suffix, suffix, suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.contactName").value("李四"));

        mockMvc.perform(post("/api/pharmacy/suppliers/{id}/status", supplier.get("id").asText()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":\"1\",\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.status").value("SUSPENDED"));

        mockMvc.perform(get("/api/pharmacy/suppliers").with(rhnWorkContext())
                        .param("organizationId", ORGANIZATION).param("query", "更新药品")
                        .param("status", "SUSPENDED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(supplier.get("id").asText()));
    }
}
