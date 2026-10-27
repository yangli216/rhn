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

    private DiagnosticTemplateDirectory.TemplateView current(String code) {
        Long item = jdbc.queryForObject("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT = 362387869790209 and CD_CATALOG_ITEM = ?", Long.class, code);
        return templates.current(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), item, LocalDate.now()).orElseThrow();
    }
}
