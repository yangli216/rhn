package com.rhn;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BasicDataCenterFoundationTest extends RhnIntegrationTestSupport {
    @Autowired
    CatalogLifecycleDirectory catalogLifecycleDirectory;

    @Test
    void catalog_lifecycle_preserves_versions_resolves_business_date_and_audits_partial_batches() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode item = json(mockMvc.perform(post("/api/platform/master-data/services").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"SRV-LIFE-%s","name":"生命周期测试项目","unitCode":"次",
                                  "orderable":true,"chargeable":true,"sdStatus":"ACTIVE",
                                  "validFrom":"2026-01-01","sdServiceType":"EXAMINATION",
                                  "sdUsageType":"COMMON","medicalTechnology":true,
                                  "combinationItem":false,"singleOrder":true,"pregnancyAlert":false
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String itemId = item.get("id").asText();

        JsonNode first = json(mockMvc.perform(post(
                                "/api/platform/master-data/catalog-lifecycle/catalog-items/{itemId}/adoptions", itemId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","localCode":"LIFE-A","localName":"机构项目A",
                                  "orderable":true,"executable":true,"chargeable":true,
                                  "purchasable":false,"stocked":false,"dispensable":false,"returnable":false,
                                  "status":"ACTIVE","validFrom":"2026-09-01"
                                }
                                """.formatted(ORGANIZATION)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currentAdoption.localCode").value("LIFE-A"))
                .andReturn().getResponse().getContentAsString());
        JsonNode adoption = first.get("currentAdoption");

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/adoptions/{id}/replace",
                                adoption.get("id").asText()).with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedRevision":%d,"organizationId":"%s",
                                  "localCode":"LIFE-B","localName":"机构项目B",
                                  "orderable":true,"executable":true,"chargeable":true,
                                  "purchasable":false,"stocked":false,"dispensable":false,"returnable":false,
                                  "status":"ACTIVE","validFrom":"2027-01-01"
                                }
                                """.formatted(adoption.get("revision").asLong(), ORGANIZATION)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.adoptionHistory.length()").value(2))
                .andExpect(jsonPath("$.adoptionHistory[?(@.localCode == 'LIFE-A')].sdStatus").value("REPLACED"))
                .andExpect(jsonPath("$.adoptionHistory[?(@.localCode == 'LIFE-A')].validTo").value("2026-12-31"))
                .andExpect(jsonPath("$.currentAdoption.replacesAdoptionId").value(adoption.get("id").asText()));

        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/catalog-items/{itemId}", itemId)
                        .param("organizationId", ORGANIZATION).param("businessDate", "2026-12-01").with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.currentAdoption.localCode").value("LIFE-A"));
        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/catalog-items/{itemId}", itemId)
                        .param("organizationId", ORGANIZATION).param("businessDate", "2027-01-01").with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.currentAdoption.localCode").value("LIFE-B"));

        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/catalog-items/{itemId}/prices", itemId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "organizationId":"%s","priceType":"SALE","price":20.00,
                                  "currencyCode":"CNY","priceDocumentCode":"LIFE-2026",
                                  "priceReason":"首次定价","validFrom":"2026-09-01","status":"ACTIVE"
                                }
                                """.formatted(ORGANIZATION)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.currentPrices[0].price").value(20.0));

        String requestCode = UUID.randomUUID().toString();
        String batchRequest = """
                {
                  "requestCode":"%s","organizationId":"%s","businessDate":"2027-02-01",
                  "entries":[
                    {"catalogItemId":"%s","priceType":"SALE","price":21.00,"currencyCode":"CNY",
                     "priceDocumentCode":"LIFE-2027-A","status":"ACTIVE"},
                    {"catalogItemId":"%s","priceType":"SALE","price":22.00,"currencyCode":"CNY",
                     "priceDocumentCode":"LIFE-2027-B","status":"ACTIVE"}
                  ]
                }
                """.formatted(requestCode, ORGANIZATION, itemId, itemId);
        JsonNode batch = json(mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/price-batches")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content(batchRequest))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PARTIAL"))
                .andExpect(jsonPath("$.succeededRows").value(1))
                .andExpect(jsonPath("$.failedRows").value(1))
                .andExpect(jsonPath("$.rows[0].targetResourceType").value("CATALOG_PRICE"))
                .andExpect(jsonPath("$.rows[1].errorCode").value("BATCH_ROW_INVALID"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/price-batches")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content(batchRequest))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(batch.get("id").asText()));
        mockMvc.perform(post("/api/platform/master-data/catalog-lifecycle/price-batches")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content(batchRequest.replace("21.00", "99.00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CATALOG_CHANGE_REQUEST_REUSED"));
        mockMvc.perform(get("/api/platform/master-data/catalog-lifecycle/batches/{id}", batch.get("id").asText())
                        .with(rhn())).andExpect(status().isOk()).andExpect(jsonPath("$.rows.length()").value(2));
        var operational = catalogLifecycleDirectory.resolve(Long.valueOf(TENANT), Long.valueOf(itemId),
                Long.valueOf(ORGANIZATION), null, "SALE", java.time.LocalDate.parse("2027-02-01"));
        org.assertj.core.api.Assertions.assertThat(operational.adoption().localCode()).isEqualTo("LIFE-B");
        org.assertj.core.api.Assertions.assertThat(operational.price().price()).isEqualByComparingTo("21.00");
    }

    @Test
    void standard_mapping_preserves_history_rejects_overlapping_primary_and_resolves_by_business_date() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/standard-mappings/code-systems")
                        .param("authorityType", "NATIONAL").param("businessDate", "2026-08-27").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'WHO.BD.CS.ICD10')].version").value("2019"))
                .andExpect(jsonPath("$[?(@.code == 'WHO.BD.CS.ICD10')].authorityType").value("NATIONAL"));
        mockMvc.perform(get("/api/platform/master-data/standard-mappings/terms")
                        .param("codeSystemId", "362387869795001").param("query", "高血压")
                        .param("businessDate", "2026-08-27").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("I10"));

        JsonNode first = json(mockMvc.perform(post(
                                "/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "conceptId":"362387869795011","mappingType":"CLINICAL",
                                  "equivalence":"EXACT","primaryMapping":true,
                                  "limitation":"用于诊疗项目临床语义对照","validFrom":"2026-08-27"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.effectiveMappings[0].termCode").value("I10"))
                .andExpect(jsonPath("$.effectiveMappings[0].primaryMapping").value(true))
                .andReturn().getResponse().getContentAsString());
        JsonNode firstMapping = first.get("history").get(0);

        mockMvc.perform(post("/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "conceptId":"362387869795012","mappingType":"CLINICAL",
                                  "equivalence":"RELATED","primaryMapping":true,
                                  "validFrom":"2026-09-01"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEM_MAPPING_PRIMARY_OVERLAP"));

        mockMvc.perform(post("/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "conceptId", "362387869795012", "mappingType", "CLINICAL",
                                "equivalence", "EXACT", "primaryMapping", true,
                                "validFrom", "2027-01-01", "replacesMappingId", firstMapping.get("id").asText(),
                                "expectedReplacesRevision", firstMapping.get("revision").asLong()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.history.length()").value(2))
                .andExpect(jsonPath("$.history[?(@.termCode == 'I10')].status").value("SUPERSEDED"))
                .andExpect(jsonPath("$.history[?(@.termCode == 'I10')].validTo").value("2026-12-31"))
                .andExpect(jsonPath("$.effectiveMappings[0].termCode").value("E11.9"));

        mockMvc.perform(get("/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101")
                        .param("businessDate", "2026-12-01").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.effectiveMappings.length()").value(1))
                .andExpect(jsonPath("$.effectiveMappings[0].termCode").value("I10"));
        mockMvc.perform(get("/api/platform/master-data/standard-mappings/CATALOG_ITEM/362387869795101")
                        .param("businessDate", "2027-01-01").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.effectiveMappings.length()").value(1))
                .andExpect(jsonPath("$.effectiveMappings[0].termCode").value("E11.9"));
    }

    @Test
    void csv_import_batch_preflights_corrects_commits_and_is_idempotent() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String firstCode = "SRV-IMP-" + suffix + "-A";
        String secondCode = "SRV-IMP-" + suffix + "-B";
        String requestCode = UUID.randomUUID().toString();
        String csv = """
                编码,名称,可开立,可收费,状态,生效日期,项目类型,用途类型,医疗技术,组合项目,允许单开,孕期提醒
                %s,批量导入检查A,是,是,ACTIVE,2026-08-27,EXAMINATION,COMMON,否,否,是,否
                1INVALID,批量导入检查B,是,是,ACTIVE,2026-08-27,EXAMINATION,COMMON,否,否,是,否
                """.formatted(firstCode);
        MockMultipartFile file = new MockMultipartFile("file", "service-import.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        JsonNode preflight = json(mockMvc.perform(multipart("/api/platform/master-data/imports/preflight")
                        .file(file).param("importType", "SERVICE").param("requestCode", requestCode).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INVALID"))
                .andExpect(jsonPath("$.totalRows").value(2))
                .andExpect(jsonPath("$.readyRows").value(1))
                .andExpect(jsonPath("$.invalidRows").value(1))
                .andExpect(jsonPath("$.rows[1].errors[?(@.code == 'CODE_FORMAT')]").exists())
                .andReturn().getResponse().getContentAsString());
        String batchId = preflight.get("id").asText();
        JsonNode invalidRow = preflight.get("rows").get(1);

        mockMvc.perform(get("/api/platform/master-data/imports/{batchId}/errors.csv", batchId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("CODE_FORMAT"));

        Map<String, String> corrected = new LinkedHashMap<>();
        corrected.put("编码", secondCode);
        corrected.put("名称", "批量导入检查B");
        corrected.put("可开立", "是");
        corrected.put("可收费", "是");
        corrected.put("状态", "ACTIVE");
        corrected.put("生效日期", "2026-08-27");
        corrected.put("项目类型", "EXAMINATION");
        corrected.put("用途类型", "COMMON");
        corrected.put("医疗技术", "否");
        corrected.put("组合项目", "否");
        corrected.put("允许单开", "是");
        corrected.put("孕期提醒", "否");
        JsonNode correctedBatch = json(mockMvc.perform(put("/api/platform/master-data/imports/{batchId}/rows/{rowId}",
                        batchId, invalidRow.get("id").asText()).with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "expectedRevision", invalidRow.get("revision").asLong(), "values", corrected))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.readyRows").value(2))
                .andExpect(jsonPath("$.invalidRows").value(0))
                .andReturn().getResponse().getContentAsString());
        JsonNode correctedRow = correctedBatch.get("rows").get(1);
        corrected.put("名称", "批量导入检查B修正");
        mockMvc.perform(put("/api/platform/master-data/imports/{batchId}/rows/{rowId}",
                        batchId, correctedRow.get("id").asText()).with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "expectedRevision", correctedRow.get("revision").asLong(), "values", corrected))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.rows[1].source.名称").value("批量导入检查B修正"));

        JsonNode committed = json(mockMvc.perform(post("/api/platform/master-data/imports/{batchId}/commit", batchId)
                        .with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.importedRows").value(2))
                .andExpect(jsonPath("$.rows[0].targetId").isString())
                .andExpect(jsonPath("$.rows[1].targetId").isString())
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/platform/master-data/services").param("query", firstCode).with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("批量导入检查A"));
        mockMvc.perform(get("/api/platform/master-data/services").param("query", secondCode).with(rhn()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("批量导入检查B修正"));

        mockMvc.perform(multipart("/api/platform/master-data/imports/preflight")
                        .file(file).param("importType", "SERVICE").param("requestCode", requestCode).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(committed.get("id").asText()))
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void xlsx_medication_import_uses_the_same_strong_typed_validation_and_commit_path() throws Exception {
        String code = "MED-IMP-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        byte[] content;
        try (var workbook = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
             var output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("药品知识");
            String[] headers = { "编码", "名称", "药品类型", "处方药", "基本药物", "抗菌药",
                    "需要皮试", "慢病用药", "允许单开", "状态" };
            String[] values = { code, "批量导入测试药品", "WESTERN", "是", "否", "否",
                    "否", "否", "是", "ACTIVE" };
            var header = sheet.createRow(0);
            var row = sheet.createRow(1);
            for (int index = 0; index < headers.length; index++) {
                header.createCell(index).setCellValue(headers[index]);
                row.createCell(index).setCellValue(values[index]);
            }
            workbook.write(output);
            content = output.toByteArray();
        }
        MockMultipartFile file = new MockMultipartFile("file", "medication-import.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content);
        JsonNode preflight = json(mockMvc.perform(multipart("/api/platform/master-data/imports/preflight")
                        .file(file).param("importType", "MEDICATION")
                        .param("requestCode", UUID.randomUUID().toString()).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.readyRows").value(1))
                .andExpect(jsonPath("$.rows[0].normalized.medicationType").value("WESTERN"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/platform/master-data/imports/{batchId}/commit", preflight.get("id").asText())
                        .with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.rows[0].targetId").isString());
        mockMvc.perform(get("/api/platform/master-data/medications").param("query", code).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("批量导入测试药品"))
                .andExpect(jsonPath("$[0].sdMedicationType").value("WESTERN"));

        mockMvc.perform(get("/api/platform/master-data/imports/template")
                        .param("importType", "MEDICATION").param("format", "XLSX").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(
                        result.getResponse().getContentAsByteArray()).startsWith((byte) 'P', (byte) 'K'));
    }

    @Test
    void item_type_tree_exposes_platform_service_and_medication_types() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/item-types")
                        .param("subjectType", "CATALOG_ITEM").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'SERVICE')].name").value("诊疗服务"))
                .andExpect(jsonPath("$[?(@.code == 'SERVICE.LAB_TEST')].parentId").value("362387869797002"));

        mockMvc.perform(get("/api/platform/master-data/item-types")
                        .param("subjectType", "MEDICATION").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'MEDICATION.WESTERN')].name").value("西药和化学药"));
    }

    @Test
    void item_attributes_merge_type_schema_and_resolve_scope_override_with_projection() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/item-attributes/schema")
                        .param("subjectType", "MEDICATION")
                        .param("targetId", "362387869795201").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemTypeId").value("362387869797012"))
                .andExpect(jsonPath("$.attributes.length()").value(2))
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.REQUIRED')].storageMode")
                        .value("PROJECTED"));

        mockMvc.perform(post("/api/platform/master-data/item-attributes/resolve")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION",
                                  "targetId":"362387869795201",
                                  "businessDate":"2026-08-27",
                                  "ordering":{"organizationId":"362387869790211","departmentId":"362387869790212"},
                                  "executing":null,
                                  "dispensing":null,
                                  "stocking":null
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.SOLUTION_MODE')].value")
                        .value("DILUTED_SOLUTION"))
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.SOLUTION_MODE')].sourceLevel")
                        .value("ORGANIZATION"))
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.REQUIRED')].value")
                        .value(true))
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.REQUIRED')].sourceLevel")
                        .value("PROJECTED"));

        mockMvc.perform(post("/api/platform/master-data/item-attributes/resolve")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION",
                                  "targetId":"362387869795201",
                                  "businessDate":"2026-08-27",
                                  "ordering":null,
                                  "executing":null,
                                  "dispensing":null,
                                  "stocking":null
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.SOLUTION_MODE')].value")
                        .value("ORIGINAL_SOLUTION"))
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.SOLUTION_MODE')].sourceLevel")
                        .value("TENANT"));
    }

    @Test
    void item_attribute_snapshot_is_canonical_evidenced_and_hash_stable() throws Exception {
        String request = """
                {
                  "subjectType":"MEDICATION","targetId":"362387869795201","businessDate":"2026-08-27",
                  "ordering":{"organizationId":"362387869790211","departmentId":"362387869790212"},
                  "executing":null,"dispensing":null,"stocking":null
                }
                """;
        JsonNode first = json(mockMvc.perform(post("/api/platform/master-data/item-attributes/snapshot")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hashItemAttrSnapshot").isString())
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.contractVersion").value(1))
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.attributes['MED.SKIN_TEST.SOLUTION_MODE'].value")
                        .value("DILUTED_SOLUTION"))
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.attributes['MED.SKIN_TEST.SOLUTION_MODE'].sourceLevel")
                        .value("ORGANIZATION"))
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.attributes['MED.SKIN_TEST.REQUIRED'].sourceLevel")
                        .value("PROJECTED"))
                .andReturn().getResponse().getContentAsString());
        JsonNode second = json(mockMvc.perform(post("/api/platform/master-data/item-attributes/snapshot")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        org.assertj.core.api.Assertions.assertThat(first.get("hashItemAttrSnapshot").asText())
                .hasSize(64).isEqualTo(second.get("hashItemAttrSnapshot").asText());
    }

    @Test
    void laboratory_and_examination_variant_attribute_scenarios_resolve_with_typed_relations() throws Exception {
        mockMvc.perform(post("/api/platform/master-data/item-attributes/resolve")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"CATALOG_ITEM","targetId":"362387869795101",
                                  "businessDate":"2026-08-27","ordering":null,
                                  "executing":{"organizationId":"362387869790211","departmentId":"362387869790212"},
                                  "dispensing":null,"stocking":null
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[?(@.code == 'LAB.SPECIMEN.TRANSPORT_TEMPERATURE')].value")
                        .value(4))
                .andExpect(jsonPath("$.attributes[?(@.code == 'LAB.SPECIMEN.TRANSPORT_TEMPERATURE')].sourceLevel")
                        .value("TENANT"));

        mockMvc.perform(post("/api/platform/master-data/item-attributes/resolve")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"SERVICE_VARIANT","targetId":"362387869797303",
                                  "businessDate":"2026-08-27","ordering":null,
                                  "executing":{"organizationId":"362387869790211","departmentId":"362387869790212"},
                                  "dispensing":null,"stocking":null
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[?(@.code == 'EXAM.VARIANT.PREPARATION_NOTE')].value")
                        .value("检查前保持空腹"))
                .andExpect(jsonPath("$.attributes[?(@.code == 'EXAM.VARIANT.PREPARATION_NOTE')].sourceLevel")
                        .value("TENANT"));
    }

    @Test
    void item_attribute_values_are_validated_versioned_audited_and_resolved() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"MED-ATTR-%s","name":"扩展属性测试药品","aliasName":null,
                                  "sdMedicationType":"WESTERN","sdDoseForm":"TABLET",
                                  "preparationSpec":"1g","preparationUnit":"片",
                                  "strengthValue":1,"strengthUnit":"g","sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                  "sdAntimicrobialLevel":null,"skinTestRequired":true,
                                  "defaultDose":1,"defaultDoseUnit":"g","defaultRoute":"PO",
                                  "defaultFrequency":"QD","chronicDiseaseDrug":false,"singleOrder":true,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String medicationId = medication.get("id").asText();

        mockMvc.perform(get("/api/platform/master-data/item-attributes/maintenance")
                        .param("subjectType", "MEDICATION").param("targetId", medicationId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schema.attributes.length()").value(2))
                .andExpect(jsonPath("$.baseValues.length()").value(0));

        String baseRequest = UUID.randomUUID().toString();
        JsonNode maintenance = json(mockMvc.perform(put("/api/platform/master-data/item-attributes/base-value")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797501","value":"ORIGINAL_SOLUTION",
                                  "validFrom":"2026-08-27","validTo":null,
                                  "reason":"建立药品皮试液租户基线","requestCode":"%s"
                                }
                                """.formatted(medicationId, baseRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baseValues[0].value").value("ORIGINAL_SOLUTION"))
                .andExpect(jsonPath("$.baseValues[0].revision").value(0))
                .andReturn().getResponse().getContentAsString());
        String baseValueId = maintenance.get("baseValues").get(0).get("id").asText();

        mockMvc.perform(put("/api/platform/master-data/item-attributes/base-value")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797501","valueId":"%s","expectedRevision":0,
                                  "value":"UNSUPPORTED","validFrom":"2026-08-27","validTo":null,
                                  "reason":"验证非法枚举不会写入","requestCode":"%s"
                                }
                                """.formatted(medicationId, baseValueId, UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_SCHEMA_VIOLATION"));

        mockMvc.perform(put("/api/platform/master-data/item-attributes/base-value")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797502","value":false,
                                  "validFrom":"2026-08-27","validTo":null,
                                  "reason":"验证投影字段只读","requestCode":"%s"
                                }
                                """.formatted(medicationId, UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_PROJECTED_READ_ONLY"));

        String overrideRequest = UUID.randomUUID().toString();
        JsonNode overrideMaintenance = json(mockMvc.perform(put("/api/platform/master-data/item-attributes/override")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797501","scopeType":"ORGANIZATION",
                                  "organizationId":"%s","departmentId":null,"valueMode":"OVERRIDE",
                                  "value":"DILUTED_SOLUTION","validFrom":"2026-08-27","validTo":null,
                                  "reason":"机构统一采用稀释液配置","requestCode":"%s"
                                }
                                """.formatted(medicationId, ORGANIZATION, overrideRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overrides[0].scopeType").value("ORGANIZATION"))
                .andExpect(jsonPath("$.overrides[0].value").value("DILUTED_SOLUTION"))
                .andReturn().getResponse().getContentAsString());
        String overrideId = overrideMaintenance.get("overrides").get(0).get("id").asText();

        mockMvc.perform(post("/api/platform/master-data/item-attributes/resolve")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s","businessDate":"2026-08-27",
                                  "ordering":{"organizationId":"%s","departmentId":"%s"},
                                  "executing":null,"dispensing":null,"stocking":null
                                }
                                """.formatted(medicationId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.SOLUTION_MODE')].value")
                        .value("DILUTED_SOLUTION"))
                .andExpect(jsonPath("$.attributes[?(@.code == 'MED.SKIN_TEST.SOLUTION_MODE')].sourceLevel")
                        .value("ORGANIZATION"));

        String snapshotRequest = """
                {
                  "subjectType":"MEDICATION","targetId":"%s","businessDate":"2026-08-27",
                  "ordering":{"organizationId":"%s","departmentId":"%s"},
                  "executing":null,"dispensing":null,"stocking":null
                }
                """.formatted(medicationId, ORGANIZATION, DEPARTMENT);
        JsonNode persistedSnapshot = json(mockMvc.perform(post("/api/platform/master-data/item-attributes/snapshot")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content(snapshotRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.attributes['MED.SKIN_TEST.SOLUTION_MODE'].value")
                        .value("DILUTED_SOLUTION"))
                .andReturn().getResponse().getContentAsString());
        String persistedSnapshotJson = persistedSnapshot.get("jsonItemAttrSnapshot").toString();
        String persistedSnapshotHash = persistedSnapshot.get("hashItemAttrSnapshot").asText();

        String updateRequest = UUID.randomUUID().toString();
        mockMvc.perform(put("/api/platform/master-data/item-attributes/override")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s",
                                  "definitionId":"362387869797501","overrideId":"%s","expectedRevision":0,
                                  "scopeType":"ORGANIZATION","organizationId":"%s","departmentId":null,
                                  "valueMode":"OVERRIDE","value":"ORIGINAL_SOLUTION",
                                  "validFrom":"2026-08-27","validTo":null,
                                  "reason":"调整机构皮试液配置并验证旧快照不可变","requestCode":"%s"
                                }
                                """.formatted(medicationId, overrideId, ORGANIZATION, updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overrides[0].revision").value(1))
                .andExpect(jsonPath("$.overrides[0].value").value("ORIGINAL_SOLUTION"));

        JsonNode currentSnapshot = json(mockMvc.perform(post("/api/platform/master-data/item-attributes/snapshot")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content(snapshotRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jsonItemAttrSnapshot.attributes['MED.SKIN_TEST.SOLUTION_MODE'].value")
                        .value("ORIGINAL_SOLUTION"))
                .andReturn().getResponse().getContentAsString());
        org.assertj.core.api.Assertions.assertThat(persistedSnapshot.get("jsonItemAttrSnapshot").toString())
                .isEqualTo(persistedSnapshotJson);
        org.assertj.core.api.Assertions.assertThat(persistedSnapshot.get("hashItemAttrSnapshot").asText())
                .isEqualTo(persistedSnapshotHash)
                .isNotEqualTo(currentSnapshot.get("hashItemAttrSnapshot").asText());

        mockMvc.perform(get("/api/platform/master-data/item-attributes/changes")
                        .param("subjectType", "MEDICATION").param("targetId", medicationId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[?(@.requestCode == '%s')].targetType".formatted(baseRequest))
                        .value("BASE_VALUE"))
                .andExpect(jsonPath("$[?(@.requestCode == '%s')].targetType".formatted(overrideRequest))
                        .value("SCOPE_OVERRIDE"))
                .andExpect(jsonPath("$[?(@.requestCode == '%s')].targetType".formatted(updateRequest))
                        .value("SCOPE_OVERRIDE"));
    }

    @Test
    void disease_search_uses_versioned_terminology_aliases_and_dictionary_text() throws Exception {
        mockMvc.perform(get("/api/platform/terminology/diseases")
                        .param("query", "高血压病").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("I10"))
                .andExpect(jsonPath("$[0].systemVersion").value("2019"))
                .andExpect(jsonPath("$[0].sdConceptType").value("DISEASE"))
                .andExpect(jsonPath("$[0].sdConceptTypeText").value("疾病"))
                .andExpect(jsonPath("$[0].sdDiagnosisDomain").value("WESTERN_MEDICINE"))
                .andExpect(jsonPath("$[0].sdDiagnosisDomainText").value("西医诊断"))
                .andExpect(jsonPath("$[0].managementPrograms[0].code").value("CHRONIC_HYPERTENSION"))
                .andExpect(jsonPath("$[0].managementPrograms[0].sdManagementTypeText").value("慢病管理"))
                .andExpect(jsonPath("$[0].aliases[0].name").value("高血压病"));

        mockMvc.perform(get("/api/platform/terminology/diseases")
                        .param("query", "肝阳上亢").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("GY_SK_ZHENG"))
                .andExpect(jsonPath("$[0].sdDiagnosisDomain").value("TCM_SYNDROME"))
                .andExpect(jsonPath("$[0].sdDiagnosisDomainText").value("中医证候"));
    }

    @Test
    void disease_management_programs_support_multi_member_configuration_and_reporting_metadata() throws Exception {
        JsonNode created = json(mockMvc.perform(post("/api/platform/terminology/disease-management-programs")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "productScope":false,"code":"SPECIAL_TEST_REGISTRY","name":"专项登记测试",
                                  "sdManagementType":"SPECIAL_REGISTRY","sdTriggerAction":"PROMPT_CONFIRMATION",
                                  "description":"用于验证多疾病归类","effectiveFrom":"2026-09-01"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sdManagementTypeText").value("专项登记"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/platform/terminology/disease-management-programs/{id}/members",
                                created.get("id").asText()).with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":%d,"conceptIds":["362387869795011","362387869795012"]}
                                """.formatted(created.get("revision").asLong())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members.length()").value(2))
                .andExpect(jsonPath("$.members[?(@.code == 'I10')].display").value("原发性高血压"))
                .andExpect(jsonPath("$.members[?(@.code == 'E11.9')].display").value("2型糖尿病，不伴并发症"));

        mockMvc.perform(get("/api/platform/terminology/disease-management-programs").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code == 'NOTIFIABLE_DISEASE')].reportCardType")
                        .value("INFECTIOUS_DISEASE"));
    }

    @Test
    void services_and_medications_keep_org_adoption_price_product_and_package_separate() throws Exception {
        mockMvc.perform(get("/api/platform/master-data/services")
                        .param("query", "血细胞分析").param("organizationId", ORGANIZATION).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sdServiceTypeText").exists())
                .andExpect(jsonPath("$[0].organizationAdoption.organizationId").value(ORGANIZATION))
                .andExpect(jsonPath("$[0].prices[0].sdPriceTypeText").value("销售价"));

        mockMvc.perform(get("/api/platform/master-data/services")
                        .param("query", "血细胞分析").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].laboratory.sdLaboratoryMethodText").value("血液学检测"))
                .andExpect(jsonPath("$[0].laboratory.specimens[0].specimenItemId")
                        .value("362387869797111"));

        mockMvc.perform(get("/api/platform/master-data/services")
                        .param("query", "腹部超声").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].examination.sdExaminationTypeText").value("超声检查"))
                .andExpect(jsonPath("$[0].examination.bodySiteRequired").value(true))
                .andExpect(jsonPath("$[0].examination.variants[0].code").value("ABDOMEN"))
                .andExpect(jsonPath("$[0].examination.variants[0].sdMethodTypeText").value("常规方式"));

        mockMvc.perform(get("/api/platform/master-data/medications")
                        .param("query", "阿莫西林").param("organizationId", ORGANIZATION).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sdMedicationTypeText").value("西药"))
                .andExpect(jsonPath("$[0].products[0].manufacturerName").value("示范制药有限公司"))
                .andExpect(jsonPath("$[0].products[0].packages[0].quantityFactor").value(24))
                .andExpect(jsonPath("$[0].products[0].organizationAdoption.dispensable").value(true));
    }

    @Test
    void service_creation_persists_catalog_and_strong_typed_service_detail() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode created = json(mockMvc.perform(post("/api/platform/master-data/services")
                        .param("organizationId", ORGANIZATION).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"SRV-NEW-%s",
                                  "name":"动态心电图检查",
                                  "unitCode":"次",
                                  "orderable":true,
                                  "chargeable":true,
                                  "sdStatus":"ACTIVE",
                                  "validFrom":"2026-08-27",
                                  "sdServiceType":"EXAMINATION",
                                  "serviceSubtype":"FUNCTION",
                                  "sdUsageType":"COMMON",
                                  "medicalTechnology":true,
                                  "combinationItem":false,
                                  "singleOrder":true,
                                  "sdDuplicateRule":"WARN",
                                  "multiSitePrice":30.00,
                                  "freeSiteCount":1,
                                  "maxBodySiteCount":4,
                                  "mutualRecognitionCode":"MR-ECG-24H",
                                  "pregnancyAlert":false
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.itemTypeId").value("362387869797004"))
                .andExpect(jsonPath("$.sdServiceTypeText").value("检查"))
                .andExpect(jsonPath("$.sdDuplicateRuleText").value("提醒后允许"))
                .andExpect(jsonPath("$.multiSitePrice").value(30.0))
                .andExpect(jsonPath("$.freeSiteCount").value(1))
                .andExpect(jsonPath("$.maxBodySiteCount").value(4))
                .andExpect(jsonPath("$.mutualRecognitionCode").value("MR-ECG-24H"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(get("/api/platform/master-data/services")
                        .param("query", created.get("code").asText()).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("动态心电图检查"))
                .andExpect(jsonPath("$[0].sdStatusText").value("有效"));
    }

    @Test
    void medication_creation_persists_safety_and_default_order_fields() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"MED-NEW-%s",
                                  "name":"头孢呋辛酯片",
                                  "aliasName":"头孢呋辛",
                                  "sdMedicationType":"WESTERN",
                                  "sdDoseForm":"TABLET",
                                  "preparationSpec":"0.25g",
                                  "preparationUnit":"片",
                                  "strengthValue":0.25,
                                  "strengthUnit":"g",
                                  "sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,
                                  "essentialDrug":false,
                                  "antimicrobial":true,
                                  "sdAntimicrobialLevel":"RESTRICTED",
                                  "skinTestRequired":false,
                                  "defaultDose":0.25,
                                  "defaultDoseUnit":"g",
                                  "defaultRoute":"PO",
                                  "defaultFrequency":"BID",
                                  "chronicDiseaseDrug":false,
                                  "singleOrder":false,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.itemTypeId").value("362387869797012"))
                .andExpect(jsonPath("$.sdStorageTypeText").value("常温"))
                .andExpect(jsonPath("$.sdAntimicrobialLevelText").value("限制使用级"))
                .andExpect(jsonPath("$.defaultDose").value(0.25))
                .andExpect(jsonPath("$.defaultDoseUnit").value("g"))
                .andExpect(jsonPath("$.defaultRoute").value("PO"))
                .andExpect(jsonPath("$.defaultFrequency").value("BID"));
    }

    @Test
    void non_antimicrobial_cannot_carry_an_antimicrobial_level() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"MED-INVALID-%s",
                                  "name":"错误药品配置",
                                  "aliasName":null,
                                  "sdMedicationType":"WESTERN",
                                  "sdDoseForm":null,
                                  "preparationSpec":null,
                                  "preparationUnit":null,
                                  "strengthValue":null,
                                  "strengthUnit":null,
                                  "sdStorageType":null,
                                  "prescriptionDrug":false,
                                  "essentialDrug":false,
                                  "antimicrobial":false,
                                  "sdAntimicrobialLevel":"RESTRICTED",
                                  "skinTestRequired":false,
                                  "defaultDose":null,
                                  "defaultDoseUnit":null,
                                  "defaultRoute":null,
                                  "defaultFrequency":null,
                                  "chronicDiseaseDrug":false,
                                  "singleOrder":false,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MEDICATION_ANTIMICROBIAL_LEVEL_CONFLICT"));
    }

    @Test
    void medication_type_controls_specialized_attributes_and_is_immutable() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();

        mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"HERBAL-INVALID-%s","name":"错误抗菌草药","aliasName":null,
                                  "sdMedicationType":"HERBAL","sdDoseForm":"GRANULE",
                                  "preparationSpec":"净制","preparationUnit":"g",
                                  "strengthValue":null,"strengthUnit":null,"sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":true,
                                  "sdAntimicrobialLevel":null,"skinTestRequired":false,
                                  "defaultDose":10,"defaultDoseUnit":"g","defaultRoute":"煎服",
                                  "defaultFrequency":"QD","chronicDiseaseDrug":false,"singleOrder":true,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MEDICATION_ANTIMICROBIAL_TYPE_INVALID"));

        mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"VACCINE-INVALID-%s","name":"错误频次疫苗","aliasName":null,
                                  "sdMedicationType":"VACCINE","sdDoseForm":"INJECTION",
                                  "preparationSpec":"0.5ml/支","preparationUnit":"支",
                                  "strengthValue":0.5,"strengthUnit":"ml","sdStorageType":"REFRIGERATED",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                  "sdAntimicrobialLevel":null,"skinTestRequired":false,
                                  "defaultDose":0.5,"defaultDoseUnit":"ml","defaultRoute":"肌内注射",
                                  "defaultFrequency":"每月一次","chronicDiseaseDrug":false,"singleOrder":true,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MEDICATION_VACCINE_FREQUENCY_INVALID"));

        JsonNode herbal = json(mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "code":"HERBAL-VALID-%s","name":"类型锁定草药","aliasName":null,
                                  "sdMedicationType":"HERBAL","sdDoseForm":"GRANULE",
                                  "preparationSpec":"切片","preparationUnit":"g",
                                  "strengthValue":null,"strengthUnit":null,"sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                  "sdAntimicrobialLevel":null,"skinTestRequired":false,
                                  "defaultDose":10,"defaultDoseUnit":"g","defaultRoute":"煎服",
                                  "defaultFrequency":"QD","chronicDiseaseDrug":false,"singleOrder":true,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.itemTypeId").value("362387869797014"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/platform/master-data/medications/{id}", herbal.get("id").asText())
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "expectedRevision":0,
                                  "code":"HERBAL-VALID-%s","name":"类型锁定草药","aliasName":null,
                                  "sdMedicationType":"WESTERN","sdDoseForm":"GRANULE",
                                  "preparationSpec":"切片","preparationUnit":"g",
                                  "strengthValue":null,"strengthUnit":null,"sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                  "sdAntimicrobialLevel":null,"skinTestRequired":false,
                                  "defaultDose":10,"defaultDoseUnit":"g","defaultRoute":"煎服",
                                  "defaultFrequency":"QD","chronicDiseaseDrug":false,"singleOrder":true,
                                  "sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MEDICATION_TYPE_IMMUTABLE"));
    }

    @Test
    void tenant_attribute_definitions_and_type_assignments_are_configurable_isolated_and_audited() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        int attributeOrder = 1000 + Math.abs(suffix.hashCode() % 1000000);

        mockMvc.perform(get("/api/platform/master-data/item-attribute-configurations")
                        .param("subjectType", "MEDICATION").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantNamespace").value("TNT.QINGHE-DEMO."))
                .andExpect(jsonPath("$.itemTypes[?(@.code == 'MEDICATION.WESTERN')].id")
                        .value("362387869797012"));

        String definitionRequest = UUID.randomUUID().toString();
        JsonNode definition = json(mockMvc.perform(post(
                                "/api/platform/master-data/item-attribute-configurations/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"TNT.QINGHE-DEMO.MED.LOCAL_NOTE.%s",
                                  "name":"科室用药提示","description":"由具体开立科室维护的本地提示。",
                                  "dataType":"TEXT","cardinality":"SINGLE","dictionaryId":null,"unitCode":null,
                                  "schema":{"type":["string","null"],"maxLength":200},"defaultValue":null,
                                  "variability":"LOCAL_ONLY","overridePolicy":"NO_OVERRIDE",
                                  "allowedScopes":["DEPARTMENT"],"contextBasis":"ORDERING",
                                  "sensitivity":"NORMAL","reason":"建立租户科室扩展属性","requestCode":"%s"
                                }
                                """.formatted(suffix, definitionRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.scopeType").value("TENANT"))
                .andExpect(jsonPath("$.editable").value(true))
                .andReturn().getResponse().getContentAsString());
        String definitionId = definition.get("id").asText();

        mockMvc.perform(post("/api/platform/master-data/item-attribute-configurations/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"TNT.QINGHE-DEMO.MED.LOCAL_NOTE.%s",
                                  "name":"科室用药提示","description":"由具体开立科室维护的本地提示。",
                                  "dataType":"TEXT","cardinality":"SINGLE","dictionaryId":null,"unitCode":null,
                                  "schema":{"type":["string","null"],"maxLength":200},"defaultValue":null,
                                  "variability":"LOCAL_ONLY","overridePolicy":"NO_OVERRIDE",
                                  "allowedScopes":["DEPARTMENT"],"contextBasis":"ORDERING",
                                  "sensitivity":"NORMAL","reason":"建立租户科室扩展属性","requestCode":"%s"
                                }
                                """.formatted(suffix, definitionRequest)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(definitionId));

        mockMvc.perform(post("/api/platform/master-data/item-attribute-configurations/definitions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MED.INVALID.%s","name":"非法命名空间","description":"用于校验。",
                                  "dataType":"TEXT","cardinality":"SINGLE","schema":{"type":"string"},
                                  "variability":"BASE_ONLY","overridePolicy":"NO_OVERRIDE","allowedScopes":[],
                                  "contextBasis":"NONE","sensitivity":"NORMAL","reason":"验证命名空间",
                                  "requestCode":"%s"
                                }
                                """.formatted(suffix, UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_NAMESPACE_REQUIRED"));

        String assignmentRequest = UUID.randomUUID().toString();
        JsonNode assignment = json(mockMvc.perform(post(
                                "/api/platform/master-data/item-attribute-configurations/assignments")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "itemTypeId":"362387869797012","definitionId":"%s","required":false,
                                  "defaultValue":null,"widgetType":"INPUT","groupName":"机构个性化",
                                  "groupSortOrder":90,"attributeSortOrder":%d,
                                  "visibleCondition":null,"requiredCondition":null,
                                  "searchable":false,"listDisplay":false,
                                  "reason":"装配到西药类型","requestCode":"%s"
                                }
                                """.formatted(definitionId, attributeOrder, assignmentRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.itemTypeId").value("362387869797012"))
                .andExpect(jsonPath("$.definitionId").value(definitionId))
                .andReturn().getResponse().getContentAsString());
        String assignmentId = assignment.get("id").asText();

        JsonNode medication = json(mockMvc.perform(post("/api/platform/master-data/medications")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "code":"MED-CFG-%s","name":"租户属性测试药品","aliasName":null,
                                  "sdMedicationType":"WESTERN","sdDoseForm":"TABLET",
                                  "preparationSpec":"1g","preparationUnit":"片","strengthValue":1,
                                  "strengthUnit":"g","sdStorageType":"ROOM_TEMPERATURE",
                                  "prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,
                                  "sdAntimicrobialLevel":null,"skinTestRequired":false,"defaultDose":1,
                                  "defaultDoseUnit":"g","defaultRoute":"PO","defaultFrequency":"QD",
                                  "chronicDiseaseDrug":false,"singleOrder":true,"sdStatus":"ACTIVE"
                                }
                                """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String medicationId = medication.get("id").asText();

        mockMvc.perform(get("/api/platform/master-data/item-attributes/maintenance")
                        .param("subjectType", "MEDICATION").param("targetId", medicationId).with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schema.attributes[?(@.definitionId == '%s')].code".formatted(definitionId))
                        .value("TNT.QINGHE-DEMO.MED.LOCAL_NOTE." + suffix));

        mockMvc.perform(put("/api/platform/master-data/item-attributes/base-value")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s","definitionId":"%s",
                                  "value":"不可写入公共值","validFrom":"2026-08-27","validTo":null,
                                  "reason":"验证 LOCAL_ONLY 边界","requestCode":"%s"
                                }
                                """.formatted(medicationId, definitionId, UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_BASE_VALUE_NOT_ALLOWED"));

        mockMvc.perform(put("/api/platform/master-data/item-attributes/override")
                        .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s","definitionId":"%s",
                                  "scopeType":"DEPARTMENT","organizationId":"%s","departmentId":"%s",
                                  "valueMode":"EXPLICIT_NULL","value":null,
                                  "validFrom":"2026-08-27","validTo":null,
                                  "reason":"科室明确不显示本地提示","requestCode":"%s"
                                }
                                """.formatted(medicationId, definitionId, ORGANIZATION, DEPARTMENT, UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overrides[?(@.definitionId == '%s')].valueMode".formatted(definitionId))
                        .value("EXPLICIT_NULL"));

        mockMvc.perform(post("/api/platform/master-data/item-attributes/resolve")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "subjectType":"MEDICATION","targetId":"%s","businessDate":"2026-08-27",
                                  "ordering":{"organizationId":"%s","departmentId":"%s"},
                                  "executing":null,"dispensing":null,"stocking":null
                                }
                                """.formatted(medicationId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attributes[?(@.definitionId == '%s')].valueMode".formatted(definitionId))
                        .value("EXPLICIT_NULL"));

        mockMvc.perform(put("/api/platform/master-data/item-attribute-configurations/definitions/{id}", definitionId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":0,"name":"科室用药提示","description":"由具体开立科室维护的本地提示。",
                                  "dataType":"INTEGER","cardinality":"SINGLE","dictionaryId":null,"unitCode":null,
                                  "schema":{"type":"integer"},"defaultValue":null,"variability":"LOCAL_ONLY",
                                  "overridePolicy":"NO_OVERRIDE","allowedScopes":["DEPARTMENT"],
                                  "contextBasis":"ORDERING","sensitivity":"NORMAL",
                                  "reason":"验证已使用属性禁止改变结构","requestCode":"%s"
                                }
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEM_ATTRIBUTE_DEFINITION_IN_USE"));

        mockMvc.perform(get("/api/platform/master-data/item-attribute-configurations/changes").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.requestCode == '%s')].targetType".formatted(definitionRequest))
                        .value("DEFINITION"))
                .andExpect(jsonPath("$[?(@.requestCode == '%s')].targetType".formatted(assignmentRequest))
                        .value("TYPE_ASSIGNMENT"));

        mockMvc.perform(get("/api/platform/master-data/item-attribute-configurations")
                        .param("subjectType", "MEDICATION").with(rhn("362387869790210")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.definitions[?(@.id == '%s')]".formatted(definitionId)).isEmpty())
                .andExpect(jsonPath("$.assignments[?(@.id == '%s')]".formatted(assignmentId)).isEmpty());

        mockMvc.perform(post("/api/platform/master-data/item-attribute-configurations/assignments/{id}/status", assignmentId)
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                                {
                                  "expectedRevision":0,"status":"INACTIVE",
                                  "reason":"结束隔离测试并避免影响其他西药快照场景","requestCode":"%s"
                                }
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
    }
}
