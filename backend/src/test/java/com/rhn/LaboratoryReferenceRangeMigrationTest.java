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

class LaboratoryReferenceRangeMigrationTest extends RhnIntegrationTestSupport {
    @Autowired DiagnosticTemplateDirectory templates;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;

    @Test void current_three_part_template_has_adult_reference_ranges_and_keeps_original_version() {
        var current = current("25010101501");
        assertEquals(2, current.version());
        var wbc = indicator(current, "WBC");
        var patient = new LaboratoryRuleEvaluator.PatientConditions("1", 51L * 365, null, null);
        var result = LaboratoryRuleEvaluator.evaluate(wbc, "5", "EQ", "10^9/L", patient);
        assertEquals("N", result.interpretationCode());
        assertEquals(3.5, result.referenceLow().doubleValue());
        assertEquals(9.5, result.referenceHigh().doubleValue());
        assertTrue(indicator(current, "MID_NUM").rules().isEmpty());
        assertTrue(indicator(current, "RDW_CV").rules().isEmpty());
        Long originalId = jdbc.queryForObject("select ID_DIAG_TPL from RHN_BD_DIAG_TPL where ID_CATALOG_ITEM = ? and SN_VERSION = 1", Long.class, current.catalogItemId());
        var original = templates.requireVersion(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), current.catalogItemId(), originalId, LocalDate.now());
        assertTrue(original.content().indicators().stream().allMatch(i -> i.rules().isEmpty()));
    }

    @Test void sex_age_and_hct_percent_are_evaluated_consistently_by_the_backend() {
        var panel = current("25010101501");
        var male = new LaboratoryRuleEvaluator.PatientConditions("1", 51L * 365, null, null);
        var female = new LaboratoryRuleEvaluator.PatientConditions("2", 51L * 365, null, null);
        var hgb = indicator(panel, "HGB");
        assertEquals("L", LaboratoryRuleEvaluator.evaluate(hgb, "120", "EQ", "g/L", male).interpretationCode());
        assertEquals("N", LaboratoryRuleEvaluator.evaluate(hgb, "120", "EQ", "g/L", female).interpretationCode());
        assertEquals("NO_RULE", LaboratoryRuleEvaluator.evaluate(hgb, "120", "EQ", "g/L", new LaboratoryRuleEvaluator.PatientConditions("1", 3650L, null, null)).status());
        assertEquals("NO_RULE", LaboratoryRuleEvaluator.evaluate(hgb, "120", "EQ", "g/L", new LaboratoryRuleEvaluator.PatientConditions(null, 51L * 365, null, null)).status());
        var hct = LaboratoryRuleEvaluator.evaluate(indicator(panel, "HCT"), "45", "EQ", "%", male);
        assertEquals("N", hct.interpretationCode());
        assertEquals(40, hct.referenceLow().intValue());
        assertEquals(50, hct.referenceHigh().intValue());
        assertEquals(hgb.rules(), indicator(current("25010100100"), "HGB").rules());
        assertFalse(indicator(current("25010101500"), "BASO_PCT").rules().isEmpty());
    }

    @Test @Transactional void a_later_institution_version_wins_and_rerun_does_not_create_another_version() {
        var current = current("25010101501");
        jdbc.update("""
                insert into RHN_BD_DIAG_TPL
                select ID_DIAG_TPL + 2000000, ID_TNT, ID_ORG, ID_CATALOG_ITEM, 3, SD_SVC_TYPE, DA_VALID_FROM,
                  '机构自定义参考区间', ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON from RHN_BD_DIAG_TPL where ID_DIAG_TPL = ?
                """, current.id());
        var custom = current("25010101501");
        new ResourceDatabasePopulator(new ClassPathResource("db/local/V1_129_61__cbc_adult_reference_ranges.sql")).execute(dataSource);
        assertEquals(custom.id(), current("25010101501").id());
        assertEquals(3, jdbc.queryForObject("select count(*) from RHN_BD_DIAG_TPL where ID_CATALOG_ITEM = ?", Integer.class, current.catalogItemId()));
    }

    @Test void oracle_and_h2_migrations_have_equal_reference_payloads_with_safe_clob_literals() throws Exception {
        var root = java.nio.file.Path.of("src/main/resources/db");
        var pattern = java.util.regex.Pattern.compile("(?s)-- (\\d{11}) [^\\n]*\\ninsert into RHN_BD_DIAG_TPL.*?current_timestamp, (.*?)\\nfrom RHN_BD_DIAG_TPL");
        var expected = new java.util.LinkedHashMap<String, tools.jackson.databind.JsonNode>();
        var rows = pattern.matcher(java.nio.file.Files.readString(root.resolve("local/V1_129_61__cbc_adult_reference_ranges.sql")));
        while (rows.find()) {
            String literal = rows.group(2);
            expected.put(rows.group(1), objectMapper.readTree(literal.substring(1, literal.length() - 1).replace("''", "'")));
        }
        var actual = new java.util.LinkedHashMap<String, tools.jackson.databind.JsonNode>();
        rows = pattern.matcher(java.nio.file.Files.readString(root.resolve("oracle-local/V1_129_61__cbc_adult_reference_ranges.sql")));
        var chunkPattern = java.util.regex.Pattern.compile("to_clob\\('((?:[^']|'')*)'\\)");
        while (rows.find()) {
            var chunks = chunkPattern.matcher(rows.group(2));
            var content = new StringBuilder();
            while (chunks.find()) {
                String chunk = chunks.group(1).replace("''", "'");
                assertTrue(chunk.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 4000);
                content.append(chunk);
            }
            actual.put(rows.group(1), objectMapper.readTree(content.toString()));
        }
        assertEquals(7, expected.size());
        assertEquals(expected, actual);
    }

    private DiagnosticTemplateDirectory.TemplateView current(String code) {
        Long item = jdbc.queryForObject("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT = 362387869790209 and CD_CATALOG_ITEM = ?", Long.class, code);
        return templates.current(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), item, LocalDate.now()).orElseThrow();
    }
    private DiagnosticTemplateDirectory.Indicator indicator(DiagnosticTemplateDirectory.TemplateView template, String code) {
        return template.content().indicators().stream().filter(i -> i.code().equals(code)).findFirst().orElseThrow();
    }
}
