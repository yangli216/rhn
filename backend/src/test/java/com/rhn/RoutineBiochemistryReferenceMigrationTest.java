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
    private DiagnosticTemplateDirectory.TemplateView current(String code) {
        Long item=jdbc.queryForObject("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT=362387869790209 and CD_CATALOG_ITEM=?",Long.class,code);
        return templates.current(Long.valueOf(TENANT),Long.valueOf(ORGANIZATION),item,LocalDate.now()).orElseThrow();
    }
    private LaboratoryRuleEvaluator.Evaluation evaluate(String code,String value,String gender,int age,String instrument,String population) {
        var definition=current(code).content().indicators().getFirst();
        return LaboratoryRuleEvaluator.evaluate(definition,value,"EQ",definition.unitCode(),new LaboratoryRuleEvaluator.PatientConditions(gender,age*365L,instrument,population));
    }
}
