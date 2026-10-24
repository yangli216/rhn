package com.rhn;

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

class LaboratoryDefaultTemplateMigrationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired DiagnosticTemplateDirectory templates;

    @Test void every_standard_result_project_is_bound_except_the_billing_add_on() {
        assertEquals(146, jdbc.queryForObject("select count(*) from RHN_BD_DIAG_TPL where ID_DIAG_TPL between 362387896010000 and 362387896010145", Integer.class));
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_BD_CATALOG_ITEM c
                join RHN_BD_SVC_ITEM s on s.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM
                join RHN_BD_ORG_CATALOG_ITEM o on o.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM
                where s.SD_SVC_TYPE = 'LABORATORY' and c.SD_STATUS = 'ACTIVE'
                  and c.CD_CATALOG_ITEM like '2%' and c.CD_CATALOG_ITEM <> '26000000000'
                  and o.ID_ORG = 362387869790211 and not exists
                    (select 1 from RHN_BD_DIAG_TPL t where t.ID_CATALOG_ITEM = c.ID_CATALOG_ITEM and t.ID_ORG = o.ID_ORG)
                """, Integer.class));
        assertEquals(0, jdbc.queryForObject("""
                select count(*) from RHN_BD_DIAG_TPL t join RHN_BD_CATALOG_ITEM c on c.ID_CATALOG_ITEM = t.ID_CATALOG_ITEM
                where c.CD_CATALOG_ITEM = '26000000000'
                """, Integer.class));
    }

    @Test void result_shapes_keep_three_part_five_part_and_single_test_intent() {
        var three = current("25010101501");
        assertTrue(three.content().indicators().stream().anyMatch(i -> i.code().equals("MID_NUM")));
        assertFalse(three.content().indicators().stream().anyMatch(i -> i.code().equals("ALT") || i.code().equals("MONO_NUM")));
        assertTrue(current("25010101500").content().indicators().stream().anyMatch(i -> i.code().equals("BASO_PCT")));
        assertEquals(java.util.List.of("ALT"), current("25030500700").content().indicators().stream().map(DiagnosticTemplateDirectory.Indicator::code).toList());
        assertEquals(java.util.List.of("CREA"), current("25030700200").content().indicators().stream().map(DiagnosticTemplateDirectory.Indicator::code).toList());
        assertNotEquals(three.id(), current("25010101500").id());
        assertThrows(com.rhn.shared.api.BusinessException.class, () -> templates.requireVersion(
                Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), current("25010101500").catalogItemId(), three.id(), LocalDate.now()));
    }

    @Test @Transactional void rerunning_the_seed_preserves_an_institution_publication() {
        var previous = current("25030500700");
        jdbc.update("""
                insert into RHN_BD_DIAG_TPL
                select ID_DIAG_TPL + 1000000, ID_TNT, ID_ORG, ID_CATALOG_ITEM, SN_VERSION + 1, SD_SVC_TYPE, DA_VALID_FROM,
                  '机构实际确认的规则', ID_USER_PUBLISH, DT_PUBLISH, CONTENT_JSON
                from RHN_BD_DIAG_TPL where ID_DIAG_TPL = ?
                """, previous.id());
        var published = current("25030500700");
        new ResourceDatabasePopulator(new ClassPathResource("db/local/V1_129_60__laboratory_default_templates.sql")).execute(dataSource);
        assertEquals(published, current("25030500700"));
        assertEquals(previous.version() + 1, jdbc.queryForObject("select count(*) from RHN_BD_DIAG_TPL where ID_CATALOG_ITEM = ?", Integer.class, previous.catalogItemId()));
    }

    @Test void preset_units_are_maintained_and_unconfirmed_ranges_are_absent() {
        for (String content : jdbc.queryForList("select CONTENT_JSON from RHN_BD_DIAG_TPL where ID_DIAG_TPL between 362387896010000 and 362387896010145", String.class)) {
            var value = objectMapper.readValue(content, DiagnosticTemplateDirectory.TemplateContent.class);
            for (var indicator : value.indicators()) {
                assertTrue(indicator.rules().isEmpty());
                if (indicator.unitCode() != null) assertEquals(1, jdbc.queryForObject(
                        "select count(*) from RHN_BD_UNIT_DEF where ID_TNT = 362387869790209 and CD_UNIT_DEF = ? and SD_STATUS = 'ACTIVE'",
                        Integer.class, indicator.unitCode()));
            }
        }
    }

    @Test void oracle_clob_chunks_preserve_every_h2_template_and_fit_literal_limits() throws Exception {
        var root = java.nio.file.Path.of("src/main/resources/db");
        String h2 = java.nio.file.Files.readString(root.resolve("local/V1_129_60__laboratory_default_templates.sql"));
        String oracle = java.nio.file.Files.readString(root.resolve("oracle-local/V1_129_60__laboratory_default_templates.sql"));
        var pattern = java.util.regex.Pattern.compile("(?s)-- (\\d{11}) [^\\n]*\\ninsert into RHN_BD_DIAG_TPL.*?current_timestamp, (.*?)\\nfrom RHN_BD_CATALOG_ITEM");
        var expected = new java.util.LinkedHashMap<String, tools.jackson.databind.JsonNode>();
        var localRows = pattern.matcher(h2);
        while (localRows.find()) {
            String literal = localRows.group(2);
            expected.put(localRows.group(1), objectMapper.readTree(literal.substring(1, literal.length() - 1).replace("''", "'")));
        }
        var actual = new java.util.LinkedHashMap<String, tools.jackson.databind.JsonNode>();
        var oracleRows = pattern.matcher(oracle);
        var chunkPattern = java.util.regex.Pattern.compile("to_clob\\('((?:[^']|'')*)'\\)");
        while (oracleRows.find()) {
            var chunks = chunkPattern.matcher(oracleRows.group(2));
            var payload = new StringBuilder();
            while (chunks.find()) {
                String chunk = chunks.group(1).replace("''", "'");
                assertTrue(chunk.getBytes(java.nio.charset.StandardCharsets.UTF_8).length <= 4000);
                payload.append(chunk);
            }
            actual.put(oracleRows.group(1), objectMapper.readTree(payload.toString()));
        }
        assertEquals(146, expected.size());
        assertEquals(expected, actual);
    }

    private DiagnosticTemplateDirectory.TemplateView current(String code) {
        Long item = jdbc.queryForObject("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT = 362387869790209 and CD_CATALOG_ITEM = ?", Long.class, code);
        return templates.current(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), item, LocalDate.now()).orElseThrow();
    }
}
