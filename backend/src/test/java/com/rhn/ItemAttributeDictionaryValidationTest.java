package com.rhn;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class ItemAttributeDictionaryValidationTest extends RhnIntegrationTestSupport {
    private static final String CONFIG = "/api/platform/master-data/item-attribute-configurations";
    private static final String ATTRIBUTES = "/api/platform/master-data/item-attributes";
    private String dictionaryId;

    @BeforeEach
    void dictionaries() throws Exception {
        JsonNode dictionary = createDictionary();
        dictionaryId = dictionary.path("id").asString();
        dictionary = addItem(dictionary, "FIRST");
        dictionary = addItem(dictionary, "SECOND");
        dictionary = addItem(dictionary, "RETIRED");
        String retiredId = dictionary.path("items").get(2).path("id").asString();
        mockMvc.perform(post("/api/platform/dictionaries/{id}/items/{itemId}/disable", dictionaryId, retiredId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(request().put("expectedRevision", dictionary.path("revision").asLong()).toString()))
                .andExpect(status().isOk());
        // A valid code in a different dictionary must not satisfy this attribute's reference.
        addItem(createDictionary(), "FOREIGN");
    }

    @ParameterizedTest
    @ValueSource(strings = {"base-value", "override"})
    void values_reject_invalid_codes_without_writes_and_preserve_existing_values(String endpoint) throws Exception {
        JsonNode definition = created(CONFIG + "/definitions", definition("MULTIPLE"));
        String definitionId = definition.path("id").asString();
        created(CONFIG + "/assignments", assignment(definitionId));
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(standardMedicationInput("""
                                {"code":"MED-DICT-%s","name":"字典引用校验药品","sdMedicationType":"WESTERN",
                                 "sdDoseForm":"TABLET","preparationSpec":"10mg","preparationUnit":"片",
                                 "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                 "skinTestRequired":false,"chronicDiseaseDrug":false,"singleOrder":false,
                                 "sdStatus":"ACTIVE"}
                                """.formatted(suffix()))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String targetId = medication.path("id").asString();
        String collection = "base-value".equals(endpoint) ? "baseValues" : "overrides";
        ObjectNode command = request().put("subjectType", "MEDICATION").put("targetId", targetId)
                .put("definitionId", definitionId).put("validFrom", "2026-08-27");
        if ("override".equals(endpoint)) {
            command.put("scopeType", "ORGANIZATION").put("organizationId", ORGANIZATION)
                    .put("valueMode", "OVERRIDE");
        }
        for (String invalid : List.of("UNKNOWN", "RETIRED", "FOREIGN")) {
            command.set("value", objectMapper.valueToTree(List.of("FIRST", invalid)));
            save(endpoint, command).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_DICTIONARY_VALUE_INVALID"));
        }
        maintenance(targetId).andExpect(jsonPath("$." + collection + ".length()").value(0));
        changes(targetId).andExpect(jsonPath("$.length()").value(0));

        command.set("value", objectMapper.valueToTree(List.of("FIRST", "SECOND")));
        JsonNode saved = json(save(endpoint, command).andExpect(status().isOk())
                .andExpect(jsonPath("$." + collection + "[0].value.length()").value(2))
                .andExpect(jsonPath("$." + collection + "[0].value[0]").value("FIRST"))
                .andExpect(jsonPath("$." + collection + "[0].value[1]").value("SECOND"))
                .andReturn().getResponse().getContentAsString());
        command.put("base-value".equals(endpoint) ? "valueId" : "overrideId",
                        saved.path(collection).get(0).path("id").asString())
                .put("expectedRevision", 0);
        command.set("value", objectMapper.valueToTree(List.of("FIRST", "RETIRED")));
        save(endpoint, command).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_DICTIONARY_VALUE_INVALID"));
        maintenance(targetId).andExpect(jsonPath("$." + collection + "[0].revision").value(0))
                .andExpect(jsonPath("$." + collection + "[0].value.length()").value(2))
                .andExpect(jsonPath("$." + collection + "[0].value[0]").value("FIRST"))
                .andExpect(jsonPath("$." + collection + "[0].value[1]").value("SECOND"));
        changes(targetId).andExpect(jsonPath("$.length()").value(1));
    }

    @ParameterizedTest
    @ValueSource(strings = {"SINGLE", "MULTIPLE"})
    void definition_defaults_require_active_codes_in_the_bound_dictionary(String cardinality) throws Exception {
        ObjectNode command = definition(cardinality);
        for (String invalid : List.of("UNKNOWN", "RETIRED", "FOREIGN")) {
            command.set("defaultValue", value(cardinality, invalid));
            create(CONFIG + "/definitions", command).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_DICTIONARY_VALUE_INVALID"));
        }
        // Reusing the same definition code also proves the rejected attempts did not persist it.
        command.set("defaultValue", value(cardinality, "SECOND"));
        created(CONFIG + "/definitions", command);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SINGLE", "MULTIPLE"})
    void assignment_defaults_require_active_codes_in_the_bound_dictionary(String cardinality) throws Exception {
        String definitionId = created(CONFIG + "/definitions", definition(cardinality)).path("id").asString();
        ObjectNode command = assignment(definitionId);
        for (String invalid : List.of("UNKNOWN", "RETIRED", "FOREIGN")) {
            command.set("defaultValue", value(cardinality, invalid));
            create(CONFIG + "/assignments", command).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_DICTIONARY_VALUE_INVALID"));
        }
        command.set("defaultValue", value(cardinality, "SECOND"));
        created(CONFIG + "/assignments", command);
    }

    private JsonNode value(String cardinality, String code) {
        return objectMapper.valueToTree("MULTIPLE".equals(cardinality) ? List.of("FIRST", code) : code);
    }

    private ObjectNode definition(String cardinality) throws Exception {
        ObjectNode command = request().put("code", "TNT.QINGHE-DEMO.DICT." + suffix())
                .put("name", "字典引用属性").put("description", "校验字典引用的有效性")
                .put("dataType", "DICT_REF").put("cardinality", cardinality).put("dictionaryId", dictionaryId)
                .put("variability", "SCOPE_OVERRIDE").put("overridePolicy", "ANY")
                .put("contextBasis", "ORDERING").put("sensitivity", "NORMAL");
        command.set("allowedScopes", objectMapper.valueToTree(List.of("ORGANIZATION")));
        command.set("schema", json("MULTIPLE".equals(cardinality)
                ? "{\"type\":\"array\",\"items\":{\"type\":\"string\"},\"minItems\":1,\"uniqueItems\":true}"
                : "{\"type\":\"string\"}"));
        return command;
    }

    private ObjectNode assignment(String definitionId) {
        return request().put("itemTypeId", "362387869797012").put("definitionId", definitionId)
                .put("required", false).put("widgetType", "DICT_SELECT").put("groupName", "字典引用")
                .put("groupSortOrder", 90).put("attributeSortOrder", 1)
                .put("searchable", false).put("listDisplay", false);
    }

    private JsonNode createDictionary() throws Exception {
        return created("/api/platform/dictionaries", request().put("scopeType", "TENANT")
                .put("categoryId", "9223009648984985598").put("code", "TEST_ATTR_" + suffix())
                .put("name", "属性引用测试字典"));
    }

    private JsonNode addItem(JsonNode dictionary, String code) throws Exception {
        return created("/api/platform/dictionaries/" + dictionary.path("id").asString() + "/items",
                request().put("expectedRevision", dictionary.path("revision").asLong())
                        .put("code", code).put("name", code).put("sortOrder", dictionary.path("items").size()));
    }

    private ObjectNode request() {
        return objectMapper.createObjectNode().put("reason", "验证属性编码必须来自有效字典")
                .put("requestCode", UUID.randomUUID().toString());
    }

    private ResultActions create(String path, ObjectNode command) throws Exception {
        command.put("requestCode", UUID.randomUUID().toString());
        return mockMvc.perform(post(path).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(command.toString()));
    }

    private JsonNode created(String path, ObjectNode command) throws Exception {
        return json(create(path, command).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions save(String endpoint, ObjectNode command) throws Exception {
        command.put("requestCode", UUID.randomUUID().toString());
        return mockMvc.perform(put(ATTRIBUTES + "/" + endpoint).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(command.toString()));
    }

    private ResultActions maintenance(String targetId) throws Exception {
        return mockMvc.perform(get(ATTRIBUTES + "/maintenance").with(rhnWorkContext())
                .param("subjectType", "MEDICATION").param("targetId", targetId)).andExpect(status().isOk());
    }

    private ResultActions changes(String targetId) throws Exception {
        return mockMvc.perform(get(ATTRIBUTES + "/changes").with(rhnWorkContext())
                .param("subjectType", "MEDICATION").param("targetId", targetId)).andExpect(status().isOk());
    }

    private String suffix() {
        return UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}
