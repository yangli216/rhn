package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MedicalOperationsMasterDataTest extends RhnIntegrationTestSupport {

    @Test
    void resolves_multi_site_attachments_tube_split_and_tube_surcharge() throws Exception {
        JsonNode examination = json(mockMvc.perform(get(
                        "/api/platform/master-data/operations/services/362387869795103/clinical-configuration").with(rhn()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        examination = json(mockMvc.perform(put(
                        "/api/platform/master-data/operations/services/362387869795103/examination-profile")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"examinationType":"ULTRASOUND","bodySiteRequired":true,
                         "multiBodySite":true,"maxBodySiteCount":4,"preparationDescription":"按部位检查",
                         "sitePricingMode":"BASE_PLUS_ITEM","includedSiteCount":1,
                         "additionalSiteItemId":"362387869795101","additionalSiteQuantity":1,
                         "maxChargeableSiteCount":3}
                        """.formatted(examination.get("examination").get("revision").asLong())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.examination.sitePricingMode").value("BASE_PLUS_ITEM"))
                .andExpect(jsonPath("$.examination.additionalSiteItemName").exists())
                .andReturn().getResponse().getContentAsString());

        JsonNode attachmentConfiguration = json(mockMvc.perform(post(
                        "/api/platform/master-data/operations/services/362387869795103/examination-attachments")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"attachmentCatalogItemId":"362387869795102","triggerType":"MULTI_SITE",
                         "quantityBasis":"PER_SITE","quantity":1,"requiredAttachment":true,
                         "separatelyChargeable":true,"sortOrder":10,"description":"多部位附件",
                         "status":"ACTIVE"}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.examination.attachments[0].attachmentItemName").exists())
                .andReturn().getResponse().getContentAsString());
        JsonNode attachment = attachmentConfiguration.get("examination").get("attachments").get(0);

        mockMvc.perform(post("/api/platform/master-data/operations/services/362387869795103/examination-charge-plan")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"bodySiteCodes":["LEFT","RIGHT","ABDOMEN"],"selectedAttachmentIds":["%s"]}
                        """.formatted(attachment.get("id").asText())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.siteCount").value(3))
                .andExpect(jsonPath("$.extraSiteCount").value(2))
                .andExpect(jsonPath("$.lines[1].sourceType").value("MULTI_SITE_ITEM"))
                .andExpect(jsonPath("$.lines[1].quantity").value(2))
                .andExpect(jsonPath("$.lines[2].sourceType").value("ATTACHMENT"))
                .andExpect(jsonPath("$.lines[2].quantity").value(3));

        JsonNode laboratory = json(mockMvc.perform(get(
                        "/api/platform/master-data/operations/services/362387869795101/clinical-configuration").with(rhn()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        JsonNode specimen = laboratory.get("laboratory").get("specimens").get(0);
        mockMvc.perform(put("/api/platform/master-data/operations/services/362387869795101/specimens/"
                        + specimen.get("id").asText()).with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"specimenItemId":"%s","containerItemId":"%s",
                         "minimumQuantity":2,"minimumQuantityUnit":"ML","defaultSpecimen":true,
                         "requiredSpecimen":true,"sortOrder":10,"collectionDescription":"EDTA分管",
                         "status":"ACTIVE","tubeGroupCode":"EDTA_HEMATOLOGY",
                         "tubeSharingMode":"BY_TEST_COUNT","baseTubeCount":1,"maxTestsPerTube":3,
                         "tubeChargeMode":"PER_TUBE","tubeChargeItemId":"362387869795102",
                         "includedTubeCount":0,"tubeChargeQuantity":1}
                        """.formatted(specimen.get("revision").asLong(), specimen.get("specimenItemId").asText(),
                        specimen.get("containerItemId").asText())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.laboratory.specimens[0].tubeGroupCode").value("EDTA_HEMATOLOGY"));

        mockMvc.perform(post("/api/platform/master-data/operations/laboratory-tube-plan")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"items":[{"serviceId":"362387869795101","specimenConfigurationId":"%s","quantity":5}]}
                        """.formatted(specimen.get("id").asText())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].tubeCount").value(2))
                .andExpect(jsonPath("$.groups[0].sharingMode").value("BY_TEST_COUNT"))
                .andExpect(jsonPath("$.chargeLines[0].sourceType").value("TUBE_SURCHARGE"))
                .andExpect(jsonPath("$.chargeLines[0].quantity").value(2));
    }

    @Test
    void maintains_clinical_profiles_groups_supplies_and_unit_conversion() throws Exception {
        JsonNode laboratory = json(mockMvc.perform(get(
                        "/api/platform/master-data/operations/services/362387869795101/clinical-configuration").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.laboratory.specimens[0].specimenName").value("全血"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(put("/api/platform/master-data/operations/services/362387869795101/laboratory-profile")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"laboratoryMethod":"HEMATOLOGY","reportDuration":2,
                         "reportDurationUnit":"H","fastingRequired":false,"pointOfCare":false,
                         "collectionDescription":"采集后2小时内送检"}
                        """.formatted(laboratory.get("laboratory").get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.laboratory.reportDuration").value(2));

        mockMvc.perform(post("/api/platform/master-data/operations/services/362387869795101/specimens")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"specimenItemId":"362387869797113","containerItemId":"362387869797121",
                         "minimumQuantity":1,"minimumQuantityUnit":"ML","defaultSpecimen":false,
                         "requiredSpecimen":false,"sortOrder":20,"collectionDescription":"备选血浆标本","status":"ACTIVE"}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.laboratory.specimens[1].specimenName").value("血浆"));

        JsonNode inactiveDefault = json(mockMvc.perform(post(
                        "/api/platform/master-data/operations/services/362387869795101/specimens")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"specimenItemId":"362387869797114","containerItemId":"362387869797122",
                         "minimumQuantity":1,"minimumQuantityUnit":"ML","defaultSpecimen":true,
                         "requiredSpecimen":false,"sortOrder":30,"collectionDescription":"停用的默认血清标本",
                         "status":"INACTIVE"}
                        """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode inactiveDefaultRow = inactiveDefault.get("laboratory").get("specimens").get(2);
        mockMvc.perform(post("/api/platform/master-data/operations/services/362387869795101/specimens/%s/status"
                        .formatted(inactiveDefaultRow.get("id").asText())).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"status":"ACTIVE"}
                        """.formatted(inactiveDefaultRow.get("revision").asLong())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LAB_DEFAULT_SPECIMEN_DUPLICATE"));

        JsonNode examination = json(mockMvc.perform(get(
                        "/api/platform/master-data/operations/services/362387869795103/clinical-configuration").with(rhn()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(put("/api/platform/master-data/operations/services/362387869795103/examination-profile")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"examinationType":"ULTRASOUND","bodySiteRequired":true,
                         "multiBodySite":true,"maxBodySiteCount":3,"preparationDescription":"空腹检查"}
                        """.formatted(examination.get("examination").get("revision").asLong())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.examination.maxBodySiteCount").value(3));
        mockMvc.perform(post("/api/platform/master-data/operations/services/362387869795103/examination-variants")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"ABDOMEN_ENHANCED","name":"腹部增强","methodType":"ENHANCED",
                         "bodySiteRequired":true,"sortOrder":20,"status":"ACTIVE"}
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.examination.variants[1].name").value("腹部增强"));

        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        JsonNode supply = json(mockMvc.perform(post("/api/platform/master-data/operations/supplies")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"supplyType":"CONSUMABLE","code":"SUP-%s","name":"一次性无菌注射器",
                         "unitCode":"EA","orderable":true,"chargeable":true,"stocked":true,"status":"ACTIVE",
                         "validFrom":"2026-01-01","udiDi":"UDI-%s","genericName":"注射器","modelName":"5mL",
                         "specification":"5mL/支","deviceClass":"II","highValue":false,"implant":false,
                         "intervention":false,"sterile":true,"singleUse":true,
                         "registrationCode":"国械注准测试%s"}
                        """.formatted(suffix, suffix, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.supplyType").value("CONSUMABLE"))
                .andReturn().getResponse().getContentAsString());

        supply = json(mockMvc.perform(put("/api/platform/master-data/operations/supplies/" + supply.get("id").asText())
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"supplyType":"DEVICE","code":"SUP-%s","name":"一次性无菌注射器（器械）",
                         "unitCode":"EA","orderable":true,"chargeable":true,"stocked":true,"status":"ACTIVE",
                         "validFrom":"2026-01-01","udiDi":"UDI-%s","genericCode":"SYRINGE",
                         "genericName":"注射器","modelName":"5mL","specification":"5mL/支","materialType":"聚丙烯",
                         "deviceClass":"II","highValue":false,"implant":false,"intervention":false,
                         "sterile":true,"singleUse":true,"registrationCode":"国械注准测试%s",
                         "registrationName":"一次性使用无菌注射器","registrantName":"测试医疗器械公司",
                         "registrationFrom":"2026-01-01","registrationTo":"2030-12-31",
                         "structureDescription":"外套、芯杆和活塞","scopeDescription":"临床注射",
                         "instruction":"一次性使用"}
                        """.formatted(supply.get("revision").asLong(), suffix, suffix, suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.supplyType").value("DEVICE"))
                .andExpect(jsonPath("$.registrationName").value("一次性使用无菌注射器"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/platform/master-data/operations/supplies")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"supplyType":"CONSUMABLE","code":"SUP-DUP-%s","name":"重复注册证耗材",
                         "unitCode":"EA","orderable":true,"chargeable":true,"stocked":true,"status":"ACTIVE",
                         "validFrom":"2026-01-01","highValue":false,"implant":false,"intervention":false,
                         "sterile":true,"singleUse":true,"registrationCode":"国械注准测试%s"}
                        """.formatted(suffix, suffix)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SUPPLY_REGISTRATION_DUPLICATE"));

        JsonNode group = json(mockMvc.perform(post("/api/platform/master-data/operations/item-groups")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"LIS-%s","name":"入院检验组套","groupType":"LIS","pointOfCare":false,
                         "status":"ACTIVE","validFrom":"2026-01-01","members":[
                           {"catalogItemId":"362387869795101","sortOrder":10,"quantity":1,"requiredMember":true},
                           {"catalogItemId":"362387869795102","sortOrder":20,"quantity":1,"requiredMember":true}]}
                        """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.members.length()").value(2))
                .andExpect(jsonPath("$.members[0].serviceType").value("LABORATORY"))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(put("/api/platform/master-data/operations/item-groups/" + group.get("id").asText())
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"code":"LIS-%s","name":"入院检验组套（修订）",
                         "groupType":"LIS","usageType":"INPATIENT","pointOfCare":false,"status":"ACTIVE",
                         "validFrom":"2026-01-01","members":[
                           {"catalogItemId":"362387869795101","sortOrder":10,"quantity":2,"unitCode":"EA","requiredMember":true,"memberDescription":"采集两管"},
                           {"catalogItemId":"362387869795102","sortOrder":20,"quantity":1,"requiredMember":false}]}
                        """.formatted(group.get("revision").asLong(), suffix)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("入院检验组套（修订）"))
                .andExpect(jsonPath("$.members[0].quantity").value(2))
                .andExpect(jsonPath("$.members[0].unitCode").value("EA"));

        JsonNode conversion = json(mockMvc.perform(post("/api/platform/master-data/operations/unit-conversions")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"catalogItemId":"%s","fromUnitCode":"BOX","toUnitCode":"EA","factor":50,
                         "validFrom":"2026-01-01","status":"ACTIVE"}
                        """.formatted(supply.get("id").asText())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.scopeCode").value("ITEM:" + supply.get("id").asText()))
                .andReturn().getResponse().getContentAsString());
        conversion = json(mockMvc.perform(put("/api/platform/master-data/operations/unit-conversions/" + conversion.get("id").asText())
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"catalogItemId":"%s","fromUnitCode":"BOX","toUnitCode":"EA",
                         "factor":40,"offset":0,"validFrom":"2026-01-01","status":"ACTIVE"}
                        """.formatted(conversion.get("revision").asLong(), supply.get("id").asText())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.factor").value(40))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/platform/master-data/operations/unit-conversions/convert")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"quantity":2,"fromUnitCode":"BOX","toUnitCode":"EA",
                         "catalogItemId":"%s","effectiveDate":"2026-08-29"}
                        """.formatted(supply.get("id").asText())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.result").value(80))
                .andExpect(jsonPath("$.path[0]").value("BOX"))
                .andExpect(jsonPath("$.path[1]").value("EA"));

        JsonNode unit = json(mockMvc.perform(post("/api/platform/master-data/operations/units")
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"code":"VIAL%s","name":"测试瓶","symbol":"瓶","dimension":"COUNT",
                         "decimalScale":0,"status":"ACTIVE"}
                        """.formatted(suffix)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        mockMvc.perform(put("/api/platform/master-data/operations/units/" + unit.get("id").asText())
                        .with(rhn()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"expectedRevision":%d,"code":"VIAL%s","name":"西林瓶","symbol":"瓶",
                         "dimension":"COUNT","decimalScale":0,"status":"INACTIVE"}
                        """.formatted(unit.get("revision").asLong(), suffix)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("西林瓶"))
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }
}
