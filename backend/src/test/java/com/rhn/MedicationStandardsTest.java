package com.rhn;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.application.StandardMedicationCatalogService;
import com.rhn.quality.medication.domain.rule.StandardReferenceDuplicateRule;
import com.rhn.quality.medication.domain.rule.MissingSafetyDataException;
import com.rhn.shared.json.JsonCodec;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.util.List;
import static com.rhn.quality.MedicationSafetyFixtures.*;
import static com.rhn.outpatient.api.MedicationSafetyDecision.Status.WARN;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class MedicationStandardsTest extends RhnIntegrationTestSupport {
    private static final String BASE = "/api/platform/master-data";
    private static final String SPEC = "STD-9405B86DD5B404C44E1B92B5";
    @Autowired JsonCodec codec;
    @Autowired StandardMedicationCatalogService references;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired com.rhn.platform.masterdata.application.MedicationStandardReadinessService readiness;

    @Test void readiness_uses_full_active_inventory_and_keeps_evidence_separate_from_identity() throws Exception {
        var linked = linkStandardMedication(SPEC, "MED-2026-W006-04");
        int count = jdbc.queryForObject("select count(*) from RHN_BD_MED where ID_TNT=? and SD_STATUS='ACTIVE'", Integer.class, Long.valueOf(TENANT));
        assertThat(count).isGreaterThan(40);
        var result = json(mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext()).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary.totalActive").value(count))
                .andExpect(jsonPath("$.summary.referenceStatuses.LINKED").isNumber())
                .andExpect(jsonPath("$.totalElements").value(count)).andExpect(jsonPath("$.content.length()").value(1))
                .andReturn().getResponse().getContentAsString());
        long sum = 0;
        for (var value : result.path("summary").path("referenceStatuses")) sum += value.asLong();
        assertThat(sum).isEqualTo(count);
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext())
                .param("query", linked.path("code").asString()).param("filter", "SOURCE_UNVERIFIED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary.totalActive").value(count))
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].standardReference.status").value("LINKED"))
                .andExpect(jsonPath("$.content[0].standardReference.sourceVerificationStatus").value("UNVERIFIED"))
                .andExpect(jsonPath("$.content[0].presentationConversionStatus").value("COMPUTABLE"))
                .andExpect(jsonPath("$.content[0].conversionReasons").isEmpty());
        assertThat(readiness.inspect(-1L, "", "ALL", 0, 20).summary().totalActive()).isZero();
        assertThat(readiness.inspect(-1L, "", "ALL", 0, 20).content()).isEmpty();
    }

    @Test void readiness_distinguishes_concentration_from_undefined_container_conversion() throws Exception {
        var linked = linkStandardMedication("STD-01DA2F4B12655FB389688C18", "MED-2026-W016-01");
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext())
                .param("query", linked.path("code").asString()).param("filter", "CONCENTRATION_AVAILABLE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].presentationConversionStatus").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.content[0].clinicalConversion.status").value("COMPUTABLE"))
                .andExpect(jsonPath("$.content[0].clinicalConversion.inputUnit").value("mL"))
                .andExpect(jsonPath("$.content[0].clinicalConversion.basis").value("REFERENCE_MASS_PER_VOLUME"));
    }

    @Test void readiness_classifies_duplicates_across_pages_and_then_reports_the_occupied_standard() throws Exception {
        long original = 362387880000024L;
        long other = jdbc.queryForObject("select min(ID_MED) from RHN_BD_MED where ID_TNT=? and ID_MED<>?", Long.class, Long.valueOf(TENANT), original);
        var spec = references.specification(SPEC);
        jdbc.update("update RHN_BD_MED set CD_MED='DUPLICATE-LOCAL', NA_MED=?, NA_ALIAS=null, SD_MED_TYPE=?, DOSE_FORM=?, PREP_SPEC=?, PREP_UNIT=?, QTY_STRNTH_VAL=null, STRNTH_UNIT=null where ID_MED=?",
                spec.path("name").asString(), spec.path("medicationType").asString(), spec.path("doseForm").asString(),
                spec.path("specification").asString(), spec.path("presentationUnit").asString(), other);
        var duplicate = readiness.inspect(Long.valueOf(TENANT), "DUPLICATE-LOCAL", "DUPLICATE_LOCAL", 0, 1);
        assertThat(duplicate.content()).hasSize(1);
        assertThat(duplicate.content().getFirst().matching().consistentCount()).isEqualTo(1);
        assertThat(duplicate.summary().matchingStatuses().get("DUPLICATE_LOCAL")).isGreaterThanOrEqualTo(2);
        var summary = references.summary();
        medicationSources.saveAndFlush(new com.rhn.platform.masterdata.domain.MedicationStandardSource(Long.valueOf(TENANT), original,
                summary.path("catalogId").asString(), summary.path("catalogVersion").asString(), spec.path("entryId").asString(),
                SPEC, summary.path("contentHash").asString(), 1L));
        assertThat(readiness.inspect(Long.valueOf(TENANT), "DUPLICATE-LOCAL", "TARGET_IN_USE", 0, 1).content()).hasSize(1);
        jdbc.update("update RHN_BD_MED set DOSE_FORM='INJECTION' where ID_MED=?", other);
        assertThat(readiness.inspect(Long.valueOf(TENANT), "DUPLICATE-LOCAL", "IDENTITY_MISMATCH", 0, 1).content()).hasSize(1);
        jdbc.update("update RHN_BD_MED set NA_MED='无标准名称' where ID_MED=?", other);
        assertThat(readiness.inspect(Long.valueOf(TENANT), "DUPLICATE-LOCAL", "NO_CANDIDATE", 0, 1).content()).hasSize(1);
        assertThat(readiness.inspect(-1L, "", "DUPLICATE_LOCAL", 0, 1).content()).isEmpty();
    }

    @Test void readiness_reports_drift_missing_specification_and_inactive_exclusion() throws Exception {
        var linked = linkStandardMedication(SPEC, "MED-2026-W006-04");
        long id = linked.path("id").asLong(); String code = linked.path("code").asString();
        jdbc.update("update RHN_BD_MED set PREP_SPEC=? where ID_MED=?", "0.5g", id);
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext()).param("query", code).param("filter", "MISMATCH"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].presentationConversionStatus").value("NOT_ASSESSED"));
        jdbc.update("update RHN_BD_MED_STD_SOURCE set CD_STD_SPEC=? where ID_MED=?", "MISSING-SPECIFICATION", id);
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext()).param("query", code))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].standardReference.status").value("STALE"))
                .andExpect(jsonPath("$.content[0].standardReference.issues[0]").value("STANDARD_REFERENCE_SPECIFICATION_UNAVAILABLE"));
        jdbc.update("update RHN_BD_MED set SD_STATUS=? where ID_MED=?", "INACTIVE", id);
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext()).param("query", code))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test void readiness_rejects_invalid_filters_and_pages_and_handles_empty_pages() throws Exception {
        for (String parameter : List.of("filter", "size", "page")) {
            mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext()).param(parameter, "-1"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDICATION_READINESS_QUERY_INVALID"));
        }
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext()).param("page", "2147483647"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").header("X-Tenant-Id", TENANT)).andExpect(status().isUnauthorized());
    }

    @Test void readiness_does_not_count_ambiguous_identity_as_verified_or_convertible() throws Exception {
        var linked = linkStandardMedication(SPEC, "MED-2026-W006-04");
        var summary = references.summary();
        medicationSources.saveAndFlush(new com.rhn.platform.masterdata.domain.MedicationStandardSource(Long.valueOf(TENANT),
                linked.path("id").asLong(), summary.path("catalogId").asString(), summary.path("catalogVersion").asString(),
                "SECOND-ENTRY", "SECOND-SPEC", summary.path("contentHash").asString(), 1L));
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext())
                .param("query", linked.path("code").asString()).param("filter", "AMBIGUOUS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].standardReference.status").value("AMBIGUOUS"))
                .andExpect(jsonPath("$.content[0].presentationConversionStatus").value("NOT_ASSESSED"));
        mockMvc.perform(get(BASE+"/clinical-semantics/readiness").with(rhnWorkContext())
                .param("query", linked.path("code").asString()).param("filter", "SOURCE_UNVERIFIED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }

    private ObjectNode input() {
        return (ObjectNode) json("""
          {"standardSpecificationId":"%s","code":"STANDARD-TEST","name":"本院显示名称","sdMedicationType":"WESTERN",
           "sdDoseForm":"CAPSULE","preparationSpec":"0.25g","preparationUnit":"粒","strengthValue":250,"strengthUnit":"mg",
           "defaultDose":1,"defaultDoseUnit":"粒","defaultRoute":"PO","defaultFrequency":"BID","sdStatus":"ACTIVE",
           "singleOrder":true,"prescriptionDrug":true,"essentialDrug":false,"antimicrobial":false,"skinTestRequired":false,"chronicDiseaseDrug":false}
          """.formatted(SPEC));
    }
    @Test void all_new_medication_paths_require_reference_and_reject_identity_or_strength_drift() throws Exception {
        var body = input(); body.remove("standardSpecificationId");
        mockMvc.perform(post(BASE+"/medications").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDICATION_STANDARD_REQUIRED"));
        body = input(); body.put("preparationSpec", "0.5g");
        mockMvc.perform(post(BASE+"/medications").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDICATION_STANDARD_IDENTITY_MISMATCH"));
        body = input(); body.put("strengthValue", 500);
        mockMvc.perform(post(BASE+"/medications").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDICATION_STANDARD_STRENGTH_MISMATCH"));
        body = input(); body.put("defaultDoseUnit", "随意单位");
        mockMvc.perform(post(BASE+"/medications").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDICATION_STANDARD_DOSE_UNIT_INVALID"));
        var created = json(mockMvc.perform(post(BASE+"/medications").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(input().toString()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.standardReference.specificationId").value(SPEC))
                .andReturn().getResponse().getContentAsString());
        body=input(); body.put("expectedRevision",created.path("revision").asLong()); body.put("preparationSpec","0.5g");
        mockMvc.perform(put(BASE+"/medications/"+created.path("id").asString()).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MEDICATION_STANDARD_IDENTITY_MISMATCH"));
        body=input(); body.put("code","ANOTHER-LOCAL-CODE");
        mockMvc.perform(post(BASE+"/medications").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STANDARD_MEDICATION_REUSE_REQUIRED"));
    }

    @Test void legacy_drift_is_not_treated_as_a_valid_standard_reference() throws Exception {
        var linked = linkStandardMedication(SPEC, "MED-2026-W006-04");
        jdbc.update("update RHN_BD_MED set PREP_SPEC=? where ID_MED=?", "0.5g", linked.path("id").asLong());
        mockMvc.perform(get(BASE+"/medications").param("query",linked.path("code").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].standardReference.status").value("MISMATCH"));
    }
    @Test void products_cannot_be_created_under_an_unmapped_legacy_medication() throws Exception {
        var manufacturer=json(mockMvc.perform(get(BASE+"/manufacturers").with(rhnWorkContext()))
                .andReturn().getResponse().getContentAsString()).get(0).path("id").asString();
        mockMvc.perform(post(BASE+"/medication-products").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("""
          {"medicationId":"362387869795203","manufacturerId":"%s","code":"UNMAPPED-PRODUCT","sdStatus":"ACTIVE","validFrom":"2020-01-01",
           "otc":false,"centralPurchase":false,"importAllowed":false,"traceSplitRequired":false,"orderable":true,"chargeable":true,"stocked":false}
          """.formatted(manufacturer))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MEDICATION_PRODUCT_STANDARD_REQUIRED"));
    }

    @Test void import_preflight_rejects_rows_without_a_standard_specification() throws Exception {
        var file = new org.springframework.mock.web.MockMultipartFile("file", "medications.csv", "text/csv",
                "编码,名称,药品类型,处方药,基本药物,抗菌药,需要皮试,慢病用药,允许单开,状态\nNO-STANDARD,无标准关联药品,WESTERN,是,否,否,否,否,是,ACTIVE\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mockMvc.perform(multipart(BASE+"/imports/preflight").file(file).param("importType", "MEDICATION")
                .param("requestCode", java.util.UUID.randomUUID().toString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INVALID"))
                .andExpect(jsonPath("$.rows[0].errors[0].field").value("standardSpecificationId"));
    }

    @Test void exposes_standard_vocabulary_and_keeps_frequency_aliases_out_of_identity() throws Exception {
        mockMvc.perform(get(BASE+"/clinical-semantics/standards").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.doseUnits[?(@.code=='mg')].id").value("UCUM:mg"))
                .andExpect(jsonPath("$.frequencies[?(@.code=='BID')].standard.conceptId").value("TIMES_PER_DAY:2/1:DAY"));
        var daily = ClinicalMedicationStandards.frequency(frequency("TIMES_PER_PERIOD",2,"1","D"));
        var hours = ClinicalMedicationStandards.frequency(frequency("TIMES_PER_PERIOD",2,"24","H"));
        assertThat(daily.conceptId()).isEqualTo(hours.conceptId());
        assertThat(daily.conceptId()).isNotEqualTo(ClinicalMedicationStandards.frequency(frequency("FIXED_INTERVAL",1,"12","H")).conceptId());
    }

    @Test void dose_conversion_requires_explicit_dimensions_and_presentation_strength() {
        var ref=reference(SPEC); var bid=ClinicalMedicationStandards.frequency(frequency("TIMES_PER_PERIOD",2,"1","D"));
        var result=ClinicalMedicationStandards.dose(BigDecimal.ONE,"粒",ref,bid);
        assertThat(result.singleDose()).isEqualByComparingTo("0.25");
        assertThat(result.averageDailyDose()).isEqualByComparingTo("0.5");
        assertThat(result.unit()).isEqualTo("g");
        assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE,"盒",ref,bid).status()).isEqualTo("UNAVAILABLE");
        assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE,"IU",ref,bid).status()).isEqualTo("UNAVAILABLE");
        assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE,"粒",null,bid).status()).isEqualTo("UNAVAILABLE");
        var prn=ClinicalMedicationStandards.frequency(frequency("PRN",1,"1","D"));
        assertThat(ClinicalMedicationStandards.dose(BigDecimal.ONE,"粒",ref,prn).averageDailyDose()).isNull();
    }

    @Test void reference_rule_ignores_local_identity_and_rejects_missing_frozen_reference() {
        var rule=new StandardReferenceDuplicateRule(codec);
        var a=standardItem(11,90L,reference(SPEC)); var b=standardItem(12,91L,reference(SPEC));
        assertThat(rule.evaluate(snapshot(a,b),version(WARN))).singleElement().satisfies(f -> assertThat(f.medicationRequestIds()).containsExactly(11L,12L));
        var different=standardItem(13,90L,reference("STD-04D8635B1192769EBA24309B"));
        assertThat(rule.evaluate(snapshot(a,different),version(WARN))).isEmpty();
        assertThatThrownBy(() -> rule.evaluate(snapshot(a,item(14,90L,"DRAFT")),version(WARN))).isInstanceOf(MissingSafetyDataException.class);
    }
    private MedicationStandardReference reference(String id) {
        var s=references.specification(id); var c=references.summary();
        return new MedicationStandardReference("LINKED",c.path("catalogId").asString(),c.path("catalogVersion").asString(),
                c.path("contentHash").asString(),s.path("entryId").asString(),id,1,s.path("name").asString(),s.path("doseForm").asString(),
                s.path("specification").asString(),s.path("presentationUnit").asString(null),s.path("strength"),"UNVERIFIED",List.of());
    }
    private PrescriptionSafetySnapshot.MedicationItem standardItem(long id, Long medication, MedicationStandardReference ref) {
        var original=item(id,medication,"DRAFT");
        return new PrescriptionSafetySnapshot.MedicationItem(id,0,medication,original.productId(),null,"DRAFT","VERSIONED_PARTIAL",BigDecimal.ONE,"粒",
                1L,"ORAL","NONE","RESOLVED",2L,"BID","{}",BigDecimal.ONE,"DAY",
                codec.write(java.util.Map.of("name","任意院内名","clinicalSemantics",java.util.Map.of("standardReference",ref))),"{}","{}");
    }
    private OrderFrequencyDirectory.FrequencySnapshot frequency(String type,int count,String period,String unit) {
        return new OrderFrequencyDirectory.FrequencySnapshot(1L,0,"LOCAL-CODE","本院名称",null,null,type,count,new BigDecimal(period),unit,
                "STANDARD_TIME",List.of(),"REMAINING_SLOTS",true);
    }
}
