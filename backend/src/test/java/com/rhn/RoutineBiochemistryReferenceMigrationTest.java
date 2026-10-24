package com.rhn;

import com.rhn.diagnostics.application.LaboratoryRuleEvaluator;
import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.Transactional;
import javax.sql.DataSource;
import java.time.LocalDate;
import static org.junit.jupiter.api.Assertions.*;

class RoutineBiochemistryReferenceMigrationTest extends RhnIntegrationTestSupport {
    @Autowired DiagnosticTemplateDirectory templates;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Test void publishes_only_the_26_system_presets_and_keeps_originals() {
        assertEquals(26, jdbc.queryForObject("select count(*) from RHN_BD_DIAG_TPL where ID_DIAG_TPL between 362387896012000 and 362387896012025", Integer.class));
        assertEquals(146, jdbc.queryForObject("select count(*) from RHN_BD_DIAG_TPL where ID_DIAG_TPL between 362387896010000 and 362387896010145", Integer.class));
        assertEquals(2, current("25030500700").version());
        assertEquals(2, current("25010101501").version());
    }
    @Test void matches_sex_age_reagent_and_traceability_conditions() {
        assertEquals("NO_RULE", evaluate("25030500700", "42", "2", 51, null, null).status());
        assertEquals("H", evaluate("25030500700", "42", "2", 51, "IFCC_NO_P5P", null).interpretationCode());
        assertEquals("N", evaluate("25030500700", "42", "2", 51, "IFCC_P5P", null).interpretationCode());
        assertEquals("H", evaluate("25030501100", "120", "2", 49, null, null).interpretationCode());
        assertEquals("N", evaluate("25030501100", "120", "2", 51, null, null).interpretationCode());
        assertEquals("H", evaluate("25030700100", "8.5", "1", 59, null, null).interpretationCode());
        assertEquals("N", evaluate("25030700100", "8.5", "1", 60, null, null).interpretationCode());
        assertEquals("NO_RULE", evaluate("25030700200", "70", "1", 51, null, null).status());
        assertEquals("H", evaluate("25030700200", "105", "1", 51, "IDMS_TRACEABLE", null).interpretationCode());
        assertEquals("N", evaluate("25030700200", "105", "1", 70, "IDMS_TRACEABLE", null).interpretationCode());
        assertEquals("NO_RULE", evaluate("25030700100", "5", "1", 19, null, null).status());
        assertEquals("H", evaluate("25030500200", "6", "1", 51, "BECKMAN_AU_DIAZO", null).interpretationCode());
        assertEquals("NO_RANGE", evaluate("25030500200", "6", "1", 51, "ROCHE_DIAZO", null).status());
    }
    @Test void does_not_treat_random_glucose_or_lipid_guidance_as_normal() {
        assertEquals("NO_RULE", evaluate("25030200100", "5", "1", 51, null, null).status());
        assertEquals("N", evaluate("25030200100", "5", "1", 51, null, "FASTING8H_NONPREGNANT").interpretationCode());
        var lipid = evaluate("25030300100", "5.2", "1", 51, null, "ASCVD_LOW_RISK_FASTING12H");
        assertEquals("NO_RANGE", lipid.status()); assertNull(lipid.interpretationCode());
        assertTrue(current("25030300100").publicationBasis().contains("＜5.2"));
        assertNull(evaluate("25030700500", "430", "1", 51, null, null).interpretationCode());
    }
    @Test @Transactional void an_existing_institution_version_and_repeated_seed_remain_unchanged() {
        var previous = current("25030500700");
        jdbc.update("""
                insert into RHN_BD_DIAG_TPL
                select ID_DIAG_TPL + 3000000, ID_TNT, ID_ORG, ID_CATALOG_ITEM, 3, SD_SVC_TYPE, DA_VALID_FROM,
                  '机构实际确认规则', ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON from RHN_BD_DIAG_TPL where ID_DIAG_TPL = ?
                """, previous.id());
        var custom = current("25030500700");
        applySeed();
        assertEquals(custom, current("25030500700"));
    }
    @Test @Transactional void a_modified_original_preset_is_not_promoted_over_local_content() {
        var previous = current("25030400101");
        jdbc.update("delete from RHN_BD_DIAG_TPL where ID_DIAG_TPL = ?", previous.id());
        jdbc.update("update RHN_BD_DIAG_TPL set CONTENT_JSON = ? where ID_CATALOG_ITEM = ? and SN_VERSION = 1", "{\"indicators\":[],\"phrases\":[],\"requiredChecks\":[],\"minimumImages\":0}", previous.catalogItemId());
        applySeed();
        assertEquals(1, current("25030400101").version());
        assertTrue(current("25030400101").content().indicators().isEmpty());
    }
    @Test void oracle_and_h2_payloads_are_equal_and_clob_chunks_fit_oracle_limits() throws Exception {
        var root=java.nio.file.Path.of("src/main/resources/db");
        var pattern=java.util.regex.Pattern.compile("(?s)-- (\\d{11}) [^\\n]*\\ninsert into RHN_BD_DIAG_TPL.*?current_timestamp, (.*?)\\nfrom RHN_BD_DIAG_TPL");
        var expected=new java.util.LinkedHashMap<String,tools.jackson.databind.JsonNode>();
        var rows=pattern.matcher(java.nio.file.Files.readString(root.resolve("local/V1_129_62__routine_biochemistry_reference_ranges.sql")));
        while(rows.find()) {var literal=rows.group(2);expected.put(rows.group(1),objectMapper.readTree(literal.substring(1,literal.length()-1).replace("''","'")));}
        String oracle=java.nio.file.Files.readString(root.resolve("oracle-local/V1_129_62__routine_biochemistry_reference_ranges.sql"));
        var actual=new java.util.LinkedHashMap<String,tools.jackson.databind.JsonNode>();rows=pattern.matcher(oracle);
        var chunksPattern=java.util.regex.Pattern.compile("to_clob\\('((?:[^']|'')*)'\\)");
        while(rows.find()) {var chunks=chunksPattern.matcher(rows.group(2));var content=new StringBuilder();while(chunks.find())content.append(chunks.group(1).replace("''","'"));actual.put(rows.group(1),objectMapper.readTree(content.toString()));}
        var chunks=chunksPattern.matcher(oracle);while(chunks.find())assertTrue(chunks.group(1).getBytes(java.nio.charset.StandardCharsets.UTF_8).length<=4000);
        assertEquals(26,expected.size());assertEquals(expected,actual);assertTrue(oracle.contains("dbms_lob.compare"));
    }
    private void applySeed(){new ResourceDatabasePopulator(new ClassPathResource("db/local/V1_129_62__routine_biochemistry_reference_ranges.sql")).execute(dataSource);}
    private DiagnosticTemplateDirectory.TemplateView current(String code) {
        Long item=jdbc.queryForObject("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT=362387869790209 and CD_CATALOG_ITEM=?",Long.class,code);
        return templates.current(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),item,LocalDate.now()).orElseThrow();
    }
    private LaboratoryRuleEvaluator.Evaluation evaluate(String code,String value,String gender,int age,String instrument,String population) {
        var definition=current(code).content().indicators().getFirst();
        return LaboratoryRuleEvaluator.evaluate(definition,value,"EQ",definition.unitCode(),new LaboratoryRuleEvaluator.PatientConditions(gender,age*365L,instrument,population));
    }
}
