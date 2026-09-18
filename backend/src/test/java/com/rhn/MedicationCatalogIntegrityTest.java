package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationCatalogIntegrityTest extends RhnIntegrationTestSupport {
    private static final String BASE = "/api/platform/master-data";
    private final String tag = "ZZINTEGRITY" + UUID.randomUUID().toString().substring(0, 6);

    private ObjectNode medicationInput(String code, String unit) {
        return (ObjectNode) json("""
            {"code":"%s","name":"龘%s","sdMedicationType":"WESTERN","sdDoseForm":"CAPSULE",
             "preparationSpec":"0.25g","preparationUnit":"%s","sdStatus":"ACTIVE","singleOrder":true,"prescriptionDrug":false,"essentialDrug":false,"antimicrobial":false,"skinTestRequired":false,"chronicDiseaseDrug":false}
            """.formatted(code, code, unit));
    }
    private JsonNode createMedication(String code) throws Exception {
        return json(mockMvc.perform(post(BASE + "/medications").with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content(medicationInput(code, "粒").toString()))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode product(JsonNode med, String code, String validFrom) throws Exception {
        JsonNode manufacturer = json(mockMvc.perform(get(BASE + "/manufacturers").with(rhnWorkContext()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get(0);
        return json(mockMvc.perform(post(BASE + "/medication-products/setup").with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content("""
            {"product":{"medicationId":"%s","manufacturerId":"%s","code":"%s","approvalCode":"%s",
               "otc":false,"centralPurchase":false,"importAllowed":false,"traceSplitRequired":false,"stocked":true,"orderable":true,"chargeable":true,"sdStatus":"ACTIVE","validFrom":"%s"},
             "packaging":{"unitCode":"BOX","unitName":"盒","quantityFactor":24,"sdUsageType":"SALE","defaultPurchase":true,"defaultSale":true,"defaultDispense":true,
               "sdStatus":"ACTIVE","validFrom":"2020-01-01"},
             "organization":{"organizationId":"%s","stocked":true,"dispensable":true,"orderable":true,"executable":false,"chargeable":true,"purchasable":true,"returnable":true,
               "sdStatus":"ACTIVE","validFrom":"2020-01-01"},"salePrice":12,"purchasePrice":8}
            """.formatted(med.path("id").asString(), manufacturer.path("id").asString(), code, code, validFrom, ORGANIZATION)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    private JsonNode search(String query, boolean stockable) throws Exception {
        return json(mockMvc.perform(get(BASE + "/medication-products/search").with(rhnWorkContext())
            .param("organizationId", ORGANIZATION).param("query", query).param("stockable", String.valueOf(stockable)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    @Test
    void products_are_counted_and_searched_independently_of_generic_pages_and_the_500_limit() throws Exception {
        JsonNode med = createMedication(tag);
        JsonNode first = product(med, tag + "A", "2020-01-01");
        product(med, tag + "B", "2020-01-01");
        assertThat(search(tag, false).path("totalElements").asInt()).isEqualTo(2);
        assertThat(search(tag + "A", false).path("content").get(0).path("product").path("id").asString())
            .isEqualTo(first.path("id").asString());
        assertThat(search(first.path("manufacturerName").asString(), false).path("totalElements").asInt()).isGreaterThanOrEqualTo(2);
        assertThat(search(tag, true).path("totalElements").asInt()).isEqualTo(2);
        JsonNode legacy = json(mockMvc.perform(get(BASE + "/medications").with(rhnWorkContext()))
            .andReturn().getResponse().getContentAsString());
        // The baseline already has > 500 generics. Products must remain discoverable beyond its first page.
        assertThat(legacy.size()).isEqualTo(500);
        assertThat(legacy.toString()).doesNotContain(tag);
        mockMvc.perform(get(BASE + "/medication-products/search").with(rhnWorkContext()).param("query", tag)
            .param("status", "SUSPENDED")).andExpect(jsonPath("$.totalElements").value(0));
    }
    @Test
    void minimum_unit_is_editable_until_a_product_references_it_and_stays_locked_after_suspension() throws Exception {
        JsonNode med = createMedication(tag);
        var input = medicationInput(tag, "片"); input.put("expectedRevision", med.path("revision").asLong());
        med = json(mockMvc.perform(put(BASE + "/medications/" + med.path("id").asString()).with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString());
        product(med, tag + "P", "2020-01-01");
        input.put("preparationUnit", "粒"); input.put("expectedRevision", med.path("revision").asLong());
        mockMvc.perform(put(BASE + "/medications/" + med.path("id").asString()).with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content(input.toString()))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEDICATION_UNIT_IN_USE"));
        input.put("preparationUnit", "片"); input.put("sdStatus", "SUSPENDED");
        mockMvc.perform(put(BASE + "/medications/" + med.path("id").asString()).with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content(input.toString())).andExpect(status().isOk());
        assertThat(search(tag, true).path("totalElements").asInt()).isZero();
    }
    private String packageInput(String unit, String base) {
        return """
            {"unitCode":"%s","unitName":"包装","quantityFactor":24,"sdUsageType":"SALE","defaultPurchase":true,"defaultSale":true,"defaultDispense":true,
             "sdStatus":"ACTIVE","validFrom":"2020-01-01","basePackageId":"%s"}
            """.formatted(unit, base);
    }
    @Test
    void package_bases_reject_cross_product_self_and_indirect_cycles() throws Exception {
        JsonNode med = createMedication(tag);
        JsonNode a = product(med, tag + "A", "2020-01-01");
        JsonNode b = product(med, tag + "B", "2020-01-01");
        String ap = a.path("packages").get(0).path("id").asString();
        String bp = b.path("packages").get(0).path("id").asString();
        mockMvc.perform(put(BASE + "/packages/" + ap).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content(packageInput("BOX", bp))).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("PACKAGE_BASE_PRODUCT_MISMATCH"));
        mockMvc.perform(put(BASE + "/packages/" + ap).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content(packageInput("BOX", ap))).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("PACKAGE_BASE_CYCLE"));
        JsonNode child = json(mockMvc.perform(post(BASE + "/catalog-items/" + a.path("id").asString() + "/packages")
            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(packageInput("CASE", ap)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(put(BASE + "/packages/" + ap).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content(packageInput("BOX", child.path("id").asString()))).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("PACKAGE_BASE_CYCLE"));
    }
    private String createSite() throws Exception {
        return json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content("""
            {"organizationId":"%s","departmentId":"%s","code":"IGNORED","name":"IGNORED",
             "siteType":"DEPARTMENT_STORE","serviceScope":"MIXED","validFrom":"2020-01-01"}
            """.formatted(ORGANIZATION, DEPARTMENT))).andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString()).path("id").asString();
    }
    private org.springframework.test.web.servlet.ResultActions importProduct(String site, JsonNode product) throws Exception {
        return mockMvc.perform(post("/api/pharmacy/stock-sites/" + site + "/stock-items").with(rhnWorkContext())
            .contentType(MediaType.APPLICATION_JSON).content("""
            {"catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO","negativeAllowed":false,
             "lotRequired":true,"traceRequired":false,"splitAllowed":false,"coldChain":false,"controlled":false,"highAlert":false}
            """.formatted(product.path("id").asString(), product.path("packages").get(0).path("id").asString())));
    }
    @Test
    void stock_candidates_exclude_future_products_and_expired_packages() throws Exception {
        JsonNode med = createMedication(tag);
        String site = createSite();
        JsonNode future = product(med, tag + "FUTURE", "2099-01-01");
        importProduct(site, future).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("STOCK_ITEM_CATALOG_NOT_STOCKABLE"));
        JsonNode current = product(med, tag + "CURRENT", "2020-01-01");
        assertThat(search(tag, true).path("totalElements").asInt()).isEqualTo(1);
        ObjectNode pkg = (ObjectNode) json(packageInput("BOX", current.path("packages").get(0).path("id").asString()));
        pkg.remove("basePackageId"); pkg.put("validTo", "2020-01-02");
        mockMvc.perform(put(BASE + "/packages/" + current.path("packages").get(0).path("id").asString())
            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(pkg.toString())).andExpect(status().isOk());
        assertThat(search(tag, true).path("totalElements").asInt()).isZero();
        importProduct(site, current).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("STOCK_ITEM_PACKAGE_NOT_ACTIVE"));
    }
    @Test
    void standard_setup_reuses_legacy_specification_and_persists_versioned_provenance() throws Exception {
        String path = BASE + "/medication-standard-catalog/specifications/STD-9405B86DD5B404C44E1B92B5/medications";
        JsonNode candidates = json(mockMvc.perform(get(path).with(rhnWorkContext()).param("organizationId", ORGANIZATION))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode med = null;
        for (JsonNode candidate : candidates) if (candidate.path("code").asString().equals("MED-2026-W006-04")) med = candidate;
        assertThat(med).isNotNull();
        ObjectNode input = medicationInput(med.path("code").asString(), med.path("preparationUnit").asString());
        input.put("name", med.path("name").asString());
        ObjectNode body = objectMapper.createObjectNode(); body.set("medication", input);
        mockMvc.perform(post(path).with(rhnWorkContext()).param("organizationId", ORGANIZATION)
            .contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isConflict());
        body.put("medicationId", med.path("id").asString()); body.put("expectedRevision", med.path("revision").asLong());
        mockMvc.perform(post(path).with(rhnWorkContext()).param("organizationId", ORGANIZATION)
            .contentType(MediaType.APPLICATION_JSON).content(body.toString())).andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(med.path("id").asString()));
        JsonNode linkedProduct = product(med, tag + "LINKED", "2020-01-01");
        importProduct(createSite(), linkedProduct).andExpect(status().isCreated())
            .andExpect(jsonPath("$.medicationId").value(med.path("id").asString()));
        mockMvc.perform(get(path).with(rhnWorkContext()).param("organizationId", ORGANIZATION))
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(med.path("id").asString()));
    }
}
