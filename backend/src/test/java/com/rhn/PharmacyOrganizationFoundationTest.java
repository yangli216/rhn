package com.rhn;

import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PharmacyOrganizationFoundationTest extends RhnIntegrationTestSupport {
    private static final String PHARMACY_DEPARTMENT = "362387869799101";
    private static final String WAREHOUSE_DEPARTMENT = "362387869799102";
    private static final String OUTPATIENT_PHARMACY = "362387869799103";
    private static final String OUTPATIENT_SITE = "362387869799502";
    private static final String DEMO_PHARMACIST = "362387869799301";

    @Test
    void demo_baseline_exposes_recommended_pharmacy_structure_and_work_contexts() throws Exception {
        mockMvc.perform(get("/api/platform/organization-units").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'PHARMACY_DEPT')].sdDepartmentType")
                        .value("MED_PHARMACY"))
                .andExpect(jsonPath("$[?(@.code == 'DRUG_WAREHOUSE')].parentId")
                        .value(PHARMACY_DEPARTMENT))
                .andExpect(jsonPath("$[?(@.code == 'OUTPATIENT_PHARMACY')].parentId")
                        .value(PHARMACY_DEPARTMENT))
                .andExpect(jsonPath("$[?(@.code == 'INPATIENT_PHARMACY')].parentId")
                        .value(PHARMACY_DEPARTMENT))
                .andExpect(jsonPath("$[?(@.code == 'TCM_PHARMACY')].parentId")
                        .value(PHARMACY_DEPARTMENT));

        mockMvc.perform(get("/api/platform/positions").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'PHARMACIST')].sdPositionType").value("PHARMACY"));

        mockMvc.perform(get("/api/platform/practitioners/{id}", DEMO_PHARMACIST).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.practitioner.fullName").value("示范药师"))
                .andExpect(jsonPath("$.assignments[?(@.departmentId == '%s')].sdPositionType"
                        .formatted(OUTPATIENT_PHARMACY)).value("PHARMACY"))
                .andExpect(jsonPath("$.assignments[?(@.departmentId == '%s')].sdPositionType"
                        .formatted(WAREHOUSE_DEPARTMENT)).value("PHARMACY"));

        mockMvc.perform(get("/api/session").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workContexts[?(@.departmentId == '%s')].departmentName"
                        .formatted(PHARMACY_DEPARTMENT)).value("药学部"))
                .andExpect(jsonPath("$.workContexts[?(@.departmentId == '%s')].workContextType"
                        .formatted(WAREHOUSE_DEPARTMENT)).value("INVENTORY"))
                .andExpect(jsonPath("$.workContexts[?(@.departmentId == '%s')].departmentName"
                        .formatted(OUTPATIENT_PHARMACY)).value("门诊药房"))
                .andExpect(jsonPath("$.workContexts[?(@.departmentId == '%s')].workContextType"
                        .formatted(OUTPATIENT_PHARMACY)).value("PHARMACY"));
    }

    @Test
    void stock_site_operations_are_isolated_by_current_department() throws Exception {
        mockMvc.perform(get("/api/pharmacy/stock-sites/{siteId}/stock-items", OUTPATIENT_SITE)
                        .with(rhnWorkContext()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PHARMACY_SITE_CONTEXT_MISMATCH"));
    }
}
