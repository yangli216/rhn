package com.rhn;

import com.rhn.pharmacy.application.DispenseRouteApplicationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DispenseRouteManagementTest extends RhnIntegrationTestSupport {
    private static final String OUTPATIENT_SITE = "362387869799502";
    private static final String TCM_SITE = "362387869799504";
    private static final String INPATIENT_DEPARTMENT = "362387869898501";
    private static final String INPATIENT_SITE = "362387869799503";

    @Autowired
    private DispenseRouteApplicationService routing;

    @Test
    void routes_doctor_orders_to_specialized_or_default_pharmacy_and_rejects_overlap() throws Exception {
        mockMvc.perform(get("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'OUTPATIENT-DEFAULT')].targetStockSiteId")
                        .value(OUTPATIENT_SITE))
                .andExpect(jsonPath("$[?(@.code == 'OUTPATIENT-HERBAL')].targetStockSiteId")
                        .value(TCM_SITE))
                .andExpect(jsonPath("$[?(@.code == 'INPATIENT-GENERAL-WARD')].careSetting")
                        .value("INPATIENT"));

        assertEquals(OUTPATIENT_SITE, routing.resolve(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(DEPARTMENT), "WESTERN", "OUTPATIENT", LocalDate.of(2026, 8, 30)).orElseThrow()
                .stockSiteId().toString());
        assertEquals(TCM_SITE, routing.resolve(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(DEPARTMENT), "HERBAL", "OUTPATIENT", LocalDate.of(2026, 8, 30)).orElseThrow()
                .stockSiteId().toString());
        assertEquals(INPATIENT_SITE, routing.resolve(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(INPATIENT_DEPARTMENT), "WESTERN", "INPATIENT", LocalDate.of(2026, 8, 30))
                .orElseThrow().stockSiteId().toString());

        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"INPATIENT-WESTERN","name":"住院西药发药",
                                  "careSetting":"INPATIENT","sourceDepartmentId":"%s","medicationType":"WESTERN",
                                  "targetStockSiteId":"%s","active":true,"validFrom":"2026-08-30"
                                }
                                """.formatted(ORGANIZATION, INPATIENT_DEPARTMENT, INPATIENT_SITE)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.targetStockSiteId").value(INPATIENT_SITE));
        assertEquals(INPATIENT_SITE, routing.resolve(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(INPATIENT_DEPARTMENT), "WESTERN", "INPATIENT", LocalDate.of(2026, 8, 30)).orElseThrow()
                .stockSiteId().toString());

        JsonNode route = json(mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"GENERAL-WESTERN","name":"全科西药发药",
                                  "careSetting":"OUTPATIENT","sourceDepartmentId":"%s","medicationType":"WESTERN",
                                  "targetStockSiteId":"%s","active":true,"validFrom":"2026-08-30"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, OUTPATIENT_SITE)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.active").value(true))
                .andReturn().getResponse().getContentAsString());

        assertEquals("GENERAL-WESTERN", routing.resolve(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(DEPARTMENT), "WESTERN", "OUTPATIENT", LocalDate.of(2026, 8, 30))
                .orElseThrow().routeCode());

        mockMvc.perform(post("/api/pharmacy/dispense-routes").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"GENERAL-WESTERN-2","name":"重复规则",
                                  "careSetting":"OUTPATIENT","sourceDepartmentId":"%s","medicationType":"WESTERN",
                                  "targetStockSiteId":"%s","active":true,"validFrom":"2026-08-30"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, OUTPATIENT_SITE)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DISPENSE_ROUTE_RULE_OVERLAP"));

        mockMvc.perform(put("/api/pharmacy/dispense-routes/{id}", route.get("id").asText())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":%s,"organizationId":"%s","code":"GENERAL-WESTERN",
                                  "name":"全科西药发药","careSetting":"OUTPATIENT",
                                  "sourceDepartmentId":"%s","medicationType":"WESTERN",
                                  "targetStockSiteId":"%s","active":false,"validFrom":"2026-08-30"
                                }
                                """.formatted(route.get("revision").asLong(), ORGANIZATION, DEPARTMENT, OUTPATIENT_SITE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        assertEquals("OUTPATIENT-DEFAULT", routing.resolve(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                Long.valueOf(DEPARTMENT), "WESTERN", "OUTPATIENT", LocalDate.of(2026, 8, 30))
                .orElseThrow().routeCode());
    }
}
