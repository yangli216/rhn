package com.rhn;

import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;


import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ResetDatabaseBeforeEachTestMethod
class OutpatientVerticalSliceTest extends RhnIntegrationTestSupport {
    private static final String NATIONAL_ID = "330102199001011234";
    @Autowired
    OutboxEventRepository outboxEventRepository;
    @Autowired
    org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    void generic_medication_prescription_groups_draft_submit_and_cancel_when_inventory_freeze_disabled() throws Exception {
        // Inventory enforcement with the default setting has its own integration suite.
        jdbc.update("update RHN_SYS_PARAM_DEF set JSON_DEFAULT_VAL = 'false' where CD_PARAM_KEY = ?",
                "outpatient.prescription.inventory-freeze.enabled");
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String identitySuffix = "%04d".formatted(Math.floorMod((suffix + "RX").hashCode(), 10000));
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MED-GENERIC-%s","name":"通用名处方测试药品","aliasName":"通用处方药",
                                  "sdMedicationType":"WESTERN","sdDoseForm":"TABLET",
                                  "preparationSpec":"10mg","preparationUnit":"片",
                                  "strengthValue":10,"strengthUnit":"mg","sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                  "skinTestRequired":false,"defaultDose":10,"defaultDoseUnit":"mg",
                                  "defaultRoute":"PO","defaultFrequency":"QD","chronicDiseaseDrug":false,
                                  "singleOrder":false,"sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String residentId = createResidentForOrdering("33010219920404" + identitySuffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode prescription = json(mockMvc.perform(post("/api/encounters/{id}/prescriptions", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"categoryCode\":\"OUTPATIENT\",\"note\":\"通用名处方验证\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.prescriptionNo").value(org.hamcrest.Matchers.startsWith("RX")))
                .andExpect(jsonPath("$.medicationRequests").isEmpty())
                .andReturn().getResponse().getContentAsString());
        String prescriptionId = prescription.get("id").asString();

        JsonNode line = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "prescriptionId":"%s","medicationId":"%s","quantity":14,
                                  "quantityUnit":"片","substitutionAllowed":true,"selfProvided":false,
                                  "allergyReviewConfirmed":true,
                                  "durationValue":14,"durationUnit":"DAY","businessDate":"2026-08-27",
                                  "medicationInstruction":"每日一次"
                                }
                                """.formatted(prescriptionId, medication.get("id").asString())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.prescriptionId").value(prescriptionId))
                .andExpect(jsonPath("$.catalogItemId").doesNotExist())
                .andExpect(jsonPath("$.packageId").doesNotExist())
                .andExpect(jsonPath("$.adoptionId").doesNotExist())
                .andExpect(jsonPath("$.priceId").doesNotExist())
                .andExpect(jsonPath("$.medicationCode").value("MED-GENERIC-" + suffix))
                .andExpect(jsonPath("$.itemCode").value("MED-GENERIC-" + suffix))
                .andExpect(jsonPath("$.quantity").value(14))
                .andExpect(jsonPath("$.baseQuantity").value(14))
                .andExpect(jsonPath("$.doseValue").value(10))
                .andExpect(jsonPath("$.routeCode").value("ORAL"))
                .andExpect(jsonPath("$.frequencyCode").value("QD"))
                .andReturn().getResponse().getContentAsString());

        JsonNode submitted = json(mockMvc.perform(post(
                                "/api/encounters/{encounterId}/prescriptions/{prescriptionId}/submit",
                                encounterId, prescriptionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.medicationRequests[0].status").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "prescriptionId":"%s","medicationId":"%s","quantity":1,
                                  "quantityUnit":"片","substitutionAllowed":true,"selfProvided":false
                                }
                                """.formatted(prescriptionId, medication.get("id").asString())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRESCRIPTION_NOT_EDITABLE"));

        mockMvc.perform(post("/api/encounters/{encounterId}/prescriptions/{prescriptionId}/cancel",
                                encounterId, prescriptionId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"reason":"调整整体处方"}
                                """.formatted(submitted.get("revision").asLong())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.medicationRequests[0].status").value("CANCELLED"))
                .andExpect(jsonPath("$.medicationRequests[0].cancelReason").value("调整整体处方"));

        mockMvc.perform(get("/api/encounters/{id}/prescriptions", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].prescriptionNo").value(prescription.get("prescriptionNo").asString()))
                .andExpect(jsonPath("$[0].medicationRequests[0].id").value(line.get("id").asString()));
    }

    @Test
    void medication_request_freezes_generic_product_package_conversion_and_price_snapshots() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String identitySuffix = "%04d".formatted(Math.floorMod((suffix + "MED").hashCode(), 10000));
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MED-ORDER-%s","name":"处方快照药品","aliasName":"快照药",
                                  "sdMedicationType":"WESTERN","sdDoseForm":"TABLET",
                                  "preparationSpec":"0.5g","preparationUnit":"片",
                                  "strengthValue":0.5,"strengthUnit":"g","sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":true,
                                  "sdAntimicrobialLevel":"NON_RESTRICTED","skinTestRequired":false,
                                  "defaultDose":0.5,"defaultDoseUnit":"g","defaultRoute":"PO",
                                  "defaultFrequency":"BID","chronicDiseaseDrug":false,"singleOrder":false,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode manufacturer = json(mockMvc.perform(post("/api/platform/master-data/manufacturers").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MFR-ORDER-%s","name":"处方测试制药企业","shortName":"测试制药",
                                  "sdManufacturerType":"DRUG","sdProductionPlace":"DOMESTIC",
                                  "countryCode":"CN","address":"测试地址","sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode product = json(mockMvc.perform(post("/api/platform/master-data/medication-products").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "medicationId":"%s","manufacturerId":"%s","code":"MEDP-ORDER-%s",
                                  "name":"处方快照药品 0.5g*20片","unitCode":"片","tradeName":"快照片",
                                  "approvalCode":"国药准字TEST%s","sdMarketStatus":"MARKETED",
                                  "sdProductionPlace":"DOMESTIC","otc":false,"centralPurchase":false,
                                  "importAllowed":false,"traceSplitRequired":false,"orderable":true,
                                  "chargeable":true,"stocked":true,"shelfLifeValue":24,
                                  "sdShelfLifeUnit":"MONTH","sdStatus":"ACTIVE","validFrom":"2026-01-01"
                                }
                                """.formatted(medication.get("id").asString(), manufacturer.get("id").asString(),
                                suffix, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String productId = product.get("id").asString();
        JsonNode itemPackage = json(mockMvc.perform(post(
                                "/api/platform/master-data/catalog-items/{id}/packages", productId).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "unitCode":"盒","unitName":"盒","packageSpec":"20片/盒",
                                  "quantityFactor":20,"sdUsageType":"DISPENSE","barcode":"%s",
                                  "defaultPurchase":false,"defaultSale":true,"defaultDispense":true,
                                  "sdStatus":"ACTIVE","validFrom":"2026-01-01"
                                }
                                """.formatted("690" + Math.floorMod(suffix.hashCode(), 100000000))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String packageId = itemPackage.get("id").asString();

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/{id}/adoptions", productId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","localCode":"DRUG-%s","localName":"机构处方药品",
                                  "orderable":true,"executable":false,"chargeable":true,"purchasable":true,
                                  "stocked":true,"dispensable":true,"returnable":true,
                                  "status":"ACTIVE","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, suffix)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/{id}/prices", productId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","packageId":"%s","priceType":"SALE","price":18.80,
                                  "currencyCode":"CNY","priceDocumentCode":"DRUG-%s","priceReason":"盒装销售价",
                                  "validFrom":"2026-01-01","status":"ACTIVE"
                                }
                                """.formatted(ORGANIZATION, packageId, suffix)))
                .andExpect(status().isCreated());

        String residentId = createResidentForOrdering("33010219890303" + identitySuffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/medication-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","packageId":"%s","quantity":2,
                                  "substitutionAllowed":true,"selfProvided":false,
                                  "allergyReviewConfirmed":true,
                                  "durationValue":5,"durationUnit":"DAY","businessDate":"2026-08-27",
                                  "medicationInstruction":"饭后服用","reason":"门诊处方"
                                }
                                """.formatted(productId, packageId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.medicationCode").value("MED-ORDER-" + suffix))
                .andExpect(jsonPath("$.itemCode").value("MEDP-ORDER-" + suffix))
                .andExpect(jsonPath("$.localCode").value("DRUG-" + suffix))
                .andExpect(jsonPath("$.doseValue").value(0.5))
                .andExpect(jsonPath("$.doseUnit").value("g"))
                .andExpect(jsonPath("$.routeCode").value("ORAL"))
                .andExpect(jsonPath("$.frequencyCode").value("BID"))
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.quantityUnit").value("盒"))
                .andExpect(jsonPath("$.packageFactor").value(20))
                .andExpect(jsonPath("$.baseQuantity").value(40))
                .andExpect(jsonPath("$.baseUnit").value("片"))
                .andExpect(jsonPath("$.priceQuantity").value(2))
                .andExpect(jsonPath("$.unitPrice").value(18.8))
                .andExpect(jsonPath("$.totalAmount").value(37.6))
                .andExpect(jsonPath("$.medicationSnapshot.defaultDose").value(0.5))
                .andExpect(jsonPath("$.itemAttributeSnapshot.subjectType").value("MEDICATION"))
                .andExpect(jsonPath("$.standardMappings").isArray())
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/encounters/{id}/medication-requests", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].baseQuantity").value(40))
                .andExpect(jsonPath("$[0].totalAmount").value(37.6));
        mockMvc.perform(post("/api/encounters/{encounterId}/medication-requests/{requestId}/cancel",
                                encounterId, request.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":%d,\"reason\":\"调整处方\"}"
                                .formatted(request.get("revision").asLong())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("调整处方"));
    }

    @Test
    void service_request_freezes_catalog_adoption_price_attribute_and_mapping_snapshots() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String identitySuffix = "%04d".formatted(Math.floorMod(suffix.hashCode(), 10000));
        JsonNode item = json(mockMvc.perform(post("/api/platform/master-data/services").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"SRV-ORDER-%s","name":"门诊开立快照项目","unitCode":"次",
                                  "orderable":true,"chargeable":true,"sdStatus":"ACTIVE",
                                  "validFrom":"2026-01-01","sdServiceType":"TREATMENT",
                                  "sdUsageType":"OUTPATIENT","medicalTechnology":false,
                                  "combinationItem":false,"singleOrder":true,"pregnancyAlert":false
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String itemId = item.get("id").asString();

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/{id}/adoptions", itemId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","localCode":"OP-%s","localName":"机构开立项目",
                                  "orderable":true,"executable":true,"chargeable":true,
                                  "purchasable":false,"stocked":false,"dispensable":false,"returnable":false,
                                  "status":"ACTIVE","validFrom":"2026-01-01"
                                }
                                """.formatted(ORGANIZATION, suffix)))
                .andExpect(status().isCreated());
        JsonNode priceLifecycle = json(mockMvc.perform(post(
                                "/api/platform/master-data/catalog-lifecycle/catalog-items/{id}/prices", itemId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","priceType":"SALE","price":12.50,
                                  "currencyCode":"CNY","priceDocumentCode":"OP-%s",
                                  "priceReason":"门诊测试价","validFrom":"2026-01-01","status":"ACTIVE"
                                }
                                """.formatted(ORGANIZATION, suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode originalPrice = priceLifecycle.get("currentPrices").get(0);

        String residentId = createResidentForOrdering("33010219881212" + identitySuffix);
        String encounterId = createActiveEncounter(residentId);
        JsonNode request = json(mockMvc.perform(post("/api/encounters/{id}/service-requests", encounterId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "catalogItemId":"%s","quantity":2,"priceType":"SALE",
                                  "businessDate":"2026-08-27","reason":"头晕相关处置",
                                  "clinicalDescription":"门诊诊疗项目开立契约验证"
                                }
                                """.formatted(itemId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.itemCode").value("SRV-ORDER-" + suffix))
                .andExpect(jsonPath("$.localCode").value("OP-" + suffix))
                .andExpect(jsonPath("$.unitPrice").value(12.5))
                .andExpect(jsonPath("$.quantity").value(2))
                .andExpect(jsonPath("$.totalAmount").value(25.0))
                .andExpect(jsonPath("$.itemAttributeHash")
                        .value(org.hamcrest.Matchers.matchesPattern("[0-9a-f]{64}")))
                .andExpect(jsonPath("$.itemAttributeSnapshot.contractVersion").exists())
                .andExpect(jsonPath("$.standardMappings").isArray())
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/prices/{id}/replace",
                                originalPrice.get("id").asString()).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":%d,"organizationId":"%s","priceType":"SALE",
                                  "price":99.00,"currencyCode":"CNY","priceDocumentCode":"OP-NEW-%s",
                                  "priceReason":"后续调价","validFrom":"2026-08-28","status":"ACTIVE"
                                }
                                """.formatted(originalPrice.get("revision").asLong(), ORGANIZATION, suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentPrices[0].price").value(99.0));

        mockMvc.perform(get("/api/encounters/{id}/service-requests", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].itemName").value("门诊开立快照项目"))
                .andExpect(jsonPath("$[0].unitPrice").value(12.5));

        mockMvc.perform(post("/api/encounters/{encounterId}/service-requests/{requestId}/cancel",
                                encounterId, request.get("id").asString())
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {"expectedRevision":%d,"reason":"患者取消"}
                                """.formatted(request.get("revision").asLong())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("患者取消"));
    }

    @Test
    void resident_to_completed_encounter_is_projected_to_health_timeline() throws Exception {
        long outboxCountBefore = outboxEventRepository.countByTenantId(Long.valueOf(TENANT));
        String residentBody = mockMvc.perform(post("/api/residents")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "张建国",
                                  "nationalId": "%s",
                                  "gender": "MALE",
                                  "birthDate": "1990-01-01",
                                  "phone": "13800138000"
                                }
                                """.formatted(NATIONAL_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullName").value("张建国"))
                .andExpect(jsonPath("$.maskedNationalId").value("3301**********1234"))
                .andReturn().getResponse().getContentAsString();

        String residentId = extract(residentBody, "id");
        String encounterBody = mockMvc.perform(post("/api/encounters")
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "residentId": "%s",
                                  "organizationId": "%s",
                                  "departmentId": "%s"
                                }
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REGISTERED"))
                .andReturn().getResponse().getContentAsString();

        String encounterId = extract(encounterBody, "id");
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        mockMvc.perform(put("/api/encounters/{id}/clinical-record", encounterId)
                        .with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "chiefComplaint": "头晕一周",
                                  "systolic": 148,
                                  "diastolic": 92,
                                  "diagnoses": [{"code": "I10", "display": "原发性高血压", "type": "PRIMARY"}]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.diagnoses[0].code").value("I10"));

        String clinicalDocuments = mockMvc.perform(get("/api/clinical-documents")
                        .param("encounterId", encounterId).with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString();
        String clinicalDocumentId = objectMapper.readTree(clinicalDocuments).get(0).get("id").asString();
        mockMvc.perform(post("/api/clinical-documents/{id}/sign", clinicalDocumentId)
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedCurrentVersion\":1,\"signatureMeaning\":\"AUTHOR\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED"));

        mockMvc.perform(post("/api/encounters/{id}/complete", encounterId)
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        mockMvc.perform(get("/api/residents/{id}/timeline", residentId)
                .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(11))
                .andExpect(jsonPath("$[0].eventType").value("ENCOUNTER_COMPLETED"))
                .andExpect(jsonPath("$[1].eventType").value("QUEUE_TICKET_COMPLETED"))
                .andExpect(jsonPath("$[2].eventType").value("CLINICAL_DOCUMENT_SIGNED"))
                .andExpect(jsonPath("$[3].eventType").value("DIAGNOSIS_RECORDED"))
                .andExpect(jsonPath("$[4].details.systolic").value(148))
                .andExpect(jsonPath("$[5].eventType").value("CARE_TASK_READY"));

        var outboxEvents = outboxEventRepository.findByAggregateIdOrderByRecordedAt(Long.valueOf(encounterId));
        assertEquals(5, outboxEvents.size());
        assertEquals(outboxCountBefore + 12, outboxEventRepository.countByTenantId(Long.valueOf(TENANT)));
        assertTrue(outboxEvents.stream().allMatch(event -> event.publicationStatus().equals("PENDING")));
        assertEquals(5, outboxEvents.stream().map(OutboxEvent::eventId).distinct().count());
    }

    @Test
    void duplicate_identity_is_rejected_inside_tenant_but_isolated_between_tenants() throws Exception {
        String identity = "330102197701011121";
        createResident(TENANT, identity).andExpect(status().isCreated());
        createResident(TENANT, identity)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("RESIDENT_DUPLICATE"));
        createResident("362387869790210", identity)
                .andExpect(status().isCreated());
    }

    @Test
    void api_requires_explicit_tenant_context() throws Exception {
        mockMvc.perform(get("/api/session").with(httpBasic("doctor", "test-password")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TENANT_REQUIRED"));
    }

    private org.springframework.test.web.servlet.ResultActions createResident(String tenant, String nationalId)
            throws Exception {
        return mockMvc.perform(post("/api/residents")
                .with(rhn(tenant))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                          "fullName": "王小禾",
                          "nationalId": "%s",
                          "gender": "FEMALE",
                          "birthDate": "1977-01-01",
                          "phone": "13800138001"
                        }
                        """.formatted(nationalId)));
    }

    private String createResidentForOrdering(String nationalId) throws Exception {
        String body = mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "fullName":"目录快照患者","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],"gender":"FEMALE",
                                  "birthDate":"1988-12-12","phone":"13800138009"
                                }
                                """.formatted(nationalId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return extract(body, "id");
    }

    private String createActiveEncounter(String residentId) throws Exception {
        String body = mockMvc.perform(post("/api/encounters").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"residentId":"%s","organizationId":"%s","departmentId":"%s"}
                                """.formatted(residentId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String encounterId = extract(body, "id");
        mockMvc.perform(verifiedEncounterStart(encounterId))
                .andExpect(status().isOk());
        return encounterId;
    }

    private String extract(String json, String field) {
        String marker = "\"" + field + "\":\"";
        int start = json.indexOf(marker) + marker.length();
        return json.substring(start, json.indexOf('"', start));
    }
}
