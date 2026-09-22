package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
class PharmacyIntakeReviewTest extends RhnIntegrationTestSupport {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.rhn.quality.medication.api.MedicationRuleAuthoringAi improvementAi;

    private static final String PRODUCT_ID = "362387869795113";
    private static final String MEDICATION_ID = "362387869795203";
    private static final String PACKAGE_ID = "362387869795403";

    @Test
    void non_virtual_stock_site_requires_department() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","code":"NO-DEPT-%s","name":"未绑定科室药房",
                                  "siteType":"PHARMACY","serviceScope":"OUTPATIENT","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("STOCK_SITE_DEPARTMENT_REQUIRED"));
    }

    @Test
    void department_inventory_profile_inherits_department_identity_and_is_unique() throws Exception {
        String body = """
                {
                  "organizationId":"%s","departmentId":"%s",
                  "code":"IGNORED-CODE","name":"不应形成第二套名称",
                  "siteType":"DEPARTMENT_STORE","serviceScope":"MIXED",
                  "validFrom":"2026-08-28"
                }
                """.formatted(ORGANIZATION, DEPARTMENT);
        mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("GENERAL"))
                .andExpect(jsonPath("$.name").value("全科门诊"))
                .andExpect(jsonPath("$.validFrom").value("2026-01-01"));

        mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STOCK_SITE_DEPARTMENT_DUPLICATE"));
    }

    @Test
    void stock_items_can_be_imported_as_one_atomic_batch() throws Exception {
        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s","code":"IGNORED","name":"IGNORED",
                                  "siteType":"DEPARTMENT_STORE","serviceScope":"MIXED","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items/batch", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"items":[
                                  {"catalogItemId":"362387869795111","packageId":"362387869795401","issuePolicy":"FEFO",
                                   "negativeAllowed":false,"lotRequired":true,"traceRequired":true,"splitAllowed":false,
                                   "coldChain":false,"controlled":false,"highAlert":false},
                                  {"catalogItemId":"362387869795112","packageId":"362387869795402","issuePolicy":"FEFO",
                                   "negativeAllowed":false,"lotRequired":true,"traceRequired":true,"splitAllowed":false,
                                   "coldChain":false,"controlled":false,"highAlert":false}
                                ]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(2));

        mockMvc.perform(post("/api/pharmacy/stock-sites/{siteId}/stock-items/batch", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"items":[
                                  {"catalogItemId":"362387869795113","packageId":"362387869795403","issuePolicy":"FEFO",
                                   "negativeAllowed":false,"lotRequired":true,"traceRequired":true,"splitAllowed":false,
                                   "coldChain":false,"controlled":false,"highAlert":false},
                                  {"catalogItemId":"362387869795111","packageId":"362387869795401","issuePolicy":"FEFO",
                                   "negativeAllowed":false,"lotRequired":true,"traceRequired":true,"splitAllowed":false,
                                   "coldChain":false,"controlled":false,"highAlert":false}
                                ]}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("STOCK_ITEM_DUPLICATE"));

        mockMvc.perform(get("/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.catalogItemId == '362387869795113')]").isEmpty());
    }

    @Test
    void outpatient_request_intake_preserves_attribute_snapshot_and_records_append_only_reviews() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        String residentId = createResident(suffix);
        String encounterId = createActiveEncounter(residentId);
        recordInpatientNoKnownDrugAllergy(residentId, encounterId);
        linkStandardMedication("STD-04D8635B1192769EBA24309B", "DRUG-AML");
        JsonNode request = createMedicationRequest(encounterId);
        OverrideRecord changedOverride = changeCurrentAttributeAfterOrdering(suffix, request.get("itemAttributeHash").asString());

        mockMvc.perform(get("/api/pharmacy/inbox").with(rhnWorkContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.request.id == '%s')].taskId".formatted(request.get("id").asString()))
                        .value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.nullValue())));

        JsonNode site = json(mockMvc.perform(post("/api/pharmacy/stock-sites").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","departmentId":"%s",
                                  "code":"OPH-%s","name":"门诊药房%s",
                                  "siteType":"PHARMACY","serviceScope":"OUTPATIENT",
                                  "validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, DEPARTMENT, suffix, suffix)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        JsonNode stockItem = json(mockMvc.perform(post(
                                "/api/pharmacy/stock-sites/{siteId}/stock-items", site.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","issuePolicy":"FEFO",
                                  "negativeAllowed":false,"lotRequired":true,"traceRequired":true,
                                  "splitAllowed":true,"coldChain":false,"controlled":false,
                                  "highAlert":false
                                }
                                """.formatted(PRODUCT_ID, PACKAGE_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.medicationId").value(MEDICATION_ID))
                .andReturn().getResponse().getContentAsString());

        JsonNode task = json(mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake",
                                request.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"stockItemId":"%s","description":"窗口接方"}
                                """.formatted(stockItem.get("id").asString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.lines[0].requestId").value(request.get("id").asString()))
                .andExpect(jsonPath("$.lines[0].plannedQuantity").value(2))
                .andExpect(jsonPath("$.lines[0].dispenseUnitCode").value("BOX"))
                .andExpect(jsonPath("$.lines[0].baseQuantityFactor").value(14))
                .andExpect(jsonPath("$.lines[0].split").value(false))
                .andExpect(jsonPath("$.lines[0].itemAttributeHash")
                        .value(request.get("itemAttributeHash").asString()))
                .andReturn().getResponse().getContentAsString());
        assertEquals(request.get("itemAttributeSnapshot"), task.get("lines").get(0).get("itemAttributeSnapshot"));
        assertEquals("医生已核对重复开立：合成业务测试说明", task.path("prescriptionSafety").get(0).path("doctorReason").asString());
        assertEquals(request.path("prescriptionId").asString(), task.path("prescriptionSafety").get(0).path("prescriptionId").asString());
        assertEquals(2, task.path("prescriptionSafety").get(0).path("medications").size());
        assertEquals("SHADOW", task.path("prescriptionSafety").get(0).path("evaluation").path("mode").asString());
        org.assertj.core.api.Assertions.assertThat(task.path("prescriptionSafety").get(0).path("evaluation").path("findings").toString())
                .contains("QMED.EXACT_GENERIC_DUPLICATE");

        mockMvc.perform(post("/api/pharmacy/requests/{requestId}/intake", request.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"stockItemId\":\"%s\"}".formatted(stockItem.get("id").asString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(task.get("id").asString()))
                .andExpect(jsonPath("$.lines.length()").value(1));

        Reviewer clinicalReviewer = createReviewer(suffix + "C", "CLINICAL");
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "result":"PASS",
                                  "pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"
                                }
                                """.formatted(clinicalReviewer.practitionerId(), clinicalReviewer.assignmentId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PHARMACY_POSITION_TYPE_REQUIRED"));

        Reviewer reviewer = createReviewer(suffix);
        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "result":"INTERVENE","reasonCode":"DOSE_CONFIRM",
                                  "description":"请确认剂量后继续",
                                  "pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"
                                }
                                """.formatted(reviewer.practitionerId(), reviewer.assignmentId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INTERVENTION"))
                .andExpect(jsonPath("$.lines[0].status").value("PENDING"))
                .andExpect(jsonPath("$.reviews.length()").value(1))
                .andExpect(jsonPath("$.reviews[0].result").value("INTERVENE"));

        mockMvc.perform(post("/api/pharmacy/dispense-tasks/{taskId}/reviews", task.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "result":"PASS",
                                  "pharmacistPractitionerId":"%s","reviewerAssignmentId":"%s"
                                }
                                """.formatted(reviewer.practitionerId(), reviewer.assignmentId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY_TO_PICK"))
                .andExpect(jsonPath("$.lines[0].status").value("READY"))
                .andExpect(jsonPath("$.reviews.length()").value(2))
                .andExpect(jsonPath("$.reviews[0].result").value("INTERVENE"))
                .andExpect(jsonPath("$.reviews[1].result").value("PASS"))
                .andExpect(jsonPath("$.prescriptionSafety[0].doctorReason").value("医生已核对重复开立：合成业务测试说明"))
                .andExpect(jsonPath("$.reviews[0].description").value("请确认剂量后继续"))
                .andExpect(jsonPath("$.lines[0].itemAttributeHash")
                        .value(request.get("itemAttributeHash").asString()));

        // A real saved pharmacist review reaches the existing AI intake and knowledge workflow.
        JsonNode reviewed = json(mockMvc.perform(get("/api/pharmacy/dispense-tasks/{id}", task.get("id").asString())
                .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String reviewId = reviewed.path("reviews").get(0).path("id").asString();
        String findingId = reviewed.path("prescriptionSafety").get(0).path("evaluation").path("findings").get(0).path("findingId").asString();
        String improvementPath = "/api/quality/pharmacy-tasks/" + task.get("id").asString() + "/reviews/" + reviewId + "/improvement-intakes";
        mockMvc.perform(get(improvementPath + "/source").queryParam("findingId", findingId).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pharmacy.review.description").value("请确认剂量后继续"))
                .andExpect(jsonPath("$.pharmacy.finding.findingId").value(findingId));
        mockMvc.perform(get(improvementPath + "/source").queryParam("findingId", "1").with(rhnWorkContext()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_PHARMACY_FINDING"));
        org.mockito.Mockito.when(improvementAi.status()).thenReturn(new com.rhn.quality.medication.api.MedicationRuleAuthoringAi.Status(true,"isolated-test","test"));
        org.mockito.Mockito.when(improvementAi.generate(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyString()))
                .thenReturn("{\"intents\":[{\"kind\":\"DUPLICATE_THERAPY\",\"source\":\"requirement\",\"quote\":\"重复用药\",\"scope\":\"UNSPECIFIED\",\"conditions\":[],\"questions\":[]}]}");
        String input = "{\"intake\":{\"requirement\":\"核查重复用药例外\",\"answers\":[]},\"findingId\":\"" + findingId + "\",\"confirmed\":true}";
        mockMvc.perform(post(improvementPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(input.replace("true", "false")))
                .andExpect(status().isBadRequest());
        JsonNode analysis = json(mockMvc.perform(post(improvementPath).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(input))
                .andExpect(status().isOk()).andExpect(jsonPath("$.result.status").value("ANALYZED")).andReturn().getResponse().getContentAsString());
        var modelInput = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(improvementAi).generate(org.mockito.ArgumentMatchers.anyString(),modelInput.capture(),org.mockito.ArgumentMatchers.anyString());
        org.assertj.core.api.Assertions.assertThat(modelInput.getValue()).contains("核查重复用药例外")
                .doesNotContain("请确认剂量后继续", "医生已核对", residentId, encounterId);
        mockMvc.perform(get("/api/quality/medication-rule-intakes/" + analysis.path("id").asString() + "/feedback-origin").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pharmacy.review.id").value(reviewId));
        mockMvc.perform(get(improvementPath).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        var knowledgeInput = new com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Save(0,
                MedicationKnowledgeDraftModelTest.duplicate(),"根据药师意见建立待核对草稿",null,Long.valueOf(analysis.path("id").asString()));
        JsonNode knowledge = json(mockMvc.perform(post("/api/quality/medication-knowledge-drafts").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(knowledgeInput)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.saved.status").value("DRAFT")).andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/quality/medication-knowledge-drafts/" + knowledge.path("saved").path("id").asString() + "/versions/1/intake-origin").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(analysis.path("id").asString()));

        mockMvc.perform(get("/api/pharmacy/inbox").with(rhnWorkContext())
                        .queryParam("organizationId", ORGANIZATION))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.request.id == '%s')].taskStatus"
                        .formatted(request.get("id").asString())).value("READY_TO_PICK"))
                .andExpect(jsonPath("$[?(@.request.id == '%s')].latestReviewResult"
                        .formatted(request.get("id").asString())).value("PASS"))
                .andExpect(jsonPath("$[?(@.request.id == '%s')].clinicalContext.encounterId"
                        .formatted(request.get("id").asString())).value(encounterId))
                .andExpect(jsonPath("$[?(@.request.id == '%s')].clinicalContext.encounterNo"
                        .formatted(request.get("id").asString())).isNotEmpty())
                .andExpect(jsonPath("$[?(@.request.id == '%s')].clinicalContext.diagnoses"
                        .formatted(request.get("id").asString())).isArray())
                .andExpect(jsonPath("$[?(@.request.id == '%s')].prescriptionRequests[0].id"
                        .formatted(request.get("id").asString())).value(request.get("id").asString()));

        disableOverride(changedOverride, suffix);
    }

    private OverrideRecord changeCurrentAttributeAfterOrdering(String suffix, String orderedHash) throws Exception {
        JsonNode maintenance = json(mockMvc.perform(put("/api/platform/master-data/item-attributes/override")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797501","scopeType":"ORGANIZATION",
                                  "organizationId":"%s","valueMode":"OVERRIDE","value":"DILUTED_SOLUTION",
                                  "validFrom":"2026-08-27","reason":"验证开立后配置变化不改写药房任务",
                                  "requestCode":"PHARM-OVERRIDE-%s"
                                }
                                """.formatted(MEDICATION_ID, ORGANIZATION, suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overrides[0].value").value("DILUTED_SOLUTION"))
                .andReturn().getResponse().getContentAsString());
        JsonNode override = maintenance.get("overrides").get(0);
        JsonNode current = json(mockMvc.perform(post("/api/platform/master-data/item-attributes/snapshot")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s","businessDate":"2026-08-27",
                                  "ordering":{"organizationId":"%s","departmentId":"%s"},
                                  "executing":null,"dispensing":null,"stocking":null
                                }
                                """.formatted(MEDICATION_ID, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.attributes['MED.SKIN_TEST.SOLUTION_MODE'].value")
                        .value("DILUTED_SOLUTION"))
                .andReturn().getResponse().getContentAsString());
        assertNotEquals(orderedHash, current.get("hashItemAttrSnapshot").asString());
        return new OverrideRecord(override.get("id").asString(), override.get("revision").asLong());
    }

    private void disableOverride(OverrideRecord value, String suffix) throws Exception {
        mockMvc.perform(post("/api/platform/master-data/item-attributes/override/disable")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797501","recordId":"%s","expectedRevision":%d,
                                  "reason":"药房跨模块验收完成后清理测试覆盖值",
                                  "requestCode":"PHARM-OVERRIDE-CLEAN-%s"
                                }
                                """.formatted(MEDICATION_ID, value.id(), value.revision(), suffix)))
                .andExpect(status().isOk());
    }

    private JsonNode createMedicationRequest(String encounterId) throws Exception {
        var rx=json(mockMvc.perform(post("/api/encounters/{id}/prescriptions",encounterId)
            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"categoryCode\":\"WESTERN\"}"))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        for(int i=0;i<2;i++) {
            mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                    {"prescriptionId":"%s","catalogItemId":"%s","packageId":"%s","quantity":2,
                     "substitutionAllowed":false,"selfProvided":false,"allergyReviewConfirmed":true,
                     "doseValue":1,"doseUnit":"片","routeCode":"PO","frequencyCode":"QD","durationValue":7,"durationUnit":"DAY",
                     "businessDate":"2026-08-27","reason":"合成重复用药及药房处理验收"}
                    """.formatted(rx.path("id").asString(),PRODUCT_ID,PACKAGE_ID)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"));
        }
        var submitted=json(mockMvc.perform(post("/api/encounters/{e}/prescriptions/{p}/submit",encounterId,rx.path("id").asString())
            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                {"expectedRevision":%s,"reason":"医生已核对重复开立：合成业务测试说明"}
                """.formatted(rx.path("revision").asLong())))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return submitted.path("medicationRequests").get(0);
    }

    private String createResident(String suffix) throws Exception {
        String digits = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        return json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"药房验收患者","identifiers":[{"system":"9","value":"PHARMACY-%s","useType":"SECONDARY"}],
                                  "gender":"FEMALE","birthDate":"1988-12-12"
                                }
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString();
    }

    private String createActiveEncounter(String residentId) throws Exception {
        JsonNode encounter = json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString()))
                .andExpect(status().isOk());
        return encounter.get("id").asString();
    }

    private Reviewer createReviewer(String suffix) throws Exception {
        return createReviewer(suffix, "PHARMACY");
    }

    private Reviewer createReviewer(String suffix, String positionType) throws Exception {
        JsonNode practitioner = json(mockMvc.perform(post("/api/platform/practitioners").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"code":"PHARM-%s","fullName":"验收药师%s","sdPractGender":"FEMALE"}
                                """.formatted(suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode position = json(mockMvc.perform(post("/api/platform/positions").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"PHARM-POS-%s","name":"门诊药师%s",
                                  "sdPositionType":"%s","dutyDescription":"门诊审方"
                                }
                                """.formatted(suffix, suffix, positionType)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode employment = json(mockMvc.perform(post("/api/platform/employments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "practitionerId":"%s","organizationId":"%s","code":"PHARM-EMP-%s",
                                  "sdEmploymentType":"PERMANENT","primaryEmployment":true,
                                  "hireDate":"2026-01-01"
                                }
                                """.formatted(practitioner.get("id").asString(), ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode assignment = json(mockMvc.perform(post("/api/platform/assignments").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "employmentId":"%s","organizationId":"%s","departmentId":"%s",
                                  "positionId":"%s","code":"PHARM-ASN-%s","sdAssignmentType":"PRIMARY",
                                  "primaryAssignment":true,"validFrom":"2026-01-01"
                                }
                                """.formatted(employment.get("id").asString(), ORGANIZATION, DEPARTMENT,
                                position.get("id").asString(), suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        return new Reviewer(practitioner.get("id").asString(), assignment.get("id").asString());
    }

    private record Reviewer(String practitionerId, String assignmentId) {}
    private record OverrideRecord(String id, long revision) {}
}
