package com.rhn;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.UUID;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Contract behavior, not just equality of generated contract files. Uses the isolated test profile. */
class MasterDataRequestContractTest extends RhnIntegrationTestSupport {
    private static final String BASE = "/api/platform/master-data";
    private static final List<String> FLAGS = List.of("prescriptionDrug", "essentialDrug", "antimicrobial",
            "skinTestRequired", "chronicDiseaseDrug", "singleOrder");

    private ObjectNode medication() {
        var body = objectMapper.createObjectNode();
        body.put("code", "CONTRACT-" + UUID.randomUUID());
        body.put("name", "契约测试药品");
        body.put("sdMedicationType", "WESTERN");
        body.put("sdStatus", "DRAFT");
        FLAGS.forEach(flag -> body.put(flag, false));
        return body;
    }

    @ParameterizedTest
    @ValueSource(strings = {"prescriptionDrug", "essentialDrug", "antimicrobial", "skinTestRequired", "chronicDiseaseDrug", "singleOrder"})
    void omitted_required_boolean_is_a_validation_error(String flag) throws Exception {
        var body = medication();
        body.remove(flag);
        mockMvc.perform(post(BASE + "/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"prescriptionDrug", "essentialDrug", "antimicrobial", "skinTestRequired", "chronicDiseaseDrug", "singleOrder"})
    void null_required_boolean_is_a_validation_error(String flag) throws Exception {
        var body = medication();
        body.putNull(flag);
        mockMvc.perform(post(BASE + "/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void false_is_preserved_and_optional_nulls_are_accepted() throws Exception {
        var body = medication();
        body.putNull("strengthValue");
        body.putNull("antimicrobialOutpatientAllowed");
        body.putNull("antimicrobialConsultationRequired");
        body.putNull("antimicrobialEmergencyAllowed");
        var created = json(mockMvc.perform(post(BASE + "/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.sdMedicationTypeText").isString())
                .andReturn().getResponse().getContentAsString());
        for (var flag : FLAGS) assertThat(created.path(flag).asBoolean()).as(flag).isFalse();
        assertThat(created.path("sdMedicationTypeText").asString()).isNotEqualTo("WESTERN").isNotBlank();
        assertThat(created.path("strengthValue").isNull()).isTrue();
    }

    @Test
    void blank_name_and_invalid_identifier_fail_before_writing() throws Exception {
        var body = medication();
        body.put("name", " ");
        mockMvc.perform(post(BASE + "/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        body = medication();
        body.put("expectedRevision", 0);
        mockMvc.perform(put(BASE + "/medications/not-an-id").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void runtime_openapi_declares_required_flags_for_create_and_update() throws Exception {
        var document = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        // Capture the tested runtime contract as a build artifact, never write generated sources from a test.
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target/master-data-contract-openapi.json"), document);
        var openapi = json(document);
        var schemas = openapi.path("components").path("schemas");
        assertThat(openapi.path("paths").path(BASE + "/catalog-items/{id}/prices")
                .path("post").path("requestBody").path("content").path("application/json")
                .path("schema").path("$ref").asString()).endsWith("/MasterDataPriceRequest");
        assertThat(schemas.path("MasterDataPriceRequest").path("required").valueStream()
                .map(value -> value.asString()).toList()).contains("sdPriceType", "price");
        assertThat(schemas.path("PriceRequest").path("required").valueStream()
                .map(value -> value.asString()).toList()).contains("priceType", "price").doesNotContain("sdPriceType");
        var price = schemas.path("MasterDataPriceRequest");
        assertThat(price.path("properties").has("sdPriceType")).isTrue();
        assertThat(price.path("properties").has("sdStatus")).isTrue();
        assertThat(schemas.path("PriceRequest").path("properties").has("priceType")).isTrue();
        for (var schemaName : List.of("MasterDataMedicationRequest", "MasterDataUpdateMedicationRequest")) {
            var schema = schemas.path(schemaName);
            var required = schema.path("required").valueStream().map(value -> value.asString()).toList();
            assertThat(required).containsAll(FLAGS);
            for (var flag : FLAGS) {
                assertThat(schema.path("properties").path(flag).path("type").asString()).isEqualTo("boolean");
            }
        }
        for (var field : List.of("strengthValue", "antimicrobialOutpatientAllowed", "antimicrobialConsultationRequired")) {
            var property = schemas.path("MasterDataMedicationRequest").path("properties").path(field);
            boolean nullable = property.path("nullable").asBoolean()
                    || property.path("type").valueStream().anyMatch(value -> "null".equals(value.asString()));
            assertThat(nullable).as("nullable wire field " + field).isTrue();
        }
        for (var schemaName : List.of("MasterDataServiceRequest", "MasterDataUpdateServiceRequest", "MasterDataProductRequest", "MasterDataUpdateProductRequest", "MasterDataPackageRequest", "MasterDataAdoptionRequest")) {
            var schema = schemas.path(schemaName);
            var required = schema.path("required").valueStream().map(value -> value.asString()).toList();
            schema.path("properties").properties().forEach(entry -> {
                if (entry.getValue().path("type").isString()
                        && "boolean".equals(entry.getValue().path("type").asString())) {
                    assertThat(required).as(schemaName + "." + entry.getKey()).contains(entry.getKey());
                }
            });
        }
    }
}
